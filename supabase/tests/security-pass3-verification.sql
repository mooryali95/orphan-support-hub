-- =====================================================================
-- المراجعة الأمنية الثالثة: إثبات (هجرة 20261204100000_security_pass3)
-- ---------------------------------------------------------------------
--   N1: اسمٌ بغير صيغة child_update_path_ok مرفوض، والحصّة اليومية تُغلق
--       الرفع، والكائن بلا صفٍّ بعد يومٍ يُسرَد للحذف (وما له صفٌّ لا يُسرَد).
--   N2: مديرٌ بجلسة aal1 لا يرى الكفلاء، وبـ aal2 يراهم؛ وكلّ بحثٍ سطرُ
--       sec_admin_search بلا نصّ الاستعلام؛ وحدّ المعدّل يردّ rate_limited.
--   N3: معرّفٌ عشوائي يُرفض country_forbidden بلا سطر سلامة، ورفض MFA
--       المتكرّر سطرٌ واحد في الدقيقة.
--   N6: security_events_recent للخدمة وحدها، ويعدّ ولا يعدّ البحث.
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
  ('a3a00000-0000-4000-8000-000000000001', 'p3-admin@example.test', '{}', now()),
  ('a3a00000-0000-4000-8000-000000000002', 'p3-sponsor@example.test', '{}', now()),
  ('a3a00000-0000-4000-8000-000000000003', 'p3-snde@example.test', '{}', now()),
  ('a3a00000-0000-4000-8000-000000000005', 'p3-snsup@example.test', '{}', now());
INSERT INTO public.user_roles (user_id, role) VALUES ('a3a00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('SN', 'a3a00000-0000-4000-8000-000000000003', 'data_entry'),
  ('SN', 'a3a00000-0000-4000-8000-000000000005', 'supervisor');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, status, approved_at, country, country_code) VALUES
  ('a3c00000-0000-4000-8000-000000000001', 'P3-SN-1', 'أمينة الثالثة', 100, 'USD', 'approved', now(), 'SN', 'SN');

DO $$
DECLARE
  _o TEXT := 'a3c00000-0000-4000-8000-000000000001';
  _de TEXT := '{"sub":"a3a00000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}';
  _ok BOOLEAN; _r JSONB; _n INT; _i INT;
BEGIN
  -- ١) N1: الاسم بغير الصيغة
  PERFORM set_config('request.jwt.claims', _de, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('child-updates', _o || '/not-a-uuid-anything.exe', 'a3a00000-0000-4000-8000-000000000003', '{"size":10}');
    _ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _ok := false;
  END;
  IF _ok THEN RAISE EXCEPTION 'FAIL N1: قُبل اسمٌ بغير صيغة child_update_path_ok'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('child-updates', _o || '/33333333-3333-4333-8333-333333333333.exe', 'a3a00000-0000-4000-8000-000000000003', '{"size":10}');
    _ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _ok := false;
  END;
  IF _ok THEN RAISE EXCEPTION 'FAIL N1: قُبل امتدادٌ غير الصورة والمقطع'; END IF;
  -- الاسم الصحيح يُقبل
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('child-updates', _o || '/22222222-2222-4222-8222-222222222222.jpg', 'a3a00000-0000-4000-8000-000000000003', '{"size":10}');
  RESET ROLE;

  -- ٢) N1: الحصّة اليومية
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  SELECT 'child-updates', _o || '/' || gen_random_uuid() || '.jpg', 'a3a00000-0000-4000-8000-000000000003', '{"size":1}'
    FROM generate_series(1, public.child_update_upload_quota());
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('child-updates', _o || '/44444444-4444-4444-8444-444444444444.jpg', 'a3a00000-0000-4000-8000-000000000003', '{"size":10}');
    _ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN _ok := false;
  END;
  RESET ROLE;
  IF _ok THEN RAISE EXCEPTION 'FAIL N1: تجاوز الرفعُ الحصّةَ اليومية'; END IF;

  -- ٣) N1: الكائن بلا صفٍّ بعد يوم يُسرَد، والمسجَّل والحديث لا يُسرَدان
  DELETE FROM storage.objects WHERE bucket_id = 'child-updates' AND name LIKE _o || '/%'
     AND name <> _o || '/22222222-2222-4222-8222-222222222222.jpg';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata, created_at) VALUES
    ('child-updates', _o || '/55555555-5555-4555-8555-555555555555.jpg', NULL, '{"size":10}', now() - interval '2 days'),
    ('child-updates', _o || '/66666666-6666-4666-8666-666666666666.jpg', NULL, '{"size":10}', now() - interval '2 days'),
    ('child-updates', _o || '/77777777-7777-4777-8777-777777777777.jpg', NULL, '{"size":10}', now() - interval '1 hour');
  INSERT INTO public.child_updates (orphan_id, country_code, kind, storage_path, caption_ar, guardian_consent, uploaded_by)
  VALUES (_o::uuid, 'SN', 'photo', _o || '/66666666-6666-4666-8666-666666666666.jpg', 'صورة', true,
          'a3a00000-0000-4000-8000-000000000003');
  _r := public.child_updates_stray_objects(500);
  IF _r->'paths' <> jsonb_build_array(_o || '/55555555-5555-4555-8555-555555555555.jpg') THEN
    RAISE EXCEPTION 'FAIL N1: قائمة الكائنات اليتيمة خاطئة: %', _r;
  END IF;
  PERFORM public.child_updates_stray_done(1);
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'child_updates_stray_purge') THEN
    RAISE EXCEPTION 'FAIL N1: حذف اليتيم بلا أثر';
  END IF;
  IF has_function_privilege('authenticated', 'public.child_updates_stray_objects(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL N1: سرد الكائنات اليتيمة متاح لغير الخدمة';
  END IF;
  RAISE NOTICE 'PASS N1: صيغة الاسم والحصّة ومسح الكائنات اليتيمة';
END $$;

-- ٤) N2: البحث الإداري
INSERT INTO public.profiles (id, full_name) VALUES ('a3a00000-0000-4000-8000-000000000002', 'كافل الثالثة')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
DO $$
DECLARE
  _a1 TEXT := '{"sub":"a3a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
  _a2 TEXT := '{"sub":"a3a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  _r JSONB; _before INT; _i INT; _limited BOOLEAN := false;
