-- =====================================================================
-- لوحة الإدارة — مجاميع الدعم (admin_support_summary) — إثبات
-- =====================================================================
--   • للإدارة وحدها: غير المدير يُرفض، والزائر لا يملك التنفيذ أصلاً.
--   • المعادل بالعملة الموحّدة بالسعر «المعتمد» وحده: البذرة الاسترشادية لا
--     تدخل مجموعاً، وسعرٌ استرشادي أحدث لا يزيح المعتمد.
--   • الدعم بنوعه وحالته وعملته، والسلسلة الشهرية، والمال بعملاته.
--   • الداعمون: الجديد والمتعثّر والمنقطع بقواعدها المعلنة.
--   • المستحقّات بتاريخها.
--   • دولةٌ دون حدّ الحشد تعود بلا عددٍ ولا مبلغ.
--   • مجاميع فقط: لا اسم ولا بريد ولا رمز ملفّ في الناتج.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin-support-summary-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a5a00000-0000-4000-8000-000000000001', 'sum-admin@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000002', 'sum-steady@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000003', 'sum-late@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000004', 'sum-gone@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000005', 'sum-new@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000006', 'sum-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a5a00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a5b00000-0000-4000-8000-00000000000a', 'a5a00000-0000-4000-8000-000000000006', 'جهة المجاميع', 'approved');

-- ست ملفّات منشورة في AL (فوق حدّ الحشد)، واثنان في XK (دونه).
INSERT INTO public.orphans (id, code, display_name, country, monthly_need, currency, org_id, created_by, status, approved_at)
SELECT ('a5c00000-0000-4000-8000-00000000000' || n)::uuid, 'SUM-AL-' || n, 'طفل المجاميع السرّي ' || n,
       'AL', 100, 'EUR', 'a5b00000-0000-4000-8000-00000000000a', 'a5a00000-0000-4000-8000-000000000006',
       'approved', now()
  FROM generate_series(1, 6) n;
INSERT INTO public.orphans (id, code, display_name, country, monthly_need, currency, org_id, created_by, status, approved_at)
SELECT ('a5c00000-0000-4000-8000-00000000001' || n)::uuid, 'SUM-XK-' || n, 'طفل المجاميع السرّي XK ' || n,
       'XK', 100, 'EUR', 'a5b00000-0000-4000-8000-00000000000a', 'a5a00000-0000-4000-8000-000000000006',
       'approved', now()
  FROM generate_series(1, 2) n;

-- الصفوف تُكتب بدور المالك: الحرّاس تخصّ من يكتب بدور المسجَّل، وهنا تُبنى
-- حالاتٌ تاريخية (تواريخ ماضية) لا يصل إليها مسار الكافل.
SET LOCAL session_replication_role = replica;

INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, type, amount, currency, status, started_at, created_at)
VALUES
  -- منتظم: يورو، دفع قبل 20 يوماً.
  ('a5d00000-0000-4000-8000-000000000001', 'a5a00000-0000-4000-8000-000000000002',
   'a5c00000-0000-4000-8000-000000000001', 'monthly', 50, 'EUR', 'active', now() - interval '100 days', now() - interval '100 days'),
  -- متعثّر: دولار، آخر دفعةٍ قبل 70 يوماً (فات الاستحقاق بأربعين).
  ('a5d00000-0000-4000-8000-000000000002', 'a5a00000-0000-4000-8000-000000000003',
   'a5c00000-0000-4000-8000-000000000002', 'monthly', 40, 'USD', 'active', now() - interval '80 days', now() - interval '80 days'),
  -- منقطع: دفع مرّة ثم أُلغيت.
  ('a5d00000-0000-4000-8000-000000000003', 'a5a00000-0000-4000-8000-000000000004',
   'a5c00000-0000-4000-8000-000000000003', 'monthly', 30, 'EUR', 'cancelled', now() - interval '200 days', now() - interval '200 days'),
  -- جديد: بانتظار دفعته الأولى منذ ثلاثة أيام.
  ('a5d00000-0000-4000-8000-000000000004', 'a5a00000-0000-4000-8000-000000000005',
   'a5c00000-0000-4000-8000-000000000004', 'monthly', 20, 'USD', 'pending_payment', NULL, now() - interval '3 days');

INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, paid_at, created_at)
VALUES
  ('a5d00000-0000-4000-8000-000000000001', 'a5a00000-0000-4000-8000-000000000002', 50, 'EUR', 'paid', now() - interval '20 days', now() - interval '20 days'),
  ('a5d00000-0000-4000-8000-000000000001', 'a5a00000-0000-4000-8000-000000000002', 50, 'EUR', 'paid', now() - interval '50 days', now() - interval '50 days'),
  ('a5d00000-0000-4000-8000-000000000002', 'a5a00000-0000-4000-8000-000000000003', 40, 'USD', 'paid', now() - interval '70 days', now() - interval '70 days'),
  ('a5d00000-0000-4000-8000-000000000003', 'a5a00000-0000-4000-8000-000000000004', 30, 'EUR', 'paid', now() - interval '190 days', now() - interval '190 days'),
  ('a5d00000-0000-4000-8000-000000000004', 'a5a00000-0000-4000-8000-000000000005', 20, 'USD', 'pending', NULL, now() - interval '3 days'),
  -- خارج نافذة السلسلة (أقدم من 12 شهراً): لا يدخلها، ويدخل المحصَّل.
  ('a5d00000-0000-4000-8000-000000000003', 'a5a00000-0000-4000-8000-000000000004', 30, 'EUR', 'paid', now() - interval '500 days', now() - interval '500 days');

INSERT INTO public.disbursements (org_id, orphan_id, amount, currency, period_start, period_end, created_by)
VALUES ('a5b00000-0000-4000-8000-00000000000a', 'a5c00000-0000-4000-8000-000000000001', 60, 'EUR',
        CURRENT_DATE - 30, CURRENT_DATE, 'a5a00000-0000-4000-8000-000000000001');

INSERT INTO public.support_pledges (supporter_id, kind, target_type, orphan_id, country_code, amount, currency, status, created_at)
VALUES
  ('a5a00000-0000-4000-8000-000000000002', 'qualification', 'country', NULL, 'AL', 100, 'EUR', 'active', now() - interval '10 days'),
  ('a5a00000-0000-4000-8000-000000000002', 'qualification', 'country', NULL, 'AL', 60, 'EUR', 'active', now() - interval '40 days'),
  ('a5a00000-0000-4000-8000-000000000003', 'in_kind', 'country', NULL, 'AL', 25, 'USD', 'pending', now() - interval '2 days'),
  ('a5a00000-0000-4000-8000-000000000003', 'in_kind', 'country', NULL, 'AL', 75, 'USD', 'cancelled', now() - interval '2 days'),
  -- موجّهٌ لطفلٍ بعينه في دولةٍ دون حدّ الحشد.
  ('a5a00000-0000-4000-8000-000000000004', 'in_kind', 'orphan', 'a5c00000-0000-4000-8000-000000000011', 'XK', 500, 'EUR', 'fulfilled', now() - interval '5 days');

SET LOCAL session_replication_role = origin;

