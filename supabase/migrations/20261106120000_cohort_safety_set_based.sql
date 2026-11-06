-- =====================================================================
-- المرحلة صفر — حماية الحشد تُحسب مرّةً لكلّ نداء (المجموعة PERF)
-- ---------------------------------------------------------------------
-- PERF-01 / RT-01: `cohort_is_safe(id)` تعدّ الأطفال المنشورين الذين
-- يشاركون الطفل بلده ومنطقته وجنسه وفئته العمرية — بمسحٍ كامل للجدول.
-- و`list_orphan_cards` تناديها مرّتين لكلّ طفلٍ منشور قبل الترقيم،
-- و`orphan_filter_options` واقتراحُ الكافل مرّةً لكلّ طفل. فالدليل
-- O(n²): ١٣ ثانية عند ألف طفل، ويتجاوز مهلة الزائر في Supabase (نحو ٣
-- ثوانٍ) من نحو خمسمئة — فتظهر صفحة /orphans فارغةً وتختفي الفلاتر بصمت.
--
-- الإصلاح: الحشود تُعدّ مرّةً واحدة بنافذة
-- `count(*) OVER (PARTITION BY بلد، منطقة، جنس، فئة عمرية)` على
-- المنشورين، وتُربط بالطفل بمعرّفه. **والحجب نفسه لم يتغيّر حرفاً**:
--   • PARTITION BY تعامل NULL كقيمةٍ واحدة — وهو `IS NOT DISTINCT FROM`
--     الذي كانت تستعمله الدالّة؛
--   • الفئة العمرية من `age_band_of` نفسها ولا تكون NULL أبداً؛
--   • العدّ على المنشورين وحدهم (approved / fully_sponsored)، والطفل
--     المنشور يُعدّ في حشده كما كان؛
--   • الحدّ `cohort_min()` نفسه.
-- والتكافؤ مُثبَتٌ بمقارنة المخرجات القديمة والجديدة على بياناتٍ مولّدة
-- (`supabase/tests/cohort-perf-verification.sql`)، والقياس على ٢٠٠٠ و٥٠٠٠
-- طفل في `scripts/db-bench-catalogue.sh`.
--
-- و`cohort_is_safe(id)` تبقى كما هي لنداء الطفل الواحد (صفحة الطفل،
-- واقتراح المبلغ بعد LIMIT): كلفتها خطّية، ولا تتغيّر دلالتها.
--
-- PERF-03 (الجزء الآمن منه): أكثر سياسات القراءة نداءً تنادي `auth.uid()`
-- و`is_admin()` لكلّ صفّ. كلاهما STABLE بلا وسيطٍ من الصفّ، فلفّهما بـ
-- `(SELECT …)` يجعلهما يُحسبان مرّةً للاستعلام والنتيجة واحدة. يُغيَّر
-- التعبير وحده بـ ALTER POLICY: الأدوار والأمر كما هما.
--
-- كلّ ما هنا `CREATE OR REPLACE` و`ALTER`، وتواقيع الدوالّ كما هي، والمنح
-- صريحة (سحبٌ ثم منح) لأنّ صلاحيات Supabase الافتراضية تمنح العموم كلّ
-- دالّةٍ جديدة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) الفئة العمرية تتبع اليوم، فهي STABLE لا IMMUTABLE
-- ---------------------------------------------------------------------
-- كانت معلنةً IMMUTABLE وهي تقرأ CURRENT_DATE. وهذا خطأٌ دلاليّ (خطّةٌ
-- محفوظة قد تُثبّت فئة يومٍ مضى) ويمنع المخطِّط من دمجها في الاستعلام،
-- فتُنادى دالّةً لكلّ صفّ. لا فهرس ولا قيد يعتمد عليها.
ALTER FUNCTION public.age_band_of(DATE) STABLE;


