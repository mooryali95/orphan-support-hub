-- =====================================================================
-- أبواب النطاقات، مسار التسليم، رمز البلد — إثبات
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'sv-admin@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000002', 'sv-org@example.test', '{"role":"care_org"}'::jsonb),
  ('a7000000-0000-4000-8000-000000000003', 'sv-journey@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000004', 'sv-results@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000005', 'sv-stranger@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000006', 'sv-field@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000007', 'sv-otherfield@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a7000000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'جهة النطاقات', 'approved');
INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region)
VALUES ('a7200000-0000-4000-8000-000000000001', 'rowad-albania', 'sv-g', 'مجموعة الضياء', 'AL', 'دوريس');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at, group_id)
VALUES ('a7300000-0000-4000-8000-000000000001', 'SV-1', 'طفل النطاقات', 'a7100000-0000-4000-8000-000000000001',
        'a7000000-0000-4000-8000-000000000002', 'نصٌّ ما', 'دوريس', 100, 'approved', now(),
        'a7200000-0000-4000-8000-000000000001'),
       ('a7300000-0000-4000-8000-000000000002', 'SV-2', 'طفل البلد', 'a7100000-0000-4000-8000-000000000001',
        'a7000000-0000-4000-8000-000000000002', 'ألبانيا', NULL, 100, 'approved', now(), NULL);

INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'a7400000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';
INSERT INTO public.enrollment_units (enrollment_id, unit_id, status, evidence, note, submitted_at, decided_at, decided_by)
SELECT 'a7400000-0000-4000-8000-000000000001', u.id, 'accepted', 'مخرَج الجلسة الأولى', 'أحسن', now(), now(), 'a7000000-0000-4000-8000-000000000001'
  FROM public.program_units u JOIN public.programs p ON p.id = u.program_id
 WHERE p.slug = 'ahliyyah-foundational' AND u.ordinal = 1;

INSERT INTO public.progress_reports (orphan_id, period, summary, education_note, health_note, status)
VALUES ('a7300000-0000-4000-8000-000000000001', '2026-10', 'شهرٌ طيّب', 'تقدّمٌ في القراءة', 'ملاحظة صحّية سرّية', 'approved');

INSERT INTO public.offices (id, name, country_code, region) VALUES
  ('a7500000-0000-4000-8000-000000000001', 'مكتب دوريس', 'AL', 'دوريس'),
  ('a7500000-0000-4000-8000-000000000002', 'مكتب فلورا', 'AL', 'فلورا');
INSERT INTO public.office_members (office_id, user_id, role) VALUES
  ('a7500000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000006', 'field_officer'),
  ('a7500000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000007', 'field_officer');
INSERT INTO public.office_reports (office_id, author_id, title, body, status, published_at, attachments) VALUES
  ('a7500000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000006', 'زيارة دوريس', 'وُزّعت الحقائب', 'published', now(),
   ARRAY['a7500000-0000-4000-8000-000000000001/a.jpg']),
  ('a7500000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000007', 'زيارة فلورا', 'منطقة أخرى', 'published', now(), '{}'),
  ('a7500000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000006', 'مسودّة', 'لم تُنشر', 'draft', NULL, '{}');

