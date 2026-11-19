-- =====================================================================
-- نقل drizzle 0005 (طبّقه Lovable على البثّ مباشرةً) إلى السلسلة
-- ---------------------------------------------------------------------
-- 0005 يعيد شرط «المشرف معتمَدٌ ولم ينقضِ أجله» إلى دوالّ المشرف. هذا الشرط
-- في السلسلة أصلاً (20261116100000_reconcile_live_drizzle.sql)، فالدالّتان
-- الأوليان هنا مطابقتان لها، ويُضاف منح مفتاح الخدمة كما في 0005.
--
-- واختلف 0005 في `enrollment_supervisor_standing`: حصرها في المسجَّلين وسحبها
-- من الزائر. والسلسلة تُبقيها عامّةً عمداً، بقرار المالك: الشهادة بلا هويةٍ
-- ولا رقم (المستوى والاعتماد والاستقلالية وتاريخ الإسناد)، وتظهر على بطاقة
-- الطفل قبل الكفالة (qualification-verification). فتعود هنا عامّةً بشرط
-- الاعتماد، ومعرّف المشرف وحده يبقى محصوراً.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._enrollment_supervisor_any(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
     AND r.approval = 'approved' AND r.expires_at > now()
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public._enrollment_supervisor_any(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._enrollment_supervisor_any(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
     AND r.approval = 'approved' AND r.expires_at > now()
     AND auth.uid() IS NOT NULL
     AND (r.person_id = auth.uid() OR public.is_admin() OR public.can_see_qualification(e.orphan_id))
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_supervisor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor_standing(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'assigned', true,
       'level', s.level,
       'certified', s.certified_at IS NOT NULL,
       'independent', s.independence_index >= public.supervisor_independence_threshold(),
       'since', r.assigned_at
     )
     FROM public.enrollment_roles r
     JOIN public.supervisor_profiles s ON s.user_id = r.person_id
     WHERE r.enrollment_id = _enrollment AND r.role = 'supervisor' AND r.ended_at IS NULL
       AND r.approval = 'approved' AND r.expires_at > now()
     LIMIT 1),
    jsonb_build_object('assigned', false)
  );
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_supervisor_standing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor_standing(UUID) TO anon, authenticated, service_role;
