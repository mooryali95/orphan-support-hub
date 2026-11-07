-- =====================================================================
-- جهة الرعاية تُسجّل نفسها بتحقّقٍ أدنى — إثبات (الدفعة ٢: UX-03 + PRD-16)
-- ---------------------------------------------------------------------
-- كلّ فحصٍ يبدأ من النداء المباشر بالمفتاح المنشور، لا من الشاشة:
--   • حسابٌ عادي يُسجّل جهةً فتصير «بانتظار الاعتماد» ويُمنح دور care_org
--   • لا تسجيل بلا الاسم القانوني ورقم التسجيل والدولة العاملة والعنوان
--     والممثّل ووسيلة التواصل
--   • لا يعتمد صاحبُ الجهة نفسه، ولا يقرأ غيرُه بيانات تحقّقه أو وثائقه
--   • لا وثيقة خارج مجلّد الجهة أو بلا ملفٍّ في الخزنة
--   • لا اعتماد بلا تحقّقٍ كامل، ولا رفض بلا سبب، والمرفوضة تُعيد التقديم
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b2c00000-0000-4000-8000-000000000001', 'b2c-admin@example.test', '{}'::jsonb),
  ('b2c00000-0000-4000-8000-000000000002', 'b2c-newuser@example.test', '{}'::jsonb),
  ('b2c00000-0000-4000-8000-000000000003', 'b2c-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('b2c00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.countries (code, name_ar, status)
VALUES ('XK', 'كوسوفو', 'active'), ('ZZ', 'بلدٌ مخطَّط', 'planned')
ON CONFLICT (code) DO NOTHING;

CREATE TEMP TABLE b2c_ctx (k TEXT PRIMARY KEY, v UUID);
GRANT ALL ON b2c_ctx TO authenticated;

-- ١) حسابٌ جديد بلا دورٍ سوى «كافل» يُسجّل جهته.
DO $$
DECLARE _res JSONB; _roles TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000002","role":"authenticated"}', true);

  -- ناقص: بلا ممثّلٍ ولا عنوان.
  BEGIN
    PERFORM public.register_care_organization(jsonb_build_object(
      'name', 'دار الأمل', 'legal_name', 'جمعية دار الأمل',
      'registration_number', 'AL-123', 'country_code', 'AL', 'contact_email', 'a@b.test'));
    RAISE EXCEPTION 'FAIL — قُبل تسجيلٌ بلا عنوانٍ ولا ممثّل قانوني';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  -- دولةٌ مخطَّطة لا تعمل فيها المنصّة.
  BEGIN
    PERFORM public.register_care_organization(jsonb_build_object(
      'name', 'دار الأمل', 'legal_name', 'جمعية دار الأمل', 'registration_number', 'AL-123',
      'country_code', 'ZZ', 'address', 'شارع ١، تيرانا', 'legal_rep_name', 'أنيسا ك.',
      'contact_email', 'a@b.test'));
    RAISE EXCEPTION 'FAIL — قُبل تسجيلٌ في دولةٍ لا تعمل فيها المنصّة';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  -- بلا وسيلة تواصل.
  BEGIN
    PERFORM public.register_care_organization(jsonb_build_object(
      'name', 'دار الأمل', 'legal_name', 'جمعية دار الأمل', 'registration_number', 'AL-123',
      'country_code', 'AL', 'address', 'شارع ١، تيرانا', 'legal_rep_name', 'أنيسا ك.'));
    RAISE EXCEPTION 'FAIL — قُبل تسجيلٌ بلا بريدٍ ولا هاتف';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  _res := public.register_care_organization(jsonb_build_object(
    'name', 'دار الأمل', 'legal_name', 'جمعية دار الأمل', 'registration_number', 'AL-123',
    'country_code', 'AL', 'address', 'شارع ١، تيرانا', 'legal_rep_name', 'أنيسا ك.',
    'legal_rep_title', 'رئيسة الجمعية', 'contact_email', 'Contact@Amal.test', 'city', 'تيرانا',
    -- محاولة اعتمادٍ ذاتي من الحمولة: تُتجاهل.
    'status', 'approved'));
  INSERT INTO b2c_ctx VALUES ('org', (_res->>'id')::uuid);
  IF _res->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — الجهة لم تُسجَّل «بانتظار الاعتماد»: %', _res;
  END IF;

  SELECT array_agg(role::text) INTO _roles FROM public.user_roles
   WHERE user_id = 'b2c00000-0000-4000-8000-000000000002';
  IF NOT ('care_org' = ANY (_roles)) THEN
    RAISE EXCEPTION 'FAIL — لم يُمنح دور care_org: %', _roles;
  END IF;
  IF 'admin' = ANY (_roles) THEN RAISE EXCEPTION 'FAIL — مُنح دورٌ لم يُطلب'; END IF;

  -- طلبٌ ثانٍ لا يُنشئ جهةً ثانية.
  PERFORM public.register_care_organization(jsonb_build_object(
    'name', 'دار الأمل ٢', 'legal_name', 'جمعية دار الأمل', 'registration_number', 'AL-123',
    'country_code', 'AL', 'address', 'شارع ١، تيرانا', 'legal_rep_name', 'أنيسا ك.',
    'contact_phone', '+355 600 000'));
  IF (SELECT count(*) FROM public.care_organizations
       WHERE owner_id = 'b2c00000-0000-4000-8000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'FAIL — التسجيل الثاني أنشأ جهةً ثانية';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — UX-03: حسابٌ عادي يُسجّل جهته «بانتظار الاعتماد» ويُمنح care_org، ولا حقل تحقّقٍ يُتجاوز';
END $$;

-- ٢) لا اعتماد ذاتي: لا بالتحديث المباشر ولا بدالّة القرار.
DO $$
DECLARE _org UUID := (SELECT v FROM b2c_ctx WHERE k = 'org');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    UPDATE public.care_organizations SET status = 'approved' WHERE id = _org;
    RAISE EXCEPTION 'FAIL — صاحب الجهة اعتمدها بنفسه';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.review_organization(_org, 'approved');
    RAISE EXCEPTION 'FAIL — صاحب الجهة نادى دالّة القرار';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF (SELECT status FROM public.care_organizations WHERE id = _org) <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — تغيّرت حال الجهة';
  END IF;
  RAISE NOTICE 'PASS — UX-03: لا تعتمد الجهة نفسها، بالتحديث ولا بالدالّة';
