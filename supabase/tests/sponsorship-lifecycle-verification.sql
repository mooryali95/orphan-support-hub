-- =====================================================================
-- دورة حياة الكفالة والمال — إثبات (الدفعة ٣أ)
-- =====================================================================
--   APP-02 / PRD-10 / UX-02  الإلغاء بتأكيدٍ وسبب، نافذٌ آخر المدّة المدفوعة،
--                            يُبلَّغ به الجهة والإدارة، ويُطلب إلغاء الاشتراك
--                            لدى المزوّد؛ والتحصيل بعد الإلغاء لا يُعيد الكفالة.
--   UX-13                    الإيقاف المؤقّت والاستئناف وتعديل المبلغ.
--   APP-03 / ARC-03          قيد التحصيل ذرّيّ في دالّةٍ واحدة، والإعادة بلا أثر.
--   APP-04                   عملةٌ مخالفة تُرفض وتُرفع للإدارة.
--   APP-07                   الدفعة المعلّقة تصير هي المدفوعة، والمهجورة تنقضي.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sponsorship-lifecycle-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b3a00000-0000-4000-8000-000000000001', 'b3-admin@example.test', '{}'::jsonb),
  ('b3a00000-0000-4000-8000-000000000002', 'b3-sponsor-a@example.test', '{}'::jsonb),
  ('b3a00000-0000-4000-8000-000000000003', 'b3-sponsor-b@example.test', '{}'::jsonb),
  ('b3a00000-0000-4000-8000-000000000004', 'b3-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b3a00000-0000-4000-8000-000000000005', 'b3-sponsor-c@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('b3a00000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b3b00000-0000-4000-8000-00000000000a', 'b3a00000-0000-4000-8000-000000000004',
        'جهة الدورة', 'approved');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, org_id, created_by, status, approved_at)
VALUES ('b3c00000-0000-4000-8000-000000000001', 'B3L-1', 'ملف الدورة', 300, 'EUR',
        'b3b00000-0000-4000-8000-00000000000a', 'b3a00000-0000-4000-8000-000000000004', 'approved', now()),
       ('b3c00000-0000-4000-8000-000000000002', 'B3L-2', 'ملف الدولار', 200, 'USD',
        'b3b00000-0000-4000-8000-00000000000a', 'b3a00000-0000-4000-8000-000000000004', 'approved', now());

-- S1: كفالة يدوية نشطة، دُفع شهرها قبل عشرة أيام.
-- S2: كفالة Creem نشطة باشتراك.  S3: بانتظار الدفع.  S4: كفالة دولار نشطة.
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, provider, provider_subscription_id, started_at)
VALUES ('b3d00000-0000-4000-8000-000000000001', 'b3a00000-0000-4000-8000-000000000002',
        'b3c00000-0000-4000-8000-000000000001', 50, 'EUR', 'active', 'manual', NULL, now() - interval '10 days'),
       ('b3d00000-0000-4000-8000-000000000002', 'b3a00000-0000-4000-8000-000000000003',
        'b3c00000-0000-4000-8000-000000000001', 60, 'EUR', 'active', 'creem', 'sub_b3_2', now() - interval '40 days'),
       ('b3d00000-0000-4000-8000-000000000003', 'b3a00000-0000-4000-8000-000000000005',
        'b3c00000-0000-4000-8000-000000000001', 30, 'EUR', 'pending_payment', NULL, NULL, NULL),
       ('b3d00000-0000-4000-8000-000000000004', 'b3a00000-0000-4000-8000-000000000002',
        'b3c00000-0000-4000-8000-000000000002', 70, 'USD', 'active', 'manual', NULL, now() - interval '5 days');
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_payment_id, paid_at)
VALUES ('b3d00000-0000-4000-8000-000000000001', 'b3a00000-0000-4000-8000-000000000002', 50, 'EUR', 'paid', 'manual', NULL, now() - interval '10 days'),
       ('b3d00000-0000-4000-8000-000000000002', 'b3a00000-0000-4000-8000-000000000003', 60, 'EUR', 'paid', 'creem', 'ord_b3_1', now() - interval '40 days'),
       ('b3d00000-0000-4000-8000-000000000002', 'b3a00000-0000-4000-8000-000000000003', 60, 'EUR', 'paid', 'creem', 'ord_b3_2', now() - interval '9 days'),
       ('b3d00000-0000-4000-8000-000000000004', 'b3a00000-0000-4000-8000-000000000002', 70, 'USD', 'paid', 'manual', NULL, now() - interval '5 days');
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, idempotency_key, created_at)
VALUES ('b3d00000-0000-4000-8000-000000000003', 'b3a00000-0000-4000-8000-000000000005', 30, 'EUR', 'pending', 'manual',
        'b3d00000-0000-4000-8000-000000000003:manual', now());

