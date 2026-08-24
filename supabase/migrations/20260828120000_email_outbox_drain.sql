-- =====================================================================
-- مُصرِّف طابور البريد
-- ---------------------------------------------------------------------
-- الطابور موجود منذ المرحلة 4 (`notifications.email_state`)، ولا شيء
-- يستهلكه. هذه الهجرة تبني نصفه في القاعدة: المطالبة الذرّية والوسم.
-- والإرسال نفسه في الخادم، لأن HTTP لا يجوز داخل معاملة قاعدة بيانات.
--
-- ثلاثة قرارات تستحقّ الذكر:
--
-- (١) **لا حالة `sending` جديدة.** إضافة قيمة للتعداد تُقيّد الهجرات
--     لاحقاً بلا داعٍ؛ والحجز يكفيه ختمُ وقت (`email_claimed_at`) مع
--     مهلة. فما مضى على حجزه أكثر من المهلة يُعاد إلى المطالِبين — وهذا
--     ما ينقذ الطابور إن مات المُصرِّف بعد المطالبة وقبل الإرسال.
--
-- (٢) **التفضيلات تُراجَع عند المطالبة لا عند الإنشاء وحدها.** بين
--     إنشاء الإشعار وإرساله قد يمرّ وقت يُلغي فيه صاحبه اشتراكه. ولو
--     اكتفينا بفحص `notify()` لأرسلنا إليه بعد أن قال «كفى» — وهي
--     المخالفة نفسها التي بُنيت الطبقة كلها لمنعها.
--
-- (٣) **التسليم مرّة على الأقل لا مرّة بالضبط.** ضمان «مرّة بالضبط»
--     مستحيل عبر شبكة؛ فالمُصرِّف يمرّر معرّف الإشعار مفتاحَ تفرّد إلى
--     مزوّد البريد، والتكرار يُطرح هناك لا هنا.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ختم الحجز
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_claimed_at TIMESTAMPTZ;

-- الفهرس الجزئي القائم على `(email_state, created_at) WHERE pending` يخدم
-- الترتيب؛ وهذا يخدم شرط انتهاء المهلة على المحجوزة منها.
CREATE INDEX IF NOT EXISTS idx_notifications_claimed
  ON public.notifications(email_claimed_at)
  WHERE email_state = 'pending' AND email_claimed_at IS NOT NULL;


-- ---------------------------------------------------------------------
-- 2) الكنس: ما لم يعد يجوز إرساله يخرج من الطابور
-- ---------------------------------------------------------------------
-- يُنفَّذ قبل كل مطالبة. والسبب يُكتب، فيبقى الفرق بين «المنصّة مقفولة»
-- و«صاحبه رفض» قابلاً للتشخيص عند أي شكوى.
CREATE OR REPLACE FUNCTION public.sweep_email_outbox()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _held BOOLEAN; _n INTEGER;
BEGIN
  SELECT email_on_hold INTO _held FROM public.platform_settings WHERE id;

  IF COALESCE(_held, true) THEN
    UPDATE public.notifications
       SET email_state = 'skipped', email_skip_reason = 'platform_hold'
     WHERE email_state = 'pending';
    GET DIAGNOSTICS _n = ROW_COUNT;
    RETURN _n;
  END IF;

  UPDATE public.notifications n
     SET email_state = 'skipped',
         email_skip_reason = CASE WHEN NOT p.email_enabled
                                  THEN 'user_unsubscribed' ELSE 'kind_muted' END
    FROM public.notification_prefs p
   WHERE p.user_id = n.user_id
     AND n.email_state = 'pending'
     AND (NOT p.email_enabled OR n.kind = ANY(p.muted_kinds));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.sweep_email_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_email_outbox() TO service_role;


-- ---------------------------------------------------------------------
-- 3) المطالبة الذرّية
-- ---------------------------------------------------------------------
-- `FOR UPDATE SKIP LOCKED` تجعل مُصرِّفَين متوازيَين يقتسمان الطابور بلا
-- تنازع ولا ازدواج: ما يقفله أحدهما يتخطّاه الآخر.
CREATE OR REPLACE FUNCTION public.claim_email_batch(
  _limit INTEGER DEFAULT 25,
  _lease_seconds INTEGER DEFAULT 300,
  _max_attempts INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  recipient TEXT,
  kind public.notification_kind,
  title TEXT,
  body TEXT,
  link TEXT,
  unsubscribe_token UUID,
  attempts INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.sweep_email_outbox();

  RETURN QUERY
  WITH candidate AS (
    SELECT n.id
      FROM public.notifications n
     WHERE n.email_state = 'pending'
       AND n.email_attempts < _max_attempts
       AND (n.email_claimed_at IS NULL
            OR n.email_claimed_at < now() - make_interval(secs => _lease_seconds))
     ORDER BY n.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(_limit, 0)
  ),
  claimed AS (
    UPDATE public.notifications n
       SET email_claimed_at = now(),
           email_attempts = n.email_attempts + 1
      FROM candidate c
     WHERE n.id = c.id
    RETURNING n.id, n.user_id, n.kind, n.title, n.body, n.link, n.email_attempts
  )
  SELECT cl.id,
         u.email::text,
         cl.kind,
         cl.title,
         cl.body,
         cl.link,
         p.unsubscribe_token,
         -- `email_attempts` عمودها `smallint`، والنوع المعلَن `INTEGER`؛
         -- وPostgres يطابق أنواع RETURNS TABLE حرفياً لا بالتوسيع.
         cl.email_attempts::INTEGER
    FROM claimed cl
    JOIN auth.users u ON u.id = cl.user_id
    JOIN public.notification_prefs p ON p.user_id = cl.user_id
   WHERE u.email IS NOT NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_email_batch(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(INTEGER, INTEGER, INTEGER) TO service_role;


-- ---------------------------------------------------------------------
-- 4) الوسم بعد المحاولة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_email_sent(_ids UUID[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.notifications
     SET email_state = 'sent', email_sent_at = now(),
         email_error = NULL, email_claimed_at = NULL
   WHERE id = ANY(_ids) AND email_state = 'pending';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_email_sent(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_sent(UUID[]) TO service_role;


/* الفشل يُعاد إلى الطابور ما بقيت محاولات، ويستقرّ `failed` بعد نفادها.
   والخطأ يُحفظ لأن فشلاً بلا سبب لا يُشخَّص. */
CREATE OR REPLACE FUNCTION public.mark_email_failed(
  _id UUID, _error TEXT, _max_attempts INTEGER DEFAULT 5
)
RETURNS public.email_state LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _state public.email_state;
BEGIN
  UPDATE public.notifications
     SET email_error = left(COALESCE(_error, 'unknown'), 500),
         email_claimed_at = NULL,
         email_state = CASE WHEN email_attempts >= _max_attempts
                            THEN 'failed'::public.email_state
                            ELSE 'pending'::public.email_state END
   WHERE id = _id
  RETURNING email_state INTO _state;

  RETURN _state;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_email_failed(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_failed(UUID, TEXT, INTEGER) TO service_role;


/* المستلم المرفوض نهائياً (suppressed عند المزوّد) ليس فشلاً يُعاد:
   إعادته إهدارٌ ووسمٌ خاطئ. يخرج من الطابور بسببه. */
CREATE OR REPLACE FUNCTION public.mark_email_suppressed(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.notifications
     SET email_state = 'skipped', email_skip_reason = 'recipient_suppressed',
         email_claimed_at = NULL
   WHERE id = _id;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_email_suppressed(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_suppressed(UUID) TO service_role;
