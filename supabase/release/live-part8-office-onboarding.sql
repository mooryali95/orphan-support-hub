-- =====================================================================
-- بدء تشغيل المكتب: ما يحتاجه مكتبٌ جديد (ألبانيا أوّلاً) ليرى أين هو
-- ---------------------------------------------------------------------
-- تُضاف إلى `office_dashboard()`:
--   members    عدد أعضاء المكتب (لا أسماء ولا بريد — ذلك للإدارة).
--   platform   منصّة التشغيل في دولة المكتب: هل رُبطت بجهة، هل صدر لها
--              مفتاح مزامنة نشط، وآخر مزامنةٍ وآخر خطأ (نصّ الخطأ يُحجب
--              عن غير الإدارة: فقط «هناك خطأ»).
-- كلّها حقائق مجمّعة يراها عضو المكتب ليعرف ما ينقص، بلا أسرار.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.office_dashboard(_office UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o public.offices; _p public.operating_platforms; _platform JSONB := 'null'::jsonb;
BEGIN
  IF NOT public.office_permission(_office, 'read') THEN
    RAISE EXCEPTION 'office_read_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.offices WHERE id = _office;

  SELECT * INTO _p FROM public.operating_platforms p
   WHERE p.country_code = _o.country_code AND p.active
   ORDER BY p.created_at LIMIT 1;
  IF FOUND THEN
    _platform := jsonb_build_object(
      'key', _p.key, 'name', _p.name,
      'org_linked', _p.org_id IS NOT NULL,
      'api_key_issued', EXISTS (SELECT 1 FROM public.api_clients c
                                 WHERE c.org_id = _p.org_id AND c.active),
      'last_sync_at', (SELECT max(s.last_run_at) FROM public.mirror_sync_state s WHERE s.source = _p.key),
      'has_error', EXISTS (SELECT 1 FROM public.mirror_sync_state s
                            WHERE s.source = _p.key AND s.last_error IS NOT NULL),
      'last_error', CASE WHEN public.is_admin()
                         THEN (SELECT s.last_error FROM public.mirror_sync_state s
                                WHERE s.source = _p.key AND s.last_error IS NOT NULL
                                ORDER BY s.last_run_at DESC NULLS LAST LIMIT 1) END);
  END IF;

  RETURN jsonb_build_object(
    'office', jsonb_build_object('id', _o.id, 'name', _o.name, 'country', _o.country_code, 'region', _o.region),
    'members', (SELECT count(*) FROM public.office_members m WHERE m.office_id = _office),
    'platform', _platform,
    'groups', (SELECT count(*) FROM public.mirror_groups g
                WHERE g.deleted_at IS NULL AND g.country_code = _o.country_code
                  AND (_o.region IS NULL OR g.region = _o.region)),
    'orphans', (SELECT count(*) FROM public.orphans o JOIN public.mirror_groups g ON g.id = o.group_id
                 WHERE o.status = 'approved' AND g.deleted_at IS NULL
                   AND g.country_code = _o.country_code
                   AND (_o.region IS NULL OR g.region = _o.region)),
    'pledges', COALESCE((
      SELECT jsonb_object_agg(k.kind, k.v) FROM (
        SELECT p.kind, jsonb_build_object('count', count(*), 'amount', sum(p.amount)) AS v
          FROM public.support_pledges p
          LEFT JOIN public.mirror_groups g ON g.id = p.group_id
          LEFT JOIN public.orphans o ON o.id = p.orphan_id
          LEFT JOIN public.mirror_groups og ON og.id = o.group_id
          LEFT JOIN public.care_organizations c ON c.id = p.org_id
         WHERE p.status IN ('pending', 'active') AND p.country_code = _o.country_code
           AND (_o.region IS NULL
                OR COALESCE(p.region, g.region, og.region, c.region) = _o.region)
         GROUP BY p.kind) k), '{}'::jsonb),
    'reports', jsonb_build_object(
      'draft', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'draft'),
      'submitted', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'submitted'),
      'published', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'published')),
    'can_write', public.office_permission(_office, 'write'),
    'can_publish', public.office_permission(_office, 'publish'));
END $fn$;
REVOKE ALL ON FUNCTION public.office_dashboard(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_dashboard(UUID) TO authenticated;