DO $$ BEGIN RAISE NOTICE '── الإلغاء'; END $$;

-- الكافل لا يُنهي كفالةً جارية بتحديثٍ مباشر: الإلغاء له مسارٌ يحفظ المدّة المدفوعة.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    UPDATE public.sponsorships SET status = 'cancelled', ended_at = now()
     WHERE id = 'b3d00000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL — APP-02: الكافل أنهى كفالةً جارية فوراً بتحديثٍ مباشر';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.sponsorships SET cancel_effective_at = now() + interval '1 year'
     WHERE id = 'b3d00000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL — حقول الإلغاء يكتبها الكافل مباشرةً';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — APP-02: لا إنهاء فوريّ لكفالةٍ جارية بتحديثٍ مباشر، وحقول الإلغاء للخادم';
END $$;

-- الإلغاء عبر المسار: نافذٌ آخر الشهر المدفوع، والكفالة جاريةٌ حتى ذلك.
DO $$
DECLARE _r JSONB; _s public.sponsorships;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  BEGIN
    PERFORM public.sponsor_cancel_sponsorship('b3d00000-0000-4000-8000-000000000001', 'financial', NULL);
    RAISE EXCEPTION 'FAIL — كافلٌ ألغى كفالة غيره';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _r := public.sponsor_cancel_sponsorship('b3d00000-0000-4000-8000-000000000001', 'financial', 'ظرفٌ طارئ');
  RESET ROLE;

  SELECT * INTO _s FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000001';
  IF _s.status <> 'active' OR _s.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — UX-02: الإلغاء نفذ فوراً (%)', _s.status;
  END IF;
  IF _s.cancel_effective_at IS NULL
     OR abs(extract(epoch FROM _s.cancel_effective_at - (now() - interval '10 days' + interval '1 month'))) > 5 THEN
    RAISE EXCEPTION 'FAIL — UX-02: تاريخ النفاذ ليس آخر المدّة المدفوعة (%)', _s.cancel_effective_at;
  END IF;
  IF _s.cancel_reason <> 'financial' OR _s.cancel_note <> 'ظرفٌ طارئ' THEN
    RAISE EXCEPTION 'FAIL — السبب لم يُحفظ';
  END IF;
  IF (_r->>'immediate')::boolean THEN RAISE EXCEPTION 'FAIL — الجواب يقول فوراً: %', _r; END IF;
  -- يدويّ: لا اشتراك لدى مزوّد يُلغى.
  IF _s.provider_cancel_state IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — طُلب إلغاءٌ لدى مزوّد لكفالةٍ يدوية';
  END IF;
  -- الجهة والإدارة تعلمان.
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = 'b3a00000-0000-4000-8000-000000000004'
                    AND entity_id = _s.id) THEN
    RAISE EXCEPTION 'FAIL — PRD-10: جهة الرعاية لم تُبلَّغ بالإلغاء';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = 'b3a00000-0000-4000-8000-000000000001'
                    AND entity_id = _s.id) THEN
    RAISE EXCEPTION 'FAIL — PRD-10: الإدارة لم تُبلَّغ بالإلغاء';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE entity_id = _s.id
                    AND action = 'sponsorship.cancel_requested') THEN
    RAISE EXCEPTION 'FAIL — طلب الإلغاء بلا أثر';
  END IF;
  -- الطفل يبقى مكفولاً بما دُفع حتى نهاية المدّة.
  IF (SELECT funded_monthly FROM public.orphans WHERE id = 'b3c00000-0000-4000-8000-000000000001') < 110 THEN
    RAISE EXCEPTION 'FAIL — التمويل سقط قبل نهاية المدّة المدفوعة';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.sponsor_cancel_sponsorship('b3d00000-0000-4000-8000-000000000001', NULL, NULL);
    RAISE EXCEPTION 'FAIL — إلغاءٌ مكرّر قُبل';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — APP-02/UX-02: الإلغاء بسببٍ نافذٌ آخر المدّة المدفوعة، والجهة والإدارة تعلمان، والأثر محفوظ';
