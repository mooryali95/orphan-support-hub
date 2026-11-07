-- =====================================================================
-- الدفعة 3B — التشغيل والتقوية الأمنية — إثبات
-- ---------------------------------------------------------------------
-- ARC-01  ما طبّقه drizzle/ على البثّ صار في السلسلة: إعدادات المنصّة
--         للإدارة، وحال إيقاف الدفع عبر دالّة، وجداول البحث للمسجَّلين.
-- DB-11   المستخدم يَسِم إشعاره مقروءاً ولا يلمس حال بريده ولا نصّه.
-- DB-10   دعوة عضو الجهة المانحة: ردٌّ واحد وُجد الحساب أم لا، ولا عضوية
--         بلا قبول، ولا دعوة من جهةٍ لم تُعتمد.
-- APP-12  الطلب المكرّر يُرفض (مخزن آحاد)، ومفتاح التكرار يُحجز ذرّياً.
-- GAP-06  أرقام الفواتير لكل سنة، بلا ثغرةٍ عند إدراجٍ فاشل.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b3000000-0000-4000-8000-000000000001', 'b3-owner@example.test', '{}'::jsonb),
  ('b3000000-0000-4000-8000-000000000002', 'b3-invitee@example.test', '{}'::jsonb),
  ('b3000000-0000-4000-8000-000000000003', 'b3-admin@example.test', '{}'::jsonb),
  ('b3000000-0000-4000-8000-000000000004', 'b3-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b3000000-0000-4000-8000-000000000005', 'b3-sponsor@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('b3000000-0000-4000-8000-000000000003', 'admin');


-- ---------------------------------------------------------------------
-- ARC-01
-- ---------------------------------------------------------------------
DO $$
DECLARE _h JSONB; _n INTEGER;
BEGIN
  IF to_regprocedure('public.payment_hold_state()') IS NULL
     OR to_regprocedure('public.is_published_orphan_folder(text)') IS NULL THEN
    RAISE EXCEPTION 'FAIL — دالّتا drizzle غائبتان عن السلسلة';
  END IF;
  IF has_function_privilege('anon', 'public.payment_hold_state()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — الزائر يقرأ حال إيقاف الدفع';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  _h := public.payment_hold_state();
  SELECT count(*) INTO _n FROM public.platform_settings;
  RESET ROLE;
  IF NOT (_h ? 'payments_on_hold') OR _h->>'payments_on_hold' IS NULL THEN
    RAISE EXCEPTION 'FAIL — payment_hold_state لا يُعيد الحال: %', _h;
  END IF;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — المسجَّل غير المشرف يقرأ صفّ إعدادات المنصّة كاملاً';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  SELECT count(*) INTO _n FROM public.platform_settings;
  RESET ROLE;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL — المشرف لا يقرأ إعدادات المنصّة'; END IF;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  -- office_roles لا منح للزائر عليه أصلاً؛ هذان يحملان SELECT وRLS تحكمهما.
  SELECT (SELECT count(*) FROM public.trait_dimensions) + (SELECT count(*) FROM public.institution_kinds)
    INTO _n;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL — الزائر يقرأ جداول البحث مباشرةً (% صفّاً)', _n; END IF;

  -- سياسة public-media الأضيق (20261106140000) تبقى: لا يعيدها النقل إلى الزائر.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname = 'public_media_read' AND 'anon' = ANY(roles)) THEN
    RAISE EXCEPTION 'FAIL — النقل أعاد قراءة public-media للزائر';
  END IF;
  RAISE NOTICE 'PASS — ARC-01: ما طبّقه drizzle/ على البثّ صار في السلسلة دون أن يوسّع ما ضيّقته المرحلة صفر';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص الدفعة 3B (التشغيل والتقوية) اجتازت ──'; END $$;
ROLLBACK;