BEGIN
  SELECT count(*) INTO _before FROM public.integrity_log WHERE kind = 'sec_admin_search';
  PERFORM set_config('request.jwt.claims', _a1, true);
  _r := public.admin_search('p3-sponsor', 6);
  IF jsonb_array_length(_r->'sponsors') <> 0 OR (_r->>'mfa_required')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL N2: مديرٌ بجلسة aal1 رأى الكفلاء: %', _r;
  END IF;
  PERFORM set_config('request.jwt.claims', _a2, true);
  _r := public.admin_search('p3-sponsor', 6);
  IF jsonb_array_length(_r->'sponsors') <> 1 OR (_r->>'mfa_required')::boolean THEN
    RAISE EXCEPTION 'FAIL N2: مديرٌ بجلسة aal2 لم يرَ الكافل: %', _r;
  END IF;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_admin_search') <> _before + 2 THEN
    RAISE EXCEPTION 'FAIL N2: البحث بلا سطر سلامة';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'sec_admin_search'
              AND (detail::text LIKE '%p3-sponsor%' OR NOT (detail ? 'q_len') OR NOT (detail ? 'results'))) THEN
    RAISE EXCEPTION 'FAIL N2: سطر البحث يحمل النصّ أو يفقد الطول والعدد';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'sec_admin_search'
                  AND (detail->>'q_len')::int = 10 AND (detail->>'results')::int = 1) THEN
    RAISE EXCEPTION 'FAIL N2: الطول أو العدد خطأ';
  END IF;
  FOR _i IN 1..40 LOOP
    _r := public.admin_search('p3-sponsor', 6);
    IF _r->>'code' = 'rate_limited' THEN _limited := true; EXIT; END IF;
  END LOOP;
  IF NOT _limited THEN RAISE EXCEPTION 'FAIL N2: البحث بلا حدّ معدّل'; END IF;
  RAISE NOTICE 'PASS N2: aal2 للكفلاء، وسطر سلامة بلا نصّ، وحدّ معدّل';
END $$;

-- ٥) N3: ترتيب الفحص وتجميع الرفض
DO $$
DECLARE
  _sup TEXT := '{"sub":"a3a00000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}';
  _before INT; _r JSONB; _ok BOOLEAN; _u UUID;
BEGIN
  SELECT count(*) INTO _before FROM public.integrity_log WHERE kind = 'sec_mfa_required';
  PERFORM set_config('request.jwt.claims', _sup, true);
  FOR _i IN 1..4 LOOP
    BEGIN
      PERFORM public.child_update_review(gen_random_uuid(), 'approve');
      _ok := true;
    EXCEPTION WHEN insufficient_privilege THEN _ok := false;
    END;
    IF _ok THEN RAISE EXCEPTION 'FAIL N3: معرّفٌ عشوائي لم يُرفض country_forbidden'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_mfa_required') <> _before THEN
    RAISE EXCEPTION 'FAIL N3: المعرّفات العشوائية كتبت في سجلّ السلامة';
  END IF;
  SELECT id INTO _u FROM public.child_updates WHERE orphan_id = 'a3c00000-0000-4000-8000-000000000001' LIMIT 1;
  FOR _i IN 1..3 LOOP
    _r := public.child_update_review(_u, 'approve');
    IF _r->>'code' <> 'mfa_required' THEN RAISE EXCEPTION 'FAIL N3: بندٌ حقيقي بجلسة aal1: %', _r; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_mfa_required') <> _before + 1 THEN
    RAISE EXCEPTION 'FAIL N3: الرفض المتكرّر لم يُجمع في سطر واحد';
  END IF;
  RAISE NOTICE 'PASS N3: الوجود والنطاق قبل MFA، والرفض المتكرّر سطرٌ واحد';
END $$;

-- ٦) N6: العدّ
DO $$
DECLARE _r JSONB;
BEGIN
  _r := public.security_events_recent(0);
  IF (_r->>'count')::int < 1 OR NOT (_r->>'alert')::boolean THEN
    RAISE EXCEPTION 'FAIL N6: العدّ لم يرَ sec_mfa_required: %', _r;
  END IF;
  IF (_r->>'count')::int <> (SELECT count(*) FROM public.integrity_log WHERE kind LIKE 'sec\_%'
                              AND kind <> 'sec_admin_search' AND at > now() - interval '1 hour') THEN
    RAISE EXCEPTION 'FAIL N6: العدّ يشمل البحث الإداري';
  END IF;
  IF has_function_privilege('authenticated', 'public.security_events_recent(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL N6: العدّ متاح لغير الخدمة';
  END IF;
  RAISE NOTICE 'PASS N6: عدّ أحداث السلامة للخدمة وحدها';
END $$;
ROLLBACK;
