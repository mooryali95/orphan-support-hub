-- =====================================================================
-- تفضيلات الإشعارات، وإلغاء الاشتراك، وقفل البريد
-- ---------------------------------------------------------------------
-- بنية البريد وصلت جاهزة، ولا تستطيع إرسال رسالة واحدة: سجلّ القوالب
-- المعامَلاتية فارغ، و`sendTemplateEmail` بلا مستدعٍ، والطابور
-- (`notifications.email_state = 'pending'`) يتراكم بلا مُصرِّف.
--
-- ولم يكن الصواب وصلَه كما هو. إرسال بريد معامَلاتي إلى قائمة حقيقية بلا
-- تفضيلات وبلا رابط إلغاء اشتراك مخالفةٌ صريحة (CAN-SPAM، وGDPR م.٢١،
-- ونظام مكافحة الرسائل غير المرغوبة). فهذه الهجرة ترفع ذلك الحاجز.
--
-- ثلاث طبقات، كلٌّ تُغلق وحدها:
--   قفل المنصّة  — لا يُرسل شيء ما لم يُرفع القفل بقرار.
--   قرار المستخدم — إلغاء اشتراك شامل، أو كتم أنواع بعينها.
--   وكلاهما يُفرَض في `notify()` وحدها، وهي نقطة الاختناق التي تمرّ بها
--   كل الإشعارات — فلا يوجد طريق ثانٍ يلتفّ عليهما.
--
-- والإشعار داخل التطبيق **لا يُكتَم أبداً**: من أوقف البريد يبقى يرى
-- جرس الإشعارات. الكتم يخصّ البريد وحده، فحقّ المستخدم في العلم بما
-- يجري في كفالته لا يسقط بإيقافه رسائل بريدية.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) قفل البريد على مستوى المنصّة
-- ---------------------------------------------------------------------
-- على غرار `payments_on_hold`: الافتراض **مقفول**. فتحه فعلٌ متعمَّد لا
-- نتيجة نسيان، ولا يُفتح إلا من الإدارة (السياسة القائمة على الجدول).
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS email_on_hold BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_hold_reason TEXT
    DEFAULT 'لم يُفعَّل الإرسال بعد: يحتاج نطاقاً موثَّقاً ومُصرِّفاً للطابور';


-- ---------------------------------------------------------------------
-- 2) تفضيلات المستخدم
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  /* إلغاء الاشتراك الشامل: يوقف كل بريد بلا استثناء. ومن قال «كفى»
     يُطاع حرفياً — لا نستثني «رسائل مهمّة» من قراره. */
  email_enabled BOOLEAN NOT NULL DEFAULT true,

  /* كتمٌ دقيق لأنواع بعينها، لمن أراد بعض البريد لا كلّه. */
  muted_kinds public.notification_kind[] NOT NULL DEFAULT '{}',

  /* رمز الإلغاء بنقرة واحدة: الرابط في ذيل الرسالة يجب أن يعمل بلا
     تسجيل دخول، وإلا لم يكن إلغاءً عملياً. */
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_prefs_token
  ON public.notification_prefs(unsubscribe_token);

GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs_own_read" ON public.notification_prefs;
CREATE POLICY "prefs_own_read" ON public.notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "prefs_own_insert" ON public.notification_prefs;
CREATE POLICY "prefs_own_insert" ON public.notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prefs_own_update" ON public.notification_prefs;
CREATE POLICY "prefs_own_update" ON public.notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