END $$;

-- كفالة Creem: يُطلب إلغاء الاشتراك لدى المزوّد عند نهاية الدورة.
DO $$
DECLARE _r JSONB; _s public.sponsorships; _due JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _r := public.sponsor_cancel_sponsorship('b3d00000-0000-4000-8000-000000000002', 'other', NULL);
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000002';
  IF _s.provider_cancel_state <> 'pending' OR _s.provider_cancel_mode <> 'scheduled' THEN
    RAISE EXCEPTION 'FAIL — APP-02: لم يُطلب إلغاء الاشتراك لدى المزوّد (% / %)',
      _s.provider_cancel_state, _s.provider_cancel_mode;
  END IF;
  IF NOT (_r->>'provider_cancel')::boolean THEN RAISE EXCEPTION 'FAIL — الجواب لا يذكر المزوّد'; END IF;

  SET LOCAL ROLE service_role;
  SELECT jsonb_agg(to_jsonb(d)) INTO _due FROM public.provider_cancellations_due(50) d;
  RESET ROLE;
  IF NOT _due @> '[{"provider_subscription_id":"sub_b3_2","mode":"scheduled"}]'::jsonb THEN
    RAISE EXCEPTION 'FAIL — الاشتراك ليس في قائمة الإلغاء لدى المزوّد: %', _due;
  END IF;

  -- المحاولة الأولى فشلت ثم نجحت: الحال تُسجَّل.
  SET LOCAL ROLE service_role;
  PERFORM public.mark_provider_cancel_result('b3d00000-0000-4000-8000-000000000002', false, 'Creem 503');
  RESET ROLE;
  IF (SELECT provider_cancel_state FROM public.sponsorships WHERE id = _s.id) <> 'failed' THEN
    RAISE EXCEPTION 'FAIL — فشل الإلغاء لدى المزوّد لم يُسجَّل';
  END IF;
  SET LOCAL ROLE service_role;
  PERFORM public.mark_provider_cancel_result('b3d00000-0000-4000-8000-000000000002', true, NULL);
  RESET ROLE;
  IF (SELECT provider_cancel_state FROM public.sponsorships WHERE id = _s.id) <> 'done' THEN
    RAISE EXCEPTION 'FAIL — نجاح الإلغاء لدى المزوّد لم يُسجَّل';
  END IF;
  RAISE NOTICE 'PASS — APP-02: إلغاء الكافل يطلب إلغاء الاشتراك لدى المزوّد ويسجّل نتيجته';
END $$;

