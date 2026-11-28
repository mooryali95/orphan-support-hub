-- =====================================================================
-- شريط «اليوم» لفريق الدولة: عددان من الخادم بنطاق الدولة نفسه.
--   settle:  ما يملك المتّصل حسمه فعلاً (مشرف الدولة أو الإدارة، وليس ممّا رفعه هو
--            حين تمنعه العينان: التنبيه، والتحديث، والتغيير الحرج أو غير «الاختلاف»).
--   overdue: من ذلك ما تجاوز مهلته (SLA_HOURS في queue.ts): التنبيه الحرج ٢٤ ساعة،
--            وغيره ٧٢ ساعة.
-- عددٌ صادق لا «N+»: لا يتوقّف عند صفحة. لا أسماء ولا رموز، فلا يكشف شيئاً.
-- جلسة aal2 لا تدخل العدّ: المشرف بلا تحقّقٍ ثانٍ يرى ما ينتظره ويُطلب منه الرفع.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_today_strip(_country text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _me UUID := auth.uid(); _can BOOLEAN;
BEGIN
  IF _country IS NULL OR NOT public.country_can(_country, 'read') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  _can := public.is_admin() OR EXISTS (SELECT 1 FROM public.country_staff s
           WHERE s.user_id = _me AND s.country_code = _country AND s.role = 'supervisor');
  IF NOT _can THEN RETURN jsonb_build_object('settle', 0, 'overdue', 0); END IF;
  RETURN (
    WITH items AS (
      SELECT a.created_at, CASE WHEN a.severity = 'critical' THEN 24 ELSE 72 END AS sla
        FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
       WHERE a.status = 'open' AND COALESCE(o.country_code, a.country_code) = _country
         AND (a.raised_by IS NULL OR a.raised_by <> _me)
      UNION ALL
      SELECT d.created_at, 72
        FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
       WHERE d.status = 'open' AND o.country_code = _country
         AND NOT ((d.risk = 'critical' OR d.kind <> 'disagreement') AND EXISTS (
               SELECT 1 FROM public.orphan_field_history h
                WHERE h.orphan_id = d.orphan_id AND h.field = d.field AND h.received_by = _me
                  AND h.value IN (d.proposed_value, d.wamy_value, d.office_value)))
      UNION ALL
      SELECT q.created_at, 72 FROM public.source_link_queue q
       WHERE q.status = 'pending' AND q.country_code = _country
      UNION ALL
      SELECT u.created_at, 72 FROM public.child_updates u
       WHERE u.status = 'pending' AND u.country_code = _country
         AND u.uploaded_by IS DISTINCT FROM _me)
    SELECT jsonb_build_object('settle', count(*),
             'overdue', count(*) FILTER (WHERE created_at < now() - make_interval(hours => sla)))
      FROM items);
END $function$;

REVOKE ALL ON FUNCTION public.admin_today_strip(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_today_strip(text) TO authenticated;
