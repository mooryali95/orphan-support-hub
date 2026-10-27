-- =====================================================================
-- كهاتين — كتالوج أهداف الدعم وتعهّداتي
-- ---------------------------------------------------------------------
-- مسار الدعم يحتاج أن يعرض للداعم ما يمكنه اختياره دون أن يفتح جداول
-- المرآة: المجموعة تظهر باسمها ومنطقتها وعدد أطفالها فقط — لا أسماء
-- ولا مشرف (ذلك نطاق «group» بإذن الإدارة).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.support_catalog(_country TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH c AS (
    SELECT code, name_ar FROM public.countries
     WHERE status = 'active' AND (_country IS NULL OR code = _country)
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar) ORDER BY name_ar)
                             FROM c), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('country', r.country, 'name', r.region))
                           FROM (SELECT g.country_code AS country, g.region FROM public.mirror_groups g
                                  WHERE g.deleted_at IS NULL AND g.region IS NOT NULL
                                 UNION
                                 SELECT o.country_code, o.region FROM public.offices o
                                  WHERE o.active AND o.region IS NOT NULL) r
                          WHERE r.country IN (SELECT code FROM c)), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', g.id, 'name', g.name, 'country', g.country_code, 'region', g.region,
                          'children', (SELECT count(*) FROM public.orphans o
                                        WHERE o.group_id = g.id AND o.status = 'approved'))
                        ORDER BY g.region NULLS LAST, g.name)
                          FROM public.mirror_groups g
                         WHERE g.deleted_at IS NULL AND g.country_code IN (SELECT code FROM c)), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'name', o.name, 'kind', k.label, 'country', o.country_code,
                          'region', o.region)
                        ORDER BY o.name)
                          FROM public.care_organizations o
                          LEFT JOIN public.institution_kinds k ON k.key = o.kind
                         WHERE o.status = 'approved' AND o.country_code IN (SELECT code FROM c)), '[]'::jsonb));
$fn$;
GRANT EXECUTE ON FUNCTION public.support_catalog(TEXT) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.my_pledges()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
           'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
           'target', CASE p.target_type
                       WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                       WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                       WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                       WHEN 'region' THEN p.region
                       ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code)
                     END)
         ORDER BY p.created_at DESC), '[]'::jsonb)
    FROM public.support_pledges p
   WHERE p.supporter_id = auth.uid();
$fn$;
REVOKE ALL ON FUNCTION public.my_pledges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pledges() TO authenticated;
