-- «بانتظار غيرك»: كل بندٍ يقول هل رفعه المنادي، فلا يُعرض له زرّ حسمٍ سترفضه قاعدة العينين.
-- تلميحٌ للواجهة وحده؛ الرفض الحقيقي في admin_conflict_resolve و admin_alert_resolve.
CREATE OR REPLACE FUNCTION public.admin_conflicts(_country text DEFAULT NULL::text, _limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'rank', x->>'created_at') FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'orphan_id', o.id, 'code', o.code, 'name', o.display_name, 'country', o.country_code,
      'field', d.field, 'field_group', fa.field_group, 'kind', d.kind, 'risk', d.risk,
      'current', d.current_value, 'proposed', d.proposed_value, 'wamy', d.wamy_value, 'office', d.office_value,
      'created_at', d.created_at, 'updated_at', d.updated_at, 'mine', EXISTS (SELECT 1 FROM public.orphan_field_history h
        WHERE h.orphan_id = d.orphan_id AND h.field = d.field AND h.received_by = auth.uid()
          AND h.value IN (d.proposed_value, d.wamy_value, d.office_value)),
      'rank', CASE d.risk WHEN 'critical' THEN '0' WHEN 'medium' THEN '1' ELSE '2' END) AS x
      FROM public.data_conflicts d
      JOIN public.orphans o ON o.id = d.orphan_id
      JOIN public.field_authority fa ON fa.field = d.field
     WHERE d.status = 'open' AND (_country IS NULL OR o.country_code = _country)
     ORDER BY CASE d.risk WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, d.created_at
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $function$

;
CREATE OR REPLACE FUNCTION public.admin_alerts(_country text DEFAULT NULL::text, _limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'orphan_id', a.orphan_id, 'code', o.code, 'name', o.display_name,
      'country', COALESCE(o.country_code, a.country_code), 'field', a.field, 'signal', a.code,
      'severity', a.severity, 'role', a.role, 'source', a.source, 'detail', a.detail,
      'hits', a.hits, 'created_at', a.created_at, 'updated_at', a.updated_at,
      'mine', a.raised_by IS NOT NULL AND a.raised_by = auth.uid()) AS x
      FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
     WHERE a.status = 'open' AND (_country IS NULL OR COALESCE(o.country_code, a.country_code) = _country)
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.updated_at DESC
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $function$

;
