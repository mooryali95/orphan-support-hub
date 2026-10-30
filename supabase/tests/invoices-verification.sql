-- =====================================================================
-- الفاتورة والدفع الحقيقي — إثبات
-- الخطر: فاتورتان لمعاملةٍ واحدة، أو فاتورةٌ تتغيّر حقائقها أو تُحذف، أو
-- إيصالٌ لا يرتبط بالمعاملة الحقيقية، أو كافلٌ يرى دفعات غيره.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b9100000-0000-4000-8000-000000000001', 'iv-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b9100000-0000-4000-8000-000000000002', 'iv-sponsor@example.test', '{}'::jsonb),
  ('b9100000-0000-4000-8000-000000000003', 'iv-stranger@example.test', '{}'::jsonb),
  ('b9100000-0000-4000-8000-000000000004', 'iv-admin@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('b9100000-0000-4000-8000-000000000004', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b9200000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'جهة الفاتورة', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
VALUES ('b9300000-0000-4000-8000-000000000001', 'IV-1', 'طفل الفاتورة', 'b9200000-0000-4000-8000-000000000001',
        'b9100000-0000-4000-8000-000000000001', 'ألبانيا', 'Tirana', 100, 'approved', now());
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('b9400000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000002',
        'b9300000-0000-4000-8000-000000000001', 40, 'EUR', 'active', now() - interval '1 month');

DO $$
DECLARE _inv TEXT; _ok BOOLEAN; _l JSONB; _m JSONB; _r JSONB; _rc TEXT;
        _month TEXT := to_char(now() - interval '1 month', 'YYYY-MM');
BEGIN
  -- ١) الدفعة المدفوعة تأخذ فاتورة، ومحاولةٌ معلّقة أو فاشلة لا تأخذ
  INSERT INTO public.sponsorship_payments (id, sponsorship_id, sponsor_id, amount, currency, status, provider,
         provider_ref, provider_payment_id, paid_at, period_start)
  VALUES ('b9500000-0000-4000-8000-000000000001', 'b9400000-0000-4000-8000-000000000001',
          'b9100000-0000-4000-8000-000000000002', 40, 'EUR', 'paid', 'creem', 'ch_iv_1', 'ord_iv_1',
          now() - interval '1 month', date_trunc('month', now() - interval '1 month')::date);
  INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_payment_id)
  VALUES ('b9400000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000002', 40, 'EUR', 'failed', 'creem', 'ord_iv_f');
  SELECT invoice_no INTO _inv FROM public.sponsorship_payments WHERE id = 'b9500000-0000-4000-8000-000000000001';
  IF _inv !~ '^INV-\d{4}-\d{6}$' THEN RAISE EXCEPTION 'FAIL — رقم الفاتورة بصيغةٍ خاطئة: %', _inv; END IF;
  IF EXISTS (SELECT 1 FROM public.sponsorship_payments WHERE status = 'failed' AND invoice_no IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL — دفعةٌ فاشلة أخذت فاتورة';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'payment_invoiced'
                  AND detail->>'invoice' = _inv AND detail->>'provider_payment_id' = 'ord_iv_1') THEN
    RAISE EXCEPTION 'FAIL — الفاتورة لم تُثبَّت في سجلّ السلامة بمعاملتها';
  END IF;
  RAISE NOTICE 'PASS — الدفعة المدفوعة وحدها تأخذ فاتورة، مربوطةً بمعاملة المزوّد ومثبّتةً في السجلّ';

  -- ٢) معاملةٌ واحدة لا تصنع فاتورتين (حدثٌ مكرّر من المزوّد)
  _ok := false;
  BEGIN
    INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_payment_id, paid_at)
    VALUES ('b9400000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000002', 40, 'EUR', 'paid', 'creem', 'ord_iv_1', now());
  EXCEPTION WHEN unique_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — معاملةٌ واحدة صارت فاتورتين'; END IF;
  RAISE NOTICE 'PASS — معاملةٌ واحدة لدى المزوّد = فاتورةٌ واحدة';

  -- ٣) الحقائق مجمّدة، ولا حذف — ولا بحذف حساب الكافل
  _ok := false;
  BEGIN UPDATE public.sponsorship_payments SET amount = 10 WHERE id = 'b9500000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — تغيّر مبلغ دفعةٍ مفوترة'; END IF;
  _ok := false;
  BEGIN UPDATE public.sponsorship_payments SET provider_payment_id = 'ord_other' WHERE id = 'b9500000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — تغيّر رقم المعاملة لفاتورةٍ قائمة'; END IF;
  _ok := false;
  BEGIN DELETE FROM public.sponsorship_payments WHERE id = 'b9500000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذفت دفعةٌ مفوترة'; END IF;
  _ok := false;
  BEGIN DELETE FROM auth.users WHERE id = 'b9100000-0000-4000-8000-000000000002';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حذف حساب الكافل محا فواتيره'; END IF;
  RAISE NOTICE 'PASS — الفاتورة: لا يتغيّر مبلغها ولا معاملتها، ولا تُحذف ولا بحذف الحساب';

  -- ٤) الحالة تتقدّم في مسارٍ معلوم، وكل تقدّمٍ مُسجَّل
  UPDATE public.sponsorship_payments SET status = 'disputed' WHERE id = 'b9500000-0000-4000-8000-000000000001';
  UPDATE public.sponsorship_payments SET status = 'paid' WHERE id = 'b9500000-0000-4000-8000-000000000001';
  _ok := false;
  BEGIN UPDATE public.sponsorship_payments SET status = 'pending' WHERE id = 'b9500000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — فاتورةٌ عادت «معلّقة»'; END IF;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'payment_status' AND detail->>'invoice' = _inv) <> 2 THEN
    RAISE EXCEPTION 'FAIL — تقدّم حالة الفاتورة لم يُسجَّل';
  END IF;
  RAISE NOTICE 'PASS — الحالة: مدفوع ← منازَع ← مدفوع، ولا رجوع إلى «معلّق»، وكل خطوةٍ في السجلّ';

  -- ٥) سجلّ الشهر يحمل الفاتورة والمعاملة، والإيصال مربوطٌ بهما
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b9100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _l := public.sponsorship_ledger('b9400000-0000-4000-8000-000000000001');
  RESET ROLE;
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  IF _m->'payments'->0->>'invoice_no' <> _inv OR _m->'payments'->0->>'provider_payment_id' <> 'ord_iv_1' THEN
    RAISE EXCEPTION 'FAIL — سجلّ الشهر لا يحمل الفاتورة ومعاملتها: %', _m;
  END IF;
  _rc := _m->>'receipt';
  ALTER TABLE public.sponsorship_payments DISABLE TRIGGER freeze_invoiced_payment;
  UPDATE public.sponsorship_payments SET provider_payment_id = 'ord_forged' WHERE id = 'b9500000-0000-4000-8000-000000000001';
  ALTER TABLE public.sponsorship_payments ENABLE TRIGGER freeze_invoiced_payment;
  SET LOCAL ROLE authenticated;
  _r := public.verify_ledger_receipt('b9400000-0000-4000-8000-000000000001', _month, _rc);
  RESET ROLE;
  IF (_r->>'match')::boolean THEN RAISE EXCEPTION 'FAIL — استُبدلت المعاملة ولم يتغيّر الإيصال'; END IF;
  ALTER TABLE public.sponsorship_payments DISABLE TRIGGER freeze_invoiced_payment;
  UPDATE public.sponsorship_payments SET provider_payment_id = 'ord_iv_1' WHERE id = 'b9500000-0000-4000-8000-000000000001';
  ALTER TABLE public.sponsorship_payments ENABLE TRIGGER freeze_invoiced_payment;
  RAISE NOTICE 'PASS — إيصال الشهر مربوطٌ بالفاتورة ومعاملتها: استبدال المعاملة يكشفه';

  -- ٦) البحث: الكافل بالفاتورة وبالمعاملة، والغريب لا يجد، والإدارة تجد
  SET LOCAL ROLE authenticated;
  _r := public.lookup_payment(lower(_inv));
  IF NOT (_r->>'found')::boolean OR _r->>'provider_payment_id' <> 'ord_iv_1' OR _r->>'month' <> _month
     OR _r->>'month_receipt' IS NULL OR _r->>'anchor' IS NULL THEN
    RAISE EXCEPTION 'FAIL — البحث بالفاتورة لم يُعِد الربط كاملاً: %', _r;
  END IF;
  _r := public.lookup_payment('ord_iv_1');
  IF _r->>'invoice_no' <> _inv THEN RAISE EXCEPTION 'FAIL — البحث بمعاملة المزوّد لم يجد الفاتورة'; END IF;
  SET LOCAL request.jwt.claims = '{"sub":"b9100000-0000-4000-8000-000000000003","role":"authenticated"}';
  _r := public.lookup_payment(_inv);
  IF (_r->>'found')::boolean THEN RAISE EXCEPTION 'FAIL — غريبٌ وجد فاتورة غيره'; END IF;
  SET LOCAL request.jwt.claims = '{"sub":"b9100000-0000-4000-8000-000000000004","role":"authenticated"}';
  _r := public.lookup_payment('ord_iv_1');
  RESET ROLE;
  IF NOT (_r->>'found')::boolean THEN RAISE EXCEPTION 'FAIL — الإدارة لم تجد الفاتورة'; END IF;
  RAISE NOTICE 'PASS — البحث بالفاتورة أو بمعاملة المزوّد: للكافل دفعاته، وللإدارة الكل، والغريب لا شيء';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الفاتورة اجتازت ──'; END $$;
ROLLBACK;
