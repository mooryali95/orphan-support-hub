-- 1) Fix mutable search_path
CREATE OR REPLACE FUNCTION public.protected_admin_override()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT COALESCE(current_setting('app.allow_protected_admin_change', true), '') = 'yes-i-am-sure';
$function$;

-- 2) Remove public/anon/authenticated EXECUTE on SECURITY DEFINER helpers not needed by clients or RLS
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(numeric, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_protected_admin_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_orphan_funding() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_protected_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_protected_admin_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protected_admin_override() FROM PUBLIC, anon, authenticated;

-- 3) RLS helper functions: keep EXECUTE only for signed-in users (never anon)
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_orphan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sponsors_orphan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_orphan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sponsors_orphan(uuid) TO authenticated;