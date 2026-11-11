-- ملف نشر كهاتين — كل الهجرات بعد 20261107140000
-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: 2026-11-11T03:29Z
BEGIN;

-- >>> migration 20261108200000 port_drizzle_policies
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108200000') THEN
    RAISE EXCEPTION 'الهجرة 20261108200000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- ARC-01 — مصدرٌ واحد لمخطط الإنتاج
-- ---------------------------------------------------------------------
-- في 2026-10-30/31 طبّق Lovable ثلاثة ملفّات على البثّ من drizzle/migrations
-- (drizzle-kit على LOVABLE_DB_MIGRATION_URL) لم تدخل هذه السلسلة قطّ. فالقاعدة
-- التي يبنيها CI كانت تنقصها `payment_hold_state()` التي تناديها
-- payments.functions.ts، وتحمل قراءاتٍ أوسع ممّا على البثّ.
--
-- هذه الهجرة تنقل أثرها الفعلي. كلّها CREATE OR REPLACE وDROP … IF EXISTS،
-- فهي على البثّ لا تغيّر شيئاً، وعلى قاعدةٍ نظيفة تبلغ حال البثّ.
--
-- القاعدة من الآن: **مخطط الإنتاج = supabase/migrations وحدها.** drizzle/ ليس
-- طريق هجرة؛ و`scripts/check-types-drift.sh` (يشغّله db-test.sh) يسقط إن ذكر
-- types.ts المولَّد من البثّ ما لا تُنشئه السلسلة، أو ظهر في drizzle/ ملفٌّ جديد.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0000_restrict_platform_settings_read
-- ---------------------------------------------------------------------
-- صفّ إعدادات المنصّة للإدارة وحدها؛ وما يحتاجه غيرها (هل الدفع موقوف؟)
-- يمرّ بدالّةٍ تُعيد العمودين لا الصفّ.
DROP POLICY IF EXISTS "settings_read" ON public.platform_settings;
DROP POLICY IF EXISTS "settings_read_admin" ON public.platform_settings;
CREATE POLICY "settings_read_admin" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.payment_hold_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('payments_on_hold', payments_on_hold, 'payments_hold_reason', payments_hold_reason)
  FROM public.platform_settings WHERE id;
