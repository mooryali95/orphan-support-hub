-- =====================================================================
-- التكامل مع المنصّات الأخرى — إثبات
-- ---------------------------------------------------------------------
-- بابُ التكامل بابٌ إلى قاعدةٍ فيها ملفّات أطفال. وثلاثة أشياء تُفحص
-- هنا لأن سكوتها يفتحه على مصراعيه:
--   النشر    — هل يستطيع شريكٌ أن يَنشر ملفّاً لم تره إدارتنا؟
--   الحاجب   — هل يلتفّ المفتاح على ما حجبناه عن الزائر؟
--   الحدود   — هل يكتب شريكٌ في ملفّات شريكٍ آخر؟
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'i-admin@example.test', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', 'i-org@example.test', '{"role":"care_org"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000003', 'i-other@example.test', '{"role":"care_org"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000004', 'i-pending@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('f1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status) VALUES
  ('f2000000-0000-4000-8000-00000000000a',
   'f1000000-0000-4000-8000-000000000002', 'جهة الشريك الأول', 'approved'),
  ('f2000000-0000-4000-8000-00000000000b',
   'f1000000-0000-4000-8000-000000000003', 'جهة الشريك الثاني', 'approved'),
  ('f2000000-0000-4000-8000-00000000000c',
   'f1000000-0000-4000-8000-000000000004', 'جهة معلّقة', 'pending');

INSERT INTO public.api_clients (id, name, client_key, secret_hash, org_id, scopes) VALUES
  ('f3000000-0000-4000-8000-00000000000d', 'الشريك الأول', 'ioso_live_one', 'x',
   'f2000000-0000-4000-8000-00000000000a', ARRAY['orphans:read','orphans:import']),
  ('f3000000-0000-4000-8000-00000000000e', 'الشريك الثاني', 'ioso_live_two', 'x',
   'f2000000-0000-4000-8000-00000000000b', ARRAY['orphans:read','orphans:import']),
  /* قارئٌ **بجهةٍ معتمدة**: بلا جهةٍ كان شرط الجهة يلتقطه فيمرّ فحصُ
     النطاق بلا أن يقيس النطاق — وهو ما كشفه الإبطال. */
  ('f3000000-0000-4000-8000-00000000000f', 'قارئ فقط', 'ioso_live_read', 'x',
   'f2000000-0000-4000-8000-00000000000a', ARRAY['orphans:read']),
  ('f3000000-0000-4000-8000-000000000010', 'شريك جهة معلّقة', 'ioso_live_pend', 'x',
   'f2000000-0000-4000-8000-00000000000c', ARRAY['orphans:import']);


-- ---------------------------------------------------------------------
-- القيود: نطاقٌ مجهول، واستيرادٌ بلا جهة
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.api_clients (name, client_key, secret_hash, org_id, scopes)
    VALUES ('نطاق مجهول', 'ioso_bad_scope', 'x',
            'f2000000-0000-4000-8000-00000000000a', ARRAY['orphans:delete']);
    RAISE EXCEPTION 'FAIL — قُبل نطاقٌ غير معروف';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — النطاق المجهول مرفوض، فلا تصير الكتابة الخاطئة صلاحيةً صامتة';
  END;

  BEGIN
    INSERT INTO public.api_clients (name, client_key, secret_hash, org_id, scopes)
    VALUES ('مستورد بلا جهة', 'ioso_no_org', 'x', NULL, ARRAY['orphans:import']);
    RAISE EXCEPTION 'FAIL — قُبل مستوردٌ بلا جهة مسؤولة';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — الاستيراد يحتاج جهةً مسؤولة';
  END;
END $$;


-- ---------------------------------------------------------------------
-- المستورَد لا يُنشَر — ولو ادّعت الحمولة
-- ---------------------------------------------------------------------
DO $$
DECLARE _r JSONB; _st TEXT;
BEGIN
  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000d', jsonb_build_object(
    'external_ref', 'EXT-1', 'display_name', 'مستورد . أ', 'gender', 'male',
    'birth_date', (CURRENT_DATE - interval '10 years')::date::text,
    'country', 'الأردن', 'region', 'إربد', 'city', 'الرمثا',
    'story', 'قصّة مرسلة من المنصّة الشريكة.', 'education_stage', 'ابتدائي',
    'monthly_need', '150',
    -- ادّعاءٌ صريح بالاعتماد والتمويل:
    'status', 'approved', 'funded_monthly', '150'));

  IF (_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — رُفض استيرادٌ سليم (%)', _r;
  END IF;
  IF _r->>'status' IS DISTINCT FROM 'under_review' THEN
    RAISE EXCEPTION 'FAIL — دخل المستورَد بحالة % لا under_review', _r->>'status';
  END IF;

  SELECT status::text INTO _st FROM public.orphans WHERE id = (_r->>'id')::uuid;
  IF _st IS DISTINCT FROM 'under_review' THEN
    RAISE EXCEPTION 'FAIL — الحالة في القاعدة % لا under_review', _st;
  END IF;
  IF (SELECT funded_monthly FROM public.orphans WHERE id = (_r->>'id')::uuid) <> 0 THEN
    RAISE EXCEPTION 'FAIL — دخل المستورَد بتمويلٍ مُدّعى';
  END IF;
  RAISE NOTICE 'PASS — المستورَد يقف عند المراجعة مهما ادّعت الحمولة';
END $$;

-- والحارس لا يُعفي حتى الكتابة المباشرة بصلاحية الخدمة.
DO $$
DECLARE _st TEXT;
BEGIN
  INSERT INTO public.orphans
    (code, display_name, org_id, external_source, external_ref,
     monthly_need, funded_monthly, status, approved_at)
  VALUES (public.next_orphan_code(), 'كتابة مباشرة',
          'f2000000-0000-4000-8000-00000000000a', 'ioso_live_one', 'EXT-DIRECT',
          100, 100, 'approved', now());

  SELECT status::text INTO _st FROM public.orphans WHERE external_ref = 'EXT-DIRECT';
  IF _st IS DISTINCT FROM 'under_review' THEN
    RAISE EXCEPTION 'FAIL — كتابةٌ مباشرة نشرت ملفّاً مستورَداً (%)', _st;
  END IF;
  IF (SELECT approved_at FROM public.orphans WHERE external_ref = 'EXT-DIRECT') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — بقي ختم الاعتماد على ملفّ مستورَد';
  END IF;
  RAISE NOTICE 'PASS — الحارس يسبق صلاحية الخدمة، فلا يُنشَر مستورَدٌ بأيّ طريق';
END $$;


-- والحقول التي تُبنى عليها الفلترة إلزامية: فلترةٌ تكذب أسوأ من ناقصة.
DO $$
DECLARE _r JSONB;
BEGIN
  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000d',
        jsonb_build_object('external_ref', 'EXT-NOCOUNTRY', 'display_name', 'بلا بلد'));
  IF _r->>'code' IS DISTINCT FROM 'country_required' THEN
    RAISE EXCEPTION 'FAIL — قُبل استيرادٌ بلا بلد فيقع تحت الافتراضي (%)', _r;
  END IF;

  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000d',
        jsonb_build_object('external_ref', 'EXT-NONAME', 'country', 'مصر'));
  IF _r->>'code' IS DISTINCT FROM 'display_name_required' THEN
    RAISE EXCEPTION 'FAIL — قُبل استيرادٌ بلا اسم (%)', _r;
  END IF;
  RAISE NOTICE 'PASS — الاسم والبلد إلزاميان عند الإنشاء';
