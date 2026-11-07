-- =====================================================================
-- عمليات الإدارة — إثبات (الدفعة ٢: UX-15 + PRD-13)
-- ---------------------------------------------------------------------
--   • التحويل المعلّق بندٌ في صندوق القرارات بسياقه (الكافل وبريده والمبلغ)
--   • لا تفعيل بلا المبلغ المستلَم وعملته وتاريخ القيد والمرجع البنكي؛
--     العملة المخالفة تُرفض، والفرق لا يمرّ إلا بإقرارٍ وملاحظة؛ المرجع لا
--     يتكرّر؛ والتأكيد للإدارة وحدها، مسجَّلٌ في الأثر
--   • القوائم صفحاتٌ بعددٍ كلّي وبحث، والتصدير للإدارة بلا بيانات سرّية
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b2e00000-0000-4000-8000-000000000001', 'b2e-admin@example.test', '{}'::jsonb),
  ('b2e00000-0000-4000-8000-000000000002', 'b2e-sponsor@example.test', '{"full_name":"سارة الكافلة"}'::jsonb),
  ('b2e00000-0000-4000-8000-000000000003', 'b2e-card@example.test', '{}'::jsonb),
  ('b2e00000-0000-4000-8000-000000000004', 'b2e-third@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('b2e00000-0000-4000-8000-000000000001', 'admin');
UPDATE public.profiles SET full_name = 'سارة الكافلة' WHERE id = 'b2e00000-0000-4000-8000-000000000002';

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b2e10000-0000-4000-8000-000000000001', NULL, 'جهة العمليات', 'approved');
INSERT INTO public.orphans (id, code, display_name, gender, country, region, org_id, monthly_need, currency, status, approved_at)
VALUES
  ('b2e20000-0000-4000-8000-000000000001', 'B2E-1', 'ليندا', 'female', 'ألبانيا', 'تيرانا',
   'b2e10000-0000-4000-8000-000000000001', 100, 'EUR', 'approved', now()),
  ('b2e20000-0000-4000-8000-000000000002', 'B2E-2', 'دريتون', 'male', 'ألبانيا', 'تيرانا',
   'b2e10000-0000-4000-8000-000000000001', 80, 'EUR', 'approved', now()),
  ('b2e20000-0000-4000-8000-000000000003', 'B2E-3', 'أرتا', 'female', 'ألبانيا', 'تيرانا',
   'b2e10000-0000-4000-8000-000000000001', 60, 'EUR', 'approved', now());
INSERT INTO public.orphan_private (orphan_id, full_name, national_id)
VALUES ('b2e20000-0000-4000-8000-000000000001', 'ليندا السرّية', 'ID-SECRET-1');

-- T1 تحويلٌ بنكي معلّق (ومعه دفعته المعلّقة)، T2 بطاقةٌ عند مزوّدٍ إلكتروني، T3 تحويلٌ ثانٍ.
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, created_at) VALUES
  ('b2e30000-0000-4000-8000-000000000001', 'b2e00000-0000-4000-8000-000000000002',
   'b2e20000-0000-4000-8000-000000000001', 50, 'EUR', 'pending_payment', now() - interval '3 days'),
  ('b2e30000-0000-4000-8000-000000000002', 'b2e00000-0000-4000-8000-000000000003',
   'b2e20000-0000-4000-8000-000000000002', 40, 'EUR', 'pending_payment', now() - interval '3 days'),
  ('b2e30000-0000-4000-8000-000000000003', 'b2e00000-0000-4000-8000-000000000004',
   'b2e20000-0000-4000-8000-000000000003', 30, 'EUR', 'pending_payment', now() - interval '3 days');
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, idempotency_key)
VALUES ('b2e30000-0000-4000-8000-000000000001', 'b2e00000-0000-4000-8000-000000000002', 50, 'EUR',
        'pending', 'manual', 'b2e-manual-1'),
       ('b2e30000-0000-4000-8000-000000000002', 'b2e00000-0000-4000-8000-000000000003', 40, 'EUR',
        'pending', 'creem', 'b2e-card-1');

-- ١) التحويل المعلّق في الصندوق بسياقه؛ والبطاقة ليست تحويلاً.
DO $$
DECLARE _inbox JSONB; _ctx JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _inbox := public.admin_decision_inbox();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_inbox) i
                  WHERE i->>'kind' = 'transfer' AND i->>'id' = 'b2e30000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — التحويل المعلّق غائبٌ عن صندوق القرارات';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_inbox) i
              WHERE i->>'kind' = 'transfer' AND i->>'id' = 'b2e30000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL — دفعة البطاقة عُرضت تحويلاً يدوياً';
  END IF;
  _ctx := public.admin_decision_context('transfer', 'b2e30000-0000-4000-8000-000000000001');
  IF _ctx->>'person_email' <> 'b2e-sponsor@example.test' OR _ctx->>'person_name' <> 'سارة الكافلة'
     OR (_ctx->>'amount')::numeric <> 50 OR _ctx->>'currency' <> 'EUR'
     OR _ctx->>'reference' <> upper(left('b2e30000-0000-4000-8000-000000000001', 8)) THEN
    RAISE EXCEPTION 'FAIL — سياق التحويل ناقص: %', _ctx;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — UX-15: التحويل المعلّق بندٌ في صندوق القرارات بكافله وبريده ومبلغه ومرجعه';
