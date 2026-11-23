-- =====================================================================
-- لا إدارة بالبريد، ولا دعوة إلا بإثبات صندوق البريد في الجلسة نفسها
-- ---------------------------------------------------------------------
-- الهجرة السابقة اشترطت `email_confirmed_at`، لكنّ ذلك يتبع إعداد الخادم:
-- مع «Auto-confirm email» يُعدّ كلّ بريدٍ مؤكَّداً لحظة التسجيل بكلمة مرور.
-- فالحماية هنا لا تعتمد على أيّ إعداد:
--   1) الإدارة لا تُمنح بالبريد أبداً، لا عند الإنشاء ولا عند التأكيد.
--      المؤسّس يملك دوره مسبقاً، وحماية الحذف والإزالة باقية؛ وإسناد مديرٍ
--      جديد بمفتاح الخدمة وحده (docs/runbook.ar.md).
--   2) الدعوة لا تُرى ولا تُقبل إلا إن فُتحت الجلسة برمزٍ أُرسل إلى البريد
--      نفسه (amr: otp / magiclink / email/signup / invite / email_change)،
--      لا بكلمة مرورٍ يختارها من سجّل ببريد غيره.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_grant_protected_admin_on_confirm ON auth.users;
DROP FUNCTION IF EXISTS public.grant_protected_admin_on_confirm();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requested TEXT;
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- الأدوار القابلة للإسناد الذاتي فقط (C1). لا «admin» من البريد أبداً.
  _requested := NULLIF(NEW.raw_user_meta_data->>'role', '');
  _role := CASE
             WHEN _requested IN ('sponsor', 'care_org') THEN _requested::public.app_role
             ELSE 'sponsor'::public.app_role
           END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- بريد الجلسة إن أثبتت الجلسة نفسها ملكيّة صندوقه، وإلا NULL.
CREATE OR REPLACE FUNCTION public.session_proved_email()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(u.email)
    FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.email IS NOT NULL
     AND u.email_confirmed_at IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(COALESCE(auth.jwt() -> 'amr', '[]'::jsonb)) a
        WHERE a ->> 'method' IN ('otp', 'magiclink', 'email/signup', 'invite', 'email_change')
     );
$$;
REVOKE ALL ON FUNCTION public.session_proved_email() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_donor_invitations()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entity_id', e.id, 'entity_name', e.name, 'role', i.role,
           'created_at', i.created_at, 'expires_at', i.expires_at) ORDER BY i.created_at DESC), '[]'::jsonb)
    FROM public.donor_member_invites i
    JOIN public.donor_entities e ON e.id = i.entity_id
   WHERE i.email = public.session_proved_email()
     AND i.expires_at > now() AND e.status = 'approved';
$fn$;
REVOKE ALL ON FUNCTION public.my_donor_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_donor_invitations() TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_donor_invitation(_entity UUID, _accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _mail TEXT := public.session_proved_email(); _role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  -- دعوةٌ لا تثبت الجلسة بريدها لا يُعرف وجودها.
  IF _mail IS NULL THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'no_data_found';
  END IF;

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
