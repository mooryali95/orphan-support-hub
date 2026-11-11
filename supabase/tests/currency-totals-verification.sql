-- =====================================================================
-- المجاميع بعملاتها — إثبات (APP-04 / UI-01 / UX-07 / PRD-14)
-- =====================================================================
-- الخزينة والصفحة الأولى كانت تجمع اليورو مع الدولار في رقمٍ واحد بعملة
-- المنصّة. الآن: مجموعٌ لكل عملة بجانب الحقول القديمة، وعملة الطفل رمزٌ من
-- ثلاثة أحرف لا تغيّرها الجهة بعد الاعتماد.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/currency-totals-verification.sql
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b3c90000-0000-4000-8000-000000000001', 'b3c-admin@example.test', '{}'::jsonb),
  ('b3c90000-0000-4000-8000-000000000002', 'b3c-sponsor@example.test', '{}'::jsonb),
  ('b3c90000-0000-4000-8000-000000000003', 'b3c-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('b3c90000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b3c91000-0000-4000-8000-00000000000a', 'b3c90000-0000-4000-8000-000000000003', 'جهة العملات', 'approved');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, org_id, created_by, status, approved_at)
VALUES ('b3c92000-0000-4000-8000-000000000001', 'B3C-1', 'يورو', 500, 'EUR',
        'b3c91000-0000-4000-8000-00000000000a', 'b3c90000-0000-4000-8000-000000000003', 'approved', now()),
       ('b3c92000-0000-4000-8000-000000000002', 'B3C-2', 'دولار', 1000, 'USD',
        'b3c91000-0000-4000-8000-00000000000a', 'b3c90000-0000-4000-8000-000000000003', 'approved', now());
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('b3c93000-0000-4000-8000-000000000001', 'b3c90000-0000-4000-8000-000000000002',
        'b3c92000-0000-4000-8000-000000000001', 70, 'EUR', 'active', now()),
       ('b3c93000-0000-4000-8000-000000000002', 'b3c90000-0000-4000-8000-000000000002',
        'b3c92000-0000-4000-8000-000000000002', 90, 'USD', 'active', now());
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, paid_at)
VALUES ('b3c93000-0000-4000-8000-000000000001', 'b3c90000-0000-4000-8000-000000000002', 70, 'EUR', 'paid', now()),
       ('b3c93000-0000-4000-8000-000000000002', 'b3c90000-0000-4000-8000-000000000002', 90, 'USD', 'paid', now());

DO $$
DECLARE v JSONB; _eur JSONB; _usd JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3c90000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  v := public.admin_overview();
  RESET ROLE;
  SELECT x INTO _eur FROM jsonb_array_elements(v->'money_by_currency') x WHERE x->>'currency' = 'EUR';
  SELECT x INTO _usd FROM jsonb_array_elements(v->'money_by_currency') x WHERE x->>'currency' = 'USD';
  IF _eur IS NULL OR _usd IS NULL THEN
    RAISE EXCEPTION 'FAIL — PRD-14: الخزينة بلا تقسيمٍ بالعملة: %', v->'money_by_currency';
  END IF;
  -- حدٌّ أدنى لا مساواة: في القاعدة النظيفة بياناتٌ غير هذه.
  IF (_eur->>'collected')::numeric < 70 OR (_usd->>'collected')::numeric < 90 THEN
    RAISE EXCEPTION 'FAIL — PRD-14: المحصّل بالعملة % / %', _eur, _usd;
  END IF;
  IF (_eur->>'collected')::numeric + (_usd->>'collected')::numeric
     > (v->'money'->>'collected')::numeric THEN
    RAISE EXCEPTION 'FAIL — المجاميع بالعملة لا توافق المجموع القديم';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'committed_by_currency') x
                  WHERE x->>'currency' = 'EUR' AND (x->>'amount')::numeric >= 70)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'orphans_by_currency') x
                     WHERE x->>'currency' = 'USD' AND (x->>'monthly_need')::numeric >= 1000) THEN
    RAISE EXCEPTION 'FAIL — PRD-14: الالتزام والاحتياج بلا عملة: % / %',
      v->'committed_by_currency', v->'orphans_by_currency';
  END IF;
  RAISE NOTICE 'PASS — PRD-14: الخزينة والالتزام والاحتياج لكلّ عملةٍ على حدة';
END $$;

DO $$
DECLARE v JSONB;
BEGIN
  SET LOCAL ROLE anon;
  v := public.public_platform_stats();
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'by_currency') x
                  WHERE x->>'currency' = 'EUR' AND (x->>'monthly_need')::numeric >= 500
                    AND (x->>'monthly_funded')::numeric >= 70)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'by_currency') x
                     WHERE x->>'currency' = 'USD') THEN
    RAISE EXCEPTION 'FAIL — UX-07: أرقام الصفحة الأولى بلا عملة: %', v;
  END IF;
  RAISE NOTICE 'PASS — UX-07: أرقام الصفحة الأولى لكلّ عملةٍ على حدة';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.orphans SET currency = 'euro' WHERE id = 'b3c92000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL — APP-04: عملةٌ ليست رمزاً';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3c90000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  BEGIN
    UPDATE public.orphans SET currency = 'ALL' WHERE id = 'b3c92000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL — APP-04: الجهة غيّرت عملة طفلٍ معتمد';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — APP-04: عملة الطفل رمزٌ من ثلاثة أحرف، ولا تغيّرها الجهة بعد الاعتماد';
END $$;

ROLLBACK;