-- ---------------------------------------------------------------------
-- ٢) أمان الحشد لكلّ المنشورين دفعةً واحدة
-- ---------------------------------------------------------------------
-- تُنادى من داخل دوالّ DEFINER وحدها (البطاقات، الفلاتر، الاقتراح)،
-- فهي INVOKER ومغلقةٌ على العموم: لا حاجة لأن يعدّد الزائر من حشده صغير.
CREATE OR REPLACE FUNCTION public.cohort_safety()
RETURNS TABLE (orphan_id UUID, safe BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT o.id,
         count(*) OVER (
           PARTITION BY o.country, o.region, o.gender, public.age_band_of(o.birth_date)
         ) >= public.cohort_min()
    FROM public.orphans o
   WHERE o.status IN ('approved', 'fully_sponsored');
$fn$;
REVOKE ALL ON FUNCTION public.cohort_safety() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٣) الدليل: الحجب نفسه، والحشود تُعدّ مرّة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,
  _building BOOLEAN DEFAULT NULL,
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0,
  _group UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب لا يُحذف: محرف البدل يصير محرفاً عادياً لا «كلّ شيء». */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها.
              والحشد محسوبٌ مرّةً لكلّ النداء في `cohort_safety()`. */
           CASE WHEN cs.safe THEN o.region END AS region,
           CASE WHEN cs.safe THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           o.status, o.org_id, o.created_at, o.group_id,
           public.age_band_of(o.birth_date) AS age_band,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
               JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building,
           GREATEST(0, (now()::date - COALESCE(o.approved_at, o.created_at)::date))::INTEGER
             AS waiting_days,
           /* إشارات الثقة: عددٌ ونعم/لا، لا محتوى. */
           (SELECT count(*) FROM public.orphan_profile_sections p
             WHERE p.orphan_id = o.id)::INTEGER AS profile_sections,
           (o.photo_consent IN ('granted', 'face_hidden')) AS consent_documented,
           EXISTS (SELECT 1 FROM public.progress_reports r
                    WHERE r.orphan_id = o.id AND r.status = 'approved'
                      AND r.updated_at > now() - interval '90 days') AS recent_report
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       /* الفلترة على المنطقة المحجوبة لا الخام: وإلا صار سؤال «هل في
          كوكس أحد؟» جواباً. */
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       AND (_group IS NULL OR b.group_id = _group)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN _sort = 'documented' THEN f.profile_sections END DESC,
          CASE WHEN _sort = 'documented' THEN f.recent_report END DESC,
          CASE WHEN COALESCE(_sort,'waiting') = 'waiting' THEN f.waiting_days END DESC,
          f.id
      ) AS ord
        FROM filtered f
       ORDER BY ord
       LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 60)
      OFFSET GREATEST(COALESCE(_offset, 0), 0)
    ) t;

  RETURN jsonb_build_object('rows', _rows, 'total', _total);
END $fn$;
REVOKE ALL ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  TO anon, authenticated;


-- خيارات المنطقة والمرحلة لا تُدرج قيمةً لا يظهر فيها أحد: كانت تُنبئ بوجودها.
CREATE OR REPLACE FUNCTION public.orphan_filter_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pub AS (
    SELECT o.country, o.region, o.education_stage, cs.safe
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status IN ('approved', 'fully_sponsored')
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT p.country) FROM pub p
                            WHERE COALESCE(btrim(p.country), '') <> ''), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT p.region) FROM pub p
                          WHERE COALESCE(btrim(p.region), '') <> ''
                            AND p.safe), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(DISTINCT p.education_stage) FROM pub p
                         WHERE COALESCE(btrim(p.education_stage), '') <> ''
                           AND p.safe), '[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.orphan_filter_options() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_filter_options() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ٤) اقتراح الكافل: الحجب نفسه (DB-A)، والحشود تُعدّ مرّة
-- ---------------------------------------------------------------------
-- كان يحسب `cohort_is_safe` لكلّ مرشَّحٍ قبل الترتيب، فهو O(n²) كالدليل.
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _limit INT DEFAULT 12
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, gender TEXT,
  country TEXT, region TEXT, education_stage TEXT, age_band public.age_band,
  monthly_need NUMERIC, funded_monthly NUMERIC, currency TEXT,
  status public.orphan_status, org_id UUID, created_at TIMESTAMPTZ,
  gap NUMERIC, building BOOLEAN, completes BOOLEAN, in_region BOOLEAN,
  waiting_days INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status = 'approved'
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
           CASE WHEN c.safe THEN c.raw_stage END AS m_stage
      FROM cand c
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.m_region,
         c.m_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status, c.org_id,
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
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  TO authenticated;


-- ---------------------------------------------------------------------
-- ٥) PERF-03 — `auth.uid()` و`is_admin()` تُحسبان مرّةً للاستعلام
-- ---------------------------------------------------------------------
-- السجلّ المالي والإشعارات أكبر الجداول نموّاً، وكلّ مسجَّلٍ يقرؤها
-- بالمفتاح العامّ. كان الشرط يُنادي الدالّتين لكلّ صفّ (٥ ثوانٍ عند
-- ٢٠٠ ألف دفعة)؛ والصيغة `(SELECT …)` تجعلهما InitPlan يُحسب مرّة.
-- الشرط نفسه، فلا يتغيّر من يرى ماذا (وتقديم `is_admin` على
-- `can_manage_orphan` في «أو» لا يغيّر النتيجة، ويوفّر على الإدارة نداءً
-- لكلّ صفّ). و`can_manage_orphan(orphan_id)` تأخذ وسيطاً من الصفّ فتبقى.
ALTER POLICY "payments_read" ON public.sponsorship_payments
  USING (sponsor_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

ALTER POLICY "sponsorships_read" ON public.sponsorships
  USING (sponsor_id = (SELECT auth.uid())
         OR (SELECT public.is_admin())
         OR public.can_manage_orphan(orphan_id));

ALTER POLICY "notif_read_own" ON public.notifications
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "notif_update_own" ON public.notifications
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
