-- =====================================================================
-- المكاتب والجهات المانحة — إثبات
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'of-admin@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000002', 'of-country-mgr@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000003', 'of-region-field@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000004', 'of-viewer@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000005', 'of-stranger@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000006', 'of-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('d1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.offices (id, name, country_code, region, parent_id) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'مكتب ألبانيا', 'AL', NULL, NULL),
  ('d2000000-0000-4000-8000-000000000002', 'مكتب تيرانا', 'AL', 'تيرانا', 'd2000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000003', 'مكتب شكودر', 'AL', 'شكودر', 'd2000000-0000-4000-8000-000000000001');
INSERT INTO public.office_members (office_id, user_id, role) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'manager'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003', 'field_officer'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', 'viewer');

INSERT INTO public.care_organizations (id, owner_id, name, status, kind, country_code, region)
VALUES ('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', 'مركز النور', 'approved', 'center', 'AL', 'تيرانا');
INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'rowad-albania', 'of-g1', 'مجموعة تيرانا', 'AL', 'تيرانا'),
  ('d3000000-0000-4000-8000-000000000002', 'rowad-albania', 'of-g2', 'مجموعة شكودر', 'AL', 'شكودر');

DO $$
DECLARE _j JSONB; _n INTEGER; _ok BOOLEAN; _r UUID;
BEGIN
  -- الميداني يكتب في مكتبه، ولا ينشر
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _r := public.save_office_report('d2000000-0000-4000-8000-000000000002', 'زيارة ميدانية', 'وُزّعت الحقائب.',
          '{"kits": 40}'::jsonb, ARRAY['d2000000-0000-4000-8000-000000000002/visit.jpg'], NULL, NULL, 'submitted');
  RESET ROLE;
  RAISE NOTICE 'PASS — الميداني يرفع تقريراً بمؤشّرات وصور';

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.save_office_report('d2000000-0000-4000-8000-000000000002', 'نشر', '', '{}', '{}', NULL, NULL, 'published');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — نشر من لا يملك النشر'; END IF;
  RAISE NOTICE 'PASS — النشر للمدير وحده';

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.save_office_report('d2000000-0000-4000-8000-000000000002', 'مرفق مستعار', '', '{}',
            ARRAY['d2000000-0000-4000-8000-000000000003/x.jpg'], NULL, NULL, 'draft');
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'attachment_outside_office';
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — قُبل مرفقٌ من مكتب آخر'; END IF;
  RAISE NOTICE 'PASS — لا يُستعار مرفقٌ من مجلّد مكتبٍ آخر';

  -- المطّلع يقرأ ولا يكتب
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
    PERFORM public.save_office_report('d2000000-0000-4000-8000-000000000002', 'محاولة', '', '{}', '{}', NULL, NULL, 'draft');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — المطّلع كتب'; END IF;
  RAISE NOTICE 'PASS — المطّلع يقرأ ولا يكتب';

  -- مدير الدولة يرى مكاتب المناطق وتقاريرها وينشر فيها
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.offices;
  PERFORM public.save_office_report('d2000000-0000-4000-8000-000000000002', 'زيارة ميدانية', 'وُزّعت الحقائب.',
          '{"kits": 40}'::jsonb, '{}', NULL, NULL, 'published', _r);
  RESET ROLE;
  IF _n <> 3 THEN RAISE EXCEPTION 'FAIL — مدير الدولة لا يرى مكاتبها (%)', _n; END IF;
  RAISE NOTICE 'PASS — مدير الدولة يرى مكاتب مناطقها وينشر تقاريرها';

  -- ميداني تيرانا لا يرى شكودر
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.offices;
  RESET ROLE;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL — مكتب المنطقة يرى غيره (%)', _n; END IF;
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.office_dashboard('d2000000-0000-4000-8000-000000000003');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — فُتحت لوحة مكتبٍ آخر'; END IF;
  RAISE NOTICE 'PASS — مكتب المنطقة محصورٌ في منطقته';

  -- الغريب لا يرى شيئاً
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.office_reports;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL — غريبٌ قرأ تقارير'; END IF;
  RAISE NOTICE 'PASS — التقارير مغلقة على غير الأعضاء';
END $$;

-- لوحة المكتب تحسب نطاقها
DO $$
DECLARE _j JSONB; _e UUID; _p UUID; _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  PERFORM public.create_support_pledge('qualification', 'group', 'd3000000-0000-4000-8000-000000000001', 100);
  PERFORM public.create_support_pledge('in_kind', 'group', 'd3000000-0000-4000-8000-000000000002', 70);
  PERFORM public.create_support_pledge('qualification', 'institution', 'd4000000-0000-4000-8000-000000000001', 30, 'AL');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.office_dashboard('d2000000-0000-4000-8000-000000000002');
  RESET ROLE;
  IF (_j->>'groups')::int <> 1 OR (_j->'pledges'->'qualification'->>'amount')::numeric <> 130
     OR _j->'pledges' ? 'in_kind' THEN
    RAISE EXCEPTION 'FAIL — لوحة تيرانا تحسب خارج نطاقها: %', _j;
  END IF;
  RAISE NOTICE 'PASS — لوحة المكتب تحسب منطقته وحدها (مجموعة + مؤسسة)';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.office_dashboard('d2000000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF (_j->>'groups')::int <> 2 OR (_j->'pledges'->'in_kind'->>'amount')::numeric <> 70 THEN
    RAISE EXCEPTION 'FAIL — لوحة الدولة لا تجمع مناطقها: %', _j;
  END IF;
  RAISE NOTICE 'PASS — لوحة مكتب الدولة تجمع كل مناطقها';

  -- الجهة المانحة
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _e := public.register_donor_entity('وقف الخير', 'waqf', 'SA');
  SELECT id INTO _p FROM public.support_pledges WHERE kind = 'in_kind' LIMIT 1;
  BEGIN
    PERFORM public.set_pledge_entity(_p, _e);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — جهةٌ غير معتمدة دعمت باسمها';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  UPDATE public.donor_entities SET status = 'approved' WHERE id = _e;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  PERFORM public.set_pledge_entity(_p, _e);
  _j := public.donor_entity_dashboard(_e);
  RESET ROLE;
  IF (_j->'by_kind'->>'in_kind')::numeric <> 70 THEN
    RAISE EXCEPTION 'FAIL — لوحة الجهة لا تعكس تعهّدها: %', _j;
  END IF;
  RAISE NOTICE 'PASS — الجهة المانحة تُعتمد أولاً ثم تدعم باسمها وترى لوحتها';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.donor_entities;
  _j := public.my_workspaces();
  RESET ROLE;
  IF _n <> 0 OR jsonb_array_length(_j->'offices') <> 1 THEN
    RAISE EXCEPTION 'FAIL — بوابات المستخدم خاطئة: % / %', _n, _j;
  END IF;
  RAISE NOTICE 'PASS — كلٌّ يرى بواباته وحدها';
END $$;

DO $$
DECLARE _ok BOOLEAN := false;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
    PERFORM public.admin_assign_office_member('d2000000-0000-4000-8000-000000000003', 'of-stranger@example.test', 'manager');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مدير مكتبٍ أسند أعضاء بنفسه'; END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.admin_assign_office_member('d2000000-0000-4000-8000-000000000003', 'OF-STRANGER@example.test', 'viewer');
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.office_members WHERE user_id = 'd1000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'FAIL — الإدارة لم تُسند';
  END IF;
  RAISE NOTICE 'PASS — إسناد الأعضاء للإدارة وحدها، وبالبريد';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المكاتب اجتازت ──'; END $$;
ROLLBACK;
