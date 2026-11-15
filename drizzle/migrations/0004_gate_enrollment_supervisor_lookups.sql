CREATE OR REPLACE FUNCTION public._enrollment_supervisor_any(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public._enrollment_supervisor_any(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._enrollment_supervisor_any(UUID) TO service_role;

DO $do$
DECLARE f regprocedure; def text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('record_trait_assessment','record_unit_progress','guard_enrollment_stage',
                                'orphan_qualification','enrollment_detail','suggest_orphans_for_sponsor','list_orphan_cards')
              AND p.prosrc ~ 'enrollment_supervisor\('
  LOOP
    def := pg_get_functiondef(f);
    def := regexp_replace(def, '(public\.)?enrollment_supervisor\(', 'public._enrollment_supervisor_any(', 'g');
    EXECUTE def;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
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
     JOIN public.program_enrollments e ON e.id = r.enrollment_id
     JOIN public.supervisor_profiles s ON s.user_id = r.person_id
     WHERE r.enrollment_id = _enrollment AND r.role = 'supervisor' AND r.ended_at IS NULL
       AND auth.uid() IS NOT NULL
       AND (r.person_id = auth.uid() OR public.is_admin() OR public.can_see_qualification(e.orphan_id))
     LIMIT 1),
    jsonb_build_object('assigned', false)
  );
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_supervisor_standing(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor_standing(UUID) TO authenticated, service_role;