INSERT INTO public.orphan_access_requests (id, orphan_id, requester_id, reason) VALUES
  ('a7600000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'أتابع رحلته التعليمية عن قرب.'),
  ('a7600000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 'أتابع نتائجه وتقاريره الدورية.');
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.decide_orphan_access('a7600000-0000-4000-8000-000000000001', 'approved', ARRAY['journey'], NULL, 30);
  PERFORM public.decide_orphan_access('a7600000-0000-4000-8000-000000000002', 'approved', ARRAY['results','progress','reports'], NULL, 30);
  RESET ROLE;
END $$;

DO $$
DECLARE _j JSONB; _u JSONB;
BEGIN
  -- 1.4
  IF (SELECT country_code FROM public.orphans WHERE code = 'SV-1') <> 'AL'
     OR (SELECT country_code FROM public.orphans WHERE code = 'SV-2') <> 'AL' THEN
    RAISE EXCEPTION 'FAIL — رمز البلد لم يُشتقّ من المجموعة أو من الاسم';
  END IF;
  RAISE NOTICE 'PASS — رمز البلد يُشتقّ من المجموعة ثم من الاسم';

  -- الغريب
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated"}';
  IF (public.orphan_journey('a7300000-0000-4000-8000-000000000001')->>'allowed')::boolean
     OR (public.orphan_reports('a7300000-0000-4000-8000-000000000001')->>'allowed')::boolean THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL — غريبٌ فتح الرحلة أو التقارير';
  END IF;
  RESET ROLE;

  -- journey وحده: الجلسات بلا مخرَج ولا مرحلة
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.orphan_journey('a7300000-0000-4000-8000-000000000001');
  RESET ROLE;
  _u := _j->'enrollments'->0->'units'->0;
  IF NOT (_j->>'allowed')::boolean OR _u->>'status' <> 'accepted' OR _u ? 'evidence' AND _u->>'evidence' IS NOT NULL
     OR _j->'enrollments'->0->>'stage' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — نطاق الرحلة أعطى أكثر أو أقلّ: %', _j;
  END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.orphan_reports('a7300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF (_j->>'allowed')::boolean THEN RAISE EXCEPTION 'FAIL — نطاق الرحلة فتح التقارير'; END IF;
  RAISE NOTICE 'PASS — «الرحلة» تُظهر الجلسات وحالتها فقط';

  -- results + progress + reports
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.orphan_journey('a7300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _j->'enrollments'->0->'units'->0->>'evidence' <> 'مخرَج الجلسة الأولى'
     OR (_j->'enrollments'->0->>'accepted')::int <> 1 OR (_j->'enrollments'->0->>'total')::int < 1 THEN
    RAISE EXCEPTION 'FAIL — النتائج/التقدّم ناقصة: %', _j;
  END IF;
  RAISE NOTICE 'PASS — «النتائج» تُضيف المخرَج والتقويم، و«التقدّم» المقبول من المجموع';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.orphan_reports('a7300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF jsonb_array_length(_j->'progress') <> 1 OR _j::text LIKE '%سرّية%' THEN
    RAISE EXCEPTION 'FAIL — تقارير الجهة خاطئة أو سرّبت الصحّة: %', _j->'progress';
  END IF;
  IF jsonb_array_length(_j->'field') <> 1 OR _j->'field'->0->>'title' <> 'زيارة دوريس'
     OR (_j->'field'->0->>'attachments')::int <> 1 OR _j::text LIKE '%a.jpg%' THEN
    RAISE EXCEPTION 'FAIL — تقارير المكتب: منطقةٌ خاطئة أو مسودّة أو مسار مرفق: %', _j->'field';
  END IF;
  RAISE NOTICE 'PASS — «التقارير»: المعتمَد بلا صحّة، ومنشور مكتب المنطقة وحده بلا مسارات';
END $$;

-- 1.7) مسار التسليم
DO $$
DECLARE _p UUID; _ok BOOLEAN; _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _p := public.create_support_pledge('in_kind', 'group', 'a7200000-0000-4000-8000-000000000001', 30);
  RESET ROLE;

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000007","role":"authenticated"}';
    PERFORM public.record_pledge_delivery(_p, 'a7500000-0000-4000-8000-000000000002', 'preparing');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مكتب منطقةٍ أخرى سلّم التعهّد'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000006","role":"authenticated"}';
  IF jsonb_array_length(public.office_open_pledges('a7500000-0000-4000-8000-000000000001')) <> 1 THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL — المكتب لا يرى تعهّد منطقته';
  END IF;
  PERFORM public.record_pledge_delivery(_p, 'a7500000-0000-4000-8000-000000000001', 'preparing');
  RESET ROLE;

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000006","role":"authenticated"}';
    PERFORM public.record_pledge_delivery(_p, 'a7500000-0000-4000-8000-000000000001', 'delivered',
      'a7500000-0000-4000-8000-000000000002/x.jpg');
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'proof_outside_office';
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — قُبل مستند تسليمٍ من مجلّد مكتبٍ آخر'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000006","role":"authenticated"}';
  PERFORM public.record_pledge_delivery(_p, 'a7500000-0000-4000-8000-000000000001', 'delivered',
    'a7500000-0000-4000-8000-000000000001/receipt.jpg', 'سُلّمت للمشرف');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _j := public.my_pledges();
  RESET ROLE;
  IF _j->0->>'status' <> 'fulfilled' OR jsonb_array_length(_j->0->'deliveries') <> 2
     OR NOT (_j->0->'deliveries'->1->>'documented')::boolean OR _j::text LIKE '%receipt.jpg%' THEN
    RAISE EXCEPTION 'FAIL — مسار التسليم لا يظهر للداعم كما يجب: %', _j;
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = 'a7000000-0000-4000-8000-000000000005'
        AND kind IN ('pledge_preparing', 'pledge_delivered') AND entity = 'pledge') <> 2 THEN
    RAISE EXCEPTION 'FAIL — لم يُبلَّغ الداعم بمرحلتي التسليم';
  END IF;
  RAISE NOTICE 'PASS — التعهّد: تجهيز ← تسليم بمستند من المكتب المختصّ، والداعم يُبلَّغ ولا يرى المستند';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص أبواب النطاقات اجتازت ──'; END $$;
ROLLBACK;
