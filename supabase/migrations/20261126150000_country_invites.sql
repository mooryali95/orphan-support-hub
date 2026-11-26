-- =====================================================================
-- دعوة أعضاء فريق الدولة
-- ---------------------------------------------------------------------
-- بريدٌ بلا حساب: يرسل الخادم دعوة المصادقة (قالب «invite» القائم في
-- /lovable/email/auth/webhook) فيُنشأ الحساب، ثم يُسند الدور في الخطوة نفسها.
-- هنا: الدور يُفحص قبل البحث عن البريد، فلا يُنشئ مشرفٌ حساباً لدورٍ لا يملك
-- منحه؛ والقائمة تميّز من دُعي ولم يدخل بعد.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.country_staff_set(_country TEXT, _email TEXT, _role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID; _was TEXT; _admin BOOLEAN := public.is_admin();
BEGIN
  IF NOT public.country_can(_country, 'manage') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  IF _role IS NOT NULL AND _role NOT IN ('supervisor', 'data_entry', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'role_unknown');
  END IF;
  -- الدور قبل البحث: لا تُنشأ دعوةٌ لدورٍ لا يملك المشرف منحه.
  IF NOT _admin AND _role = 'supervisor' THEN RETURN jsonb_build_object('ok', false, 'code', 'role_forbidden'); END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(btrim(COALESCE(_email, '')));
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'user_not_found'); END IF;
  SELECT role INTO _was FROM public.country_staff WHERE country_code = _country AND user_id = _uid;
  IF NOT _admin AND (_uid = auth.uid() OR _role = 'supervisor' OR _was = 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'role_forbidden');
  END IF;
  IF _role IS NULL THEN
    DELETE FROM public.country_staff WHERE country_code = _country AND user_id = _uid;
  ELSE
    INSERT INTO public.country_staff AS s (country_code, user_id, role, added_by)
    VALUES (_country, _uid, _role, auth.uid())
    ON CONFLICT (country_code, user_id) DO UPDATE SET role = EXCLUDED.role, added_by = EXCLUDED.added_by;
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'country_staff_set', 'country_staff', _uid,
          jsonb_build_object('country', _country, 'from', _was, 'to', _role));
  RETURN jsonb_build_object('ok', true, 'from', _was, 'to', _role);
END $fn$;

CREATE OR REPLACE FUNCTION public.country_staff_list(_country TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.country_can(_country, 'manage') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', s.user_id, 'email', u.email, 'role', s.role,
                                                        -- دُعي ولم يدخل بعد
                                                        'pending', u.last_sign_in_at IS NULL,
                                                        'created_at', s.created_at)
                                     ORDER BY CASE s.role WHEN 'supervisor' THEN 0 WHEN 'data_entry' THEN 1 ELSE 2 END, u.email)
                     FROM public.country_staff s JOIN auth.users u ON u.id = s.user_id
                    WHERE s.country_code = _country), '[]'::jsonb);
END $fn$;