END $$;


-- ---------------------------------------------------------------------
-- الحدود بين الشركاء
-- ---------------------------------------------------------------------
DO $$
DECLARE _r JSONB; _n INTEGER; _org UUID;
BEGIN
  -- نفس المرجع الخارجي من شريكٍ آخر: ملفٌّ مستقلّ لا كتابةٌ فوق الأوّل.
  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000e', jsonb_build_object(
    'external_ref', 'EXT-1', 'display_name', 'مستورد . ب', 'country', 'مصر',
    'monthly_need', '90',
    -- وادّعاءٌ بجهةٍ ليست جهته:
    'org_id', 'f2000000-0000-4000-8000-00000000000a'));

  IF _r->>'action' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'FAIL — كتب الشريك الثاني فوق ملفّ الأوّل (%)', _r;
  END IF;

  SELECT org_id INTO _org FROM public.orphans WHERE id = (_r->>'id')::uuid;
  IF _org IS DISTINCT FROM 'f2000000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'FAIL — الجهة أُخذت من الحمولة لا من العميل (%)', _org;
  END IF;

  SELECT count(*) INTO _n FROM public.orphans WHERE external_ref = 'EXT-1';
  IF _n <> 2 THEN
    RAISE EXCEPTION 'FAIL — المرجع الخارجي ليس مقصوراً على شريكه (% ملفّاً)', _n;
  END IF;
  RAISE NOTICE 'PASS — المرجع الخارجي مقصورٌ على شريكه، والجهة من العميل لا من الحمولة';
