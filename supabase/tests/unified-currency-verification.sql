-- =====================================================================
-- العملة الموحّدة وعملة تشغيل الدولة — إثبات
-- =====================================================================
--   • السعر مخزَّنٌ بتاريخه ومصدره؛ يقرؤه الجميع وتضيفه الإدارة وحدها.
--   • الكافل يدفع بعملة الحاجة أو بالموحّدة؛ غيرهما مرفوض.
--   • المقيَّد لحاجة الطفل يحسبه الخادم من السعر المخزَّن لا من رقم العميل.
--   • الدفعة تحمل ما حُصِّل وما قُيِّد وسعره، ولا تتبدّل إن تبدّل السعر بعدها.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/unified-currency-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f8a00000-0000-4000-8000-000000000001', 'fx-admin@example.test', '{}'::jsonb),
  ('f8a00000-0000-4000-8000-000000000002', 'fx-sponsor@example.test', '{}'::jsonb),
  ('f8a00000-0000-4000-8000-000000000003', 'fx-org@example.test', '{"role":"care_org"}'::jsonb),
  ('f8a00000-0000-4000-8000-000000000004', 'fx-sponsor-b@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('f8a00000-0000-4000-8000-000000000001', 'admin');
UPDATE public.countries SET status = 'active' WHERE code = 'AL';
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('f8b00000-0000-4000-8000-00000000000a', 'f8a00000-0000-4000-8000-000000000003', 'جهة الصرف', 'approved');
INSERT INTO public.orphans (id, code, display_name, country, monthly_need, currency, org_id, created_by, status, approved_at)
VALUES ('f8c00000-0000-4000-8000-000000000001', 'FX-1', 'ملف اليورو', 'AL', 300, 'EUR',
        'f8b00000-0000-4000-8000-00000000000a', 'f8a00000-0000-4000-8000-000000000003', 'approved', now()),
       ('f8c00000-0000-4000-8000-000000000002', 'FX-2', 'ملف الدولار', 'بلا دولة', 200, 'USD',
        'f8b00000-0000-4000-8000-00000000000a', 'f8a00000-0000-4000-8000-000000000003', 'approved', now());

DO $$ BEGIN RAISE NOTICE '── السعر وعملة الدولة'; END $$;

DO $$
DECLARE _q RECORD; _n INT;
BEGIN
  IF public.unified_currency() <> 'USD' THEN
    RAISE EXCEPTION 'FAIL — العملة الموحّدة ليست عملة المنصّة: %', public.unified_currency();
  END IF;
  SELECT * INTO _q FROM public.fx_convert('USD', 'EUR', 54);
  IF _q.converted <> 50.00 OR _q.pair <> 'EUR/USD' OR _q.rate <> 1.08
     OR _q.as_of <> DATE '2026-11-21' OR NOT _q.indicative THEN
    RAISE EXCEPTION 'FAIL — تحويل 54 دولاراً: %', _q;
  END IF;
  SELECT * INTO _q FROM public.fx_convert('usd', 'eur', 50);
  IF _q.converted <> 46.29 THEN RAISE EXCEPTION 'FAIL — التقريب ليس نزولاً إلى سنتين: %', _q; END IF;
  SELECT * INTO _q FROM public.fx_convert('EUR', 'USD', 80);
  IF _q.converted <> 86.40 THEN RAISE EXCEPTION 'FAIL — التحويل المباشر: %', _q; END IF;
  SELECT count(*) INTO _n FROM public.fx_convert('GBP', 'EUR', 10);
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL — عملةٌ بلا سعر حُوِّلت'; END IF;
  RAISE NOTICE 'PASS — التحويل بأحدث سعرٍ مخزَّن، نزولاً إلى سنتين، وبلا سعرٍ لا تحويل';

  IF public.default_operating_currency('AL') <> 'EUR' OR public.default_operating_currency('XK') <> 'EUR'
     OR public.default_operating_currency('CY') <> 'EUR'
     OR public.default_operating_currency('SN') <> 'USD' OR public.default_operating_currency('ID') <> 'USD' THEN
    RAISE EXCEPTION 'FAIL — قاعدة القارة';
  END IF;
  INSERT INTO public.countries (code, name_ar) VALUES ('SN', 'السنغال'), ('BA', 'البوسنة والهرسك')
  ON CONFLICT (code) DO UPDATE SET currency = NULL;
  IF (SELECT currency FROM public.countries WHERE code = 'SN') <> 'USD'
     OR (SELECT currency FROM public.countries WHERE code = 'BA') <> 'EUR'
     OR (SELECT currency FROM public.countries WHERE code = 'AL') <> 'EUR' THEN
    RAISE EXCEPTION 'FAIL — دولةٌ بلا عملة تشغيل';
  END IF;
  UPDATE public.countries SET currency = 'XOF' WHERE code = 'SN';
  IF (SELECT currency FROM public.countries WHERE code = 'SN') <> 'XOF' THEN
    RAISE EXCEPTION 'FAIL — عملة الدولة لا تُغيَّر لكل دولة';
  END IF;
  RAISE NOTICE 'PASS — كل دولةٍ لها عملة تشغيل: قارّتها افتراضاً، وتُغيَّر لكل دولة';
END $$;

DO $$
DECLARE _id UUID; _q RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f8a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_set_fx_rate('EUR', 'USD', 9, CURRENT_DATE, 'forged');
    RAISE EXCEPTION 'FAIL — كافلٌ كتب سعر صرف';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.fx_rates;
    RAISE EXCEPTION 'FAIL — جدول الأسعار مقروءٌ مباشرةً';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f8a00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_set_fx_rate('EUR', 'USD', 1.2, CURRENT_DATE + 1, 'future');
    RAISE EXCEPTION 'FAIL — سعرٌ بتاريخٍ قادم قُبل';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  _id := public.admin_set_fx_rate('gbp', 'usd', 1.25, DATE '2026-11-20', ' desk ', true);
  RESET ROLE;
  SELECT * INTO _q FROM public.fx_rates WHERE id = _id;
  IF _q.base <> 'GBP' OR _q.quote <> 'USD' OR _q.source <> 'desk' OR NOT _q.indicative
     OR _q.created_by <> 'f8a00000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL — السعر لم يُحفظ بمصدره وكاتبه: %', _q;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'fx_rate.set' AND entity_id = _id) THEN
    RAISE EXCEPTION 'FAIL — إضافة السعر بلا أثرٍ في سجلّ التدقيق';
  END IF;
  DELETE FROM public.fx_rates WHERE id = _id;
  RAISE NOTICE 'PASS — السعر تضيفه الإدارة وحدها بتاريخه ومصدره ويُدوَّن، ولا يُقرأ الجدول مباشرةً';
