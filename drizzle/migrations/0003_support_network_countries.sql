ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS in_network boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.countries.in_network IS 'Country has a public WAMY presence (office or field) on the main map; qualification/in-kind support may target it.';

CREATE OR REPLACE FUNCTION public.support_catalog(_country text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT code, name_ar FROM public.countries
     WHERE (status = 'active' OR in_network) AND (_country IS NULL OR code = _country)
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar) ORDER BY name_ar) FROM c), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('country', r.country, 'name', r.region))
                           FROM (SELECT g.country_code AS country, g.region FROM public.mirror_groups g
                                  WHERE g.deleted_at IS NULL AND g.region IS NOT NULL
                                 UNION
                                 SELECT o.country_code, o.region FROM public.offices o
                                  WHERE o.active AND o.region IS NOT NULL) r
                          WHERE r.country IN (SELECT code FROM c)), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', g.id, 'name', g.name, 'country', g.country_code, 'region', g.region,
                          'children', (SELECT count(*) FROM public.orphans o WHERE o.group_id = g.id AND o.status = 'approved'))
                        ORDER BY g.region NULLS LAST, g.name)
                          FROM public.mirror_groups g
                         WHERE g.deleted_at IS NULL AND g.country_code IN (SELECT code FROM c)), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'name', o.name, 'kind', k.label, 'country', o.country_code, 'region', o.region)
                        ORDER BY o.name)
                          FROM public.care_organizations o
                          LEFT JOIN public.institution_kinds k ON k.key = o.kind
                         WHERE o.status = 'approved' AND o.country_code IN (SELECT code FROM c)), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.create_support_pledge(_kind text, _target_type text, _target text, _amount numeric, _country text DEFAULT NULL::text, _note text DEFAULT NULL::text, _currency text DEFAULT 'EUR'::text, _elapsed integer DEFAULT NULL::integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _id UUID;
  _orphan UUID; _group UUID; _org UUID; _region TEXT; _cc TEXT;
  _cur TEXT := upper(btrim(COALESCE(_currency, 'EUR')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF _cur !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'invalid_currency'; END IF;

  IF _target_type = 'orphan' THEN
    SELECT o.id, g.country_code INTO _orphan, _cc
      FROM public.orphans o LEFT JOIN public.mirror_groups g ON g.id = o.group_id
     WHERE o.id = _target::UUID AND o.status = 'approved';
    IF _orphan IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := COALESCE(_cc, _country);
  ELSIF _target_type = 'group' THEN
    SELECT g.id, g.country_code INTO _group, _cc FROM public.mirror_groups g
     WHERE g.id = _target::UUID AND g.deleted_at IS NULL;
    IF _group IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  ELSIF _target_type = 'institution' THEN
    SELECT c.id INTO _org FROM public.care_organizations c
     WHERE c.id = _target::UUID AND c.status = 'approved';
    IF _org IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'region' THEN
    _region := NULLIF(btrim(_target), '');
    IF _region IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'country' THEN
    _cc := COALESCE(NULLIF(btrim(_target), ''), _country);
  ELSE
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  IF _cc IS NULL OR NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc AND (status = 'active' OR in_network)) THEN
    RAISE EXCEPTION 'country_not_active';
  END IF;

  INSERT INTO public.support_pledges
    (supporter_id, kind, target_type, orphan_id, group_id, org_id, country_code, region,
     amount, currency, note, elapsed_seconds)
  VALUES (_uid, _kind, _target_type, _orphan, _group, _org, _cc, _region,
          _amount, _cur, NULLIF(btrim(_note), ''),
          CASE WHEN _elapsed IS NULL THEN NULL ELSE LEAST(86400, GREATEST(0, _elapsed)) END)
  RETURNING id INTO _id;
  RETURN _id;
END $function$;