-- الطلب المعلّق يُلغى فوراً: لا مدّة مدفوعة، ودفعته المعلّقة تُغلق.
DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  _r := public.sponsor_cancel_sponsorship('b3d00000-0000-4000-8000-000000000003', NULL, NULL);
  RESET ROLE;
  IF (SELECT status FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000003') <> 'cancelled'
     OR NOT (_r->>'immediate')::boolean THEN
    RAISE EXCEPTION 'FAIL — الطلب المعلّق لم يُلغَ فوراً: %', _r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sponsorship_payments
              WHERE sponsorship_id = 'b3d00000-0000-4000-8000-000000000003' AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL — دفعةٌ معلّقة بقيت على طلبٍ ملغى';
  END IF;
  RAISE NOTICE 'PASS — الطلب «بانتظار الدفع» يُلغى فوراً وتُغلق دفعته المعلّقة';
END $$;

DO $$ BEGIN RAISE NOTICE '── التحصيل من المزوّد'; END $$;

-- التحصيل الطبيعي: الدفعة المعلّقة نفسها تصير مدفوعة، والإعادة بلا أثر.
DO $$
DECLARE _r JSONB; _again JSONB; _n INTEGER;
BEGIN
  INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status)
  VALUES ('b3d00000-0000-4000-8000-000000000005', 'b3a00000-0000-4000-8000-000000000005',
          'b3c00000-0000-4000-8000-000000000002', 40, 'USD', 'pending_payment');
  INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider,
                                           provider_checkout_id, checkout_url, idempotency_key)
  VALUES ('b3d00000-0000-4000-8000-000000000005', 'b3a00000-0000-4000-8000-000000000005', 40, 'USD',
          'pending', 'creem', 'ch_b3_5', 'https://pay/x', 'b3d00000-0000-4000-8000-000000000005:2026-11');

  SET LOCAL ROLE service_role;
  _r := public.record_provider_charge('b3d00000-0000-4000-8000-000000000005', 'creem', 'evt_b3_5',
          'ord_b3_5', 'ch_b3_5', 'sub_b3_5', 40, 'USD', now());
  _again := public.record_provider_charge('b3d00000-0000-4000-8000-000000000005', 'creem', 'evt_b3_5',
          'ord_b3_5', 'ch_b3_5', 'sub_b3_5', 40, 'USD', now());
  RESET ROLE;

  IF _r->>'outcome' <> 'recorded' OR _again->>'outcome' <> 'replay' THEN
    RAISE EXCEPTION 'FAIL — APP-03: النتيجتان % / %', _r, _again;
  END IF;
  SELECT count(*) INTO _n FROM public.sponsorship_payments
   WHERE sponsorship_id = 'b3d00000-0000-4000-8000-000000000005';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — APP-07: % قيدٍ بدل أن تصير المعلّقة هي المدفوعة', _n;
  END IF;
  IF (SELECT status FROM public.sponsorship_payments WHERE sponsorship_id = 'b3d00000-0000-4000-8000-000000000005') <> 'paid'
     OR (SELECT status FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000005') <> 'active'
     OR (SELECT provider_subscription_id FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000005') <> 'sub_b3_5' THEN
    RAISE EXCEPTION 'FAIL — التحصيل لم يُفعّل الكفالة';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE entity_id = 'b3d00000-0000-4000-8000-000000000005'
        AND kind = 'sponsorship_started') <> 1 THEN
    RAISE EXCEPTION 'FAIL — إعلان البدء لم يُرسل مرّةً واحدة';
  END IF;
  RAISE NOTICE 'PASS — APP-03/APP-07: التحصيل ذرّيّ، والمعلّقة تصير المدفوعة، والإعادة بلا قيدٍ ولا إعلانٍ ثانٍ';
END $$;

-- عملةٌ غير عملة الكفالة: لا تُقيَّد، وتُرفع للإدارة.
DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE service_role;
  _r := public.record_provider_charge('b3d00000-0000-4000-8000-000000000005', 'creem', 'evt_b3_6',
          'ord_b3_6', NULL, 'sub_b3_5', 40, 'EUR', now());
  RESET ROLE;
  IF _r->>'outcome' <> 'refused' OR _r->>'reason' <> 'currency_mismatch' THEN
    RAISE EXCEPTION 'FAIL — APP-04: عملةٌ مخالفة لم تُرفض: %', _r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sponsorship_payments WHERE provider_payment_id = 'ord_b3_6') THEN
    RAISE EXCEPTION 'FAIL — APP-04: قُيّد مبلغٌ بعملةٍ مخالفة';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.money_issues WHERE provider_payment_id = 'ord_b3_6'
                    AND kind = 'currency_mismatch' AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL — APP-04: العملة المخالفة لم تُرفع للإدارة';
  END IF;
  RAISE NOTICE 'PASS — APP-04: تحصيلٌ بعملةٍ مخالفة لا يُقيَّد ويُرفع للإدارة';
END $$;

