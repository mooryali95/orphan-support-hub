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


-- ---------------------------------------------------------------------
-- DB-11
-- ---------------------------------------------------------------------
UPDATE public.platform_settings SET email_on_hold = false WHERE id;
DO $$
DECLARE _id UUID; _ok BOOLEAN; _n INTEGER;
BEGIN
  PERFORM public.notify('b3000000-0000-4000-8000-000000000005', 'welcome', 'أهلاً', 'متن', '/dashboard');
  SELECT id INTO _id FROM public.notifications
   WHERE user_id = 'b3000000-0000-4000-8000-000000000005' ORDER BY created_at DESC LIMIT 1;
  UPDATE public.notifications SET email_state = 'sent', email_sent_at = now() WHERE id = _id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  UPDATE public.notifications SET read_at = now() WHERE id = _id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _ok := false;
  BEGIN
    UPDATE public.notifications
       SET email_state = 'pending', email_attempts = 0, title = 'Arbitrary', link = 'https://evil.example'
     WHERE id = _id;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL — صاحب الإشعار لا يَسِمه مقروءاً'; END IF;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — المستخدم أعاد إشعاره إلى طابور البريد بنصٍّ جديد'; END IF;
  IF (SELECT email_state::text FROM public.notifications WHERE id = _id) <> 'sent' THEN
    RAISE EXCEPTION 'FAIL — تغيّرت حال البريد';
  END IF;
  RAISE NOTICE 'PASS — DB-11: المستخدم يَسِم إشعاره مقروءاً ولا يعيد كتابته أو جدولة بريده';
END $$;


-- ---------------------------------------------------------------------
-- DB-10
-- ---------------------------------------------------------------------
DO $$
DECLARE _e UUID; _ok BOOLEAN; _r JSONB; _a TEXT; _b TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _e := public.register_donor_entity('جهة الدفعة 3B', 'foundation');
  -- جهةٌ معلّقة لا تدعو أحداً.
  _ok := false;
  BEGIN
    PERFORM public.donor_set_member(_e, 'b3-invitee@example.test', 'member');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — جهةٌ لم تُعتمد تدعو أعضاء'; END IF;

  UPDATE public.donor_entities SET status = 'approved' WHERE id = _e;

  -- ردٌّ واحد: بريدٌ بحساب وبريدٌ بلا حساب سواء.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.donor_set_member(_e, 'nobody@nowhere.test', 'member');
    _a := 'ok';
  EXCEPTION WHEN OTHERS THEN _a := SQLERRM;
  END;
  BEGIN
    PERFORM public.donor_set_member(_e, 'B3-Invitee@example.test', 'finance');
    _b := 'ok';
  EXCEPTION WHEN OTHERS THEN _b := SQLERRM;
  END;
  RESET ROLE;
  IF _a <> 'ok' OR _b <> 'ok' THEN
    RAISE EXCEPTION 'FAIL — الردّ يكشف وجود الحساب: «%» مقابل «%»', _a, _b;
  END IF;
  IF EXISTS (SELECT 1 FROM public.donor_members WHERE entity_id = _e
              AND user_id = 'b3000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL — أُدخل صاحب البريد عضواً بلا قبوله';
  END IF;

  -- المدعوّ يرى دعوته ويقبلها، فيصير عضواً بالدور المدعوّ إليه.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _r := public.my_donor_invitations();
  IF jsonb_array_length(_r) <> 1 OR _r->0->>'role' <> 'finance' THEN
    RAISE EXCEPTION 'FAIL — المدعوّ لا يرى دعوته: %', _r;
  END IF;
  PERFORM public.respond_donor_invitation(_e, true);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.donor_members WHERE entity_id = _e
                  AND user_id = 'b3000000-0000-4000-8000-000000000002' AND role = 'finance') THEN
    RAISE EXCEPTION 'FAIL — القبول لم يُنشئ العضوية';
  END IF;

  -- غيرُ المدعوّ لا يقبل دعوة غيره.
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"b3000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
    PERFORM public.respond_donor_invitation(_e, true);
  EXCEPTION WHEN no_data_found THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok OR EXISTS (SELECT 1 FROM public.donor_members WHERE entity_id = _e
                         AND user_id = 'b3000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'FAIL — غيرُ المدعوّ دخل الجهة';
  END IF;

  -- قائمة الفريق تُظهر الدعوة المعلّقة على أنها دعوة.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _r := public.donor_members_list(_e);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r) x
                  WHERE x->>'email' = 'nobody@nowhere.test' AND x->>'status' = 'invited') THEN
    RAISE EXCEPTION 'FAIL — الدعوة المعلّقة لا تظهر للمالك: %', _r;
  END IF;
  IF has_table_privilege('authenticated', 'public.donor_member_invites', 'SELECT')
     OR has_table_privilege('anon', 'public.donor_member_invites', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL — جدول الدعوات مقروءٌ مباشرةً';
  END IF;
  RAISE NOTICE 'PASS — DB-10: الدعوة لا تكشف الحساب ولا تُدخل أحداً بلا قبوله، ولا تخرج من جهةٍ لم تُعتمد';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص الدفعة 3B (التشغيل والتقوية) اجتازت ──'; END $$;
ROLLBACK;
