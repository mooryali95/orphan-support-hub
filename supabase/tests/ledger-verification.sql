-- =====================================================================
-- سجلّ الكفالة وإصلاحات صفحة الطفل — إثبات
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'lg-admin@example.test', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', 'lg-org@example.test', '{"role":"care_org"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000003', 'lg-sponsor@example.test', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000004', 'lg-stranger@example.test', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000005', 'lg-viewer@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('f1000000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000002', 'جهة السجلّ', 'approved');

-- طفلٌ وحيدٌ في حشده (نادر)، وستةٌ في حشدٍ واحد (آمن).
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, region, city, gender,
                            birth_date, education_stage, monthly_need, status, approved_at)
SELECT ('f3000000-0000-4000-8000-00000000000' || i)::uuid, 'LG-' || i, 'طفل ' || i,
       'f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000002',
       'ألبانيا', CASE WHEN i = 0 THEN 'منطقة نادرة' ELSE 'تيرانا' END, 'مدينة', 'male',
       (now() - interval '8 years')::date, 'ابتدائي', 100, 'approved', now()
  FROM generate_series(0, 6) i;
INSERT INTO public.orphan_private (orphan_id, full_name)
VALUES ('f3000000-0000-4000-8000-000000000001', 'الاسم الحقيقي');

DO $$
DECLARE _j JSONB; _r UUID;
BEGIN
  -- ٣) الحشد
  SET LOCAL ROLE anon;
  _j := public.orphan_view('f3000000-0000-4000-8000-000000000000');
  RESET ROLE;
  IF _j->>'region' IS NOT NULL OR _j->>'education_stage' IS NOT NULL OR NOT (_j->>'cohort_small')::boolean THEN
    RAISE EXCEPTION 'FAIL — الطفل النادر كُشفت منطقته: %', _j;
  END IF;
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_search := 'LG-0');
  RESET ROLE;
  IF _j->'rows'->0->>'region' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — بطاقة الدليل كشفت المنطقة النادرة';
  END IF;
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_region := 'منطقة نادرة');
  RESET ROLE;
  IF (_j->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL — الفلترة بالمنطقة النادرة تُرجع الطفل';
  END IF;
  SET LOCAL ROLE anon;
  _j := public.orphan_view('f3000000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _j->>'region' IS DISTINCT FROM 'تيرانا' THEN
    RAISE EXCEPTION 'FAIL — حُجبت منطقةٌ في حشدٍ آمن';
  END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.orphan_view('f3000000-0000-4000-8000-000000000000');
  RESET ROLE;
  IF _j->>'region' IS DISTINCT FROM 'منطقة نادرة' THEN
    RAISE EXCEPTION 'FAIL — دائرة الطفل لا ترى منطقته';
  END IF;
  RAISE NOTICE 'PASS — الصفات النادرة تُحجب عن العموم وتبقى للدائرة';

  -- ١) الهوية
  INSERT INTO public.orphan_access_requests (id, orphan_id, requester_id, reason)
  VALUES ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
          'f1000000-0000-4000-8000-000000000005', 'طلب اطّلاع لإثبات نطاق الهوية.');
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.decide_orphan_access('f4000000-0000-4000-8000-000000000001', 'approved', ARRAY['identity'], NULL, 30);
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _j := public.orphan_view('f3000000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _j->'detail'->>'real_name' IS DISTINCT FROM 'الاسم الحقيقي' THEN
    RAISE EXCEPTION 'FAIL — نطاق الهوية لا يكشف الاسم الحقيقي: %', _j->'detail';
  END IF;
  RAISE NOTICE 'PASS — نطاق الهوية يكشف الاسم الحقيقي فعلاً';
END $$;

-- ٢) الرسالة
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at, message)
VALUES ('f5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003',
        'f3000000-0000-4000-8000-000000000001', 40, 'EUR', 'active', now() - interval '2 months',
        'أدعو لك بالتوفيق');