END $$;

DO $$ BEGIN RAISE NOTICE '── الكفالة بعملة الدفع'; END $$;

DO $$
DECLARE _opts JSONB; _id UUID; _s RECORD; _err TEXT;
BEGIN
  SET LOCAL ROLE anon;
  _opts := public.sponsorship_pay_options('f8c00000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF jsonb_array_length(_opts) <> 2
     OR _opts->0 <> '{"currency":"EUR","kind":"operating"}'::jsonb
     OR _opts->1->>'currency' <> 'USD' OR _opts->1->>'kind' <> 'unified'
     OR (_opts->1->>'rate')::numeric <> 1.08 OR _opts->1->>'as_of' <> '2026-11-21'
     OR (_opts->1->>'indicative')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — عملات الدفع لطفلٍ باليورو: %', _opts;
  END IF;
  -- حاجةٌ بالموحّدة نفسها: عملةٌ واحدة بلا تكرار.
  IF jsonb_array_length(public.sponsorship_pay_options('f8c00000-0000-4000-8000-000000000002')) <> 1 THEN
    RAISE EXCEPTION 'FAIL — تكرّرت العملة الموحّدة: %',
      public.sponsorship_pay_options('f8c00000-0000-4000-8000-000000000002');
  END IF;
  RAISE NOTICE 'PASS — عملة تشغيل الدولة ثم الموحّدة بسعرها وتاريخه، بلا تكرار';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f8a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  -- العميل يرسل مقيَّداً ملفَّقاً (9999) وسعراً ملفَّقاً: الخادم يحسبهما.
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, charge_currency, charge_amount,
                                   fx_pair, fx_rate, fx_as_of, fx_source)
  VALUES ('f8a00000-0000-4000-8000-000000000002', 'f8c00000-0000-4000-8000-000000000001', 9999, 'USD',
          'usd', 54, 'EUR/USD', 0.01, DATE '2020-01-01', 'forged')
  RETURNING id INTO _id;
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = _id;
  IF _s.amount <> 50.00 OR _s.currency <> 'EUR' OR _s.charge_currency <> 'USD' OR _s.charge_amount <> 54
     OR _s.fx_pair <> 'EUR/USD' OR _s.fx_rate <> 1.08 OR _s.fx_as_of <> DATE '2026-11-21'
     OR _s.fx_source <> 'seed:indicative' OR _s.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'FAIL — شروط التحصيل ليست من الخادم: %', _s;
  END IF;
  RAISE NOTICE 'PASS — يُحصَّل ما كتبه الكافل (54 USD) ويُقيَّد معادله (50 EUR) بالسعر المخزَّن';

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, charge_currency, charge_amount)
    VALUES ('f8a00000-0000-4000-8000-000000000002', 'f8c00000-0000-4000-8000-000000000001', 40, 'GBP', 40);
    _err := NULL;
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM;
  END;
  IF _err IS NULL OR _err NOT LIKE '%currency_not_payable%' THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — عملةٌ لا تُدفع بها لهذا الطفل قُبلت: %', _err;
  END IF;
  BEGIN
    UPDATE public.sponsorships SET charge_amount = 1 WHERE id = _id;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — الكافل عدّل شروط التحصيل بعد الإنشاء';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- بعملة الحاجة: كما كان، بلا شروط تحصيل.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f8a00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, charge_currency, charge_amount, type)
  VALUES ('f8a00000-0000-4000-8000-000000000004', 'f8c00000-0000-4000-8000-000000000001', 30, 'EUR', 777, 'one_time')
  RETURNING id INTO _id;
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = _id;
  IF _s.amount <> 30 OR _s.currency <> 'EUR' OR _s.charge_currency IS NOT NULL OR _s.charge_amount IS NOT NULL
     OR _s.fx_rate IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — الدفع بعملة الحاجة تغيّر: %', _s;
  END IF;
  RAISE NOTICE 'PASS — عملةٌ غير مسموحة تُرفض، والشروط لا تُعدَّل، والدفع بعملة الحاجة كما كان';
