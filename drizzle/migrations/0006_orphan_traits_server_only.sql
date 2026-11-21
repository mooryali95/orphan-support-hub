CREATE OR REPLACE FUNCTION public._orphan_traits_data(_orphan uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.dimension_order, x.dimension, x.name)
      FROM (
        SELECT d.key AS dimension, d.label_ar AS dimension_label, d.sort_order AS dimension_order,
               t.id AS trait_id, t.name_ar AS name,
               (SELECT round(100 * s.score / s.scale_max, 1) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                 ORDER BY s.observed_at ASC LIMIT 1) AS first_percent,
               (SELECT round(100 * s.score / s.scale_max, 1) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                 ORDER BY s.observed_at DESC LIMIT 1) AS latest_percent,
               (SELECT count(*) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL) AS observations
          FROM public.trait_definitions t
          JOIN public.trait_dimensions d ON d.id = t.dimension_id
         WHERE t.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM public.orphan_trait_scores s
                        WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL)
      ) x), '[]'::jsonb);
$fn$;
REVOKE ALL ON FUNCTION public._orphan_traits_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._orphan_traits_data(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.orphan_traits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_traits(uuid) TO service_role;