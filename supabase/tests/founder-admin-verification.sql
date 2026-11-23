-- =====================================================================
-- المدير المؤسّس — إثبات الإسناد والحماية
-- =====================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/founder-admin-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------
-- 1) لا إدارة بالبريد: حسابٌ جديد ببريدٍ محميّ لا يأخذ admin، ولا عند تأكيده
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('99990000-0000-4000-8000-0000000000aa', 'Founder.Twin@example.test', '{}'::jsonb);
INSERT INTO public.protected_admins (email) VALUES ('founder.twin@example.test');
UPDATE auth.users SET email_confirmed_at = now()
 WHERE id = '99990000-0000-4000-8000-0000000000aa';

DO $$
BEGIN
  -- الحساب أُنشئ قبل إدراج البريد في القائمة؛ نعيد الإنشاء بعد الإدراج لنفحص الطريقين.
  INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  VALUES ('99990000-0000-4000-8000-0000000000ab', 'founder.twin2@example.test', '{}'::jsonb, now());
  INSERT INTO public.protected_admins (email) VALUES ('founder.twin2@example.test');
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = '99990000-0000-4000-8000-0000000000ab';
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id IN ('99990000-0000-4000-8000-0000000000aa',
                               '99990000-0000-4000-8000-0000000000ab') AND role = 'admin') THEN
    RAISE EXCEPTION 'FAIL — a protected email obtained the admin role automatically';
  END IF;
  RAISE NOTICE 'PASS — no admin role is granted from an email address';
END $$;

-- الإسناد بمفتاح الخدمة وحده، والحماية تمنع إزالته.
INSERT INTO public.user_roles (user_id, role)
VALUES ('99990000-0000-4000-8000-0000000000ab', 'admin');

-- حساب المؤسّس كما هو في الإنتاج: دوره أُسند قديماً (التعبئة الرجعية).
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
VALUES ('99990000-0000-4000-8000-000000000001', 'p.o.m2012@hotmail.com',
        '{"full_name":"المالك"}'::jsonb, now())
ON CONFLICT (email) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'p.o.m2012@hotmail.com'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) بريد آخر يطلب admin صراحةً في بيانات التسجيل → sponsor
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('99990000-0000-4000-8000-000000000002', 'impostor@example.test',
        '{"role":"admin"}'::jsonb);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = '99990000-0000-4000-8000-000000000002' AND role = 'admin') THEN
    RAISE EXCEPTION 'FAIL — a non-protected email obtained the admin role';
  END IF;
  RAISE NOTICE 'PASS — non-protected email fell back to sponsor';
END $$;

-- ---------------------------------------------------------------------
-- 3) قائمة المديرين المحميّين غير مرئية للعميل
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM 1 FROM public.protected_admins;
    RAISE EXCEPTION 'FAIL — authenticated can read protected_admins';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — protected_admins invisible to authenticated';
  END;
  BEGIN
    INSERT INTO public.protected_admins (email) VALUES ('attacker@example.test');
    RAISE EXCEPTION 'FAIL — authenticated can add itself to protected_admins';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — protected_admins not writable by authenticated';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------
-- 4) لا يمكن إزالة دور المدير المحميّ — حتى بصلاحيات كاملة
-- ---------------------------------------------------------------------
DO $$
DECLARE _id UUID;
BEGIN
  SELECT id INTO _id FROM auth.users WHERE lower(email) = 'p.o.m2012@hotmail.com';
  BEGIN
    DELETE FROM public.user_roles WHERE user_id = _id AND role = 'admin';
    RAISE EXCEPTION 'FAIL — protected admin role was deleted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — protected admin role cannot be deleted';
  END;
  BEGIN
    UPDATE public.user_roles SET role = 'sponsor' WHERE user_id = _id AND role = 'admin';
    RAISE EXCEPTION 'FAIL — protected admin role was downgraded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — protected admin role cannot be downgraded';
  END;
END $$;

-- ---------------------------------------------------------------------
-- 5) لا يمكن حذف حساب المدير المحميّ
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    DELETE FROM auth.users WHERE lower(email) = 'p.o.m2012@hotmail.com';
    RAISE EXCEPTION 'FAIL — protected admin account was deleted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — protected admin account cannot be deleted';
  END;
END $$;

-- ---------------------------------------------------------------------
-- 6) لا يمكن إزالة آخر مدير متبقٍّ (حتى لو غير محميّ)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('99990000-0000-4000-8000-000000000003', 'second.admin@example.test');
  INSERT INTO public.user_roles (user_id, role) VALUES
    ('99990000-0000-4000-8000-000000000003', 'admin');
  -- مديران الآن: حذف غير المحميّ مسموح
  DELETE FROM public.user_roles
  WHERE user_id = '99990000-0000-4000-8000-000000000003' AND role = 'admin';
  RAISE NOTICE 'PASS — a non-protected admin can still be removed while another remains';
END $$;

-- ---------------------------------------------------------------------
-- 7) الإعلان الصريح يفتح الحماية (مخرج الطوارئ)
-- ---------------------------------------------------------------------
DO $$
DECLARE _id UUID;
BEGIN
  SET LOCAL app.allow_protected_admin_change = 'yes-i-am-sure';
  SELECT id INTO _id FROM auth.users WHERE lower(email) = 'p.o.m2012@hotmail.com';
  DELETE FROM public.user_roles WHERE user_id = _id AND role = 'admin';
  RAISE NOTICE 'PASS — explicit override releases the lock';
  SET LOCAL app.allow_protected_admin_change = '';
  INSERT INTO public.user_roles (user_id, role) VALUES (_id, 'admin');
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المدير المؤسّس اجتازت ──'; END $$;
ROLLBACK;
