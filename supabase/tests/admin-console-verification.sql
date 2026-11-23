-- لوحة البيانات للإدارة — إثبات القراءة الموحّدة والتوثيق وانتقالات التعهّد
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
  ('ac100000-0000-4000-8000-000000000001', 'ac-admin@example.test', '{}'::jsonb, now()),
  ('ac100000-0000-4000-8000-000000000002', 'ac-donor@example.test', '{}'::jsonb, now()),
  ('ac100000-0000-4000-8000-000000000003', 'ac-org@example.test', '{"role":"care_org"}'::jsonb, now());
INSERT INTO public.user_roles (user_id, role) VALUES ('ac100000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ac200000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000003', 'جهة اللوحة', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, monthly_need, status, approved_at)
VALUES
  ('ac300000-0000-4000-8000-000000000001', 'AC-1', 'موثّق', 'ac200000-0000-4000-8000-000000000001',
   'ac100000-0000-4000-8000-000000000003', 'ألبانيا', 100, 'approved', now()),
  ('ac300000-0000-4000-8000-000000000002', 'AC-2', 'مسودة', 'ac200000-0000-4000-8000-000000000001',
   'ac100000-0000-4000-8000-000000000003', 'ألبانيا', 100, 'draft', NULL);
INSERT INTO public.orphan_documents (orphan_id, doc_type, storage_path, verified) VALUES
  ('ac300000-0000-4000-8000-000000000001', 'death_certificate', 'x/1', true),
  ('ac300000-0000-4000-8000-000000000001', 'birth_certificate', 'x/2', true),
  ('ac300000-0000-4000-8000-000000000001', 'guardianship_proof', 'x/3', false);
INSERT INTO public.support_pledges (id, supporter_id, kind, target_type, country_code, amount, currency, status)
VALUES ('ac400000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000002',
        'qualification', 'country', 'AL', 40, 'EUR', 'pending');

DO $$
DECLARE _r JSONB; _v JSONB; _ok BOOLEAN := false;
BEGIN
  -- غير المدير لا يقرأ.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"sub":"ac100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    PERFORM public.admin_records('orphans');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غير المدير قرأ لوحة البيانات'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  -- كلّ الحالات، لا المنشور وحده، مع عدّاد كلّ حالة.
  _r := public.admin_records('orphans', 'AC-');
  IF (_r->>'total')::int <> 2 OR (_r->'counts'->>'draft')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL — الأيتام بكلّ حالاتهم: %', _r;
  END IF;
  _r := public.admin_records('orphans', 'AC-', 'draft');
  IF (_r->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL — فلتر الحالة: %', _r; END IF;

  -- التوثيق من المستندات الموثَّقة وحدها.
  _r := public.admin_records('orphans', 'AC-1');
  _v := _r->'rows'->0->'verification';
  IF NOT (_v->>'death')::boolean OR NOT (_v->>'identity')::boolean
     OR (_v->>'guardianship')::boolean OR (_v->>'verified_documents')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL — قائمة التوثيق: %', _v;
  END IF;

  _r := public.admin_records('pledges', 'ac-donor');
  IF (_r->>'total')::int <> 1 OR _r->'rows'->0->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — التعهّدات: %', _r;
  END IF;

  -- انتقالٌ مسموح يُسجَّل في التدقيق، وغير المسموح يُرفض.
  PERFORM public.admin_set_pledge_status('ac400000-0000-4000-8000-000000000001', 'active', 'تحقّقنا من التواصل');
  _ok := false;
  BEGIN
    PERFORM public.admin_set_pledge_status('ac400000-0000-4000-8000-000000000001', 'pending');
  EXCEPTION WHEN invalid_parameter_value THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — انتقالٌ غير مسموح مرّ'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE entity_id = 'ac400000-0000-4000-8000-000000000001'
                  AND action = 'pledge_status' AND meta->>'to' = 'active'
                  AND meta->>'reason' = 'تحقّقنا من التواصل') THEN
    RAISE EXCEPTION 'FAIL — تغيير الحالة لم يُسجَّل';
  END IF;
  RAISE NOTICE 'PASS — لوحة البيانات: قراءة موحّدة، وتوثيق، وانتقالات مسجَّلة';
END $$;
ROLLBACK;
