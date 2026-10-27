-- =====================================================================
-- كهاتين — الداعم الكبير والجهات المانحة
-- ---------------------------------------------------------------------
-- 7.1  طلب الاطّلاع يحمل الحزمة المطلوبة، فتُعرض للإدارة مختارةً سلفاً.
-- 7.3  «من أتابعهم»: أذوناتي الممنوحة بنطاقاتها ومدّتها.
-- 7.4  أعضاء الجهة المانحة: يدعوهم المالك بأدوار (مالك، مالي، مطّلع).
-- 7.5  تعهّدات الجهة بمراحل تسليمها لتقرير الأثر.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 7.1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_orphan_access(_orphan UUID, _reason TEXT, _package TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _res JSONB;
BEGIN
  IF _package IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.access_scope_packages WHERE key = _package AND active) THEN
    RAISE EXCEPTION 'unknown_package';
  END IF;
  _res := public.request_orphan_access(_orphan, _reason);
  IF _res ? 'request_id' THEN
    UPDATE public.orphan_access_requests SET requested_package = _package
     WHERE id = (_res->>'request_id')::uuid AND requester_id = auth.uid();
  END IF;
  RETURN _res;
END $fn$;
REVOKE ALL ON FUNCTION public.request_orphan_access(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_orphan_access(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_access_requests(_status TEXT DEFAULT 'pending')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'طابور الأذونات للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'orphan_id', o.id, 'orphan_name', o.display_name, 'orphan_code', o.code,
      'requester_email', u.email, 'reason', a.reason, 'status', a.status,
      'created_at', a.created_at, 'decided_at', a.decided_at, 'expires_at', a.expires_at,
      'requested_package', a.requested_package,
      'package_scopes', (SELECT to_jsonb(p.scopes) FROM public.access_scope_packages p
                          WHERE p.key = a.requested_package),
      'granted_scopes', to_jsonb(a.granted_scopes),
      'sponsorships', (SELECT count(*) FROM public.sponsorships s
                        WHERE s.sponsor_id = a.requester_id AND s.status IN ('active', 'paused'))
    ) ORDER BY a.created_at)
    FROM public.orphan_access_requests a
    JOIN public.orphans o ON o.id = a.orphan_id
    JOIN auth.users u ON u.id = a.requester_id
   WHERE COALESCE(_status, 'pending') = 'any' OR a.status = _status::public.access_status
  ), '[]'::jsonb);
END $fn$;


-- ---------------------------------------------------------------------
-- 7.3
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_access_requests()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'orphan_id', a.orphan_id, 'orphan', o.display_name, 'code', o.code,
    'status', a.status, 'reason', a.reason, 'decision_note', a.decision_note,
    'requested_package', a.requested_package,
    'granted_scopes', CASE WHEN a.status = 'approved' THEN to_jsonb(a.granted_scopes) END,
    'expires_at', a.expires_at, 'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM public.orphan_access_requests a
  JOIN public.orphans o ON o.id = a.orphan_id
  WHERE a.requester_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;


-- ---------------------------------------------------------------------
-- 7.4  أعضاء الجهة المانحة
-- ---------------------------------------------------------------------
ALTER TABLE public.donor_members DROP CONSTRAINT IF EXISTS donor_members_role_check;
ALTER TABLE public.donor_members
  ADD CONSTRAINT donor_members_role_check CHECK (role IN ('owner', 'finance', 'member'));

CREATE OR REPLACE FUNCTION public.is_donor_owner(_entity UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.donor_members
                  WHERE entity_id = _entity AND user_id = auth.uid() AND role = 'owner');
$fn$;

CREATE OR REPLACE FUNCTION public.donor_set_member(_entity UUID, _email TEXT, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID;
BEGIN
  IF NOT (public.is_donor_owner(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_owner_only' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO _user FROM auth.users u WHERE lower(u.email) = lower(btrim(COALESCE(_email, '')));
  IF _user IS NULL THEN RAISE EXCEPTION 'لا حساب بهذا البريد' USING ERRCODE = 'no_data_found'; END IF;
  IF _role = 'remove' THEN
    -- لا تُترك الجهة بلا مالك.
    IF (SELECT role FROM public.donor_members WHERE entity_id = _entity AND user_id = _user) = 'owner'
       AND (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity AND role = 'owner') = 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
    DELETE FROM public.donor_members WHERE entity_id = _entity AND user_id = _user;
  ELSE
    INSERT INTO public.donor_members (entity_id, user_id, role) VALUES (_entity, _user, _role)
    ON CONFLICT (entity_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.donor_members_list(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) ORDER BY m.role, u.email)
                     FROM public.donor_members m JOIN auth.users u ON u.id = m.user_id
                    WHERE m.entity_id = _entity), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.donor_members_list(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_members_list(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 7.5  تعهّدات الجهة بمراحلها — لتقرير الأثر
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.donor_entity_pledges(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
             'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
             'country', p.country_code,
             'target', CASE p.target_type
                         WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                         WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                         WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                         WHEN 'region' THEN p.region
                         ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code) END,
             'delivered_at', (SELECT max(d.created_at) FROM public.pledge_deliveries d
                               WHERE d.pledge_id = p.id AND d.stage = 'delivered'))
           ORDER BY p.created_at DESC)
      FROM public.support_pledges p WHERE p.donor_entity_id = _entity), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.donor_entity_pledges(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_entity_pledges(UUID) TO authenticated;
