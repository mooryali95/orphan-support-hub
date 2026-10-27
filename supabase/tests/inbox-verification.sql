-- صندوق قرارات الإدارة — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9900000-0000-4000-8000-000000000001', 'ib-admin@example.test', '{}'::jsonb),
  ('a9900000-0000-4000-8000-000000000002', 'ib-org@example.test', '{"role":"care_org"}'::jsonb),
  ('a9900000-0000-4000-8000-000000000003', 'ib-user@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a9900000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a9910000-0000-4000-8000-000000000001', 'a9900000-0000-4000-8000-000000000002', 'جهة الصندوق', 'pending');
INSERT INTO public.donor_entities (id, name, created_by)
VALUES ('a9920000-0000-4000-8000-000000000001', 'وقف الصندوق', 'a9900000-0000-4000-8000-000000000003');
INSERT INTO public.offices (id, name, country_code) VALUES ('a9930000-0000-4000-8000-000000000001', 'مكتب الصندوق', 'AL');
INSERT INTO public.office_reports (id, office_id, author_id, title, status)
VALUES ('a9940000-0000-4000-8000-000000000001', 'a9930000-0000-4000-8000-000000000001',
        'a9900000-0000-4000-8000-000000000003', 'تقرير مرفوع', 'submitted');

DO $$
DECLARE _j JSONB; _ok BOOLEAN := false;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.admin_decision_inbox();
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غير الإدارة قرأ الصندوق'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000001","role":"authenticated"}';
  _j := public.admin_decision_inbox();
  IF NOT (_j @> '[{"kind":"org"}]' AND _j @> '[{"kind":"donor"}]' AND _j @> '[{"kind":"office_report"}]') THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL — الصندوق ناقص: %', _j;
  END IF;
  IF public.admin_decision_context('org', 'a9910000-0000-4000-8000-000000000001') ? 'owner_id' THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL — السياق كشف معرّف المالك';
  END IF;
  PERFORM public.admin_review_office_report('a9940000-0000-4000-8000-000000000001', true);
  _j := public.admin_decision_inbox();
  RESET ROLE;
  IF _j @> '[{"kind":"office_report"}]' THEN RAISE EXCEPTION 'FAIL — التقرير المنشور بقي في الصندوق'; END IF;
  IF (SELECT status FROM public.office_reports WHERE id = 'a9940000-0000-4000-8000-000000000001') <> 'published' THEN
    RAISE EXCEPTION 'FAIL — لم يُنشر التقرير';
  END IF;
  RAISE NOTICE 'PASS — الصندوق للإدارة وحدها، يجمع المصادر، والقرار يُخرج البند منه';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الصندوق اجتازت ──'; END $$;
ROLLBACK;
