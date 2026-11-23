-- =====================================================================
-- ملفّ الطفل: مسودّةٌ في الخادم، وتصحيح المرفوض، والدولة والعملة — إثبات
-- (الدفعة ٢: UX-04 + UX-10 + A11Y-06)
-- ---------------------------------------------------------------------
--   • ملفّ الإدخال يُكتب بدولته (اسمها كما يقرؤه الدليل ورمزها) وعملتها،
--     لا بالافتراضي 'SA'/'USD'؛ ولا دولة غير عاملة
--   • المسودّة تُحفظ في القاعدة وتُقرأ منها لجهتها وحدها، ولا تتغيّر حالها
--   • المرفوض يُصحَّح ويُعاد: الوثيقة غير الموثَّقة تُستبدل، والموثَّقة باقية
--   • المُقدَّم يُقرأ ولا يُعدَّل، ولا تُنسب إليه وثيقة طفلٍ آخر
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b2d00000-0000-4000-8000-000000000001', 'b2d-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b2d00000-0000-4000-8000-000000000002', 'b2d-other-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b2d00000-0000-4000-8000-000000000003', 'b2d-admin@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('b2d00000-0000-4000-8000-000000000003', 'admin');
INSERT INTO public.countries (code, name_ar, status) VALUES ('XK', 'كوسوفو', 'active'),
  ('ZY', 'بلدٌ مخطَّط', 'planned')
ON CONFLICT (code) DO UPDATE SET status = EXCLUDED.status;
UPDATE public.countries SET currency = 'EUR' WHERE code = 'XK' AND currency IS NULL;
INSERT INTO public.care_organizations (id, owner_id, name, status, country_code) VALUES
  ('b2d10000-0000-4000-8000-000000000001', 'b2d00000-0000-4000-8000-000000000001', 'جهة الإدخال', 'approved', 'AL'),
  ('b2d10000-0000-4000-8000-000000000002', 'b2d00000-0000-4000-8000-000000000002', 'جهة أخرى', 'approved', 'AL');

CREATE TEMP TABLE b2d_ctx (k TEXT PRIMARY KEY, v UUID);
GRANT ALL ON b2d_ctx TO authenticated;

-- ١) قبل الهجرة كان الملفّ المُقدَّم بلا دولة: 'SA' و'USD'.
DO $$
DECLARE _res JSONB; _o RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2d00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _res := public.create_orphan_intake(jsonb_build_object(
    'org_id', 'b2d10000-0000-4000-8000-000000000001', 'display_name', 'أرديت . ب',
    'gender', 'male', 'country', 'XK', 'region', 'بيخا', 'needs', '[]'::jsonb, 'monthly_need', 0));
  INSERT INTO b2d_ctx VALUES ('new', (_res->>'id')::uuid);
  RESET ROLE;
  SELECT country, country_code, currency, region INTO _o FROM public.orphans WHERE id = (_res->>'id')::uuid;
  IF _o.country IS DISTINCT FROM 'كوسوفو' OR _o.country_code IS DISTINCT FROM 'XK'
     OR _o.currency IS DISTINCT FROM 'EUR' OR _o.region IS DISTINCT FROM 'بيخا' THEN
    RAISE EXCEPTION 'FAIL — الملفّ لم يُكتب بدولته وعملته: %', row_to_json(_o);
  END IF;

  -- وبلا دولةٍ في الطلب: دولة الجهة لا 'SA'.
  SET LOCAL ROLE authenticated;
  _res := public.create_orphan_intake(jsonb_build_object(
    'org_id', 'b2d10000-0000-4000-8000-000000000001', 'display_name', 'إلير . ك',
    'gender', 'male', 'needs', '[]'::jsonb));
  RESET ROLE;
  IF (SELECT country_code FROM public.orphans WHERE id = (_res->>'id')::uuid) IS DISTINCT FROM 'AL'
     OR (SELECT currency FROM public.orphans WHERE id = (_res->>'id')::uuid) IS DISTINCT FROM 'EUR' THEN
    RAISE EXCEPTION 'FAIL — الملفّ بلا دولةٍ لم يأخذ دولة جهته';
  END IF;

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_orphan_intake(jsonb_build_object(
      'org_id', 'b2d10000-0000-4000-8000-000000000001', 'display_name', 'زائف',
      'gender', 'male', 'country', 'ZY'));
    RAISE EXCEPTION 'FAIL — قُبلت دولةٌ لا تعمل فيها المنصّة';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — UX-10: ملفّ الإدخال يُكتب بدولةٍ عاملة واسمها كما في الدليل وعملتها (لا SA/USD)';
