-- «رحلتي» ورسالة الشهر وفلتر المجموعة — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a8000000-0000-4000-8000-000000000001', 'fd-admin@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000002', 'fd-org@example.test', '{"role":"care_org"}'::jsonb),
  ('a8000000-0000-4000-8000-000000000003', 'fd-sponsor@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000004', 'fd-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a8000000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a8100000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002', 'جهة الخطّ', 'approved');
INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region)
VALUES ('a8200000-0000-4000-8000-000000000001', 'rowad-albania', 'fd-g', 'مجموعة الخطّ', 'AL', 'إلباسان');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, monthly_need, status, approved_at, group_id)
VALUES ('a8300000-0000-4000-8000-000000000001', 'FD-1', 'طفل الخطّ', 'a8100000-0000-4000-8000-000000000001',
        'a8000000-0000-4000-8000-000000000002', 'ألبانيا', 100, 'approved', now(), 'a8200000-0000-4000-8000-000000000001'),
       ('a8300000-0000-4000-8000-000000000002', 'FD-2', 'طفل آخر', 'a8100000-0000-4000-8000-000000000001',
        'a8000000-0000-4000-8000-000000000002', 'ألبانيا', 100, 'approved', now(), NULL);
INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, status, started_at)
VALUES ('a8000000-0000-4000-8000-000000000003', 'a8300000-0000-4000-8000-000000000001', 30, 'active', now());
INSERT INTO public.timeline_events (orphan_id, event_type, detail)
VALUES ('a8300000-0000-4000-8000-000000000001', 'report.published', '2026-10'),
       ('a8300000-0000-4000-8000-000000000002', 'report.published', 'لطفلٍ لا يكفله');
INSERT INTO public.trait_dimensions (id, source, key, label_ar)
VALUES ('a8400000-0000-4000-8000-000000000001', 'rowad-albania', 'AQL', 'حفظ العقل');
INSERT INTO public.trait_definitions (id, source, external_ref, dimension_id, name_ar)
VALUES ('a8500000-0000-4000-8000-000000000001', 'rowad-albania', 'fd-t', 'a8400000-0000-4000-8000-000000000001', 'التفكير');
INSERT INTO public.orphan_trait_scores (source, external_ref, orphan_id, trait_id, score, observed_at, note)
VALUES ('rowad-albania', 'fd-s', 'a8300000-0000-4000-8000-000000000001', 'a8500000-0000-4000-8000-000000000001', 60, now(), 'سرّي');

DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.my_journey_feed();
  RESET ROLE;
  IF jsonb_array_length(_j) <> 1 OR _j->0->>'orphan' <> 'طفل الخطّ' THEN
    RAISE EXCEPTION 'FAIL — الخطّ الزمني: إمّا نقص أو تسرّب لطفلٍ آخر أو لسمةٍ بلا نطاق: %', _j;
  END IF;
  RAISE NOTICE 'PASS — «رحلتي» تجمع ما يخصّ مكفوله وحده، والسمات بلا نطاقٍ لا تظهر';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.my_monthly_digest();
  RESET ROLE;
  IF (_j->>'reports')::int <> 1 OR _j::text LIKE '%سرّي%' THEN
    RAISE EXCEPTION 'FAIL — رسالة الشهر: %', _j;
  END IF;
  RAISE NOTICE 'PASS — رسالة الشهر تُحصي الثلاثين يوماً';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.my_journey_feed();
  RESET ROLE;
  IF jsonb_array_length(_j) <> 0 THEN RAISE EXCEPTION 'FAIL — غريبٌ رأى خطّاً زمنياً'; END IF;

  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_group := 'a8200000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF (_j->>'total')::int <> 1 OR _j->'rows'->0 ? 'group_id' THEN
    RAISE EXCEPTION 'FAIL — فلتر المجموعة خاطئ أو كشف معرّفها: %', _j;
  END IF;
  RAISE NOTICE 'PASS — الدليل يُفلتر بالمجموعة ولا يكشف معرّفها في البطاقة';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الخطّ الزمني اجتازت ──'; END $$;
ROLLBACK;
