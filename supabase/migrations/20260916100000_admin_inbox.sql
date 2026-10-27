-- =====================================================================
-- كهاتين — صندوق قرارات الإدارة
-- ---------------------------------------------------------------------
-- كل ما ينتظر قرار الإدارة في قائمةٍ واحدة مرتّبة بالأقدم: ملفّات،
-- جهات رعاية، طلبات اطّلاع، جهات مانحة، تقارير جهات، تقارير مكاتب،
-- تعهّدات تنتظر فتحها. لكل بندٍ نوعه ومعرّفه وما يكفي ليُقرأ في سطر.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
      ) i), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;


-- نشر تقرير مكتبٍ مرفوع أو إعادته مسودّة — من الصندوق مباشرة.
CREATE OR REPLACE FUNCTION public.admin_review_office_report(_report UUID, _publish BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.office_reports
     SET status = CASE WHEN _publish THEN 'published' ELSE 'draft' END,
         published_at = CASE WHEN _publish THEN now() END,
         updated_at = now()
   WHERE id = _report AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_submitted'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_review_office_report(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_office_report(UUID, BOOLEAN) TO authenticated;


-- السياق الكامل لبندٍ واحد في اللوح الجانبي.
CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind TEXT, _id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN (SELECT to_jsonb(c) - 'owner_id' FROM public.care_organizations c WHERE c.id = _id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    ELSE NULL END;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;
