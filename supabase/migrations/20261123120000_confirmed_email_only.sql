-- =====================================================================
-- البريد المؤكَّد وحده يمنح شيئاً
-- ---------------------------------------------------------------------
-- السبب: ثلاث دوالّ كانت تطابق `auth.users.email` دون أن تسأل هل أُكِّد.
-- وSupabase يُنشئ صفّ المستخدم ببريده قبل تأكيده (تسجيلٌ بكلمة مرور عبر
-- الواجهة البرمجية مباشرةً)، فمن يسجّل ببريد غيره يملك صفّاً يحمل ذلك
-- البريد دون أن يملك صندوقه. فكان:
--   1) handle_new_user يمنح «admin» عند الإنشاء لبريد المؤسّس، مؤكَّداً أم لا.
--   2) my_donor_invitations يعرض دعوات جهةٍ لصاحب البريد غير المؤكَّد.
--   3) respond_donor_invitation يقبلها ويُدخله عضواً.
-- الإصلاح: كلّها تشترط `email_confirmed_at IS NOT NULL`، ودور المؤسّس يُمنح
-- عند التأكيد لا عند الإنشاء.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requested TEXT;
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- الأدوار القابلة للإسناد الذاتي فقط (C1). دور المؤسّس لا يُمنح هنا أبداً:
  -- يمنحه grant_protected_admin_on_confirm حين يُثبت صاحب البريد ملكيّته.
  _requested := NULLIF(NEW.raw_user_meta_data->>'role', '');
  _role := CASE
             WHEN _requested IN ('sponsor', 'care_org') THEN _requested::public.app_role
             ELSE 'sponsor'::public.app_role
           END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;

  IF NEW.email_confirmed_at IS NOT NULL AND public.is_protected_admin_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- دور المؤسّس عند تأكيد البريد (أو تغييره إلى بريدٍ مؤكَّد).
CREATE OR REPLACE FUNCTION public.grant_protected_admin_on_confirm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND public.is_protected_admin_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.grant_protected_admin_on_confirm() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_grant_protected_admin_on_confirm ON auth.users;
CREATE TRIGGER trg_grant_protected_admin_on_confirm
AFTER UPDATE OF email_confirmed_at, email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_protected_admin_on_confirm();

/* دعواتي: بالبريد المؤكَّد للحساب نفسه وحده. */
CREATE OR REPLACE FUNCTION public.my_donor_invitations()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entity_id', e.id, 'entity_name', e.name, 'role', i.role,
           'created_at', i.created_at, 'expires_at', i.expires_at) ORDER BY i.created_at DESC), '[]'::jsonb)
    FROM public.donor_member_invites i
    JOIN public.donor_entities e ON e.id = i.entity_id
    JOIN auth.users u ON u.id = auth.uid() AND lower(u.email) = i.email
                     AND u.email_confirmed_at IS NOT NULL
   WHERE auth.uid() IS NOT NULL AND i.expires_at > now() AND e.status = 'approved';
$fn$;
REVOKE ALL ON FUNCTION public.my_donor_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_donor_invitations() TO authenticated;

/* القبول أو الردّ — بالبريد المؤكَّد وحده. دعوةٌ ليست لهذا الحساب لا يُعرف وجودها. */
CREATE OR REPLACE FUNCTION public.respond_donor_invitation(_entity UUID, _accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _mail TEXT; _role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  SELECT lower(email) INTO _mail FROM auth.users
   WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
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
