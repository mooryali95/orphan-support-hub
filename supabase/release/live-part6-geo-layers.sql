BEGIN;

CREATE OR REPLACE FUNCTION public.geo_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pub AS (
    SELECT o.id,
           btrim(o.country) AS country,
           NULLIF(btrim(o.region), '') AS region,
           (o.status = 'fully_sponsored') AS sponsored,
           GREATEST(0, o.monthly_need - o.funded_monthly) AS gap,
           o.currency,
           EXISTS (SELECT 1 FROM public.disbursements d
                    WHERE d.orphan_id = o.id AND d.status = 'delivered'
                      AND d.delivered_at > now() - interval '90 days') AS delivered
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.country), '') <> ''
  ),
  reg AS (
    SELECT country, region,
           count(*) AS total,
           count(*) FILTER (WHERE sponsored) AS spon,
           count(*) FILTER (WHERE delivered) AS deliv,
           mode() WITHIN GROUP (ORDER BY currency) AS currency
      FROM pub WHERE region IS NOT NULL GROUP BY country, region
  ),
  reg_gap AS (
    SELECT r.country, r.region, sum(p.gap) AS gap
      FROM reg r JOIN pub p ON p.country = r.country AND p.region = r.region
                           AND p.currency = r.currency
     GROUP BY r.country, r.region
  ),
  cty AS (
    SELECT country,
           count(*) AS total,
           count(*) FILTER (WHERE sponsored) AS spon,
           count(*) FILTER (WHERE delivered) AS deliv,
           mode() WITHIN GROUP (ORDER BY currency) AS currency
      FROM pub GROUP BY country
  ),
  cty_gap AS (
    SELECT c.country, sum(p.gap) AS gap
      FROM cty c JOIN pub p ON p.country = c.country AND p.currency = c.currency
     GROUP BY c.country
  ),
  shaped AS (
    SELECT c.country, c.total, c.spon, c.deliv, c.currency, cg.gap,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'region', r.region,
                      'small', r.total < public.cohort_min(),
                      'total', CASE WHEN r.total < public.cohort_min() THEN NULL ELSE r.total END,
                      'sponsored', CASE WHEN r.total < public.cohort_min()
                                          OR r.spon < public.cohort_min()
                                          OR r.total - r.spon < public.cohort_min()
                                        THEN NULL ELSE r.spon END,
                      'delivered', CASE WHEN r.total < public.cohort_min()
                                          OR r.deliv < public.cohort_min()
                                          OR r.total - r.deliv < public.cohort_min()
                                        THEN NULL ELSE r.deliv END,
                      'gap', CASE WHEN r.total < public.cohort_min() THEN NULL ELSE rg.gap END,
                      'currency', CASE WHEN r.total < public.cohort_min() THEN NULL ELSE r.currency END)
                    ORDER BY r.total DESC, r.region)
               FROM reg r JOIN reg_gap rg ON rg.country = r.country AND rg.region = r.region
              WHERE r.country = c.country), '[]'::jsonb) AS regions
      FROM cty c JOIN cty_gap cg ON cg.country = c.country
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
        'delivered', CASE WHEN s.total < public.cohort_min()
                            OR s.deliv < public.cohort_min()
                            OR s.total - s.deliv < public.cohort_min()
                          THEN NULL ELSE s.deliv END,
        'gap', CASE WHEN s.total < public.cohort_min() THEN NULL ELSE s.gap END,
        'currency', CASE WHEN s.total < public.cohort_min() THEN NULL ELSE s.currency END,
        'regions', s.regions)
      ORDER BY s.total DESC, s.country), '[]'::jsonb)
  ) FROM shaped s;
$fn$;
REVOKE ALL ON FUNCTION public.geo_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geo_stats() TO anon, authenticated;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260929100000', 'geo_layers');
COMMIT;
