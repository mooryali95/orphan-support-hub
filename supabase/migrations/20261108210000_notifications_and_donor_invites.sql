-- =====================================================================
-- الدفعة 3B — DB-11 وDB-10
-- ---------------------------------------------------------------------
-- DB-11  سياسة notif_update_own تسمح للمستخدم بتحديث كلّ عمود في إشعاره:
--        كان يعيد email_state إلى pending بعنوانٍ ورابطٍ من عنده، فيرسلها
--        المُصرِّف بريداً باسم المنصّة. الواجهة لا تكتب إلا read_at، فالمنح
--        يضيق إليه وحده.
--
-- DB-10  donor_set_member كان يُجيب «لا حساب بهذا البريد» (مِسبار حسابات)،
--        ويُدخل صاحب البريد عضواً في جهة المالك بلا علمه، ومن جهةٍ لم
--        تُعتمد. صار دعوةً: ردٌّ واحد وُجد الحساب أم لا، والعضوية بقبول
--        المدعوّ وحده، والدعوة من جهةٍ معتمدة (أو من الإدارة).
-- =====================================================================

-- ---------------------------------------------------------------------
-- DB-11
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;


-- ---------------------------------------------------------------------
-- DB-10
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donor_member_invites (
  entity_id   UUID NOT NULL REFERENCES public.donor_entities(id) ON DELETE CASCADE,
  email       TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
  role        TEXT NOT NULL CHECK (role IN ('owner', 'finance', 'member')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  PRIMARY KEY (entity_id, email)
);
CREATE INDEX IF NOT EXISTS idx_donor_invites_email ON public.donor_member_invites(email);
ALTER TABLE public.donor_member_invites ENABLE ROW LEVEL SECURITY;
-- لا قراءة مباشرة: الدوالّ أدناه وحدها تقرأ الجدول وتكتبه.
REVOKE ALL ON public.donor_member_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.donor_member_invites TO service_role;


CREATE OR REPLACE FUNCTION public.donor_set_member(_entity UUID, _email TEXT, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID; _mail TEXT := lower(btrim(COALESCE(_email, '')));
BEGIN
  IF NOT (public.is_donor_owner(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_owner_only' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
       SELECT 1 FROM public.donor_entities WHERE id = _entity AND status = 'approved') THEN
    RAISE EXCEPTION 'donor_entity_not_approved' USING ERRCODE = '42501';
  END IF;
  IF _mail !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF _role NOT IN ('owner', 'finance', 'member', 'remove') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  -- العضو القائم يُعرف من جدول الأعضاء لا من auth.users: من يعرض قائمة
  -- الفريق يعرف أعضاءه أصلاً، ولا يعرف بهذا شيئاً عن غيرهم.
  SELECT m.user_id INTO _user
    FROM public.donor_members m JOIN auth.users u ON u.id = m.user_id
   WHERE m.entity_id = _entity AND lower(u.email) = _mail;

  IF _role = 'remove' THEN
    DELETE FROM public.donor_member_invites WHERE entity_id = _entity AND email = _mail;
    IF _user IS NOT NULL THEN
      -- لا تُترك الجهة بلا مالك.
      IF (SELECT role FROM public.donor_members WHERE entity_id = _entity AND user_id = _user) = 'owner'
         AND (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity AND role = 'owner') = 1 THEN
        RAISE EXCEPTION 'last_owner';
      END IF;
      DELETE FROM public.donor_members WHERE entity_id = _entity AND user_id = _user;
    END IF;
    RETURN;
  END IF;

  IF _user IS NOT NULL THEN
    IF _role <> 'owner'
       AND (SELECT role FROM public.donor_members WHERE entity_id = _entity AND user_id = _user) = 'owner'
       AND (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity AND role = 'owner') = 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
    UPDATE public.donor_members SET role = _role WHERE entity_id = _entity AND user_id = _user;
    RETURN;
  END IF;

  -- غير العضو يُدعى — كان له حسابٌ أم لم يكن، والردّ واحد.
  INSERT INTO public.donor_member_invites (entity_id, email, role, invited_by)
  VALUES (_entity, _mail, _role, auth.uid())
  ON CONFLICT (entity_id, email) DO UPDATE
    SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by,
        created_at = now(), expires_at = now() + INTERVAL '30 days';
END $fn$;
REVOKE ALL ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) TO authenticated;


/* القائمة تُظهر الدعوات المعلّقة بحالها، فلا يظنّها المالك أعضاء. */
CREATE OR REPLACE FUNCTION public.donor_members_list(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'status', x->>'role', x->>'email') FROM (
      SELECT jsonb_build_object('email', u.email, 'role', m.role, 'status', 'member') AS x
        FROM public.donor_members m JOIN auth.users u ON u.id = m.user_id
       WHERE m.entity_id = _entity
      UNION ALL
      SELECT jsonb_build_object('email', i.email, 'role', i.role, 'status', 'invited',
                                'expires_at', i.expires_at)
        FROM public.donor_member_invites i
       WHERE i.entity_id = _entity AND i.expires_at > now()) s), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.donor_members_list(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_members_list(UUID) TO authenticated;


/* دعواتي: بالبريد المؤكَّد للحساب نفسه وحده. */
CREATE OR REPLACE FUNCTION public.my_donor_invitations()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entity_id', e.id, 'entity_name', e.name, 'role', i.role,
           'created_at', i.created_at, 'expires_at', i.expires_at) ORDER BY i.created_at DESC), '[]'::jsonb)
    FROM public.donor_member_invites i
    JOIN public.donor_entities e ON e.id = i.entity_id
    JOIN auth.users u ON u.id = auth.uid() AND lower(u.email) = i.email
   WHERE auth.uid() IS NOT NULL AND i.expires_at > now() AND e.status = 'approved';
$fn$;
REVOKE ALL ON FUNCTION public.my_donor_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_donor_invitations() TO authenticated;


/* القبول أو الردّ. دعوةٌ ليست لهذا الحساب لا يُعرف وجودها: no_data_found. */
CREATE OR REPLACE FUNCTION public.respond_donor_invitation(_entity UUID, _accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _mail TEXT; _role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  SELECT lower(email) INTO _mail FROM auth.users WHERE id = auth.uid();

  DELETE FROM public.donor_member_invites i
   USING public.donor_entities e
   WHERE i.entity_id = _entity AND i.email = _mail AND i.expires_at > now()
     AND e.id = i.entity_id AND e.status = 'approved'
  RETURNING i.role INTO _role;
  IF _role IS NULL THEN RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'no_data_found'; END IF;

  IF COALESCE(_accept, false) THEN
    INSERT INTO public.donor_members (entity_id, user_id, role) VALUES (_entity, auth.uid(), _role)
    ON CONFLICT (entity_id, user_id) DO NOTHING;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.respond_donor_invitation(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_donor_invitation(UUID, BOOLEAN) TO authenticated;