$$;
REVOKE ALL ON FUNCTION public.payment_hold_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_hold_state() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 0001_restrict_public_media_read
-- ---------------------------------------------------------------------
-- الدالّة تُنقل كما هي (types.ts يذكرها). أمّا سياسة "public_media_read" التي
-- بناها drizzle عليها فقد استبدلتها 20261106140000_phase0_review_fixes بأضيق
-- منها (المسجَّل الذي يبلغ مجلّد الطفل وحده؛ الصور صارت في orphan-photos
-- الخاصّة). فلا تُعاد هنا: إعادتها تفتح public-media للزائر من جديد.
-- ولا يحتاجها الزائر بعد ذلك، فتُغلق عليه.
CREATE OR REPLACE FUNCTION public.is_published_orphan_folder(_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  RETURN EXISTS (SELECT 1 FROM public.orphans o
    WHERE o.id = _id AND o.status IN ('approved','fully_sponsored')
      AND o.photo_consent IN ('granted','face_hidden'));
END $$;
REVOKE ALL ON FUNCTION public.is_published_orphan_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_published_orphan_folder(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 0002_restrict_lookup_reads
-- ---------------------------------------------------------------------
-- جداول البحث للمسجَّلين؛ والزائر يبلغ ما يحتاجه منها عبر دوالّ الدليل
-- (trait_model وأخواتها، SECURITY DEFINER).
DROP POLICY IF EXISTS td_read ON public.trait_dimensions;
CREATE POLICY td_read ON public.trait_dimensions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS oroles_read ON public.office_roles;
CREATE POLICY oroles_read ON public.office_roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS ik_read ON public.institution_kinds;
CREATE POLICY ik_read ON public.institution_kinds FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108200000', 'port_drizzle_policies');

-- >>> migration 20261108210000 notifications_and_donor_invites
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108210000') THEN
    RAISE EXCEPTION 'الهجرة 20261108210000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة 3B — DB-11 وDB-10
-- ---------------------------------------------------------------------
-- DB-11  سياسة notif_update_own تسمح للمستخدم بتحديث كلّ عمود في إشعاره:
--        كان يعيد email_state إلى pending بعنوانٍ ورابطٍ من عنده، فيرسلها
--        المُصرِّف بريداً باسم المنصّة. الواجهة لا تكتب إلا read_at، فالمنح
--        يضيق إليه وحده.
--
-- DB-10  donor_set_member كان يُجيب «لا حساب بهذا البريد» (مِسبار حسابات)،
--        ويُدخل صاحب البريد عضواً في جهة المالك بلا علمه، ومن جهةٍ لم
--        تُعتمد. صار دعوةً: ردٌّ واحد وُجد الحساب أم لا، والعضوية بقبول
--        المدعوّ وحده، والدعوة من جهةٍ معتمدة (أو من الإدارة).
-- =====================================================================

-- ---------------------------------------------------------------------
-- DB-11
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;


-- ---------------------------------------------------------------------
-- DB-10
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donor_member_invites (
  entity_id   UUID NOT NULL REFERENCES public.donor_entities(id) ON DELETE CASCADE,
  email       TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
  role        TEXT NOT NULL CHECK (role IN ('owner', 'finance', 'member')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  PRIMARY KEY (entity_id, email)
);
CREATE INDEX IF NOT EXISTS idx_donor_invites_email ON public.donor_member_invites(email);
ALTER TABLE public.donor_member_invites ENABLE ROW LEVEL SECURITY;
-- لا قراءة مباشرة: الدوالّ أدناه وحدها تقرأ الجدول وتكتبه.
REVOKE ALL ON public.donor_member_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.donor_member_invites TO service_role;


CREATE OR REPLACE FUNCTION public.donor_set_member(_entity UUID, _email TEXT, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID; _mail TEXT := lower(btrim(COALESCE(_email, '')));
BEGIN
  IF NOT (public.is_donor_owner(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_owner_only' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
       SELECT 1 FROM public.donor_entities WHERE id = _entity AND status = 'approved') THEN
    RAISE EXCEPTION 'donor_entity_not_approved' USING ERRCODE = '42501';
  END IF;
  IF _mail !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF _role NOT IN ('owner', 'finance', 'member', 'remove') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  -- العضو القائم يُعرف من جدول الأعضاء لا من auth.users: من يعرض قائمة
  -- الفريق يعرف أعضاءه أصلاً، ولا يعرف بهذا شيئاً عن غيرهم.
  SELECT m.user_id INTO _user
    FROM public.donor_members m JOIN auth.users u ON u.id = m.user_id
   WHERE m.entity_id = _entity AND lower(u.email) = _mail;

  IF _role = 'remove' THEN
    DELETE FROM public.donor_member_invites WHERE entity_id = _entity AND email = _mail;
    IF _user IS NOT NULL THEN
      -- لا تُترك الجهة بلا مالك.
      IF (SELECT role FROM public.donor_members WHERE entity_id = _entity AND user_id = _user) = 'owner'
         AND (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity AND role = 'owner') = 1 THEN
        RAISE EXCEPTION 'last_owner';
      END IF;
      DELETE FROM public.donor_members WHERE entity_id = _entity AND user_id = _user;
    END IF;
    RETURN;
  END IF;

  IF _user IS NOT NULL THEN
    IF _role <> 'owner'
       AND (SELECT role FROM public.donor_members WHERE entity_id = _entity AND user_id = _user) = 'owner'
       AND (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity AND role = 'owner') = 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
    UPDATE public.donor_members SET role = _role WHERE entity_id = _entity AND user_id = _user;
    RETURN;
  END IF;

  -- غير العضو يُدعى — كان له حسابٌ أم لم يكن، والردّ واحد.
  INSERT INTO public.donor_member_invites (entity_id, email, role, invited_by)
  VALUES (_entity, _mail, _role, auth.uid())
  ON CONFLICT (entity_id, email) DO UPDATE
    SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by,
        created_at = now(), expires_at = now() + INTERVAL '30 days';
END $fn$;
REVOKE ALL ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) TO authenticated;


/* القائمة تُظهر الدعوات المعلّقة بحالها، فلا يظنّها المالك أعضاء. */
CREATE OR REPLACE FUNCTION public.donor_members_list(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'status', x->>'role', x->>'email') FROM (
      SELECT jsonb_build_object('email', u.email, 'role', m.role, 'status', 'member') AS x
        FROM public.donor_members m JOIN auth.users u ON u.id = m.user_id
       WHERE m.entity_id = _entity
      UNION ALL
      SELECT jsonb_build_object('email', i.email, 'role', i.role, 'status', 'invited',
                                'expires_at', i.expires_at)
        FROM public.donor_member_invites i
       WHERE i.entity_id = _entity AND i.expires_at > now()) s), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.donor_members_list(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_members_list(UUID) TO authenticated;


/* دعواتي: بالبريد المؤكَّد للحساب نفسه وحده. */
CREATE OR REPLACE FUNCTION public.my_donor_invitations()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entity_id', e.id, 'entity_name', e.name, 'role', i.role,
           'created_at', i.created_at, 'expires_at', i.expires_at) ORDER BY i.created_at DESC), '[]'::jsonb)
    FROM public.donor_member_invites i
    JOIN public.donor_entities e ON e.id = i.entity_id
    JOIN auth.users u ON u.id = auth.uid() AND lower(u.email) = i.email
   WHERE auth.uid() IS NOT NULL AND i.expires_at > now() AND e.status = 'approved';
$fn$;
REVOKE ALL ON FUNCTION public.my_donor_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_donor_invitations() TO authenticated;


/* القبول أو الردّ. دعوةٌ ليست لهذا الحساب لا يُعرف وجودها: no_data_found. */
CREATE OR REPLACE FUNCTION public.respond_donor_invitation(_entity UUID, _accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _mail TEXT; _role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  SELECT lower(email) INTO _mail FROM auth.users WHERE id = auth.uid();

  DELETE FROM public.donor_member_invites i
   USING public.donor_entities e
   WHERE i.entity_id = _entity AND i.email = _mail AND i.expires_at > now()
     AND e.id = i.entity_id AND e.status = 'approved'
  RETURNING i.role INTO _role;
  IF _role IS NULL THEN RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'no_data_found'; END IF;

  IF COALESCE(_accept, false) THEN
    INSERT INTO public.donor_members (entity_id, user_id, role) VALUES (_entity, auth.uid(), _role)
    ON CONFLICT (entity_id, user_id) DO NOTHING;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.respond_donor_invitation(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_donor_invitation(UUID, BOOLEAN) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108210000', 'notifications_and_donor_invites');

-- >>> migration 20261108220000 integration_replay_protection
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108220000') THEN
    RAISE EXCEPTION 'الهجرة 20261108220000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة 3B — APP-12: حماية بوّابة التكامل من الإعادة
-- ---------------------------------------------------------------------
-- (١) ختم الوقت وحده لا يمنع إعادة طلبٍ ملتقَط داخل نافذة الخمس دقائق.
--     مخزن آحاد: كلّ (شريك، أحادية) يُقبل مرّةً واحدة في النافذة. الأحادية
--     ترويسة X-Api-Nonce إن أرسلها الشريك، وإلا بصمة الطلب نفسه (الختم
--     والطريقة والمسار وبصمة الجسم) — فالطلب نفسه حرفاً بحرف لا يمرّ مرّتين.
-- (٢) مفتاح التكرار كان «اقرأ ثم أدرج بعد المعالجة»: إعادتان متزامنتان
--     تستوردان معاً، وخطأ الإدراج الثاني يُهمَل. صار يُحجز أوّلاً بإدراجٍ
--     ذرّي (ON CONFLICT DO NOTHING)، ومن يجده محجوزاً يأخذ النتيجة أو
--     «قيد المعالجة»، ولا يعالج أحدٌ الدفعة مرّتين.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.api_request_nonces (
  client_id UUID NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  nonce     TEXT NOT NULL CHECK (length(nonce) BETWEEN 1 AND 200),
  seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_api_nonces_seen ON public.api_request_nonces(seen_at);
ALTER TABLE public.api_request_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_request_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_request_nonces TO service_role;

/* true = أوّل مرّة (يُقبل)، false = إعادة. يكنس ما خرج من النافذة. */
CREATE OR REPLACE FUNCTION public.api_claim_nonce(_client UUID, _nonce TEXT, _window_seconds INTEGER DEFAULT 300)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _ok BOOLEAN;
BEGIN
  -- النافذة مضاعفة: ختمٌ مقبولٌ في أوّل نافذته وطلبٌ في آخرها يبقيان داخلها.
  DELETE FROM public.api_request_nonces
   WHERE seen_at < now() - make_interval(secs => GREATEST(_window_seconds, 1) * 2);
  INSERT INTO public.api_request_nonces (client_id, nonce) VALUES (_client, _nonce)
  ON CONFLICT (client_id, nonce) DO NOTHING
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END $fn$;
REVOKE ALL ON FUNCTION public.api_claim_nonce(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_claim_nonce(UUID, TEXT, INTEGER) TO service_role;


ALTER TABLE public.api_import_jobs
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'done'
    CHECK (state IN ('processing', 'done')),
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

/*
 * الحجز. يُعيد واحداً من:
 *   {reserved:true, id}                       — المعالجة لك
 *   {reserved:false, state:'done', result}    — عولجت؛ هذه نتيجتها
 *   {reserved:false, state:'processing'}      — يعالجها طلبٌ آخر الآن
 *   {reserved:false, state:'digest_mismatch'} — المفتاح نفسه بحمولةٍ أخرى
 * وحجزٌ عالقٌ أقدم من _stale_minutes (عاملٌ مات) يُستعاد، فالاستيراد
 * بالمرجع الخارجي يُحدّث ولا يُكرّر.
 */
CREATE OR REPLACE FUNCTION public.api_reserve_import(
  _client UUID, _source TEXT, _key TEXT, _digest TEXT, _received INTEGER,
  _stale_minutes INTEGER DEFAULT 10
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _row public.api_import_jobs%ROWTYPE;
BEGIN
  INSERT INTO public.api_import_jobs (client_id, source, idempotency_key, request_digest,
                                      received_count, state)
  VALUES (_client, _source, _key, _digest, COALESCE(_received, 0), 'processing')
  ON CONFLICT (client_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NOT NULL THEN
    RETURN jsonb_build_object('reserved', true, 'id', _id);
  END IF;

  SELECT * INTO _row FROM public.api_import_jobs
   WHERE client_id = _client AND idempotency_key = _key FOR UPDATE;
  IF _row.request_digest IS DISTINCT FROM _digest THEN
    RETURN jsonb_build_object('reserved', false, 'state', 'digest_mismatch');
  END IF;
  IF _row.state = 'done' THEN
    RETURN jsonb_build_object('reserved', false, 'state', 'done', 'result', _row.result);
  END IF;
  IF _row.created_at < now() - make_interval(mins => GREATEST(_stale_minutes, 1)) THEN
    UPDATE public.api_import_jobs SET created_at = now() WHERE id = _row.id;
    RETURN jsonb_build_object('reserved', true, 'id', _row.id, 'resumed', true);
  END IF;
  RETURN jsonb_build_object('reserved', false, 'state', 'processing');
END $fn$;
REVOKE ALL ON FUNCTION public.api_reserve_import(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_reserve_import(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.api_finish_import(
  _job UUID, _created INTEGER, _updated INTEGER, _failed INTEGER, _result JSONB
)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.api_import_jobs
     SET state = 'done', finished_at = now(), created_count = _created, updated_count = _updated,
         failed_count = _failed, result = COALESCE(_result, '{}'::jsonb)
   WHERE id = _job;
$fn$;
REVOKE ALL ON FUNCTION public.api_finish_import(UUID, INTEGER, INTEGER, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_finish_import(UUID, INTEGER, INTEGER, INTEGER, JSONB) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108220000', 'integration_replay_protection');

-- >>> migration 20261108230000 invoice_numbering_per_year
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108230000') THEN
    RAISE EXCEPTION 'الهجرة 20261108230000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة 3B — GAP-06: ترقيم الفواتير لكل سنة وبلا ثغرات
-- ---------------------------------------------------------------------
-- next_invoice_no كان nextval() على تسلسلٍ عامّ: التسلسل لا يتراجع، فإدراجٌ
-- يفشل بعد أخذ الرقم (حدثٌ مكرّر من المزوّد يصطدم بـux_payments_provider_payment)
-- يحرق رقماً، والعدّ لا يبدأ من جديد في السنة الجديدة (INV-2027-000004).
--
-- العدّاد صار صفّاً لكل سنة يُزاد بقفل الصفّ داخل المعاملة نفسها: الإدراج
-- الفاشل يتراجع بزيادته، فلا ثغرة. والثمن تسلسل إصدار الفواتير في السنة
-- الواحدة (قفلٌ حتى نهاية المعاملة) — وهو حجمٌ لا يُشعر به هنا.
--
-- ما صدر قبلها لا يتغيّر رقمه؛ وعدّاد كلّ سنةٍ يبدأ بعد أكبر رقمٍ صدر فيها،
-- فلا يتكرّر رقم. والتسلسل القديم يبقى (لا يُحذف كائنٌ قد يُشير إليه شيء).
--
-- ما لم يُعالَج هنا (يحتاج قراراً ضريبياً لا هجرة): إشعار الدائن عند الردّ،
-- وبيانات المُصدِر ورقمه الضريبي (NUIS) والمشتري، والتسجيل المالي في ألبانيا.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year    INTEGER PRIMARY KEY CHECK (year BETWEEN 2000 AND 2999),
  last_no INTEGER NOT NULL CHECK (last_no >= 0)
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_counters TO service_role;

INSERT INTO public.invoice_counters (year, last_no)
SELECT substring(invoice_no FROM '^INV-(\d{4})-')::int,
       max(substring(invoice_no FROM '^INV-\d{4}-(\d+)$')::int)
  FROM public.sponsorship_payments
 WHERE invoice_no ~ '^INV-\d{4}-\d+$'
 GROUP BY 1
ON CONFLICT (year) DO UPDATE SET last_no = GREATEST(public.invoice_counters.last_no, EXCLUDED.last_no);

CREATE OR REPLACE FUNCTION public.next_invoice_no(_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = public AS $fn$
DECLARE _year INTEGER := extract(year FROM COALESCE(_at, now()) AT TIME ZONE 'UTC')::int; _n INTEGER;
BEGIN
  INSERT INTO public.invoice_counters AS c (year, last_no) VALUES (_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_no = c.last_no + 1
  RETURNING last_no INTO _n;
  RETURN 'INV-' || _year::text || '-' || lpad(_n::text, 6, '0');
END $fn$;
REVOKE ALL ON FUNCTION public.next_invoice_no(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108230000', 'invoice_numbering_per_year');

COMMIT;