END $$;

-- ٢) المسودّة تُحفظ في القاعدة كاملةً، ولا تتغيّر حالها.
DO $$
DECLARE _d JSONB; _id UUID; _g JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2d00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _d := public.start_orphan_draft('b2d10000-0000-4000-8000-000000000001');
  _id := (_d->>'id')::uuid;
  INSERT INTO b2d_ctx VALUES ('draft', _id);

  PERFORM public.save_orphan_draft(jsonb_build_object(
    'org_id', 'b2d10000-0000-4000-8000-000000000001', 'orphan_id', _id,
    'display_name', 'نوح . س', 'gender', 'male', 'country', 'AL', 'region', 'إشقودرة',
    'full_name', 'نوح سالم', 'guardian_phone', '+355 600 111', 'health_notes', 'ربو خفيف',
    'needs', jsonb_build_array(jsonb_build_object('category', 'education', 'title', 'رسوم',
                                                  'monthly_amount', 40, 'note', '')),
    'documents', jsonb_build_array(jsonb_build_object('kind', 'death_certificate',
                   'storage_path', _id::text || '/death-1.pdf', 'file_name', 'death.pdf'))));

  _g := public.get_orphan_intake(_id);
  RESET ROLE;
  IF _g->>'status' <> 'draft' OR NOT (_g->>'editable')::boolean
     OR _g->>'display_name' <> 'نوح . س' OR _g->>'country_code' <> 'AL' OR _g->>'currency' <> 'EUR'
     OR _g->'private'->>'full_name' <> 'نوح سالم' OR _g->'private'->>'health_notes' <> 'ربو خفيف'
     OR jsonb_array_length(_g->'needs') <> 1 OR jsonb_array_length(_g->'documents') <> 1
     OR (_g->>'monthly_need')::numeric <> 40 THEN
    RAISE EXCEPTION 'FAIL — المسودّة لم تُحفظ أو لم تُقرأ كما كُتبت: %', _g;
  END IF;
  RAISE NOTICE 'PASS — UX-04: المسودّة تُحفظ في القاعدة بمعرّف ملفّها وتُقرأ كاملةً، وحالها مسودّة';
END $$;

