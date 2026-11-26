-- =====================================================================
-- شرط الثقة على الكفالة الجديدة
-- ---------------------------------------------------------------------
-- ملفٌّ موسوم (تنبيهٌ حرج مفتوح أو تلاعبٌ مؤكَّد)، أو متعارض، أو بمصدرٍ واحد
-- حيث يوجد مؤكِّد، لا يقبل كفالةً جديدة. الشرط واحد (`golden_accepts_new_support`)
-- ويُقرأ في ثلاثة مواضع:
--   1) زناد قبل الإدراج على `sponsorships`: الحارس، لا يتجاوزه أحد (ولا الإدارة؛
--      يُحسم التنبيه أو التعارض أوّلاً، فيعود الملف تلقائياً).
--   2) الاقتراحات (`suggest_orphans_for_amount`، `suggest_orphans_for_sponsor`):
--      لا تقترح ملفاً سيُرفض عند الدفع.
--   3) شارة الكافل (`public_verification.accepts`): الزرّ يشرح بدل أن يفشل.
-- الكفالات القائمة لا تُمسّ: التحصيل الجاري والتجديد يمضيان، والإيقاف قرارٌ بشري.
-- =====================================================================

-- البوابة نفسها بحكم `golden_trust` (يقبل: موثّق، سابقٌ للطبقة، متقادم)، لكن بفحوصٍ
-- مفهرسة بدل حساب الدرجة كلّها: تُنادى لكل صفٍّ في الاقتراحات، والسعة ١٠٬٠٠٠ ملف.
-- golden-gate-verification يقفل تطابقها مع golden_trust.
CREATE INDEX IF NOT EXISTS idx_alert_orphan_critical ON public.data_alerts(orphan_id)
  WHERE severity = 'critical' AND status IN ('open', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_conflict_orphan_open ON public.data_conflicts(orphan_id) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.golden_accepts_new_support(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT NOT (
    EXISTS (SELECT 1 FROM public.data_alerts a WHERE a.orphan_id = _orphan
               AND a.severity = 'critical' AND a.status IN ('open', 'confirmed'))
    OR EXISTS (SELECT 1 FROM public.data_conflicts d WHERE d.orphan_id = _orphan AND d.status = 'open')
    OR (EXISTS (SELECT 1 FROM public.orphans o JOIN public.country_data_sources s ON s.country_code = o.country_code
                 WHERE o.id = _orphan AND s.office_mode IN ('shadow', 'active'))
        AND EXISTS (SELECT 1 FROM public.orphan_field_observations f
                     WHERE f.orphan_id = _orphan
                       AND f.observed_at >= now() - make_interval(days => COALESCE(
                             (SELECT s.stale_after_days FROM public.orphans o
                                JOIN public.country_data_sources s ON s.country_code = o.country_code
                               WHERE o.id = _orphan), 180)))
        AND NOT EXISTS (SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = _orphan AND l.role = 'office')));
$fn$;
REVOKE ALL ON FUNCTION public.golden_accepts_new_support(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_accepts_new_support(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.block_sponsorship_unverified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.golden_accepts_new_support(NEW.orphan_id) THEN
    RAISE EXCEPTION 'file_under_verification' USING ERRCODE = '42501',
      HINT = 'الملف قيد التحقق: يُحسم تنبيهه أو تعارضه أوّلاً.';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.block_sponsorship_unverified() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS block_sponsorship_unverified ON public.sponsorships;
CREATE TRIGGER block_sponsorship_unverified BEFORE INSERT ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.block_sponsorship_unverified();

-- من التعريف الحيّ بعد السلسلة (ما رقّعته هجراتٌ لاحقة باقٍ)، مع شرط الثقة وحده.
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_amount(_amount numeric, _exclude uuid DEFAULT NULL::uuid, _limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, code text, display_name text, country text, region text, education_stage text, currency text, monthly_need numeric, funded_monthly numeric, gap numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.code, o.display_name, o.country,
         CASE WHEN public.cohort_is_safe(o.id) THEN o.region END,
         CASE WHEN public.cohort_is_safe(o.id) THEN o.education_stage END,
         o.currency,
         o.monthly_need, o.funded_monthly,
         (o.monthly_need - o.funded_monthly) AS gap
    FROM public.orphans o
   WHERE o.status = 'approved' AND public.golden_accepts_new_support(o.id)
     AND o.monthly_need > o.funded_monthly
     AND (_exclude IS NULL OR o.id <> _exclude)
   ORDER BY abs((o.monthly_need - o.funded_monthly) - _amount), o.created_at
   LIMIT LEAST(GREATEST(_limit, 1), 10);
$function$;

-- من التعريف الحيّ بعد السلسلة (ما رقّعته هجراتٌ لاحقة باقٍ)، مع شرط الثقة وحده.
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(_budget numeric DEFAULT NULL::numeric, _region text DEFAULT NULL::text, _limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, code text, display_name text, gender text, country text, region text, education_stage text, age_band age_band, monthly_need numeric, funded_monthly numeric, currency text, status orphan_status, org_id uuid, created_at timestamp with time zone, gap numeric, building boolean, completes boolean, in_region boolean, waiting_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT COALESCE(_budget, p.monthly_budget) AS budget,
           COALESCE(NULLIF(btrim(COALESCE(_region, '')), ''), p.preferred_region) AS region
      FROM (SELECT NULL::UUID) z
      LEFT JOIN public.profiles p ON p.id = auth.uid()
  ),
  cand AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country, o.birth_date,
           o.monthly_need, o.funded_monthly, o.currency, o.status, o.org_id,
           o.created_at, o.approved_at,
           cs.safe,
           o.region AS raw_region, o.education_stage AS raw_stage,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
              JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id
                AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public._enrollment_supervisor_any(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status = 'approved' AND public.golden_accepts_new_support(o.id)
       AND (o.monthly_need - o.funded_monthly) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.sponsorships s
          WHERE s.orphan_id = o.id
            AND s.sponsor_id = auth.uid()
            AND s.status IN ('pending_payment', 'active', 'paused')
       )
  ),
  masked AS (
    SELECT c.*,
           CASE WHEN c.safe THEN c.raw_region END AS m_region,
           CASE WHEN c.safe THEN c.raw_stage END AS m_stage,
           CASE WHEN c.safe THEN c.org_id END AS m_org
      FROM cand c
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.m_region,
         c.m_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status, c.m_org,
         c.created_at,
         c.gap,
         c.building,
         (me.budget IS NOT NULL AND c.gap <= me.budget) AS completes,
         (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) AS in_region,
         GREATEST(0, (now()::date - COALESCE(c.approved_at, c.created_at)::date))::INTEGER
    FROM masked c CROSS JOIN me
   ORDER BY
     c.building DESC,
     (me.budget IS NOT NULL AND c.gap <= me.budget) DESC,
     (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) DESC,
     COALESCE(c.approved_at, c.created_at) ASC,
     c.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 48);
$function$;

CREATE OR REPLACE FUNCTION public.public_verification(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'level', CASE WHEN t->>'state' = 'verified' AND t->>'basis' = 'two_sources' THEN 'two_sources'
                  WHEN t->>'state' = 'verified' THEN 'primary_source'
                  ELSE 'under_review' END,
    -- هل يقبل الملف كفالةً جديدة الآن: الشرط نفسه الذي يحرس الإدراج.
    'accepts', public.golden_accepts_new_support(o.id),
    'verified_month', CASE WHEN t->>'state' = 'verified' THEN
      (SELECT to_char(max(f.observed_at), 'YYYY-MM') FROM public.orphan_field_observations f WHERE f.orphan_id = o.id) END)
  FROM public.orphans o, LATERAL (SELECT public.golden_trust(o.id) AS t) x
  WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
$fn$;
