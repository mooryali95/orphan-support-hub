-- =====================================================================
-- المدير المؤسّس — الإسناد والحماية
-- =====================================================================
-- تكمّل هذه الهجرة إصلاح C1: بعد أن مُنع الإسناد الذاتي لدور admin،
-- لم يعد هناك مسار مشروع لإنشاء أول مدير. تُنشئ هذه الهجرة قائمة
-- خادمية للمديرين المحميّين، وتُسند الدور، وتمنع إزالته أو حذف الحساب.
--
-- الحماية مطلقة عمداً: حتى service_role لا يستطيع إزالة مدير محميّ إلا
-- بإعلان نيّة صريح في نفس الجلسة (انظر docs/runbook.ar.md):
--   SET LOCAL app.allow_protected_admin_change = 'yes-i-am-sure';
-- =====================================================================

-- ---------------------------------------------------------------------
-- قائمة المديرين المحميّين
-- ---------------------------------------------------------------------
-- بلا GRANT وبلا سياسات: غير مرئية ولا قابلة للتعديل من anon أو
-- authenticated إطلاقاً، فلا يستطيع العميل ترقية نفسه بإضافة بريده.
CREATE TABLE IF NOT EXISTS public.protected_admins (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.protected_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protected_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.protected_admins TO service_role;

INSERT INTO public.protected_admins (email, reason)
VALUES ('p.o.m2012@hotmail.com', 'المدير المؤسّس — مالك المنصة')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_protected_admin_email(_email TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protected_admins pa
    WHERE lower(pa.email) = lower(_email)
  );
$$;
REVOKE ALL ON FUNCTION public.is_protected_admin_email(TEXT) FROM PUBLIC, anon, authenticated;

-- الإعلان الصريح المطلوب لتجاوز الحماية.
CREATE OR REPLACE FUNCTION public.protected_admin_override()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.allow_protected_admin_change', true), '') = 'yes-i-am-sure';
$$;
REVOKE ALL ON FUNCTION public.protected_admin_override() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- الإسناد: الآن، وتلقائياً عند إعادة إنشاء الحساب مستقبلاً
-- ---------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE public.is_protected_admin_email(u.email)
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requested TEXT;
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  IF public.is_protected_admin_email(NEW.email) THEN
    -- قائمة خادمية لا يمسّها العميل — لا علاقة لها ببيانات التسجيل.
    _role := 'admin'::public.app_role;
  ELSE
    -- الأدوار القابلة للإسناد الذاتي فقط (C1).
    _requested := NULLIF(NEW.raw_user_meta_data->>'role', '');
    _role := CASE
               WHEN _requested IN ('sponsor', 'care_org') THEN _requested::public.app_role
               ELSE 'sponsor'::public.app_role
             END;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- الحماية: لا إزالة للدور، ولا حذف للحساب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_protected_admin_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email TEXT;
  _remaining INT;
BEGIN
  IF public.protected_admin_override() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF OLD.role = 'admin' THEN
    SELECT u.email INTO _email FROM auth.users u WHERE u.id = OLD.user_id;

    IF _email IS NOT NULL AND public.is_protected_admin_email(_email) THEN
      RAISE EXCEPTION 'user_roles: % is a protected founder admin; the role cannot be changed or removed', _email
        USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO _remaining FROM public.user_roles WHERE role = 'admin';
    IF _remaining <= 1 THEN
      RAISE EXCEPTION 'user_roles: refusing to remove the last remaining admin'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.guard_protected_admin_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_protected_admin_role ON public.user_roles;
CREATE TRIGGER trg_guard_protected_admin_role
BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW
EXECUTE FUNCTION public.guard_protected_admin_role();

CREATE OR REPLACE FUNCTION public.guard_protected_admin_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.protected_admin_override() THEN RETURN OLD; END IF;

  IF OLD.email IS NOT NULL AND public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'auth.users: % is a protected founder admin and cannot be deleted', OLD.email
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.guard_protected_admin_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_protected_admin_user ON auth.users;
CREATE TRIGGER trg_guard_protected_admin_user
BEFORE DELETE ON auth.users FOR EACH ROW
EXECUTE FUNCTION public.guard_protected_admin_user();
