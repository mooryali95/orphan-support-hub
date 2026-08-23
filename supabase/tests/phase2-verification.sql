-- =====================================================================
-- المرحلة 2 — إثبات: الوثائق وموافقة الصورة والبنود وأثر التدقيق
-- =====================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase2-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'p2-admin@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000002', 'p2-org@example.test', '{"role":"care_org"}'::jsonb),
  ('d1000000-0000-4000-8000-000000000003', 'p2-other-org@example.test', '{"role":"care_org"}'::jsonb),
  ('d1000000-0000-4000-8000-000000000004', 'p2-sponsor@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('d1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status) VALUES
  ('d2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000002', 'جهة معتمدة', 'approved'),
  ('d2000000-0000-4000-8000-00000000000b', 'd1000000-0000-4000-8000-000000000003', 'جهة أخرى', 'approved');

-- ---------------------------------------------------------------------
-- M4 — رمز الملف من تسلسل: لا تصادم
-- ---------------------------------------------------------------------
DO $$
DECLARE a TEXT; b TEXT;
BEGIN
  a := public.next_orphan_code();
  b := public.next_orphan_code();
  IF a = b THEN RAISE EXCEPTION 'FAIL M4 — sequence produced a duplicate code'; END IF;
  IF a !~ '^IOCO-[0-9]{6}$' THEN RAISE EXCEPTION 'FAIL M4 — unexpected code shape: %', a; END IF;
  RAISE NOTICE 'PASS M4 — orphan codes come from a sequence (% then %)', a, b;
END $$;

-- ---------------------------------------------------------------------
-- M3 — الإدخال معاملة واحدة: لا فقدان صامت
-- ---------------------------------------------------------------------
DO $$
DECLARE _res JSONB; _orphan UUID; _priv RECORD; _need_total NUMERIC;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';

  _res := public.create_orphan_intake(jsonb_build_object(
    'org_id', 'd2000000-0000-4000-8000-00000000000a',
    'display_name', 'يتيم الفحص',
    'gender', 'male',
    'city', 'الرياض',
    'full_name', 'الاسم الكامل السرّي',
    'guardian_name', 'ولي الأمر',
    'guardian_phone', '+966500000000',
    'needs', jsonb_build_array(
      jsonb_build_object('category','education','title','رسوم','monthly_amount',120),
      jsonb_build_object('category','food','title','غذاء','monthly_amount',80)
    )
  ));
  _orphan := (_res->>'id')::uuid;
  RESET ROLE;

  SELECT * INTO _priv FROM public.orphan_private WHERE orphan_id = _orphan;
  IF _priv IS NULL OR _priv.full_name IS DISTINCT FROM 'الاسم الكامل السرّي' THEN
    RAISE EXCEPTION 'FAIL M3 — private data was not stored with the profile';
  END IF;
  RAISE NOTICE 'PASS M3 — private data lands in the same transaction as the profile';

  -- M9: المبلغ الشهري = مجموع البنود، لا رقماً مستقلّاً
  SELECT monthly_need INTO _need_total FROM public.orphans WHERE id = _orphan;
  IF _need_total <> 200 THEN
    RAISE EXCEPTION 'FAIL M9 — monthly_need is % not the 200 sum of items', _need_total;
  END IF;
  RAISE NOTICE 'PASS M9 — monthly_need is derived from the need items';

  -- M7: الإدخال ترك أثراً
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE entity = 'orphan' AND entity_id = _orphan AND action = 'orphan.submitted') THEN
    RAISE EXCEPTION 'FAIL M7 — intake left no audit trail';
  END IF;
  RAISE NOTICE 'PASS M7 — intake writes an audit entry';
END $$;

-- الفشل داخل الدالة يُسقط كل شيء: لا ملف بلا بياناته السرّية.
DO $$
DECLARE _before INTEGER; _after INTEGER;
BEGIN
  SELECT count(*) INTO _before FROM public.orphans;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    -- جهة ليست له: يجب أن تُرفض المعاملة كاملةً
    PERFORM public.create_orphan_intake(jsonb_build_object(
      'org_id', 'd2000000-0000-4000-8000-00000000000b',
      'display_name', 'يجب ألّا يوجد'));
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — intake accepted an organisation the caller does not own';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  SELECT count(*) INTO _after FROM public.orphans;
  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL — a rejected intake still left % row(s)', _after - _before;
  END IF;
  RAISE NOTICE 'PASS — a rejected intake leaves nothing behind';
END $$;