END $$;

DO $$ BEGIN RAISE NOTICE '── التحصيل'; END $$;

DO $$
DECLARE _sid UUID; _r JSONB; _p RECORD; _funded NUMERIC; _issues INT;
BEGIN
  SELECT id INTO _sid FROM public.sponsorships
   WHERE sponsor_id = 'f8a00000-0000-4000-8000-000000000002' AND charge_currency = 'USD';

  -- السعر يتبدّل بعد الإنشاء: المقيَّد يبقى بالسعر المحفوظ مع الكفالة.
  INSERT INTO public.fx_rates (base, quote, rate, as_of, source, indicative)
  VALUES ('EUR', 'USD', 1.50, DATE '2026-12-01', 'test:later', false);

  -- بعملة الحاجة على كفالةٍ اتُّفق على تحصيلها بالدولار: مخالفة.
  _r := public.record_provider_charge(_sid, 'creem', 'evt_fx_0', 'ord_fx_0', NULL, NULL, 50, 'EUR', now());
  IF _r->>'outcome' <> 'refused' OR _r->>'reason' <> 'currency_mismatch' THEN
    RAISE EXCEPTION 'FAIL — عملةٌ غير المتّفق عليها قُيّدت: %', _r;
  END IF;

  _r := public.record_provider_charge(_sid, 'creem', 'evt_fx_1', 'ord_fx_1', NULL, 'sub_fx_1', 54, 'USD', now());
  IF _r->>'outcome' <> 'recorded' THEN RAISE EXCEPTION 'FAIL — التحصيل بعملة الدفع رُفض: %', _r; END IF;
  SELECT * INTO _p FROM public.sponsorship_payments WHERE id = (_r->>'payment_id')::uuid;
  IF _p.amount <> 54 OR _p.currency <> 'USD' OR _p.credited_amount <> 50.00 OR _p.credited_currency <> 'EUR'
     OR _p.fx_pair <> 'EUR/USD' OR _p.fx_rate <> 1.08 OR _p.fx_as_of <> DATE '2026-11-21'
     OR _p.fx_source <> 'seed:indicative' OR _p.invoice_no IS NULL THEN
    RAISE EXCEPTION 'FAIL — الدفعة لا تحمل ما حُصِّل وما قُيِّد وسعره: %', _p;
  END IF;
  SELECT funded_monthly INTO _funded FROM public.orphans WHERE id = 'f8c00000-0000-4000-8000-000000000001';
  IF _funded <> 50.00 THEN RAISE EXCEPTION 'FAIL — تمويل الطفل ليس بعملة حاجته: %', _funded; END IF;
  SELECT count(*) INTO _issues FROM public.money_issues
   WHERE sponsorship_id = _sid AND kind = 'amount_mismatch';
  IF _issues <> 0 THEN RAISE EXCEPTION 'FAIL — المبلغ المتّفق عليه عُدّ مخالفاً'; END IF;
  RAISE NOTICE 'PASS — الدفعة: 54 USD محصَّلة، 50 EUR مقيَّدة، بسعر يوم الإنشاء وإن تبدّل السعر بعده';

  -- مبلغٌ غير المتّفق عليه: يُقيَّد بنسبته بالسعر المحفوظ ويُرفع للمراجعة.
  _r := public.record_provider_charge(_sid, 'creem', 'evt_fx_2', 'ord_fx_2', NULL, 'sub_fx_1', 27, 'USD', now());
  SELECT * INTO _p FROM public.sponsorship_payments WHERE id = (_r->>'payment_id')::uuid;
  SELECT count(*) INTO _issues FROM public.money_issues
   WHERE sponsorship_id = _sid AND kind = 'amount_mismatch';
  IF _p.credited_amount <> 25.00 OR _p.credited_currency <> 'EUR' OR _issues <> 1 THEN
    RAISE EXCEPTION 'FAIL — مبلغٌ مخالف: مقيَّد % وبنود %', _p.credited_amount, _issues;
  END IF;

  -- كفالةٌ بعملة الحاجة (بلا شروط تحصيل): المقيَّد هو المحصَّل.
  SELECT id INTO _sid FROM public.sponsorships
   WHERE sponsor_id = 'f8a00000-0000-4000-8000-000000000004' AND charge_currency IS NULL;
  _r := public.record_provider_charge(_sid, 'creem', 'evt_fx_3', 'ord_fx_3', NULL, NULL, 30, 'EUR', now());
  SELECT * INTO _p FROM public.sponsorship_payments WHERE id = (_r->>'payment_id')::uuid;
  IF _r->>'outcome' <> 'recorded' OR _p.amount <> 30 OR _p.currency <> 'EUR'
     OR _p.credited_amount <> 30 OR _p.credited_currency <> 'EUR' OR _p.fx_rate IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — الدفع بعملة الحاجة: % / %', _r, _p;
  END IF;
  RAISE NOTICE 'PASS — المبلغ المخالف يُقيَّد بنسبته ويُرفع، والدفع بعملة الحاجة كما كان';
