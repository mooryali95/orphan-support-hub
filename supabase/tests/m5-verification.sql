-- =====================================================================
-- M5 — إثبات: الفائض والاقتراح
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9000000-0000-4000-8000-000000000001', 'm5-org@example.test', '{"role":"care_org"}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'm5-sponsor@example.test', '{}'::jsonb);

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a9100000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-000000000001', 'جهة الفائض', 'approved');

-- ملف متبقّيه 40 (احتياج 200، مموَّل 160)
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status, approved_at)
VALUES ('a9200000-0000-4000-8000-00000000000b', 'M5-1', 'ملف شبه مكتمل',
        'a9100000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-000000000001',
        200, 'approved', now());
UPDATE public.orphans SET funded_monthly = 160 WHERE id = 'a9200000-0000-4000-8000-00000000000b';

-- ملفّان محتاجان للاقتراح: أحدهما يطابق الفائض تقريباً والآخر بعيد
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status, approved_at)
VALUES
  ('a9200000-0000-4000-8000-00000000000c', 'M5-2', 'قريب من الفائض',
   'a9100000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-000000000001', 60, 'approved', now()),
  ('a9200000-0000-4000-8000-00000000000d', 'M5-3', 'بعيد عن الفائض',
   'a9100000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-000000000001', 900, 'approved', now());

-- ---------------------------------------------------------------------
-- حال التمويل: الفجوة والفائض لا يجتمعان
-- ---------------------------------------------------------------------
DO $$
DECLARE _s JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _s := public.orphan_funding_state('a9200000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF (_s->>'gap')::numeric <> 40 THEN
    RAISE EXCEPTION 'FAIL — the gap is wrong (%)', _s->>'gap';
  END IF;
  IF (_s->>'surplus')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL — an under-funded profile reports a surplus';
  END IF;
  RAISE NOTICE 'PASS — an under-funded profile has a gap and no surplus';
END $$;

-- ---------------------------------------------------------------------
-- الاقتراح: الأقرب إلى الفائض أولاً
-- ---------------------------------------------------------------------
DO $$
DECLARE _first_delta NUMERIC; _best_delta NUMERIC; _near INT; _far INT;
BEGIN
  SET LOCAL ROLE anon;

  -- الخاصية المُختبَرة هي الترتيب لا هوية صفّ بعينه: القاعدة تحمل بيانات
  -- تجريبية قد تُطابق المبلغ أيضاً، والتثبيت على معرّف يجعل الفحص هشّاً
  -- بلا أن يزيده صرامة.
  SELECT abs(gap - 60) INTO _first_delta
    FROM public.suggest_orphans_for_amount(60, 'a9200000-0000-4000-8000-00000000000b', 5) LIMIT 1;

  SELECT min(abs((monthly_need - funded_monthly) - 60)) INTO _best_delta
    FROM public.orphans
   WHERE status = 'approved' AND monthly_need > funded_monthly
     AND id <> 'a9200000-0000-4000-8000-00000000000b';

  IF _first_delta IS DISTINCT FROM _best_delta THEN
    RAISE EXCEPTION 'FAIL — the first suggestion is not the nearest (% vs best %)',
      _first_delta, _best_delta;
  END IF;
  RAISE NOTICE 'PASS — the first suggestion is the nearest match to the surplus';

  -- والقريب يسبق البعيد بين ملفّاتنا
  SELECT ordinality INTO _near FROM (
    SELECT id, row_number() OVER () AS ordinality
      FROM public.suggest_orphans_for_amount(60, 'a9200000-0000-4000-8000-00000000000b', 50)
  ) t WHERE id = 'a9200000-0000-4000-8000-00000000000c';
  SELECT ordinality INTO _far FROM (
    SELECT id, row_number() OVER () AS ordinality
      FROM public.suggest_orphans_for_amount(60, 'a9200000-0000-4000-8000-00000000000b', 50)
  ) t WHERE id = 'a9200000-0000-4000-8000-00000000000d';
  RESET ROLE;

  IF _near IS NULL OR _far IS NULL OR _near >= _far THEN
    RAISE EXCEPTION 'FAIL — a distant profile outranked a matching one (% vs %)', _near, _far;
  END IF;
  RAISE NOTICE 'PASS — a profile the surplus completes outranks a distant one';

  IF EXISTS (SELECT 1 FROM public.suggest_orphans_for_amount(60, 'a9200000-0000-4000-8000-00000000000b', 3)
              WHERE id = 'a9200000-0000-4000-8000-00000000000b') THEN
    RAISE EXCEPTION 'FAIL — the profile being sponsored was suggested to itself';
  END IF;
  RAISE NOTICE 'PASS — the current profile is excluded from its own suggestions';
END $$;

-- الاقتراح لا يكشف أعمدة داخلية (نفس تقييد H2)
DO $$
DECLARE _cols TEXT;
BEGIN
  SELECT string_agg(a.attname, '، ') INTO _cols
    FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    JOIN pg_attribute a ON a.attrelid = t.typrelid AND a.attnum > 0
   WHERE p.proname = 'suggest_orphans_for_amount'
     AND a.attname IN ('guardian_id', 'created_by', 'external_ref', 'external_source');

  IF _cols IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — suggestions expose internal columns: %', _cols;
  END IF;
  RAISE NOTICE 'PASS — suggestions expose public columns only';
END $$;

-- ---------------------------------------------------------------------
-- التجاوز يُقبل ويُوسَم — لا يُرفض
-- ---------------------------------------------------------------------
DO $$
DECLARE _s UUID; _exceeds BOOLEAN; _excess NUMERIC;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
  -- 200 على ملف متبقّيه 40: يُقبل، ولا يُرفض
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount)
  VALUES ('a9000000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-00000000000b', 200)
  RETURNING id INTO _s;
  RESET ROLE;

  IF _s IS NULL THEN RAISE EXCEPTION 'FAIL — an over-gap sponsorship was rejected'; END IF;
  RAISE NOTICE 'PASS — giving above the gap is accepted, never refused';

  SELECT exceeds_gap, excess_at_creation INTO _exceeds, _excess
    FROM public.sponsorships WHERE id = _s;
  IF NOT _exceeds THEN RAISE EXCEPTION 'FAIL — the over-gap sponsorship was not marked'; END IF;
  IF _excess <> 160 THEN
    RAISE EXCEPTION 'FAIL — the excess was recorded as % not 160', _excess;
  END IF;
  RAISE NOTICE 'PASS — the excess is recorded, so the choice is known to be deliberate';
