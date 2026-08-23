-- =====================================================================
-- المرحلة 7 — التقوية والامتثال
-- =====================================================================
-- تغطي M1 (رؤوس أمنية — في الكود) و M2 (حرّاس المسارات — في الكود)
-- و M6 (تحديد المعدّل) وأساس الامتثال لحماية بيانات الطفل.
-- =====================================================================

-- ---------------------------------------------------------------------
-- M6 — تحديد المعدّل
-- ---------------------------------------------------------------------
-- العدّاد في القاعدة لا في ذاكرة العملية: النشر على Cloudflare يعني عدّة
-- عمليات لا واحدة، وعدّاد في الذاكرة يُقسَّم عليها فيصير الحدّ المعلن
-- أضعافه فعلياً.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  -- المفتاح: المجال + الهوية (بصمة IP أو معرّف مستخدم).
  bucket TEXT NOT NULL,
  identity TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identity, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

-- لا صلاحية للعميل إطلاقاً: عدّاد يكتبه العميل عدّادٌ يُصفّره العميل.
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hit_rate_limit(
  _bucket TEXT, _identity TEXT, _limit INTEGER, _window_seconds INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _start TIMESTAMPTZ;
  _hits INTEGER;
BEGIN
  -- النافذة ثابتة الحدود لا منزلقة: أرخص بكثير، والفرق لا يُذكر عند
  -- هذه الأحجام. `to_timestamp(floor(epoch/window)*window)` يُثبّت البداية.
  _start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limits (bucket, identity, window_start, hits)
  VALUES (_bucket, _identity, _start, 1)
  ON CONFLICT (bucket, identity, window_start)
  DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO _hits;

  RETURN jsonb_build_object(
    'allowed', _hits <= _limit,
    'hits', _hits,
    'limit', _limit,
    'reset_at', _start + make_interval(secs => _window_seconds)
  );
END $fn$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

/* التنظيف: نوافذ قديمة لا قيمة لها ولا يجوز أن تنمو بلا حدّ. */
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '1 day';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limits() TO service_role;

-- ---------------------------------------------------------------------
-- الامتثال — أساس المعالجة والاحتفاظ
-- ---------------------------------------------------------------------
-- بيانات هذه المنصة بيانات أطفال: هوية، وصاية، حالة صحّية، صور. وهي من
-- أعلى فئات الحساسية في كل نظام حماية بيانات. والتوثيق هنا ليس زينة:
-- «ما أساس معالجتك لهذه البيانات، وإلى متى تحتفظ بها» أول ما يُسأل عنه.

DO $$ BEGIN
  CREATE TYPE public.processing_basis AS ENUM (
    'guardian_consent',   -- موافقة ولي الأمر
    'legitimate_interest',-- مصلحة مشروعة (تشغيل الكفالة)
    'legal_obligation',   -- التزام نظامي (سجلّات مالية)
    'vital_interest'      -- مصلحة حيوية (حالة طبية طارئة)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.data_retention_policy (
  -- الجدول أو فئة البيانات
  entity TEXT PRIMARY KEY,
  basis public.processing_basis NOT NULL,
  -- مدّة الاحتفاظ بعد انتهاء الغرض، بالأشهر. NULL = يُحتفظ به بلا حدّ
  -- (السجلّ المالي مثلاً، ويُبرَّر في `note`).
  retain_months SMALLINT CHECK (retain_months IS NULL OR retain_months > 0),
  note TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_retention_policy TO authenticated;
GRANT ALL ON public.data_retention_policy TO service_role;
ALTER TABLE public.data_retention_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "retention_read" ON public.data_retention_policy;
CREATE POLICY "retention_read" ON public.data_retention_policy
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.data_retention_policy (entity, basis, retain_months, note) VALUES
  ('orphan_private', 'guardian_consent', 24,
   'الاسم الكامل والهوية والوصاية والحالة الصحّية. تُحذف بعد سنتين من انتهاء آخر كفالة، أو فور سحب موافقة ولي الأمر.'),
  ('orphan_documents', 'guardian_consent', 24,
   'وثائق الإثبات. الغرض ينتهي بانتهاء الحاجة إلى التحقّق؛ والاحتفاظ بها بعد ذلك مخاطرة بلا فائدة.'),
  ('orphans.photo_url', 'guardian_consent', NULL,
   'الصورة تُحذف فور سحب الموافقة — لا انتظار مدّة. المُشغّل ينفّذ ذلك في الحال.'),
  ('sponsorship_payments', 'legal_obligation', NULL,
   'سجلّ مالي: يُحتفظ به بمقتضى الالتزامات المحاسبية ولا يُحذف بطلب.'),
  ('progress_reports', 'legitimate_interest', 60,
   'تقارير الأثر. يُحتفظ بها ما دامت الكفالة قائمة وخمس سنوات بعدها للمساءلة.'),
  ('notifications', 'legitimate_interest', 12,
   'الإشعارات وسجلّ إرسالها. سنة تكفي للاستقصاء ثم تُحذف.'),
  ('audit_log', 'legal_obligation', NULL,
   'سجلّ التدقيق: حذفه يُبطل الغرض منه.'),
  ('rate_limits', 'legitimate_interest', 1,
   'بصمات مؤقّتة لمنع الإساءة. تُنظَّف يومياً.')
ON CONFLICT (entity) DO NOTHING;

-- ---------------------------------------------------------------------
-- صحّة النظام — لوحة واحدة تُقرأ بنظرة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.system_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'system_health: not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'payments', jsonb_build_object(
      'on_hold', (SELECT payments_on_hold FROM public.platform_settings WHERE id),
      'hold_reason', (SELECT payments_hold_reason FROM public.platform_settings WHERE id),
      'hold_since', (SELECT payments_hold_since FROM public.platform_settings WHERE id),
      -- أحداث فشل التطبيق: مؤشّر عطل حقيقي لا إحصاء.
      'events_failed_24h', (SELECT count(*) FROM public.payment_events
                             WHERE error IS NOT NULL AND created_at > now() - INTERVAL '24 hours'),
      'events_unprocessed', (SELECT count(*) FROM public.payment_events
                              WHERE processed_at IS NULL AND error IS NULL),
      'payments_failed_7d', (SELECT count(*) FROM public.sponsorship_payments
                              WHERE status = 'failed' AND created_at > now() - INTERVAL '7 days')
    ),
    'email', jsonb_build_object(
      'pending', (SELECT count(*) FROM public.notifications WHERE email_state = 'pending'),
      'failed', (SELECT count(*) FROM public.notifications WHERE email_state = 'failed'),
      'sent_24h', (SELECT count(*) FROM public.notifications
                    WHERE email_state = 'sent' AND email_sent_at > now() - INTERVAL '24 hours')
    ),
    'queues', jsonb_build_object(
      'orphans_pending', (SELECT count(*) FROM public.orphans
                           WHERE status IN ('submitted','under_review')),
      'orgs_pending', (SELECT count(*) FROM public.care_organizations WHERE status = 'pending'),
      'reports_pending', (SELECT count(*) FROM public.progress_reports WHERE status = 'submitted'),
      -- ملفّات بلا تقرير منذ ستّين يوماً: وعد التقارير الدورية يتآكل صامتاً.
      'orphans_stale_reports', (
        SELECT count(*) FROM public.orphans o
         WHERE o.status IN ('approved','fully_sponsored')
           AND NOT EXISTS (SELECT 1 FROM public.progress_reports r
                            WHERE r.orphan_id = o.id AND r.status = 'approved'
                              AND r.published_at > now() - INTERVAL '60 days'))
    ),
    'privacy', jsonb_build_object(
      -- يجب أن يبقى صفراً: الحارس يمنعه، وظهوره يعني خللاً في الحارس.
      'photos_without_consent', (SELECT count(*) FROM public.orphans
                                  WHERE COALESCE(photo_url,'') <> ''
                                    AND photo_consent NOT IN ('granted','face_hidden')),
      'consent_withdrawn', (SELECT count(*) FROM public.orphans WHERE photo_consent = 'withdrawn'),
      'documents_unverified', (SELECT count(*) FROM public.orphan_documents WHERE NOT verified)
    ),
    'generated_at', now()
  ) INTO _out;

  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.system_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_health() TO authenticated;