DO $$ BEGIN RAISE NOTICE '── الصلاحية'; END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_support_summary(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_fx_firm(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_fx_firm(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — منح دوالّ المجاميع أوسع ممّا يلزم';
  END IF;
  IF (SELECT bool_or(NOT p.prosecdef OR p.proconfig IS NULL
                     OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
         AND p.proname IN ('admin_support_summary', 'admin_fx_firm')) THEN
    RAISE EXCEPTION 'FAIL — دالّةٌ بلا SECURITY DEFINER أو بلا search_path مثبَّت';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"a5a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_support_summary();
    RAISE EXCEPTION 'FAIL — غير المدير قرأ مجاميع الإدارة';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.admin_fx_firm('EUR', 'USD');
    RAISE EXCEPTION 'FAIL — المسجَّل نفّذ دالّة السعر الداخلية';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — للإدارة وحدها: الزائر بلا تنفيذ، وغير المدير يُرفض، والدالّة الداخلية بلا منح';
END $$;

DO $$ BEGIN RAISE NOTICE '── السعر المعتمد وحده'; END $$;

DO $$
DECLARE _r JSONB; _c JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"a5a00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _r := public.admin_support_summary();
  RESET ROLE;

  IF _r->>'unified' <> 'USD' OR (_r->>'cohort_min')::int <> public.cohort_min()
     OR jsonb_array_length(_r->'months') <> 12 THEN
    RAISE EXCEPTION 'FAIL — رأس الناتج: %', _r - 'kinds' - 'trend';
  END IF;

  -- البذرة استرشادية: اليورو بلا معادل، والدولار معادله نفسه.
  SELECT x INTO _c FROM jsonb_array_elements(_r->'money') x
   WHERE x->>'measure' = 'committed' AND x->>'currency' = 'EUR';
  IF (_c->>'amount')::numeric <> 50 OR _c->'unified' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — السعر الاسترشادي دخل المعادل: %', _c;
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'money') x
   WHERE x->>'measure' = 'committed' AND x->>'currency' = 'USD';
  IF (_c->>'amount')::numeric <> 40 OR (_c->>'unified')::numeric <> 40 THEN
    RAISE EXCEPTION 'FAIL — الموحّدة نفسها: %', _c;
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'rates') x WHERE x->>'currency' = 'EUR';
  IF (_c->>'firm')::boolean IS NOT FALSE OR _c->'rate' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — عملةٌ بلا سعرٍ معتمد وُصفت معتمدة: %', _c;
  END IF;
  RAISE NOTICE 'PASS — البذرة الاسترشادية لا تدخل المعادل: اليورو بلا معادل والدولار بنفسه';

  -- سعرٌ معتمد، ثم استرشاديٌّ أحدث منه: المعتمد هو المستعمل.
  INSERT INTO public.fx_rates (base, quote, rate, as_of, source, indicative) VALUES
    ('EUR', 'USD', 1.10, CURRENT_DATE - 2, 'test:firm', false),
    ('EUR', 'USD', 1.50, CURRENT_DATE - 1, 'test:indicative-later', true),
    ('EUR', 'USD', 9.99, CURRENT_DATE + 5, 'test:future', false)
  ON CONFLICT (base, quote, as_of) DO UPDATE
    SET rate = EXCLUDED.rate, source = EXCLUDED.source, indicative = EXCLUDED.indicative;

  SET LOCAL ROLE authenticated;
  _r := public.admin_support_summary();
  RESET ROLE;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'money') x
   WHERE x->>'measure' = 'committed' AND x->>'currency' = 'EUR';
  IF (_c->>'unified')::numeric <> 55.00 THEN
    RAISE EXCEPTION 'FAIL — المعادل ليس بالسعر المعتمد (50 × 1.10): %', _c;
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'rates') x WHERE x->>'currency' = 'EUR';
  IF (_c->>'firm')::boolean IS NOT TRUE OR (_c->>'rate')::numeric <> 1.10
     OR _c->>'source' <> 'test:firm' OR (_c->>'as_of')::date <> CURRENT_DATE - 2 THEN
    RAISE EXCEPTION 'FAIL — السعر المعلن ليس المعتمد بتاريخه ومصدره: %', _c;
  END IF;
  RAISE NOTICE 'PASS — المعادل بأحدث سعرٍ معتمد بتاريخه ومصدره؛ الاسترشادي الأحدث والقادم لا يزيحانه';
END $$;

DO $$ BEGIN RAISE NOTICE '── المجاميع'; END $$;