-- ٣) جهةٌ أخرى لا تقرأ المسودّة ولا تكتبها؛ والزائر لا ينادي.
DO $$
DECLARE _id UUID := (SELECT v FROM b2d_ctx WHERE k = 'draft');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2d00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.get_orphan_intake(_id);
    RAISE EXCEPTION 'FAIL — جهةٌ أخرى قرأت المسودّة';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_orphan_draft(jsonb_build_object(
      'org_id', 'b2d10000-0000-4000-8000-000000000002', 'orphan_id', _id, 'display_name', 'x'));
    RAISE EXCEPTION 'FAIL — جهةٌ أخرى كتبت المسودّة بجهتها';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_orphan_draft(jsonb_build_object(
      'org_id', 'b2d10000-0000-4000-8000-000000000001', 'orphan_id', _id, 'display_name', 'x'));
    RAISE EXCEPTION 'FAIL — جهةٌ أخرى كتبت المسودّة بجهة صاحبها';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.prune_intake_documents(_id, 'b2d10000-0000-4000-8000-000000000001', ARRAY[]::text[]);
    RAISE EXCEPTION 'FAIL — جهةٌ أخرى حذفت وثائق المسودّة';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF has_function_privilege('anon', 'public.get_orphan_intake(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.save_orphan_draft(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.prune_intake_documents(uuid,uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — دوالّ المسودّة مفتوحةٌ للزائر';
  END IF;
  IF (SELECT display_name FROM public.orphans WHERE id = _id) <> 'نوح . س' THEN
    RAISE EXCEPTION 'FAIL — تغيّرت المسودّة';
  END IF;
  RAISE NOTICE 'PASS — UX-04: المسودّة لجهتها وحدها — لا تقرؤها جهةٌ أخرى ولا تكتبها ولا تحذف وثائقها';
END $$;

-- ٤) المرفوض يُصحَّح: غير الموثَّق يُستبدل، والموثَّق باقٍ، ثم يُعاد تقديمه.
DO $$
DECLARE _id UUID := (SELECT v FROM b2d_ctx WHERE k = 'draft'); _kinds TEXT;
BEGIN
  -- الإدارة رفضته: شهادة الوفاة غير مقروءة؛ وإثبات الوصاية موثَّق.
  INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, file_name, verified,
                                       verified_by, verified_at)
  VALUES (_id, 'guardianship_proof', 'guardianship_proof', _id::text || '/guardian.pdf',
          'guardian.pdf', true, 'b2d00000-0000-4000-8000-000000000003', now());
  UPDATE public.orphans SET status = 'rejected', rejection_code = 'documents_unclear',
         rejection_reason = 'صورة شهادة الوفاة غير مقروءة' WHERE id = _id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2d00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  IF (public.get_orphan_intake(_id)->>'rejection_reason') <> 'صورة شهادة الوفاة غير مقروءة'
     OR NOT (public.get_orphan_intake(_id)->>'editable')::boolean THEN
    RAISE EXCEPTION 'FAIL — المرفوض لا يُفتح للتصحيح بسببه';
  END IF;

  -- وثيقة طفلٍ آخر لا تُنسب إلى هذا الملف.
  BEGIN
    PERFORM public.save_orphan_draft(jsonb_build_object(
      'org_id', 'b2d10000-0000-4000-8000-000000000001', 'orphan_id', _id, 'display_name', 'نوح . س',
      'documents', jsonb_build_array(jsonb_build_object('kind', 'death_certificate',
        'storage_path', (SELECT v FROM b2d_ctx WHERE k = 'new')::text || '/death.pdf'))));
    RAISE EXCEPTION 'FAIL — نُسبت وثيقة طفلٍ آخر إلى الملف';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- إعادة التقديم بشهادةٍ جديدة، والطلب لا يذكر الوثيقة الموثَّقة.
  PERFORM public.create_orphan_intake(jsonb_build_object(
    'org_id', 'b2d10000-0000-4000-8000-000000000001', 'orphan_id', _id,
    'display_name', 'نوح . س', 'gender', 'male', 'country', 'AL', 'region', 'إشقودرة',
    'needs', jsonb_build_array(jsonb_build_object('category', 'education', 'title', 'رسوم',
                                                  'monthly_amount', 40)),
    'documents', jsonb_build_array(jsonb_build_object('kind', 'death_certificate',
                   'storage_path', _id::text || '/death-2.pdf', 'file_name', 'death-clear.pdf'))));
  RESET ROLE;

  SELECT string_agg(storage_path, ',' ORDER BY storage_path) INTO _kinds
    FROM public.orphan_documents WHERE orphan_id = _id;
  IF _kinds IS DISTINCT FROM _id::text || '/death-2.pdf,' || _id::text || '/guardian.pdf' THEN
    RAISE EXCEPTION 'FAIL — الاستبدال لم يُبقِ الموثَّق ويحذف القديم: %', _kinds;
  END IF;
  IF (SELECT status FROM public.orphans WHERE id = _id) <> 'submitted' THEN
    RAISE EXCEPTION 'FAIL — المرفوض لم يُعَد تقديمه';
  END IF;
  RAISE NOTICE 'PASS — UX-04: المرفوض يُفتح بسببه ويُصحَّح — غير الموثَّق يُستبدل والموثَّق باقٍ — ثم يُعاد';
END $$;

-- ٥) المُقدَّم يُقرأ ولا يُعدَّل.
DO $$
DECLARE _id UUID := (SELECT v FROM b2d_ctx WHERE k = 'draft'); _g JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2d00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _g := public.get_orphan_intake(_id);
  IF (_g->>'editable')::boolean OR _g->>'status' <> 'submitted' THEN
    RAISE EXCEPTION 'FAIL — المُقدَّم يُعرض قابلاً للتعديل: %', _g->>'status';
  END IF;
  BEGIN
    PERFORM public.save_orphan_draft(jsonb_build_object(
      'org_id', 'b2d10000-0000-4000-8000-000000000001', 'orphan_id', _id, 'display_name', 'تعديل'));
    RAISE EXCEPTION 'FAIL — عُدِّل ملفٌّ قيد المراجعة';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.prune_intake_documents(_id, 'b2d10000-0000-4000-8000-000000000001', ARRAY[]::text[]);
    RAISE EXCEPTION 'FAIL — حُذفت وثائق ملفٍّ قيد المراجعة';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — UX-04: المُقدَّم وقيد المراجعة يُقرآن للجهة ولا يُعدَّلان';
END $$;

ROLLBACK;