END $$;

-- ٢) لا تفعيل بلا مطابقة، ولا لغير الإدارة.
DO $$
DECLARE _s CONSTANT UUID := 'b2e30000-0000-4000-8000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 50, 'EUR', current_date, 'BANK-REF-1');
    RAISE EXCEPTION 'FAIL — الكافل فعّل كفالته بنفسه';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, NULL, 'EUR', current_date, 'BANK-REF-1');
    RAISE EXCEPTION 'FAIL — فُعّلت بلا مبلغٍ مستلَم';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 50, 'EUR', NULL, 'BANK-REF-1');
    RAISE EXCEPTION 'FAIL — فُعّلت بلا تاريخ قيد';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 50, 'EUR', current_date + 1, 'BANK-REF-1');
    RAISE EXCEPTION 'FAIL — قُبل تاريخ قيدٍ في المستقبل';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 50, 'EUR', current_date, ' ');
    RAISE EXCEPTION 'FAIL — فُعّلت بلا مرجعٍ بنكي';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 50, 'USD', current_date, 'BANK-REF-1');
    RAISE EXCEPTION 'FAIL — قُبل تحويلٌ بعملةٍ أخرى';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 45, 'EUR', current_date, 'BANK-REF-1');
    RAISE EXCEPTION 'FAIL — قُبل مبلغٌ مخالف بلا إقرار';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 45, 'EUR', current_date, 'BANK-REF-1', true);
    RAISE EXCEPTION 'FAIL — قُبل مبلغٌ مخالف بلا ملاحظة';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;
  IF (SELECT status FROM public.sponsorships WHERE id = _s) <> 'pending_payment' THEN
    RAISE EXCEPTION 'FAIL — تغيّرت حال الكفالة بمحاولةٍ مرفوضة';
  END IF;
  RAISE NOTICE 'PASS — UX-15: لا تفعيل بلا مبلغٍ وعملةٍ مطابقة وتاريخ قيدٍ ومرجع، ولا فرق بلا إقرارٍ وملاحظة، ولا لغير الإدارة';
END $$;

-- ٣) المطابقة الكاملة تُفعّل وتُسجّل، والدفعة المعلّقة نفسها تصير مدفوعة.
DO $$
DECLARE _s CONSTANT UUID := 'b2e30000-0000-4000-8000-000000000001'; _res JSONB; _p RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _res := public.confirm_manual_transfer(_s, 45, 'eur', current_date - 1, 'BANK-REF-1', true,
                                         'رسوم التحويل اقتُطعت من البنك المُرسِل');
  RESET ROLE;

  IF (SELECT count(*) FROM public.sponsorship_payments WHERE sponsorship_id = _s) <> 1 THEN
    RAISE EXCEPTION 'FAIL — قُيّدت دفعةٌ ثانية بجانب المعلّقة';
  END IF;
  SELECT * INTO _p FROM public.sponsorship_payments WHERE sponsorship_id = _s;
  IF _p.status <> 'paid' OR _p.amount <> 45 OR _p.provider_ref <> 'BANK-REF-1'
     OR _p.paid_at::date <> current_date - 1 THEN
    RAISE EXCEPTION 'FAIL — الدفعة لم تُقيَّد بما وصل: %', row_to_json(_p);
  END IF;
  IF (SELECT status FROM public.sponsorships WHERE id = _s) <> 'active' THEN
    RAISE EXCEPTION 'FAIL — الكفالة لم تُفعَّل';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.manual_transfer_reconciliations
                  WHERE sponsorship_id = _s AND amount_mismatch AND expected_amount = 50
                    AND confirmed_by = 'b2e00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — لا سجلّ مطابقة';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'payment.manual_confirmed' AND entity_id = _s
                    AND actor_id = 'b2e00000-0000-4000-8000-000000000001'
                    AND meta->>'bank_reference' = 'BANK-REF-1') THEN
    RAISE EXCEPTION 'FAIL — التأكيد بلا أثر';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'b2e00000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL — الكافل لم يُبلَّغ';
  END IF;

  -- لا تأكيدٌ ثانٍ، ولا مرجعٌ مكرّر على كفالةٍ أخرى.
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.confirm_manual_transfer(_s, 50, 'EUR', current_date, 'BANK-REF-9');
    RAISE EXCEPTION 'FAIL — أُكّدت كفالةٌ مفعّلة مرّةً ثانية';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer('b2e30000-0000-4000-8000-000000000003', 30, 'EUR',
                                           current_date, ' bank-ref-1 ');
    RAISE EXCEPTION 'FAIL — قُبل مرجعٌ بنكي مستعمل';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.confirm_manual_transfer('b2e30000-0000-4000-8000-000000000002', 40, 'EUR',
                                           current_date, 'BANK-REF-7');
    RAISE EXCEPTION 'FAIL — أُكّدت دفعة بطاقةٍ تحويلاً يدوياً';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — UX-15: المطابقة تُفعّل الكفالة بما وصل فعلاً وتُسجَّل وتُبلغ الكافل، ولا تُكرَّر';