DO $$
DECLARE _r JSONB; _c JSONB; _n INT; _sum NUMERIC;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"a5a00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _r := public.admin_support_summary(12);
  RESET ROLE;

  -- الدعم بنوعه وحالته وعملته.
  SELECT x INTO _c FROM jsonb_array_elements(_r->'kinds') x
   WHERE x->>'kind' = 'qualification' AND x->>'status' = 'active' AND x->>'currency' = 'EUR';
  IF (_c->>'count')::int <> 2 OR (_c->>'amount')::numeric <> 160 OR (_c->>'unified')::numeric <> 176.00 THEN
    RAISE EXCEPTION 'FAIL — التأهيل النشط باليورو: %', _c;
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'kinds') x
   WHERE x->>'kind' = 'in_kind' AND x->>'status' = 'pending' AND x->>'currency' = 'USD';
  IF (_c->>'count')::int <> 1 OR (_c->>'amount')::numeric <> 25 THEN
    RAISE EXCEPTION 'FAIL — العيني المنتظر بالدولار: %', _c;
  END IF;
  SELECT count(*) INTO _n FROM jsonb_array_elements(_r->'kinds') x
   WHERE x->>'kind' = 'sponsorship' AND x->>'status' = 'active';
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL — الكفالة النشطة ليست سطراً لكلّ عملة: %', _r->'kinds'; END IF;
  RAISE NOTICE 'PASS — الدعم بنوعه وحالته وعملته، ولكلّ عملةٍ سطرها';

  -- السلسلة: المدفوع داخل النافذة وحده، والتعهّد المقبول وحده.
  SELECT COALESCE(SUM((x->>'amount')::numeric), 0) INTO _sum FROM jsonb_array_elements(_r->'trend') x
   WHERE x->>'kind' = 'sponsorship' AND x->>'currency' = 'EUR';
  IF _sum <> 130 THEN RAISE EXCEPTION 'FAIL — سلسلة الكفالة باليورو (50+50+30): %', _sum; END IF;
  SELECT COALESCE(SUM((x->>'amount')::numeric), 0) INTO _sum FROM jsonb_array_elements(_r->'trend') x
   WHERE x->>'kind' = 'in_kind';
  IF _sum <> 500 THEN RAISE EXCEPTION 'FAIL — المنتظر والملغى دخلا سلسلة العيني: %', _sum; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'trend') x
              WHERE NOT (_r->'months') ? (x->>'month')) THEN
    RAISE EXCEPTION 'FAIL — شهرٌ خارج النافذة في السلسلة';
  END IF;
  IF jsonb_array_length(public.admin_support_summary(1)->'months') <> 1
     OR jsonb_array_length(public.admin_support_summary(999)->'months') <> 24 THEN
    RAISE EXCEPTION 'FAIL — النافذة لا تُحصر بين شهرٍ وأربعةٍ وعشرين';
  END IF;
  RAISE NOTICE 'PASS — السلسلة الشهرية: المدفوع والمقبول داخل النافذة وحدهما، والنافذة محصورة';

  -- المال: المحصَّل يشمل ما خرج من النافذة.
  SELECT x INTO _c FROM jsonb_array_elements(_r->'money') x
   WHERE x->>'measure' = 'collected' AND x->>'currency' = 'EUR';
  IF (_c->>'amount')::numeric <> 160 OR (_c->>'unified')::numeric <> 176.00 THEN
    RAISE EXCEPTION 'FAIL — المحصَّل باليورو: %', _c;
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'money') x
   WHERE x->>'measure' = 'disbursed' AND x->>'currency' = 'EUR';
  IF (_c->>'amount')::numeric <> 60 THEN RAISE EXCEPTION 'FAIL — المصروف: %', _c; END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'money') x
   WHERE x->>'measure' = 'pending' AND x->>'currency' = 'USD';
  IF (_c->>'amount')::numeric <> 20 THEN RAISE EXCEPTION 'FAIL — المنتظر: %', _c; END IF;
  RAISE NOTICE 'PASS — الملتزَم والمحصَّل والمنتظر والمصروف بعملاته ومعادله المعتمد';

  -- الداعمون.
  _c := _r->'donors';
  IF (_c->>'total')::int <> 4 OR (_c->>'active')::int <> 2 OR (_c->>'new')::int <> 1
     OR (_c->>'at_risk')::int <> 1 OR (_c->>'lapsed')::int <> 1
     OR (_c->'rule'->>'new_days')::int <> 30 OR (_c->'rule'->>'grace_days')::int <> 14 THEN
    RAISE EXCEPTION 'FAIL — الداعمون: %', _c;
  END IF;
  RAISE NOTICE 'PASS — الداعمون: الكلّ 4، النشط 2، الجديد 1، المتعثّر 1، المنقطع 1، والقاعدة معلنة';

  -- المستحقّات.
  SELECT x INTO _c FROM jsonb_array_elements(_r->'due') x WHERE x->>'bucket' = 'overdue';
  IF (_c->>'count')::int <> 1 OR (_c->>'amount')::numeric <> 40 OR _c->>'currency' <> 'USD' THEN
    RAISE EXCEPTION 'FAIL — الفائت استحقاقه: %', _r->'due';
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'due') x WHERE x->>'bucket' = 'first';
  IF (_c->>'count')::int <> 1 OR (_c->>'amount')::numeric <> 20 THEN
    RAISE EXCEPTION 'FAIL — بانتظار الدفعة الأولى: %', _r->'due';
  END IF;
  SELECT count(*) INTO _n FROM jsonb_array_elements(_r->'due') x WHERE x->>'bucket' IN ('week', 'month');
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL — المنتظم يستحقّ خلال ثلاثين يوماً: %', _r->'due'; END IF;
  RAISE NOTICE 'PASS — المستحقّات بتاريخها: فائتٌ، وقادمٌ خلال ثلاثين يوماً، وبانتظار الدفعة الأولى';
