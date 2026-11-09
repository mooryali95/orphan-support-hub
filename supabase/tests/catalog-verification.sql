-- كتالوج الدعم — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'ct-org@example.test', '{"role":"care_org"}'::jsonb),
  ('e1000000-0000-4000-8000-000000000002', 'ct-sup@example.test', '{}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status, kind, country_code, region)
VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'مركز الأمل', 'approved', 'center', 'AL', 'دوريس');
INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region, supervisor_name)
VALUES ('e3000000-0000-4000-8000-000000000001', 'rowad-albania', 'ct-g', 'مجموعة الفجر', 'AL', 'دوريس', 'مشرف سرّي');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, city, monthly_need, status, approved_at, group_id)
VALUES ('e4000000-0000-4000-8000-000000000001', 'CT-1', 'طفل الكتالوج', 'e2000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000001', 'ألبانيا', 'دوريس', 100, 'approved', now(), 'e3000000-0000-4000-8000-000000000001');

DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.support_catalog();
  RESET ROLE;
  IF (_j->'groups'->0->>'children')::int <> 1 OR jsonb_array_length(_j->'institutions') <> 1
     OR NOT (_j->'regions') @> '[{"country":"AL","name":"دوريس"}]' THEN
    RAISE EXCEPTION 'FAIL — الكتالوج ناقص: %', _j;
  END IF;
  IF _j::text LIKE '%مشرف سرّي%' OR _j::text LIKE '%طفل الكتالوج%' THEN
    RAISE EXCEPTION 'FAIL — الكتالوج سرّب المشرف أو أسماء الأطفال';
  END IF;
  RAISE NOTICE 'PASS — الكتالوج يعرض الأهداف بلا مشرفٍ ولا أسماء أطفال';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.create_support_pledge('in_kind', 'group', 'e3000000-0000-4000-8000-000000000001', 25);
  _j := public.my_pledges();
  RESET ROLE;
  IF (_j->0->>'target') IS DISTINCT FROM 'مجموعة الفجر' THEN
    RAISE EXCEPTION 'FAIL — تعهّداتي بلا اسم الهدف: %', _j;
  END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  _j := public.my_pledges();
  RESET ROLE;
  IF jsonb_array_length(_j) <> 0 THEN RAISE EXCEPTION 'FAIL — رأى غيرُه التعهّد'; END IF;
  RAISE NOTICE 'PASS — تعهّداتي لصاحبها وحده وبأسماء أهدافها';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الكتالوج اجتازت ──'; END $$;
ROLLBACK;
