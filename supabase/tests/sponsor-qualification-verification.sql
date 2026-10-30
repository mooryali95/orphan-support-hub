-- =====================================================================
-- رحلة التأهيل للكافل — إثبات
-- الخطر: كافلٌ لا يرى ما يدفع لبنائه، أو يرى ما لا يحقّ له (ملاحظات
-- المشرف، المخرجات، الدرجات الفردية)، أو يراها من لا صلة له.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ba100000-0000-4000-8000-000000000001', 'sq-org@example.test', '{"role":"care_org"}'::jsonb),
  ('ba100000-0000-4000-8000-000000000002', 'sq-sponsor@example.test', '{}'::jsonb),
  ('ba100000-0000-4000-8000-000000000003', 'sq-stranger@example.test', '{}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ba200000-0000-4000-8000-000000000001', 'ba100000-0000-4000-8000-000000000001', 'جهة التأهيل', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
VALUES ('ba300000-0000-4000-8000-000000000001', 'SQ-1', 'طفل التأهيل', 'ba200000-0000-4000-8000-000000000001',
        'ba100000-0000-4000-8000-000000000001', 'ألبانيا', 'Tirana', 100, 'approved', now());
INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('ba100000-0000-4000-8000-000000000002', 'ba300000-0000-4000-8000-000000000001', 40, 'EUR', 'active', now());

DO $$
DECLARE _prog UUID; _enr UUID; _u1 UUID; _u2 UUID; _v JSONB; _src TEXT;
BEGIN
  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price, status, started_at)
  SELECT 'ba300000-0000-4000-8000-000000000001', p.id, p.monthly_price, 'funded', now()
    FROM public.programs p WHERE p.slug = 'ahliyyah-foundational' RETURNING id, program_id INTO _enr, _prog;
  -- جلسةٌ مقبولة بمخرَجٍ وملاحظة (تثبيتٌ مباشر: الحرّاس يُختبرون في مجموعتهم).
  ALTER TABLE public.enrollment_units DISABLE TRIGGER USER;
  INSERT INTO public.enrollment_units (enrollment_id, unit_id, status, evidence, note, submitted_at, decided_at, decided_by)
  SELECT _enr, u.id, 'accepted', 'مخرَجٌ-سرّي', 'ملاحظةٌ-سرّية', now(), now(), 'ba100000-0000-4000-8000-000000000001'
    FROM public.program_units u WHERE u.program_id = _prog AND u.active ORDER BY u.ordinal LIMIT 1;
  ALTER TABLE public.enrollment_units ENABLE TRIGGER USER;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ba100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _v := public.sponsor_qualification('ba300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF NOT (_v->>'allowed')::boolean THEN RAISE EXCEPTION 'FAIL — الكافل الفعّال لا يرى رحلة التأهيل'; END IF;
  IF (_v->'programs'->0->>'accepted')::int <> 1
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_v->'programs'->0->'units') x
                     WHERE x->>'status' = 'accepted' AND x->>'accepted_month' = to_char(now(), 'YYYY-MM')) THEN
    RAISE EXCEPTION 'FAIL — الجلسة المقبولة وشهرها لا يظهران للكافل: %', _v->'programs';
  END IF;
  IF _v::text ~ '"(evidence|note|score)"' OR _v::text LIKE '%سرّي%' OR _v::text LIKE '%سرّية%' THEN
    RAISE EXCEPTION 'FAIL — رحلة الكافل تحمل مخرجاتٍ أو ملاحظاتٍ أو درجاتٍ فردية';
  END IF;
  RAISE NOTICE 'PASS — الكافل يرى رحلة التأهيل بلا مخرجاتٍ ولا ملاحظاتٍ ولا درجاتٍ فردية';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ba100000-0000-4000-8000-000000000003","role":"authenticated"}';
  _v := public.sponsor_qualification('ba300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF (_v->>'allowed')::boolean THEN RAISE EXCEPTION 'FAIL — غريبٌ رأى رحلة تأهيل طفل'; END IF;
  RAISE NOTICE 'PASS — من لا صلة له لا يرى شيئاً';

  -- النموّ بالأبعاد: بُعدٌ بقياسٍ واحد لا يظهر؛ بقياسين يظهر متوسّطاً
  INSERT INTO public.trait_dimensions (source, key, label_ar) VALUES ('rowad-albania', 'SQ_D', 'بُعد التجربة');
  INSERT INTO public.trait_definitions (source, external_ref, dimension_id, name_ar)
  SELECT 'rowad-albania', 'sq-t1', id, 'سمة ١' FROM public.trait_dimensions WHERE key = 'SQ_D';
  INSERT INTO public.orphan_trait_scores (source, external_ref, orphan_id, trait_id, score, scale_max, observed_at)
  SELECT 'rowad-albania', 'sq-s1', 'ba300000-0000-4000-8000-000000000001', id, 4, 10, now() - interval '60 days'
    FROM public.trait_definitions WHERE external_ref = 'sq-t1';
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"ba100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _v := public.sponsor_qualification('ba300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF jsonb_array_length(_v->'growth') <> 0 THEN RAISE EXCEPTION 'FAIL — بُعدٌ ظهر بقياسٍ واحد'; END IF;
  INSERT INTO public.orphan_trait_scores (source, external_ref, orphan_id, trait_id, score, scale_max, observed_at)
  SELECT 'rowad-albania', 'sq-s2', 'ba300000-0000-4000-8000-000000000001', id, 7, 10, now()
    FROM public.trait_definitions WHERE external_ref = 'sq-t1';
  SET LOCAL ROLE authenticated;
  _v := public.sponsor_qualification('ba300000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF (_v->'growth'->0->>'first')::int <> 40 OR (_v->'growth'->0->>'latest')::int <> 70 THEN
    RAISE EXCEPTION 'FAIL — نموّ البُعد خاطئ: %', _v->'growth';
  END IF;
  RAISE NOTICE 'PASS — النموّ يظهر بالأبعاد بعد قياسين: من ٤٠٪ إلى ٧٠٪';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص رحلة التأهيل للكافل اجتازت ──'; END $$;
ROLLBACK;