END $$;

DO $$ BEGIN RAISE NOTICE '── حدّ الحشد والخصوصية'; END $$;

DO $$
DECLARE _r JSONB; _c JSONB; _txt TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"a5a00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _r := public.admin_support_summary();
  RESET ROLE;

  SELECT x INTO _c FROM jsonb_array_elements(_r->'by_country') x WHERE x->>'country' = 'XK';
  IF (_c->>'small')::boolean IS NOT TRUE OR _c->'count' <> 'null'::jsonb OR _c->'amounts' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — دولةٌ دون حدّ الحشد كشفت عدداً أو مبلغاً: %', _c;
  END IF;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'by_country') x WHERE x->>'country' = 'AL';
  IF (_c->>'small')::boolean IS NOT FALSE OR (_c->>'count')::int <> 3
     OR _c->'amounts' <> '[{"amount": 160, "currency": "EUR"}, {"amount": 25, "currency": "USD"}]'::jsonb THEN
    RAISE EXCEPTION 'FAIL — دولةٌ فوق الحدّ: %', _c;
  END IF;
  RAISE NOTICE 'PASS — دولةٌ دون حدّ الحشد بلا عددٍ ولا مبلغ، وفوقه بعملاتها';

  -- تعهّدٌ موجّه لطفلٍ بعينه في دولةٍ فوق الحدّ: يمسّ طفلاً واحداً ⇒ يُحجب.
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.support_pledges (supporter_id, kind, target_type, orphan_id, country_code, amount, currency, status)
  VALUES ('a5a00000-0000-4000-8000-000000000004', 'in_kind', 'orphan',
          'a5c00000-0000-4000-8000-000000000005', 'AL', 10, 'EUR', 'active');
  SET LOCAL session_replication_role = origin;
  SET LOCAL ROLE authenticated;
  _r := public.admin_support_summary();
  RESET ROLE;
  SELECT x INTO _c FROM jsonb_array_elements(_r->'by_country') x WHERE x->>'country' = 'AL';
  IF (_c->>'small')::boolean IS NOT TRUE OR _c->'amounts' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — تعهّدٌ يمسّ طفلاً واحداً ظهر في دولته: %', _c;
  END IF;
  RAISE NOTICE 'PASS — تعهّداتٌ تمسّ أقلّ من حدّ الحشد من الأطفال تُحجب ولو كبرت الدولة';

  _txt := _r::text;
  IF _txt LIKE '%example.test%' OR _txt LIKE '%السرّي%' OR _txt LIKE '%SUM-AL%'
     OR _txt LIKE '%a5c00000%' OR _txt LIKE '%a5a00000%' OR _txt LIKE '%جهة المجاميع%' THEN
    RAISE EXCEPTION 'FAIL — في الناتج اسمٌ أو بريد أو رمز ملفّ أو معرّف';
  END IF;
  RAISE NOTICE 'PASS — مجاميع فقط: لا اسم ولا بريد ولا رمز ملفّ ولا معرّف في الناتج';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص مجاميع الدعم اجتازت ──'; END $$;
ROLLBACK;