-- ---------------------------------------------------------------------
-- المسودّة: مجلّد قبل الملف، ثم تقديم
-- ---------------------------------------------------------------------
DO $$
DECLARE _draft JSONB; _id UUID; _st public.orphan_status; _res JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';

  _draft := public.start_orphan_draft('d2000000-0000-4000-8000-00000000000a');
  _id := (_draft->>'id')::uuid;
  RESET ROLE;

  SELECT status INTO _st FROM public.orphans WHERE id = _id;
  IF _st <> 'draft' THEN RAISE EXCEPTION 'FAIL — a draft did not start as draft (%)', _st; END IF;
  RAISE NOTICE 'PASS — a draft profile exists so documents have a folder';

  -- المسودّة غير منشورة: الزائر لا يراها
  SET LOCAL ROLE anon;
  IF EXISTS (SELECT 1 FROM public.orphans WHERE id = _id) THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a draft profile was visible to an anonymous visitor';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — a draft profile is not public';

  -- الوثيقة تُرفع إلى مجلّد المسودّة
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('orphan-documents', _id || '/guardianship.pdf', 'd1000000-0000-4000-8000-000000000002');

  -- ثم تُقدَّم المسودّة نفسها ببياناتها
  _res := public.create_orphan_intake(jsonb_build_object(
    'org_id', 'd2000000-0000-4000-8000-00000000000a',
    'orphan_id', _id,
    'display_name', 'يتيم المسودّة',
    'gender', 'female',
    'full_name', 'اسم سرّي',
    'needs', jsonb_build_array(
      jsonb_build_object('category','housing','title','سكن','monthly_amount',150))
  ));
  RESET ROLE;

  IF (_res->>'id')::uuid <> _id THEN
    RAISE EXCEPTION 'FAIL — submitting a draft created a second profile';
  END IF;
  SELECT status INTO _st FROM public.orphans WHERE id = _id;
  IF _st <> 'submitted' THEN RAISE EXCEPTION 'FAIL — the draft was not submitted (%)', _st; END IF;
  IF (SELECT monthly_need FROM public.orphans WHERE id = _id) <> 150 THEN
    RAISE EXCEPTION 'FAIL — the submitted draft did not take its items total';
  END IF;
  IF (SELECT full_name FROM public.orphan_private WHERE orphan_id = _id) <> 'اسم سرّي' THEN
    RAISE EXCEPTION 'FAIL — the draft private row was not filled on submit';
  END IF;
  RAISE NOTICE 'PASS — submitting a draft fills it in place, no duplicate profile';
END $$;

-- مسودّة ليست لك لا تُقدَّم باسمك.
DO $$
DECLARE _draft JSONB; _id UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _draft := public.start_orphan_draft('d2000000-0000-4000-8000-00000000000b');
  _id := (_draft->>'id')::uuid;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.create_orphan_intake(jsonb_build_object(
      'org_id', 'd2000000-0000-4000-8000-00000000000a',
      'orphan_id', _id,
      'display_name', 'اختطاف مسودّة'));
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — another organisation submitted a draft that is not theirs';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — a draft cannot be submitted by another organisation';
  END;
END $$;

-- ---------------------------------------------------------------------
-- M9 — تعديل البنود يُحرّك المبلغ، والتحرير المباشر يُرفض
-- ---------------------------------------------------------------------
DO $$
DECLARE _orphan UUID; _need UUID; _total NUMERIC;
BEGIN
  SELECT id INTO _orphan FROM public.orphans WHERE display_name = 'يتيم الفحص';
  SELECT id INTO _need FROM public.orphan_needs WHERE orphan_id = _orphan AND monthly_amount = 80;

  UPDATE public.orphan_needs SET monthly_amount = 130 WHERE id = _need;
  SELECT monthly_need INTO _total FROM public.orphans WHERE id = _orphan;
  IF _total <> 250 THEN RAISE EXCEPTION 'FAIL M9 — editing an item did not move the total (%)', _total; END IF;

  DELETE FROM public.orphan_needs WHERE id = _need;
  SELECT monthly_need INTO _total FROM public.orphans WHERE id = _orphan;
  IF _total <> 120 THEN RAISE EXCEPTION 'FAIL M9 — deleting an item did not move the total (%)', _total; END IF;
  RAISE NOTICE 'PASS M9 — the total follows items on edit and delete';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    UPDATE public.orphans SET monthly_need = 900 WHERE id = _orphan;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL M9 — the declared amount could be set above the items sum';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS M9 — the declared amount cannot contradict the items';
  END;
END $$;

-- ---------------------------------------------------------------------
-- موافقة الصورة — جوهر المرحلة أخلاقياً
-- ---------------------------------------------------------------------
DO $$
DECLARE _orphan UUID;
BEGIN
  SELECT id INTO _orphan FROM public.orphans WHERE display_name = 'يتيم الفحص';

  BEGIN
    UPDATE public.orphans SET photo_url = 'https://x/face.jpg' WHERE id = _orphan;
    RAISE EXCEPTION 'FAIL — a photo was published without any consent';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — a photo cannot be published without consent';
  END;

  BEGIN
    UPDATE public.orphans
       SET photo_url = 'https://x/face.jpg', photo_consent = 'granted'
     WHERE id = _orphan;
    RAISE EXCEPTION 'FAIL — full consent was accepted without a consent document';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — full consent requires a documented consent file';
  END;

  -- إخفاء الوجه لا يحتاج وثيقة: الصورة لا تُعرّف صاحبها.
  UPDATE public.orphans
     SET photo_url = 'https://x/silhouette.jpg', photo_consent = 'face_hidden'
   WHERE id = _orphan;
  RAISE NOTICE 'PASS — a face-hidden photo is allowed without a consent document';

  -- الموافقة الكاملة مع وثيقتها
  UPDATE public.orphans
     SET photo_consent = 'granted',
         photo_consent_doc = 'd3000000-0000-4000-8000-00000000000c/consent.pdf',
         photo_consent_at = now()
   WHERE id = _orphan;
  RAISE NOTICE 'PASS — full consent with a document is accepted';

  -- السحب يمحو الصورة فوراً، بلا إجراء يدوي
  UPDATE public.orphans SET photo_consent = 'withdrawn' WHERE id = _orphan;
  IF (SELECT photo_url FROM public.orphans WHERE id = _orphan) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — withdrawing consent left the photo in place';
  END IF;
  RAISE NOTICE 'PASS — withdrawing consent removes the photo immediately';