END $$;

-- وجهةٌ غير معتمدة لا يُستورد لها.
DO $$
DECLARE _r JSONB;
BEGIN
  _r := public.import_orphan_record('f3000000-0000-4000-8000-000000000010',
        jsonb_build_object('external_ref', 'EXT-P', 'display_name', 'لن يدخل',
                           'country', 'مصر'));
  IF (_r->>'ok')::boolean IS NOT FALSE OR _r->>'code' IS DISTINCT FROM 'org_not_approved' THEN
    RAISE EXCEPTION 'FAIL — استُورد لجهةٍ غير معتمدة (%)', _r;
  END IF;
  RAISE NOTICE 'PASS — لا استيراد لجهةٍ غير معتمدة';
END $$;

-- وقارئٌ بلا نطاق استيراد يُرفض، والمبطَل كذلك.
DO $$
DECLARE _r JSONB; _org UUID;
BEGIN
  SELECT org_id INTO _org FROM public.api_clients
   WHERE id = 'f3000000-0000-4000-8000-00000000000f';
  IF _org IS NULL THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس النطاق: العميل بلا جهة فيلتقطه شرطُ الجهة';
  END IF;

  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000f',
        jsonb_build_object('external_ref', 'EXT-R', 'display_name', 'لن يدخل',
                           'country', 'مصر'));
  IF _r->>'code' IS DISTINCT FROM 'client_not_permitted' THEN
    RAISE EXCEPTION 'FAIL — استورد عميلٌ بلا نطاق استيراد (%)', _r;
  END IF;

  UPDATE public.api_clients SET active = false, revoked_at = now()
   WHERE id = 'f3000000-0000-4000-8000-00000000000e';
  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000e',
        jsonb_build_object('external_ref', 'EXT-X', 'display_name', 'لن يدخل',
                           'country', 'مصر'));
  IF _r->>'code' IS DISTINCT FROM 'client_not_permitted' THEN
    RAISE EXCEPTION 'FAIL — استورد عميلٌ مبطَل (%)', _r;
  END IF;

  _r := public.api_orphan_cards('f3000000-0000-4000-8000-00000000000e');
  IF (_r->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL — قرأ عميلٌ مبطَل (%)', _r;
  END IF;
  RAISE NOTICE 'PASS — بلا نطاقٍ لا استيراد، والإبطال يُغلق البابين';
END $$;


-- ---------------------------------------------------------------------
-- التحديث: يُقبل الوصف، ويُردّ احتياج المعتمَد مع بيان سببه
-- ---------------------------------------------------------------------
DO $$
DECLARE _r JSONB; _need NUMERIC; _story TEXT; _id UUID;
BEGIN
  SELECT id INTO _id FROM public.orphans
   WHERE external_source = 'ioso_live_one' AND external_ref = 'EXT-1';

  -- وهو تحت المراجعة: الاحتياج يتغيّر بلا اعتراض.
  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000d',
        jsonb_build_object('external_ref', 'EXT-1', 'monthly_need', '200'));
  SELECT monthly_need INTO _need FROM public.orphans WHERE id = _id;
  IF _need <> 200 THEN
    RAISE EXCEPTION 'FAIL — لم يتغيّر احتياج ملفٍّ تحت المراجعة (%)', _need;
  END IF;
  IF jsonb_array_length(_r->'ignored_fields') <> 0 THEN
    RAISE EXCEPTION 'FAIL — رُدّ حقلٌ بلا سبب (%)', _r;
  END IF;

  -- ثمّ يُعتمد، فيصير احتياجه عهداً للكافل.
  UPDATE public.orphans SET status = 'approved', approved_at = now() WHERE id = _id;

  _r := public.import_orphan_record('f3000000-0000-4000-8000-00000000000d',
        jsonb_build_object('external_ref', 'EXT-1', 'monthly_need', '999',
                           'story', 'قصّة محدَّثة من الشريك.'));

  SELECT monthly_need, story INTO _need, _story FROM public.orphans WHERE id = _id;
  IF _need <> 200 THEN
    RAISE EXCEPTION 'FAIL — حرّك الاستيرادُ احتياج ملفٍّ معتمَد (%)', _need;
  END IF;
  IF _story IS DISTINCT FROM 'قصّة محدَّثة من الشريك.' THEN
    RAISE EXCEPTION 'FAIL — رُدّ التعديل الوصفيّ كذلك';
  END IF;
  IF NOT (_r->'ignored_fields' ? 'monthly_need') THEN
    RAISE EXCEPTION 'FAIL — رُدّ الحقل صامتاً بلا بيان (%)', _r;
  END IF;
  IF (SELECT status::text FROM public.orphans WHERE id = _id) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — أنزل الاستيرادُ ملفّاً معتمَداً عن اعتماده';
  END IF;
  RAISE NOTICE 'PASS — الوصف يُقبل، والاحتياج المعتمَد يُردّ مع بيان سببه';
