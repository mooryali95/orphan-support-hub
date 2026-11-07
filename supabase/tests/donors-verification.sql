-- الداعم الكبير والجهات المانحة — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ab100000-0000-4000-8000-000000000001', 'dn-owner@example.test', '{}'::jsonb),
  ('ab100000-0000-4000-8000-000000000002', 'dn-fin@example.test', '{}'::jsonb),
  ('ab100000-0000-4000-8000-000000000003', 'dn-out@example.test', '{}'::jsonb),
  ('ab100000-0000-4000-8000-000000000004', 'dn-org@example.test', '{"role":"care_org"}'::jsonb),
  ('ab100000-0000-4000-8000-000000000005', 'dn-admin@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('ab100000-0000-4000-8000-000000000005', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ab200000-0000-4000-8000-000000000001', 'ab100000-0000-4000-8000-000000000004', 'جهة المانحين', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, monthly_need, status, approved_at)
VALUES ('ab300000-0000-4000-8000-000000000001', 'DN-1', 'طفل المانحين', 'ab200000-0000-4000-8000-000000000001',
        'ab100000-0000-4000-8000-000000000004', 'ألبانيا', 100, 'approved', now());

DO $$
DECLARE _r JSONB; _e UUID; _ok BOOLEAN;
BEGIN
  -- 7.1
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000003","role":"authenticated"}';
  _r := public.request_orphan_access('ab300000-0000-4000-8000-000000000001', 'أريد أن أدعم مجموعته كاملة.', 'group_supporter');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000005","role":"authenticated"}';
  _r := public.admin_access_requests('pending');
  RESET ROLE;
  IF _r->0->>'requested_package' <> 'group_supporter' OR jsonb_array_length(_r->0->'package_scopes') = 0 THEN
    RAISE EXCEPTION 'FAIL — الحزمة المطلوبة لا تصل الإدارة: %', _r;
  END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000003","role":"authenticated"}';
  _r := public.my_access_requests();
  RESET ROLE;
  IF _r->0->>'orphan' <> 'طفل المانحين' OR _r->0->'granted_scopes' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — «من أتابعهم» خاطئة: %', _r;
  END IF;
  RAISE NOTICE 'PASS — الطلب يحمل حزمته إلى الإدارة، وصاحبه يرى طلبه باسم الطفل';

  -- 7.4
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000001","role":"authenticated"}';
  _e := public.register_donor_entity('مؤسسة المانحين', 'foundation');
  RESET ROLE;
  -- DB-10: الدعوة من جهةٍ معتمدة، والعضوية بقبول المدعوّ.
  UPDATE public.donor_entities SET status = 'approved' WHERE id = _e;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.donor_set_member(_e, 'dn-fin@example.test', 'finance');
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.respond_donor_invitation(_e, true);
  RESET ROLE;
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000002","role":"authenticated"}';
    PERFORM public.donor_set_member(_e, 'dn-out@example.test', 'owner');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — عضوٌ غير مالك أضاف أعضاء'; END IF;
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000001","role":"authenticated"}';
    PERFORM public.donor_set_member(_e, 'dn-owner@example.test', 'remove');
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'last_owner';
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — تُركت الجهة بلا مالك'; END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _r := public.donor_members_list(_e);
  RESET ROLE;
  IF jsonb_array_length(_r) <> 2 THEN RAISE EXCEPTION 'FAIL — قائمة الأعضاء: %', _r; END IF;
  RAISE NOTICE 'PASS — المالك وحده يدعو بأدوار، ولا تبقى الجهة بلا مالك';

  -- 7.5
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"ab100000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.donor_entity_pledges(_e);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غريبٌ قرأ تعهّدات جهة'; END IF;
  RAISE NOTICE 'PASS — تعهّدات الجهة لأعضائها وحدهم';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص المانحين اجتازت ──'; END $$;
ROLLBACK;