/* صفٌّ لكل مستخدم منذ لحظة التسجيل، فيوجد رمز إلغاء جاهز قبل أول رسالة. */
CREATE OR REPLACE FUNCTION public.ensure_notification_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.notification_prefs (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.ensure_notification_prefs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ensure_notification_prefs ON auth.users;
CREATE TRIGGER trg_ensure_notification_prefs
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.ensure_notification_prefs();

/* ومن سجّل قبل هذه الهجرة يحصل على صفّه الآن. */
INSERT INTO public.notification_prefs (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 3) سبب التخطّي — يُكتب ولا يُخمَّن
-- ---------------------------------------------------------------------
-- بلا هذا العمود تبقى كل رسالة `skipped` بلا تفسير، فيستحيل التمييز بين
-- «المنصّة مقفولة» و«المستخدم رفض» عند تشخيص شكوى.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_skip_reason TEXT;


-- ---------------------------------------------------------------------
-- 4) الفرض — في نقطة الاختناق وحدها
-- ---------------------------------------------------------------------
-- التوقيع كما هو، فلا يتغيّر شيء عند المستدعين الثمانية.
CREATE OR REPLACE FUNCTION public.notify(
  _user UUID,
  _kind public.notification_kind,
  _title TEXT,
  _body TEXT DEFAULT NULL,
  _link TEXT DEFAULT NULL,
  _entity TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _id UUID;
  _held BOOLEAN;
  _enabled BOOLEAN;
  _muted public.notification_kind[];
  _state public.email_state := 'pending';
  _reason TEXT := NULL;
BEGIN
  IF _user IS NULL THEN RETURN NULL; END IF;

  SELECT email_on_hold INTO _held FROM public.platform_settings WHERE id;

  -- غياب الصفّ = الافتراضات: بريدٌ مفعَّل ولا كتم. فمستخدمٌ بلا تفضيلات
  -- لا يُحرَم إشعاراته، ولا يُرسَل له ما رفضه.
  SELECT p.email_enabled, p.muted_kinds INTO _enabled, _muted
    FROM public.notification_prefs p WHERE p.user_id = _user;
  _enabled := COALESCE(_enabled, true);
  _muted   := COALESCE(_muted, '{}'::public.notification_kind[]);

  IF COALESCE(_held, true) THEN
    _state := 'skipped'; _reason := 'platform_hold';
  ELSIF NOT _enabled THEN
    _state := 'skipped'; _reason := 'user_unsubscribed';
  ELSIF _kind = ANY(_muted) THEN
    _state := 'skipped'; _reason := 'kind_muted';
  END IF;

  -- الإشعار نفسه يُكتب دائماً: الكتم للبريد لا للعلم.
  INSERT INTO public.notifications
    (user_id, kind, title, body, link, entity, entity_id, email_state, email_skip_reason)
  VALUES (_user, _kind, _title, _body, _link, _entity, _entity_id, _state, _reason)
  RETURNING id INTO _id;

  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.notify(UUID, public.notification_kind, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;


/* الترحيب كان يُدرج مباشرةً فيلتفّ على الفرض؛ يمرّ الآن من `notify()`. */
CREATE OR REPLACE FUNCTION public.notify_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.notify(NEW.id, 'welcome', 'أهلاً بك في IOCO',
    'حسابك جاهز. تصفّح الملفات المعتمدة واختر من تكفله.', '/orphans');
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.notify_new_user() FROM PUBLIC, anon, authenticated;

-- المُشغّلان على `auth.users` يعملان بترتيب الاسم، و`trg_ensure_…` يسبق
-- `trg_notify_…` أبجدياً — فالتفضيلات موجودة قبل أول إشعار.


-- ---------------------------------------------------------------------
-- 5) إلغاء الاشتراك برمز، بلا تسجيل دخول
-- ---------------------------------------------------------------------
-- الرابط يُنقر من صندوق البريد حيث لا جلسة، فالتنفيذ ممنوح لـ`anon`.
-- والرمز UUID عشوائي (١٢٢ بت)، فالتخمين غير عملي؛ والعملية عديمة الأثر
-- التراكمي (تكرارها كتنفيذها مرّة)، فلا حاجة لتحديد معدّل هنا.
--
-- ولا تكشف الدالة شيئاً عن صاحب الرمز: تُرجع نجاحاً أو فشلاً فقط.
CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(_token UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _hit BOOLEAN;
BEGIN
  UPDATE public.notification_prefs
     SET email_enabled = false, updated_at = now()
   WHERE unsubscribe_token = _token
  RETURNING true INTO _hit;

  RETURN COALESCE(_hit, false);
END $fn$;
REVOKE ALL ON FUNCTION public.unsubscribe_by_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_by_token(UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 6) قراءة التفضيلات وتعديلها — للواجهة
-- ---------------------------------------------------------------------
-- تُنشئ الصفّ إن غاب، فلا تحتاج الواجهة أن تعرف هل وُجد أم لا.
CREATE OR REPLACE FUNCTION public.my_notification_prefs()
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _row public.notification_prefs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'my_notification_prefs: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notification_prefs (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _row FROM public.notification_prefs WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'email_enabled', _row.email_enabled,
    'muted_kinds', to_jsonb(_row.muted_kinds),
    'unsubscribe_token', _row.unsubscribe_token
  );
END $fn$;
REVOKE ALL ON FUNCTION public.my_notification_prefs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_notification_prefs() TO authenticated;


CREATE OR REPLACE FUNCTION public.set_notification_prefs(
  _email_enabled BOOLEAN, _muted_kinds TEXT[]
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _kinds public.notification_kind[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_notification_prefs: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  -- التحويل يرمي عند نوعٍ مجهول، فلا تُكتب قيمة خارج التعداد.
  _kinds := COALESCE(_muted_kinds, '{}')::public.notification_kind[];

  INSERT INTO public.notification_prefs (user_id, email_enabled, muted_kinds, updated_at)
  VALUES (auth.uid(), COALESCE(_email_enabled, true), _kinds, now())
  ON CONFLICT (user_id) DO UPDATE
    SET email_enabled = EXCLUDED.email_enabled,
        muted_kinds   = EXCLUDED.muted_kinds,
        updated_at    = now();

  RETURN public.my_notification_prefs();
END $fn$;
REVOKE ALL ON FUNCTION public.set_notification_prefs(BOOLEAN, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_prefs(BOOLEAN, TEXT[]) TO authenticated;
