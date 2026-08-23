-- =====================================================================
-- أساس الدفع ولوحة الإدارة — إثبات
-- =====================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/payments-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'p3-admin@example.test', '{}'::jsonb),
  ('c1000000-0000-4000-8000-000000000002', 'p3-sponsor@example.test', '{}'::jsonb),
  ('c1000000-0000-4000-8000-000000000003', 'p3-org@example.test', '{"role":"care_org"}'::jsonb),
  -- كافل مستقلّ لفحص المنازعة: قيد «كفالة حيّة واحدة لكل كافل على كل ملف»
  -- يمنع مشاركة الكافل نفسه بين فحصين على الملف نفسه.
  ('c1000000-0000-4000-8000-000000000004', 'p3-disputer@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('c1000000-0000-4000-8000-000000000001', 'admin');

-- تجهيز: جهة معتمدة وملف منشور
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000003', 'جهة الدفع', 'approved');
INSERT INTO public.orphans (id, code, display_name, monthly_need, org_id, created_by, status, approved_at)
VALUES ('c3000000-0000-4000-8000-00000000000b', 'PAY-1', 'ملف الدفع', 300,
        'c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000003',
        'approved', now());

-- ---------------------------------------------------------------------
-- المنازعة: مال معلّق لا يُعدّ رصيداً متاحاً
-- ---------------------------------------------------------------------
DO $$
DECLARE v JSONB; before_balance NUMERIC; after_balance NUMERIC;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  before_balance := (public.admin_overview()->'money'->>'balance')::numeric;
  RESET ROLE;

  -- كفالة ودفعتان: واحدة سليمة وأخرى وقعت عليها منازعة.
  INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, status)
  VALUES ('c4000000-0000-4000-8000-0000000000d1',
          'c1000000-0000-4000-8000-000000000004',
          'c3000000-0000-4000-8000-00000000000b', 100, 'active');

  INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, status)
  VALUES ('c4000000-0000-4000-8000-0000000000d1',
          'c1000000-0000-4000-8000-000000000004', 100, 'paid'),
         ('c4000000-0000-4000-8000-0000000000d1',
          'c1000000-0000-4000-8000-000000000004', 40, 'disputed');

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  v := public.admin_overview();
  after_balance := (v->'money'->>'balance')::numeric;

  IF (v->'money'->>'disputed')::numeric <> 40 THEN
    RAISE EXCEPTION 'FAIL — disputed amount not reported: %', v->'money';
  END IF;
  RAISE NOTICE 'PASS — disputed amount is reported separately';

  -- الرصيد يرتفع بالمدفوع وحده: لو عُدّت المنازعة تحصيلاً لبلغ الفارق 140،
  -- ولو طُرحت مرّتين لبلغ 60.
  IF after_balance - before_balance <> 100 THEN
    RAISE EXCEPTION 'FAIL — balance mis-states disputed money (delta %)',
      after_balance - before_balance;
  END IF;
  RAISE NOTICE 'PASS — a disputed payment never counts toward the balance';
  RESET ROLE;

  -- الانتقال الحقيقي: الويبهوك يَسِم دفعةً مدفوعة، فيجب أن تغادر الرصيد.
  UPDATE public.sponsorship_payments SET status = 'disputed'
  WHERE sponsorship_id = 'c4000000-0000-4000-8000-0000000000d1' AND status = 'paid';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  v := public.admin_overview();
  IF (v->'money'->>'balance')::numeric <> before_balance THEN
    RAISE EXCEPTION 'FAIL — disputing a paid payment did not remove it from the balance (%)',
      v->'money'->>'balance';
  END IF;
  IF (v->'money'->>'disputed')::numeric <> 140 THEN
    RAISE EXCEPTION 'FAIL — disputed total wrong after transition: %', v->'money';
  END IF;
  RAISE NOTICE 'PASS — disputing a paid payment removes it from the balance';
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------
-- لوحة الإدارة: مقصورة على الإدارة
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.admin_overview();
    RAISE EXCEPTION 'FAIL — a sponsor could read admin_overview';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — admin_overview refuses a non-admin';
  END;
  RESET ROLE;
END $$;

DO $$
DECLARE v JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  v := public.admin_overview();
  IF v ? 'orphans' AND v ? 'sponsors' AND v ? 'money'
     AND v ? 'orphan_rows' AND v ? 'sponsor_rows' THEN
    RAISE NOTICE 'PASS — admin_overview returns the full picture for an admin';
  ELSE
    RAISE EXCEPTION 'FAIL — admin_overview payload incomplete: %', v;
  END IF;
  IF (v->'orphans'->>'monthly_need')::numeric < 300 THEN
    RAISE EXCEPTION 'FAIL — aggregate did not include the published orphan';
  END IF;
  RAISE NOTICE 'PASS — aggregates count published profiles';
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------
-- إعدادات المنصة: تُقرأ ولا تُكتب من العميل
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM 1 FROM public.platform_settings;
  RAISE NOTICE 'PASS — settings readable by a signed-in user';
  BEGIN
    UPDATE public.platform_settings SET fee_percent = 90 WHERE id;
    RAISE EXCEPTION 'FAIL — a sponsor rewrote the platform fee';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — platform fee not client-writable';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------
-- سجلّ الأحداث: منع تكرار المعالجة، ولا قراءة لغير الإدارة
-- ---------------------------------------------------------------------
INSERT INTO public.payment_events (provider, provider_event_id, event_type, payload)
VALUES ('careem', 'evt_dup_1', 'payment.succeeded', '{}'::jsonb);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.payment_events (provider, provider_event_id, event_type, payload)
    VALUES ('careem', 'evt_dup_1', 'payment.succeeded', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL — the same provider event was stored twice';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS — duplicate webhook delivery is rejected';
  END;
END $$;

DO $$
DECLARE n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.payment_events;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — a sponsor can read the event log'; END IF;
  RAISE NOTICE 'PASS — event log hidden from non-admins';
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------
-- كفالة واحدة جارية لكل (كافل، ملف) — M5
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount)
  VALUES ('c1000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-00000000000b', 100);
  BEGIN
    INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount)
    VALUES ('c1000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-00000000000b', 50);
    RAISE EXCEPTION 'FAIL — a sponsor opened two live sponsorships on one profile';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS — duplicate live sponsorship rejected';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------
-- انحدار: الدفتر ما يزال غير قابل للكتابة من العميل رغم الأعمدة الجديدة
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, status, fee_amount)
    SELECT id, sponsor_id, 999, 'paid', 0 FROM public.sponsorships LIMIT 1;
    RAISE EXCEPTION 'FAIL — payment ledger became client-writable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS regression — payment ledger still server-only';
  END;
  RESET ROLE;
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص الدفع ولوحة الإدارة اجتازت ──'; END $$;
ROLLBACK;
