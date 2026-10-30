-- =====================================================================
-- إيصال الكافل — إثبات
-- الخطر: إيصالٌ لا يتغيّر إن تغيّرت الحقيقة، أو يقرؤه غير صاحبه.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b8100000-0000-4000-8000-000000000001', 'rc-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b8100000-0000-4000-8000-000000000002', 'rc-sponsor@example.test', '{}'::jsonb),
  ('b8100000-0000-4000-8000-000000000003', 'rc-stranger@example.test', '{}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b8200000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000001', 'جهة الإيصال', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
VALUES ('b8300000-0000-4000-8000-000000000001', 'RC-1', 'طفل الإيصال', 'b8200000-0000-4000-8000-000000000001',
        'b8100000-0000-4000-8000-000000000001', 'ألبانيا', 'Tirana', 100, 'approved', now());
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('b8400000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000002',
        'b8300000-0000-4000-8000-000000000001', 40, 'EUR', 'active', now() - interval '1 month');
INSERT INTO public.sponsorship_payments (id, sponsorship_id, sponsor_id, amount, currency, status, paid_at, period_start)
VALUES ('b8500000-0000-4000-8000-000000000001', 'b8400000-0000-4000-8000-000000000001',
        'b8100000-0000-4000-8000-000000000002', 40, 'EUR', 'paid',
        now() - interval '1 month', date_trunc('month', now() - interval '1 month')::date);

DO $$
DECLARE _l JSONB; _m JSONB; _month TEXT := to_char(now() - interval '1 month', 'YYYY-MM'); _rc TEXT; _v JSONB; _ok BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b8100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _l := public.sponsorship_ledger('b8400000-0000-4000-8000-000000000001');
  RESET ROLE;
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  _rc := _m->>'receipt';
  IF _rc IS NULL OR _rc !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' THEN
    RAISE EXCEPTION 'FAIL — الشهر المدفوع بلا إيصالٍ صحيح الصيغة: %', _m;
  END IF;
  IF (_l->'orphan'->>'locked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — السجلّ لا يذكر أن ملفّ المكفول مثبّت';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_l->'months') x WHERE (x->>'upcoming')::boolean AND x->>'receipt' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL — شهرٌ قادم له إيصال';
  END IF;
  RAISE NOTICE 'PASS — كل شهرٍ مضى بإيصال، والقادم بلا إيصال، والسجلّ يذكر التثبيت';

  SET LOCAL ROLE authenticated;
  _v := public.verify_ledger_receipt('b8400000-0000-4000-8000-000000000001', _month, lower(_rc));
  RESET ROLE;
  IF NOT (_v->>'match')::boolean THEN RAISE EXCEPTION 'FAIL — الإيصال لا يطابق نفسه'; END IF;

  -- تغيّر حقيقةٌ من حقائق الشهر (المبلغ المدفوع) ← يتغيّر الإيصال
  -- الدفعة المفوترة مجمّدة؛ نحاكي عبثاً يتجاوز الحارس، والإيصال يكشفه.
  ALTER TABLE public.sponsorship_payments DISABLE TRIGGER freeze_invoiced_payment;
  UPDATE public.sponsorship_payments SET amount = 35 WHERE id = 'b8500000-0000-4000-8000-000000000001';
  ALTER TABLE public.sponsorship_payments ENABLE TRIGGER freeze_invoiced_payment;
  SET LOCAL ROLE authenticated;
  _v := public.verify_ledger_receipt('b8400000-0000-4000-8000-000000000001', _month, _rc);
  RESET ROLE;
  IF (_v->>'match')::boolean THEN RAISE EXCEPTION 'FAIL — تغيّر المدفوع ولم يتغيّر الإيصال'; END IF;
  RAISE NOTICE 'PASS — الإيصال يطابق حقائقه، وأي تغييرٍ فيها يكشفه';

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"b8100000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.verify_ledger_receipt('b8400000-0000-4000-8000-000000000001', _month, _rc);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غريبٌ تحقّق من إيصال كفالةٍ ليست له'; END IF;
  RAISE NOTICE 'PASS — الإيصال لصاحب الكفالة والإدارة وحدهما';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الإيصال اجتازت ──'; END $$;
ROLLBACK;