END $$;

-- ٤) القوائم صفحاتٌ وبحث، والصورة العامّة لا تحمل كلّ شيء.
DO $$
DECLARE _o JSONB; _l JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _o := public.admin_overview();
  IF jsonb_array_length(_o->'orphan_rows') > 100 OR NOT (_o ? 'orphan_rows_total')
     OR NOT (_o ? 'sponsor_rows_total') THEN
    RAISE EXCEPTION 'FAIL — الصورة العامّة بلا حدٍّ أو عدد';
  END IF;
  _l := public.admin_list('orphans', NULL, 2, 0);
  IF jsonb_array_length(_l->'rows') <> 2 OR (_l->>'total')::int < 3 THEN
    RAISE EXCEPTION 'FAIL — الصفحة لا تحترم الحدّ: %', _l;
  END IF;
  -- الترتيب بالفجوة رقماً: دريتون (٨٠) قبل أرتا (٦٠) وليندا (١٠٠ − ٥٠).
  IF (SELECT r->>'code' FROM jsonb_array_elements(public.admin_list('orphans', 'B2E', 5, 0)->'rows') r LIMIT 1) <> 'B2E-2' THEN
    RAISE EXCEPTION 'FAIL — الترتيب ليس بالفجوة رقماً';
  END IF;
  _l := public.admin_list('orphans', 'أرتا', 10, 0);
  IF (_l->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL — البحث لا يُضيّق: %', _l; END IF;
  _l := public.admin_list('sponsors', 'b2e-sponsor', 10, 0);
  IF (_l->>'total')::int <> 1 OR (_l->'rows'->0->>'paid')::numeric <> 45 THEN
    RAISE EXCEPTION 'FAIL — بحث الكفلاء: %', _l;
  END IF;
  -- البحث بمحارف LIKE لا يتّسع.
  IF (public.admin_list('sponsors', '%', 10, 0)->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL — «%%» في البحث طابق الجميع';
  END IF;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_list('sponsors', NULL, 10, 0);
    RAISE EXCEPTION 'FAIL — غير الإدارة سرد الكفلاء';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — PRD-13: القوائم صفحاتٌ بعددٍ كلّي وبحثٍ آمن ومرتّبةٌ بالأرقام، وللإدارة وحدها';
END $$;

-- ٥) التصدير للإدارة، بلا بيانات الطفل السرّية، ومسجَّل.
DO $$
DECLARE _rows JSONB; _txt TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_export('payments');
    RAISE EXCEPTION 'FAIL — غير الإدارة صدّر المدفوعات';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _rows := public.admin_export('orphans');
  _txt := _rows::text;
  IF jsonb_array_length(_rows) < 3 OR _txt LIKE '%ليندا السرّية%' OR _txt LIKE '%ID-SECRET-1%'
     OR _txt LIKE '%full_name%' OR _txt LIKE '%national_id%' THEN
    RAISE EXCEPTION 'FAIL — تصدير الأيتام يحمل بياناتٍ سرّية أو ناقص';
  END IF;
  _rows := public.admin_export('payments');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_rows) r
                  WHERE r->>'bank_reference' = 'BANK-REF-1' AND r->>'value_date' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL — تصدير المدفوعات بلا المطابقة';
  END IF;
  _rows := public.admin_export('sponsorships');
  IF jsonb_array_length(_rows) < 3 THEN RAISE EXCEPTION 'FAIL — تصدير الكفالات ناقص'; END IF;
  BEGIN
    PERFORM public.admin_export('orphan_private');
    RAISE EXCEPTION 'FAIL — صُدّرت مجموعةٌ غير مسمّاة';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  RESET ROLE;
  IF (SELECT count(*) FROM public.audit_log WHERE action = 'admin.export'
        AND actor_id = 'b2e00000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'FAIL — التصدير بلا أثر';
  END IF;
  IF has_function_privilege('anon', 'public.admin_export(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.confirm_manual_transfer(uuid,numeric,text,date,text,boolean,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_list(text,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.awaits_manual_transfer(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — دوالّ الإدارة مفتوحةٌ لغير المقصود';
  END IF;
  RAISE NOTICE 'PASS — PRD-13: التصدير (أيتام، كفالات، مدفوعات) للإدارة وحدها، بلا بيانات سرّية، ومسجَّل في الأثر';
END $$;

ROLLBACK;