-- APP-02: الإلغاء نفذ، ثم وصل تجديد: لا تعود الكفالة، ويُطلب ردّ المبلغ.
DO $$
DECLARE _r JSONB; _t JSONB; _s public.sponsorships;
BEGIN
  -- نهاية المدّة المدفوعة حلّت.
  UPDATE public.sponsorships SET cancel_effective_at = now() - interval '1 minute'
   WHERE id = 'b3d00000-0000-4000-8000-000000000002';
  SET LOCAL ROLE service_role;
  _t := public.apply_due_sponsorship_transitions();
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000002';
  IF _s.status <> 'cancelled' OR _s.end_reason <> 'sponsor_cancelled' OR _s.ended_at IS NULL THEN
    RAISE EXCEPTION 'FAIL — الإلغاء لم ينفذ عند حلول موعده (% / %)', _s.status, _s.end_reason;
  END IF;
  IF (_t->>'cancelled')::int < 1 THEN RAISE EXCEPTION 'FAIL — العدّاد: %', _t; END IF;

  SET LOCAL ROLE service_role;
  _r := public.record_provider_charge('b3d00000-0000-4000-8000-000000000002', 'creem', 'evt_b3_7',
          'ord_b3_7', NULL, 'sub_b3_2', 60, 'EUR', now());
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000002';
  IF _s.status <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL — APP-02: تجديدٌ بعد الإلغاء أعاد الكفالة (%)', _s.status;
  END IF;
  IF _r->>'outcome' <> 'refused' OR _r->>'reason' <> 'charge_after_end' THEN
    RAISE EXCEPTION 'FAIL — APP-02: الجواب %', _r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sponsorship_payments WHERE provider_payment_id = 'ord_b3_7') THEN
    RAISE EXCEPTION 'FAIL — APP-02: قُيّد تحصيلٌ على كفالةٍ منتهية';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.money_issues WHERE provider_payment_id = 'ord_b3_7'
                    AND kind = 'charge_after_end' AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL — APP-02: التحصيل بعد الإلغاء لم يُرفع للإدارة لردّه';
  END IF;
  -- والاشتراك يُطلب إلغاؤه فوراً هذه المرّة.
  IF _s.provider_cancel_state <> 'pending' OR _s.provider_cancel_mode <> 'immediate' THEN
    RAISE EXCEPTION 'FAIL — APP-02: الاشتراك لم يُطلب إلغاؤه فوراً بعد تحصيلٍ متأخّر';
  END IF;
  -- إعادة الحدث نفسه لا تفتح بنداً ثانياً.
  SET LOCAL ROLE service_role;
  _r := public.record_provider_charge('b3d00000-0000-4000-8000-000000000002', 'creem', 'evt_b3_7',
          'ord_b3_7', NULL, 'sub_b3_2', 60, 'EUR', now());
  RESET ROLE;
  IF (SELECT count(*) FROM public.money_issues WHERE provider_payment_id = 'ord_b3_7') <> 1 THEN
    RAISE EXCEPTION 'FAIL — إعادة الحدث فتحت بنداً ثانياً';
  END IF;
  -- الردّ من المزوّد يُغلق البند.
  SET LOCAL ROLE service_role;
  PERFORM public.mark_provider_payment('b3d00000-0000-4000-8000-000000000002', 'creem', 'ord_b3_7', NULL, 'refunded');
  RESET ROLE;
  IF (SELECT status FROM public.money_issues WHERE provider_payment_id = 'ord_b3_7') <> 'resolved' THEN
    RAISE EXCEPTION 'FAIL — الردّ لم يُغلق بند التحصيل المتأخّر';
  END IF;
  RAISE NOTICE 'PASS — APP-02: تحصيلٌ بعد الإلغاء لا يُعيد الكفالة ولا يُقيَّد؛ يُرفع للردّ ويُطلب إلغاء الاشتراك فوراً';
END $$;

-- الدوالّ الخادمية ليست للعميل.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.record_provider_charge('b3d00000-0000-4000-8000-000000000004', 'creem', 'x', 'y', NULL, NULL, 1, 'USD', now());
    RAISE EXCEPTION 'FAIL — الكافل قيّد تحصيلاً';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_due_sponsorship_transitions();
    RAISE EXCEPTION 'FAIL — الكافل شغّل الانتقالات';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — قيد التحصيل والانتقالات لمفتاح الخدمة وحده';
END $$;

DO $$ BEGIN RAISE NOTICE '── الإيقاف المؤقّت وتعديل المبلغ'; END $$;