END $$;

-- والوسم يُحسب في القاعدة: كفالة تُعلن نفسها «غير زائدة» لا تُصدَّق
DO $$
DECLARE _s UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, exceeds_gap, excess_at_creation)
  VALUES ('a9000000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-00000000000d',
          5000, false, 0)
  RETURNING id INTO _s;
  RESET ROLE;

  IF NOT (SELECT exceeds_gap FROM public.sponsorships WHERE id = _s) THEN
    RAISE EXCEPTION 'FAIL — a client hid its own excess flag';
  END IF;
  RAISE NOTICE 'PASS — the excess flag is computed server-side, not taken from the client';
END $$;

-- ---------------------------------------------------------------------
-- الفائض يُعرض بما يفتحه لا برقمه وحده
-- ---------------------------------------------------------------------
DO $$
DECLARE _s JSONB;
BEGIN
  -- تمويل يتجاوز الاحتياج بـ100: يغطّي التأهيل المهني (90) وما دونه
  UPDATE public.orphans SET funded_monthly = 300
   WHERE id = 'a9200000-0000-4000-8000-00000000000b';

  SET LOCAL ROLE anon;
  _s := public.orphan_funding_state('a9200000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF (_s->>'surplus')::numeric <> 100 THEN
    RAISE EXCEPTION 'FAIL — the surplus is wrong (%)', _s->>'surplus';
  END IF;
  IF (_s->>'gap')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL — a fully funded profile still reports a gap';
  END IF;
  RAISE NOTICE 'PASS — a fully funded profile reports a surplus and no gap';

  IF _s->'surplus_unlocks' IS NULL OR _s->'surplus_unlocks' = 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — the surplus does not say what it unlocks';
  END IF;
  -- الأغلى ضمن الفائض لا الأرخص: العطاء يُوجَّه إلى أكبر ما يغطّيه.
  IF (_s->'surplus_unlocks'->>'monthly_price')::numeric <> 90 THEN
    RAISE EXCEPTION 'FAIL — the surplus did not pick the largest programme it covers (%)',
      _s->'surplus_unlocks'->>'monthly_price';
  END IF;
  RAISE NOTICE 'PASS — the surplus names the largest programme it can open';
END $$;

-- برنامج التحق به الطفل لا يُقترح ثانيةً
DO $$
DECLARE _s JSONB; _prog UUID;
BEGIN
  -- يُلحَق الطفل بالبرنامج الذي كان سيُقترَح، فيجب أن ينزل الاقتراح إلى
  -- ما دونه بدل أن يُعيد عرض ما هو فيه.
  SELECT id INTO _prog FROM public.programs WHERE slug = 'vocational-track';
  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price)
  VALUES ('a9200000-0000-4000-8000-00000000000b', _prog, 90);

  SET LOCAL ROLE anon;
  _s := public.orphan_funding_state('a9200000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF (_s->'surplus_unlocks'->>'slug') = 'vocational-track' THEN
    RAISE EXCEPTION 'FAIL — a programme already enrolled was offered again';
  END IF;
  IF (_s->'surplus_unlocks'->>'monthly_price')::numeric <> 80 THEN
    RAISE EXCEPTION 'FAIL — the suggestion did not fall to the next programme down (%)',
      _s->'surplus_unlocks'->>'monthly_price';
  END IF;
  RAISE NOTICE 'PASS — an enrolled programme is skipped and the next one down is offered';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص M5 اجتازت ──'; END $$;

ROLLBACK;
