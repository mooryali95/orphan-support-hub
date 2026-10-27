-- الميدان: إقرار الصور ومهام المشرف — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aa100000-0000-4000-8000-000000000001', 'fl-field@example.test', '{}'::jsonb),
  ('aa100000-0000-4000-8000-000000000002', 'fl-org@example.test', '{"role":"care_org"}'::jsonb),
  ('aa100000-0000-4000-8000-000000000003', 'fl-sup@example.test', '{}'::jsonb),
  ('aa100000-0000-4000-8000-000000000004', 'fl-other@example.test', '{}'::jsonb);
INSERT INTO public.offices (id, name, country_code) VALUES ('aa200000-0000-4000-8000-000000000001', 'مكتب الميدان', 'AL');
INSERT INTO public.office_members (office_id, user_id, role)
VALUES ('aa200000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001', 'field_officer');

DO $$
DECLARE _ok BOOLEAN := false;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}';
    PERFORM public.save_office_report('aa200000-0000-4000-8000-000000000001', 'زيارة', '', '{}',
      ARRAY['aa200000-0000-4000-8000-000000000001/p.jpg'], NULL, NULL, 'draft');
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'photo_consent_required';
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُفظت صورٌ بلا إقرار'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.save_office_report('aa200000-0000-4000-8000-000000000001', 'زيارة', '', '{}',
    ARRAY['aa200000-0000-4000-8000-000000000001/p.jpg'], NULL, NULL, 'draft', _consent => true);
  PERFORM public.save_office_report('aa200000-0000-4000-8000-000000000001', 'بلا صور', 'نصّ', '{}', '{}', NULL, NULL, 'draft');
  RESET ROLE;
  IF NOT (SELECT attachments_consent FROM public.office_reports WHERE title = 'زيارة') THEN
    RAISE EXCEPTION 'FAIL — الإقرار لم يُحفظ مع التقرير';
  END IF;
  RAISE NOTICE 'PASS — صور التقرير تحتاج إقراراً يُحفظ معه، والتقرير بلا صور لا يحتاجه';
END $$;

-- مهام المشرف
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('aa300000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000002', 'جهة الميدان', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, monthly_need, status, approved_at)
VALUES ('aa400000-0000-4000-8000-000000000001', 'FL-1', 'طفل الميدان', 'aa300000-0000-4000-8000-000000000001',
        'aa100000-0000-4000-8000-000000000002', 'ألبانيا', 100, 'approved', now());
INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'aa500000-0000-4000-8000-000000000001', 'aa400000-0000-4000-8000-000000000001', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';
-- المشرف المعتمَد يُسنَد كما تفعل الجهة؛ الفحص يمرّ من الحرس.
INSERT INTO public.supervisor_profiles (user_id, level, independence_index, certified_at, active)
VALUES ('aa100000-0000-4000-8000-000000000003', 'foundational', 0, now(), true)
ON CONFLICT DO NOTHING;
INSERT INTO public.enrollment_roles (enrollment_id, role, person_id, person_name)
VALUES ('aa500000-0000-4000-8000-000000000001', 'supervisor', 'aa100000-0000-4000-8000-000000000003', 'المشرف');

DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.my_supervisor_today();
  RESET ROLE;
  IF NOT (_j @> '[{"task":"baseline_missing"}]' AND _j @> '[{"task":"consent_missing"}]') THEN
    RAISE EXCEPTION 'FAIL — مهام المشرف ناقصة: %', _j;
  END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.my_supervisor_today();
  RESET ROLE;
  IF jsonb_array_length(_j) <> 0 THEN RAISE EXCEPTION 'FAIL — غير المشرف رأى مهامّ'; END IF;
  RAISE NOTICE 'PASS — «اليوم» للمشرف: الموافقة الغائبة والقياس الأوّلي، ولا يراها غيره';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الميدان اجتازت ──'; END $$;
ROLLBACK;
