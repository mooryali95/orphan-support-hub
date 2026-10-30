-- =====================================================================
-- مصدرٌ واحد للجغرافيا: كم يتيماً في كل دولة وكل منطقة
-- ---------------------------------------------------------------------
-- الخارطة، وقائمتا البلد والمنطقة في الدليل، والصفحات التي تسأل «أين؟»
-- تقرأ كلّها من هذه الدالّة — فلا تُظهر الخارطة دولةً لا يجدها الدليل،
-- ولا العكس.
--
-- الحماية في القاعدة لا في الواجهة: ما دون حدّ الحشد (cohort_min) يُعاد
-- «صغيراً» بلا رقم، وتقسيم «مكفول/ينتظر» يُحجب إن صغر أحد شقّيه — فلا
-- يُستنتج من الخارطة أن طفلاً بعينه في قريةٍ بعينها بلا كافل.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.geo_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pub AS (
    SELECT btrim(o.country) AS country,
           NULLIF(btrim(o.region), '') AS region,
           (o.status = 'fully_sponsored') AS sponsored
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.country), '') <> ''
  ),
  reg AS (
    SELECT country, region, count(*) AS total, count(*) FILTER (WHERE sponsored) AS spon
      FROM pub WHERE region IS NOT NULL GROUP BY country, region
  ),
  cty AS (
    SELECT country, count(*) AS total, count(*) FILTER (WHERE sponsored) AS spon
      FROM pub GROUP BY country
  ),
  shaped AS (
    SELECT c.country,
           c.total, c.spon,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'region', r.region,
                      'small', r.total < public.cohort_min(),
                      'total', CASE WHEN r.total < public.cohort_min() THEN NULL ELSE r.total END,
                      'sponsored', CASE WHEN r.total < public.cohort_min()
                                          OR r.spon < public.cohort_min()
                                          OR r.total - r.spon < public.cohort_min()
                                        THEN NULL ELSE r.spon END)
                    ORDER BY r.total DESC, r.region)
               FROM reg r WHERE r.country = c.country), '[]'::jsonb) AS regions
      FROM cty c
  )
  SELECT jsonb_build_object(
    'countries', COALESCE(jsonb_agg(jsonb_build_object(
        'country', s.country,
        'small', s.total < public.cohort_min(),
        'total', CASE WHEN s.total < public.cohort_min() THEN NULL ELSE s.total END,
        'sponsored', CASE WHEN s.total < public.cohort_min()
                            OR s.spon < public.cohort_min()
                            OR s.total - s.spon < public.cohort_min()
                          THEN NULL ELSE s.spon END,
        'regions', s.regions)
      ORDER BY s.total DESC, s.country), '[]'::jsonb)
  ) FROM shaped s;
$fn$;
REVOKE ALL ON FUNCTION public.geo_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.geo_stats() TO anon, authenticated;