DO $$
DECLARE _j JSONB; _ok BOOLEAN;
BEGIN
  IF (SELECT message_status FROM public.sponsorships WHERE id = 'f5000000-0000-4000-8000-000000000001') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — الرسالة لم تُعلَّق للمراجعة';
  END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  UPDATE public.sponsorships SET message_status = 'approved' WHERE id = 'f5000000-0000-4000-8000-000000000001';
  RESET ROLE;
  IF (SELECT message_status FROM public.sponsorships WHERE id = 'f5000000-0000-4000-8000-000000000001') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — الكافل اعتمد رسالته بنفسه';
  END IF;

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}';
    PERFORM public.moderate_sponsor_message('f5000000-0000-4000-8000-000000000001', true);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غريبٌ راجع الرسالة'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.sponsor_messages_for_review();
  IF jsonb_array_length(_j) <> 1 THEN RESET ROLE; RAISE EXCEPTION 'FAIL — الجهة لا ترى ما ينتظرها'; END IF;
  PERFORM public.moderate_sponsor_message('f5000000-0000-4000-8000-000000000001', true);
  _j := public.orphan_messages('f3000000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF jsonb_array_length(_j) <> 1 OR _j::text LIKE '%lg-sponsor%' THEN
    RAISE EXCEPTION 'FAIL — الرسالة المعتمدة لم تصل أو كشفت الكافل: %', _j;
  END IF;
  RAISE NOTICE 'PASS — رسالة الكافل تمرّ على الدائرة وتصل بلا اسمه، ولا يعتمدها بنفسه';
END $$;

-- ٤) السجلّ
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, paid_at, period_start)
VALUES ('f5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 40, 'EUR', 'paid',
        now() - interval '1 month', date_trunc('month', now() - interval '1 month')::date);
INSERT INTO public.disbursements (id, org_id, orphan_id, amount, currency, period_start, period_end, status)
VALUES ('f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-00000000000a',
        'f3000000-0000-4000-8000-000000000001', 40, 'EUR',
        date_trunc('month', now() - interval '1 month')::date,
        (date_trunc('month', now()) - interval '1 day')::date, 'transferred');

DO $$
DECLARE _j JSONB; _ok BOOLEAN; _m JSONB;
BEGIN
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}';
    PERFORM public.sponsorship_ledger('f5000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غريبٌ قرأ سجلّ كفالة'; END IF;

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.confirm_disbursement_delivery('f6000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001/receipt.jpg');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — الكافل أكّد الوصول بنفسه'; END IF;

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
    PERFORM public.confirm_disbursement_delivery('f6000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000002/receipt.jpg');
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'proof_outside_orphan';
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — قُبل مستندٌ من مجلّد طفلٍ آخر'; END IF;
  RAISE NOTICE 'PASS — الوصول تؤكّده الجهة وحدها، بمستندٍ من مجلّد الطفل نفسه';

  -- المستند مرفوعٌ فعلاً قبل التأكيد: التأكيد بملفٍّ غير موجود مرفوض (DB-05).
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('orphan-documents', 'f3000000-0000-4000-8000-000000000001/receipt.jpg');

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  IF jsonb_array_length(public.org_pending_deliveries()) <> 1 THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL — الجهة لا ترى ما ينتظر تأكيدها';
  END IF;
  PERFORM public.confirm_disbursement_delivery('f6000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001/receipt.jpg', 'استلمتها الأم');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.sponsorship_ledger('f5000000-0000-4000-8000-000000000001');
  RESET ROLE;
  SELECT x INTO _m FROM jsonb_array_elements(_j->'months') x
   WHERE x->>'month' = to_char(now() - interval '1 month', 'YYYY-MM');
  IF (_m->>'paid')::numeric <> 40 OR _m->>'delivery_status' <> 'delivered' THEN
    RAISE EXCEPTION 'FAIL — الجدول لا يعكس الدفع والوصول: %', _m;
  END IF;
  IF jsonb_array_length(_j->'months') <> 4 OR NOT (_j->'months'->0->>'upcoming')::boolean THEN
    RAISE EXCEPTION 'FAIL — الجدول لا يمتدّ من البدء إلى الشهر القادم: %', _j->'months';
  END IF;
  IF _j::text LIKE '%receipt.jpg%' THEN
    RAISE EXCEPTION 'FAIL — مسار مستند الوصول وصل الكافل';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'f1000000-0000-4000-8000-000000000003' AND title = 'وصلت كفالة الشهر') THEN
    RAISE EXCEPTION 'FAIL — لم يُبلَّغ الكافل بالوصول';
  END IF;
  RAISE NOTICE 'PASS — الجدول: مستحَقّ ← مدفوع ← واصل، والكافل يُبلَّغ ولا يرى المستند';
END $$;

-- الاسم من إعدادٍ واحد: تغييره يغيّر رسالة الترحيب.
UPDATE public.platform_settings SET brand_name = 'اسمٌ تجريبي' WHERE id;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('f1000000-0000-4000-8000-000000000009', 'lg-new@example.test', '{}'::jsonb);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'f1000000-0000-4000-8000-000000000009'
                    AND title = 'أهلاً بك في اسمٌ تجريبي') THEN
    RAISE EXCEPTION 'FAIL — الترحيب لا يتبع اسم المنصّة: %',
      (SELECT title FROM public.notifications WHERE user_id = 'f1000000-0000-4000-8000-000000000009');
  END IF;
  RAISE NOTICE 'PASS — رسالة الترحيب تتبع اسم المنصّة من الإعداد';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص السجلّ اجتازت ──'; END $$;
ROLLBACK;