END $$;

DO $$ BEGIN RAISE NOTICE '── تعهّد الدعم'; END $$;

DO $$
DECLARE _id UUID; _cur TEXT; _err TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f8a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _id := public.create_support_pledge('in_kind', 'country', 'AL', 25, NULL, NULL, 'USD', NULL);
  SELECT currency INTO _cur FROM public.support_pledges WHERE id = _id;
  IF _cur <> 'USD' THEN RESET ROLE; RAISE EXCEPTION 'FAIL — التعهّد بالموحّدة: %', _cur; END IF;
  _id := public.create_support_pledge('in_kind', 'country', 'AL', 25, NULL, NULL, 'EUR', NULL);
  _id := public.create_support_pledge('in_kind', 'orphan', 'f8c00000-0000-4000-8000-000000000001', 25, 'AL', NULL, 'EUR', NULL);
  BEGIN
    PERFORM public.create_support_pledge('in_kind', 'country', 'AL', 25, NULL, NULL, 'GBP', NULL);
    _err := NULL;
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM;
  END;
  RESET ROLE;
  IF _err IS NULL OR _err NOT LIKE '%currency_not_payable%' THEN
    RAISE EXCEPTION 'FAIL — تعهّدٌ بعملةٍ لا تعمل بها الدولة قُبل: %', _err;
  END IF;
  RAISE NOTICE 'PASS — التعهّد بعملة تشغيل الدولة أو بالموحّدة، وما عداهما مرفوض';
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.record_provider_charge(uuid,text,text,text,text,text,numeric,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_provider_charge(uuid,text,text,text,text,text,numeric,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — قيد التحصيل متاحٌ لغير مفتاح الخدمة';
  END IF;
  IF has_table_privilege('authenticated', 'public.fx_rates', 'SELECT')
     OR has_table_privilege('authenticated', 'public.fx_rates', 'UPDATE')
     OR has_table_privilege('anon', 'public.fx_rates', 'SELECT')
     OR has_function_privilege('anon', 'public.fx_convert(text,text,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_fx_rate(text,text,numeric,date,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — منح الأسعار أوسع ممّا يلزم';
  END IF;
  RAISE NOTICE 'PASS — قيد التحصيل لمفتاح الخدمة وحده، وجدول الأسعار بلا منحٍ للعموم';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص العملة الموحّدة اجتازت ──'; END $$;
ROLLBACK;