END $$;

-- ٣) بيانات التحقّق والوثائق لا يقرؤها غريب، ولا تُرفع خارج مجلّد الجهة.
INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'org-documents', v::text || '/registration.pdf', '{"eTag":"r1"}'::jsonb FROM b2c_ctx WHERE k = 'org'
UNION ALL
SELECT 'org-documents', v::text || '/rep-id.pdf', '{"eTag":"r2"}'::jsonb FROM b2c_ctx WHERE k = 'org';

DO $$
DECLARE _org UUID := (SELECT v FROM b2c_ctx WHERE k = 'org'); _n INT; _ok BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  BEGIN
    PERFORM count(*) FROM public.care_org_kyc;
    RAISE EXCEPTION 'FAIL — الغريب يقرأ جدول التحقّق';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.care_org_documents;
    RAISE EXCEPTION 'FAIL — الغريب يقرأ جدول الوثائق';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.my_care_org_kyc() <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — my_care_org_kyc أعاد جهة غيره';
  END IF;
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'org-documents';
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL — الغريب يسرد خزنة الجهة (% ملف)', _n; END IF;
  BEGIN
    PERFORM public.attach_care_org_document(_org, 'license', _org::text || '/registration.pdf');
    RAISE EXCEPTION 'FAIL — الغريب أرفق وثيقةً بجهة غيره';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_care_org_context(_org);
    RAISE EXCEPTION 'FAIL — الغريب قرأ سياق قرار الجهة';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- ولا يكتب في مجلّدها بالخزنة.
  _ok := public.owns_org_folder(_org::text || '/x.pdf');
  IF _ok THEN RAISE EXCEPTION 'FAIL — مجلّد الجهة مفتوحٌ للغريب'; END IF;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  -- مسارٌ في مجلّدٍ آخر، أو بصعود، أو بلا ملف.
  BEGIN
    PERFORM public.attach_care_org_document(_org, 'license',
      'b2c00000-0000-4000-8000-0000000000ff/registration.pdf');
    RAISE EXCEPTION 'FAIL — أُرفقت وثيقةٌ من مجلّدٍ آخر';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.attach_care_org_document(_org, 'license', _org::text || '/../x/registration.pdf');
    RAISE EXCEPTION 'FAIL — أُرفقت وثيقةٌ بمسارٍ صاعد';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.attach_care_org_document(_org, 'license', _org::text || '/missing.pdf');
    RAISE EXCEPTION 'FAIL — أُرفقت وثيقةٌ لا ملفّ لها';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF NOT public.owns_org_folder(_org::text || '/x.pdf') THEN
    RAISE EXCEPTION 'FAIL — صاحب الجهة المعلّقة لا يرفع إلى مجلّده';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — PRD-16: التحقّق والوثائق لصاحب الجهة والإدارة وحدهما، وفي مجلّدها وحده';
END $$;

