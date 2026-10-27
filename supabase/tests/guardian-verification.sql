-- مساحة الوليّ والموافقات — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad100000-0000-4000-8000-000000000001', 'gd-org@example.test', '{"role":"care_org"}'::jsonb),
  ('ad100000-0000-4000-8000-000000000002', 'gd-guardian@example.test', '{}'::jsonb),
  ('ad100000-0000-4000-8000-000000000003', 'gd-other@example.test', '{}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ad200000-0000-4000-8000-000000000001', 'ad100000-0000-4000-8000-000000000001', 'جهة الوليّ', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, guardian_id, country, monthly_need, status, approved_at, photo_url, photo_consent)
VALUES ('ad300000-0000-4000-8000-000000000001', 'GD-1', 'طفل الوليّ', 'ad200000-0000-4000-8000-000000000001',
        'ad100000-0000-4000-8000-000000000001', 'ad100000-0000-4000-8000-000000000002', 'ألبانيا', 100, 'approved', now(),
        'media/gd.jpg', 'face_hidden');
INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'ad400000-0000-4000-8000-000000000001', 'ad300000-0000-4000-8000-000000000001', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';
INSERT INTO public.enrollment_roles (id, enrollment_id, role, person_id, person_name)
VALUES ('ad500000-0000-4000-8000-000000000001', 'ad400000-0000-4000-8000-000000000001', 'guardian',
        'ad100000-0000-4000-8000-000000000002', 'الوليّ');

DO $$
DECLARE _j JSONB; _ok BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ad100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.guardian_children_overview();
  RESET ROLE;
  IF jsonb_array_length(_j->0->'pending_consents') <> 1 OR (_j->0->'enrollment'->>'total')::int < 1
     OR _j->0->'enrollment'->>'next' IS NULL THEN
    RAISE EXCEPTION 'FAIL — بطاقة الوليّ ناقصة: %', _j;
  END IF;
  RAISE NOTICE 'PASS — الوليّ يرى أين وصل طفله والجلسة التالية وما ينتظر موافقته';

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"ad100000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.guardian_consent_enrollment('ad500000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غيرُ الوليّ وافق عنه'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ad100000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.guardian_consent_enrollment('ad500000-0000-4000-8000-000000000001');
  PERFORM public.guardian_set_photo_consent('ad300000-0000-4000-8000-000000000001', 'granted');
  RESET ROLE;
  IF NOT public.enrollment_has_consent('ad400000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — الموافقة لم تُسجَّل';
  END IF;
  IF (SELECT consent_document FROM public.enrollment_roles WHERE id = 'ad500000-0000-4000-8000-000000000001') NOT LIKE 'e-consent:%'
     OR (SELECT photo_consent_doc FROM public.orphans WHERE id = 'ad300000-0000-4000-8000-000000000001') NOT LIKE 'e-consent:%'
     OR (SELECT count(*) FROM public.guardian_e_consents WHERE user_id = 'ad100000-0000-4000-8000-000000000002') <> 2 THEN
    RAISE EXCEPTION 'FAIL — الضغطة لم تكتب سجلّ موافقةٍ يكون وثيقتها';
  END IF;
  RAISE NOTICE 'PASS — الموافقة بضغطة تكتب سجلّاً إلكترونياً بنصّها، ويصير هو الوثيقة';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ad100000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.guardian_set_photo_consent('ad300000-0000-4000-8000-000000000001', 'withdrawn');
  RESET ROLE;
  IF (SELECT photo_url FROM public.orphans WHERE id = 'ad300000-0000-4000-8000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — سحب الموافقة لم يحذف الصورة';
  END IF;
  RAISE NOTICE 'PASS — سحب موافقة الصورة يحذفها في الحال';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الوليّ اجتازت ──'; END $$;
ROLLBACK;