END $$;


-- ---------------------------------------------------------------------
-- المفتاح لا يلتفّ على حاجب الأطفال
-- ---------------------------------------------------------------------
DO $$
DECLARE _r JSONB; _txt TEXT; _row JSONB;
BEGIN
  _r := public.api_orphan_cards('f3000000-0000-4000-8000-00000000000d');
  IF (_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — رُفضت قراءةٌ مأذونة (%)', _r;
  END IF;

  _row := _r->'rows'->0;
  IF _row IS NULL THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: لا صفوف';
  END IF;
  IF _row ? 'story' OR _row ? 'city' OR _row ? 'birth_date' OR _row ? 'photo_url' THEN
    RAISE EXCEPTION 'FAIL — المفتاح يُعيد حقلاً محجوباً: %', _row;
  END IF;
  IF NOT (_row ? 'age_band') OR NOT (_row ? 'country') THEN
    RAISE EXCEPTION 'FAIL — البطاقة ناقصة (%)', _row;
  END IF;

  _txt := _r::text;
  IF _txt LIKE '%قصّة%' THEN
    RAISE EXCEPTION 'FAIL — تسرّبت قصّةُ طفلٍ إلى ردّ الـAPI';
  END IF;
  RAISE NOTICE 'PASS — مفتاح الشريك يرى البطاقة لا الملفّ';
END $$;

-- والفلترة تعمل من الـAPI كما تعمل من الدليل.
DO $$
DECLARE _r JSONB; _n INTEGER;
BEGIN
  _r := public.api_orphan_cards('f3000000-0000-4000-8000-00000000000d',
                                _country => 'لا-بلد-بهذا-الاسم');
  _n := jsonb_array_length(_r->'rows');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — الفلترة بالبلد لا تعمل من الـAPI (% صفّاً)', _n;
  END IF;
  RAISE NOTICE 'PASS — فلترة الـAPI هي فلترة الدليل نفسها';
END $$;


-- ---------------------------------------------------------------------
-- التكرار، والإبطال، والقائمة
-- ---------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.api_import_jobs (client_id, source, idempotency_key, request_digest)
  VALUES ('f3000000-0000-4000-8000-00000000000d', 'ioso_live_one', 'idem-1', 'digest-1');
  BEGIN
    INSERT INTO public.api_import_jobs (client_id, source, idempotency_key, request_digest)
    VALUES ('f3000000-0000-4000-8000-00000000000d', 'ioso_live_one', 'idem-1', 'digest-1');
    RAISE EXCEPTION 'FAIL — قُبل طلبٌ مكرّر بنفس مفتاح التكرار';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS — مفتاح التكرار يمنع إنشاء ملفّاتٍ مكرّرة لأطفالٍ حقيقيين';
  END;
END $$;

DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.admin_api_clients();
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قرأت جهةُ رعاية مفاتيح التكامل';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.revoke_api_client('f3000000-0000-4000-8000-00000000000d');
  RESET ROLE;

  IF (SELECT active FROM public.api_clients
       WHERE id = 'f3000000-0000-4000-8000-00000000000d') THEN
    RAISE EXCEPTION 'FAIL — بقي المفتاح فاعلاً بعد الإبطال';
  END IF;

  SELECT count(*) INTO _n FROM public.audit_log
   WHERE action = 'api_client.revoked'
     AND entity_id = 'f3000000-0000-4000-8000-00000000000d';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — إبطال مفتاحٍ بلا أثر (% سطراً)', _n;
  END IF;
  RAISE NOTICE 'PASS — المفاتيح للإدارة، والإبطال فوريٌّ ويترك أثراً';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص التكامل اجتازت ──'; END $$;

ROLLBACK;