DO $$
DECLARE _r JSONB; _s public.sponsorships; _t JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.sponsor_pause_sponsorship('b3d00000-0000-4000-8000-000000000004', 4);
    RAISE EXCEPTION 'FAIL — إيقافٌ أطول من ثلاثة أشهر';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  _r := public.sponsor_pause_sponsorship('b3d00000-0000-4000-8000-000000000004', 2);
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000004';
  IF _s.status <> 'paused' OR _s.paused_until IS NULL
     OR _s.paused_until < now() + interval '2 months' THEN
    RAISE EXCEPTION 'FAIL — UX-13: الإيقاف (% حتى %)', _s.status, _s.paused_until;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = 'b3a00000-0000-4000-8000-000000000004'
                    AND entity_id = _s.id) THEN
    RAISE EXCEPTION 'FAIL — الجهة لم تُبلَّغ بالإيقاف';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _r := public.sponsor_resume_sponsorship('b3d00000-0000-4000-8000-000000000004');
  RESET ROLE;
  SELECT * INTO _s FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000004';
  IF _s.status <> 'active' OR _s.paused_until IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — UX-13: الاستئناف (%)', _s.status;
  END IF;

  -- الاستئناف التلقائي عند انقضاء المدّة.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM public.sponsor_pause_sponsorship('b3d00000-0000-4000-8000-000000000004', 1);
  RESET ROLE;
  UPDATE public.sponsorships SET paused_until = now() - interval '1 minute'
   WHERE id = 'b3d00000-0000-4000-8000-000000000004';
  SET LOCAL ROLE service_role;
  _t := public.apply_due_sponsorship_transitions();
  RESET ROLE;
  IF (SELECT status FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000004') <> 'active'
     OR (_t->>'resumed')::int < 1 THEN
    RAISE EXCEPTION 'FAIL — UX-13: لم تُستأنف الكفالة عند انقضاء الإيقاف: %', _t;
  END IF;
  RAISE NOTICE 'PASS — UX-13: إيقافٌ من شهرٍ إلى ثلاثة، واستئنافٌ يدوي وتلقائي، والجهة تعلم';
END $$;

-- إيقاف اشتراك Creem وتعديل مبلغه لا يُنفَّذان في القاعدة وحدها.
DO $$
BEGIN
  UPDATE public.sponsorships SET provider = 'creem', provider_subscription_id = 'sub_b3_4'
   WHERE id = 'b3d00000-0000-4000-8000-000000000004';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.sponsor_pause_sponsorship('b3d00000-0000-4000-8000-000000000004', 1);
    RAISE EXCEPTION 'FAIL — أُوقف اشتراك مزوّدٍ في القاعدة وحدها';
  EXCEPTION WHEN feature_not_supported THEN NULL;
  END;
  BEGIN
    PERFORM public.sponsor_change_amount('b3d00000-0000-4000-8000-000000000004', 90);
    RAISE EXCEPTION 'FAIL — عُدّل مبلغ اشتراك مزوّدٍ في القاعدة وحدها';
  EXCEPTION WHEN feature_not_supported THEN NULL;
  END;
  RESET ROLE;
  UPDATE public.sponsorships SET provider = 'manual', provider_subscription_id = NULL
   WHERE id = 'b3d00000-0000-4000-8000-000000000004';
  RAISE NOTICE 'PASS — اشتراك المزوّد لا يُوقف ولا يُعدَّل مبلغه في القاعدة وحدها (لا يُوعد بما لا يحدث)';
END $$;

DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.sponsor_change_amount('b3d00000-0000-4000-8000-000000000004', 1);
    RAISE EXCEPTION 'FAIL — مبلغٌ دون الحدّ الأدنى';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  _r := public.sponsor_change_amount('b3d00000-0000-4000-8000-000000000004', 90);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  BEGIN
    PERFORM public.sponsor_change_amount('b3d00000-0000-4000-8000-000000000004', 10);
    RAISE EXCEPTION 'FAIL — كافلٌ عدّل مبلغ غيره';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  RESET ROLE;
  IF (SELECT amount FROM public.sponsorships WHERE id = 'b3d00000-0000-4000-8000-000000000004') <> 90 THEN
    RAISE EXCEPTION 'FAIL — UX-13: المبلغ لم يتغيّر';
  END IF;
  IF (SELECT funded_monthly FROM public.orphans WHERE id = 'b3c00000-0000-4000-8000-000000000002') < 90 THEN
    RAISE EXCEPTION 'FAIL — التمويل لم يتبع المبلغ الجديد';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE entity_id = 'b3d00000-0000-4000-8000-000000000004'
                    AND action = 'sponsorship.amount_changed') THEN
    RAISE EXCEPTION 'FAIL — تعديل المبلغ بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — UX-13: تعديل المبلغ للكافل وحده، في الحدود، ومسجَّلاً';