-- ٤) الإدارة لا تعتمد بلا وثيقة تسجيل، ولا ترفض بلا سبب؛ والمرفوضة تُعيد التقديم.
DO $$
DECLARE _org UUID := (SELECT v FROM b2c_ctx WHERE k = 'org'); _ctx JSONB; _kyc JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM public.attach_care_org_document(_org, 'representative_id', _org::text || '/rep-id.pdf',
                                          'rep-id.pdf', 'application/pdf', 1200);

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _ctx := public.admin_decision_context('org', _org);
  IF _ctx->>'legal_rep_name' IS DISTINCT FROM 'أنيسا ك.' OR _ctx->>'address' IS NULL
     OR jsonb_array_length(_ctx->'documents') <> 1
     OR NOT (_ctx->'missing') ? 'registration_document' THEN
    RAISE EXCEPTION 'FAIL — سياق القرار لا يحمل التحقّق والناقص: %', _ctx;
  END IF;
  IF _ctx ? 'owner_id' THEN RAISE EXCEPTION 'FAIL — السياق يكشف owner_id'; END IF;

  BEGIN
    PERFORM public.review_organization(_org, 'approved');
    RAISE EXCEPTION 'FAIL — اعتُمدت جهةٌ بلا وثيقة تسجيلٍ أو ترخيص';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.review_organization(_org, 'rejected');
    RAISE EXCEPTION 'FAIL — رُفضت جهةٌ بلا سبب';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  PERFORM public.review_organization(_org, 'rejected', 'وثيقة التسجيل غير مرفوعة');
  RESET ROLE;

  IF (SELECT status FROM public.care_organizations WHERE id = _org) <> 'rejected'
     OR NOT EXISTS (SELECT 1 FROM public.user_roles
                     WHERE user_id = 'b2c00000-0000-4000-8000-000000000002' AND role = 'care_org')
     OR NOT EXISTS (SELECT 1 FROM public.audit_log
                     WHERE entity_id = _org AND action = 'organization.rejected') THEN
    RAISE EXCEPTION 'FAIL — الرفض لم يُسجَّل أو أسقط الدور';
  END IF;

  -- الجهة ترى سبب الرفض وتُكمل وتعيد التقديم.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _kyc := public.my_care_org_kyc();
  IF _kyc->'kyc'->>'decision_note' IS DISTINCT FROM 'وثيقة التسجيل غير مرفوعة'
     OR _kyc->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL — الجهة لا ترى سبب رفضها: %', _kyc;
  END IF;
  PERFORM public.attach_care_org_document(_org, 'registration_certificate',
                                          _org::text || '/registration.pdf', 'registration.pdf');
  PERFORM public.register_care_organization(jsonb_build_object(
    'name', 'دار الأمل', 'legal_name', 'جمعية دار الأمل', 'registration_number', 'AL-123',
    'country_code', 'AL', 'address', 'شارع ١، تيرانا', 'legal_rep_name', 'أنيسا ك.',
    'contact_email', 'contact@amal.test'));
  RESET ROLE;
  IF (SELECT status FROM public.care_organizations WHERE id = _org) <> 'pending'
     OR NOT EXISTS (SELECT 1 FROM public.audit_log
                     WHERE entity_id = _org AND action = 'organization.resubmitted') THEN
    RAISE EXCEPTION 'FAIL — إعادة التقديم لم تُعِد الجهة إلى الصندوق';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.admin_decision_inbox()) i
                  WHERE i->>'kind' = 'org' AND (i->>'id')::uuid = _org) THEN
    RAISE EXCEPTION 'FAIL — الجهة المُعاد تقديمها غائبة عن صندوق القرارات';
  END IF;
  PERFORM public.review_organization(_org, 'approved');
  RESET ROLE;
  IF (SELECT status FROM public.care_organizations WHERE id = _org) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — الجهة المكتملة لم تُعتمد';
  END IF;

  -- المعتمدة لا تُبدّل بيانات تحقّقها من طرفها.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2c00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.register_care_organization(jsonb_build_object(
      'name', 'اسمٌ آخر', 'legal_name', 'جمعية أخرى', 'registration_number', 'X-1',
      'country_code', 'AL', 'address', 'عنوانٌ آخر', 'legal_rep_name', 'شخصٌ آخر',
      'contact_email', 'x@y.test'));
    RAISE EXCEPTION 'FAIL — الجهة المعتمدة بدّلت بيانات تحقّقها';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — PRD-16: لا اعتماد بلا وثيقة تسجيل، ولا رفض بلا سبب، والمرفوضة تُصحّح وتعود إلى الصندوق';
END $$;

-- ٥) الزائر لا ينادي شيئاً من هذا.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.register_care_organization(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.attach_care_org_document(uuid,text,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.my_care_org_kyc()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.care_org_kyc_missing(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — دوالّ التسجيل مفتوحةٌ لغير المقصود';
  END IF;
  RAISE NOTICE 'PASS — UX-03: دوالّ التسجيل للمسجَّلين وحدهم';
END $$;

ROLLBACK;