END $$;

-- ---------------------------------------------------------------------
-- التخزين — عزل مجلّد كل يتيم
-- ---------------------------------------------------------------------
DO $$
DECLARE _mine UUID; _theirs UUID;
BEGIN
  SELECT id INTO _mine FROM public.orphans WHERE display_name = 'يتيم الفحص';

  INSERT INTO public.orphans (code, display_name, org_id, created_by, monthly_need, status)
  VALUES (public.next_orphan_code(), 'يتيم جهة أخرى',
          'd2000000-0000-4000-8000-00000000000b',
          'd1000000-0000-4000-8000-000000000003', 100, 'submitted')
  RETURNING id INTO _theirs;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';

  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('orphan-documents', _mine || '/death-certificate.pdf',
          'd1000000-0000-4000-8000-000000000002');
  RAISE NOTICE 'PASS — an organisation can upload into its own orphan folder';

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('orphan-documents', _theirs || '/stolen.pdf',
            'd1000000-0000-4000-8000-000000000002');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an organisation wrote into another orphan folder';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — an organisation cannot write into another orphan folder';
  END;

  -- كافل عادي لا يرى وثيقة أصلاً
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'orphan-documents') THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a sponsor could list orphan documents';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — a sponsor cannot see any orphan document';

  -- والزائر كذلك
  SET LOCAL ROLE anon;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'orphan-documents') THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an anonymous visitor could list orphan documents';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — an anonymous visitor cannot see any orphan document';
END $$;

-- ---------------------------------------------------------------------
-- التوثيق حقّ الإدارة وحدها
-- ---------------------------------------------------------------------
DO $$
DECLARE _orphan UUID; _doc UUID;
BEGIN
  SELECT id INTO _orphan FROM public.orphans WHERE display_name = 'يتيم الفحص';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, verified)
    VALUES (_orphan, 'death_certificate', 'death_certificate', _orphan || '/dc.pdf', true);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an organisation marked its own document verified';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — an organisation cannot verify its own documents';
  END;

  INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path)
  VALUES (_orphan, 'death_certificate', 'death_certificate', _orphan || '/dc.pdf')
  RETURNING id INTO _doc;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.verify_document(_doc, true, 'مطابقة');
  RESET ROLE;

  IF NOT (SELECT verified FROM public.orphan_documents WHERE id = _doc) THEN
    RAISE EXCEPTION 'FAIL — admin verification did not take effect';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'document.verified' AND entity_id = _doc) THEN
    RAISE EXCEPTION 'FAIL M7 — document verification left no audit trail';
  END IF;
  RAISE NOTICE 'PASS — only an admin verifies, and the decision is audited';
END $$;

-- ---------------------------------------------------------------------
-- M7 — قرار المراجعة: مقصور على الإدارة، مُسبَّب، وموثَّق
-- ---------------------------------------------------------------------
DO $$
DECLARE _orphan UUID;
BEGIN
  SELECT id INTO _orphan FROM public.orphans WHERE display_name = 'يتيم الفحص';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.review_orphan(_orphan, 'approved');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an organisation approved its own orphan profile';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — an organisation cannot approve its own profile';
  END;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.review_orphan(_orphan, 'rejected');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a rejection without a structured code was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS — a rejection must carry a structured reason code';
  END;

  PERFORM public.review_orphan(_orphan, 'approved');
  RESET ROLE;

  IF (SELECT status FROM public.orphans WHERE id = _orphan) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — approval did not take effect';
  END IF;
  IF (SELECT reviewed_by FROM public.orphans WHERE id = _orphan)
     <> 'd1000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL — the reviewer was not recorded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'orphan.approved' AND entity_id = _orphan) THEN
    RAISE EXCEPTION 'FAIL M7 — approval left no audit trail';
  END IF;
  RAISE NOTICE 'PASS M7 — approval records the reviewer and writes an audit entry';
END $$;

-- ---------------------------------------------------------------------
-- ارتداد: ما أمّنته المرحلة 0 لا يزال مؤمَّناً
-- ---------------------------------------------------------------------
DO $$
DECLARE _orphan UUID;
BEGIN
  SELECT id INTO _orphan FROM public.orphans WHERE display_name = 'يتيم الفحص';
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    UPDATE public.orphans SET funded_monthly = 5000 WHERE id = _orphan;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL regression — funded_monthly became client-writable';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS regression — funded_monthly is still trigger-managed';
  END;
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المرحلة 2 اجتازت ──'; END $$;

ROLLBACK;