END $$;

DO $$ BEGIN RAISE NOTICE '── جلسات الدفع المهجورة'; END $$;

DO $$
DECLARE _n INTEGER;
BEGIN
  INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status)
  VALUES ('b3d00000-0000-4000-8000-000000000006', 'b3a00000-0000-4000-8000-000000000003',
          'b3c00000-0000-4000-8000-000000000002', 25, 'USD', 'pending_payment');
  INSERT INTO public.sponsorship_payments (id, sponsorship_id, sponsor_id, amount, currency, status, provider,
                                           provider_checkout_id, idempotency_key, created_at)
  VALUES ('b3e00000-0000-4000-8000-000000000001', 'b3d00000-0000-4000-8000-000000000006',
          'b3a00000-0000-4000-8000-000000000003', 25, 'USD', 'pending', 'creem', 'ch_old',
          'b3d00000-0000-4000-8000-000000000006:2026-10', now() - interval '3 days'),
         ('b3e00000-0000-4000-8000-000000000002', 'b3d00000-0000-4000-8000-000000000006',
          'b3a00000-0000-4000-8000-000000000003', 25, 'USD', 'pending', 'manual', NULL,
          'b3d00000-0000-4000-8000-000000000006:manual', now() - interval '3 days');
  SET LOCAL ROLE service_role;
  _n := public.expire_stale_checkouts(interval '24 hours');
  RESET ROLE;
  IF (SELECT status FROM public.sponsorship_payments WHERE id = 'b3e00000-0000-4000-8000-000000000001') <> 'failed'
     OR (SELECT failure_reason FROM public.sponsorship_payments WHERE id = 'b3e00000-0000-4000-8000-000000000001') <> 'checkout_expired' THEN
    RAISE EXCEPTION 'FAIL — APP-07: جلسة الدفع المهجورة بقيت معلّقة';
  END IF;
  IF (SELECT status FROM public.sponsorship_payments WHERE id = 'b3e00000-0000-4000-8000-000000000002') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — APP-07: التحويل اليدوي المنتظَر أُغلق';
  END IF;
  -- المفتاح يتحرّر فتُنشأ جلسةٌ جديدة للشهر نفسه.
  INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, idempotency_key)
  VALUES ('b3d00000-0000-4000-8000-000000000006', 'b3a00000-0000-4000-8000-000000000003', 25, 'USD',
          'pending', 'creem', 'b3d00000-0000-4000-8000-000000000006:2026-10');
  RAISE NOTICE 'PASS — APP-07: جلسات الدفع المهجورة تنقضي، والتحويل اليدوي المنتظَر يبقى';
END $$;

DO $$ BEGIN RAISE NOTICE '── صندوق القرارات'; END $$;

DO $$
DECLARE _inbox JSONB; _issue UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _inbox := public.admin_decision_inbox();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_inbox) i
                  WHERE i->>'kind' = 'money_issue') THEN
    RAISE EXCEPTION 'FAIL — بنود المال لا تظهر في صندوق القرارات';
  END IF;
  SELECT (i->>'id')::uuid INTO _issue FROM jsonb_array_elements(_inbox) i
   WHERE i->>'kind' = 'money_issue' LIMIT 1;
  BEGIN
    PERFORM public.admin_resolve_money_issue(_issue, '');
    RAISE EXCEPTION 'FAIL — أُغلق بندٌ ماليّ بلا ملاحظة';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.admin_resolve_money_issue(_issue, 'رُدّ المبلغ يدوياً');
  RESET ROLE;
  IF (SELECT status FROM public.money_issues WHERE id = _issue) <> 'resolved' THEN
    RAISE EXCEPTION 'FAIL — البند لم يُغلق';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3a00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  IF EXISTS (SELECT 1 FROM public.money_issues) THEN
    RAISE EXCEPTION 'FAIL — الكافل يقرأ بنود المال';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — بنود المال في صندوق القرارات، تُغلق بملاحظة، وللإدارة وحدها';
END $$;

ROLLBACK;
