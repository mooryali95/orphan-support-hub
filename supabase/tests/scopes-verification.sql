-- =====================================================================
-- نطاقات الاطّلاع — إثبات
-- ---------------------------------------------------------------------
-- الخطر هنا **نطاقٌ يُمنح ولا يحكم**: تظنّ الإدارة أنها ضيّقت وهي لم
-- تضيّق. فالفحص يقيس ما يُرى فعلاً لا ما كُتب في الصفّ.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'sc-admin@example.test', '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000002', 'sc-org@example.test', '{"role":"care_org"}'::jsonb),
  ('b1000000-0000-4000-8000-000000000003', 'sc-narrow@example.test', '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000004', 'sc-wide@example.test', '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000005', 'sc-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('b1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b2000000-0000-4000-8000-00000000000a',
        'b1000000-0000-4000-8000-000000000002', 'جهة النطاقات', 'approved');

INSERT INTO public.orphans
  (id, code, display_name, org_id, created_by, country, city, story,
   photo_url, photo_consent, monthly_need, status, approved_at)
VALUES ('b3000000-0000-4000-8000-00000000000b', 'SC-1', 'طفل النطاقات',
        'b2000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-000000000002',
        'السعودية', 'الرياض', 'قصّة الطفل.', 'media/sc-1.jpg', 'face_hidden',
        200, 'approved', now());

INSERT INTO public.orphan_profile_sections (orphan_id, section, data, updated_role)
VALUES ('b3000000-0000-4000-8000-00000000000b', 'education',
        '{"grade":"الخامس"}'::jsonb, 'care_org'),
       ('b3000000-0000-4000-8000-00000000000b', 'health',
        '{"chronic_conditions":"ربو خفيف"}'::jsonb, 'supervisor');


-- ---------------------------------------------------------------------
-- السجلّ: ديناميّ لكنه مضبوط
-- ---------------------------------------------------------------------
DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.access_scopes WHERE active;
  IF _n < 5 THEN
    RAISE EXCEPTION 'FAIL — سجلّ النطاقات شبه فارغ (%)', _n;
  END IF;

  -- نطاقٌ جديد يُضاف بصفّ لا بهجرة: هذا معنى «يُبنى حسب ما هو موجود».
  INSERT INTO public.access_scopes (key, label, description, sensitivity, sort_order)
  VALUES ('activities', 'الأنشطة', 'أنشطةٌ يستوردها الرواد.', 1, 100);

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  IF NOT ((public.access_scope_catalog()->'scopes')::text LIKE '%activities%') THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — النطاق المُضاف لا يظهر في الكتالوج';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — النطاقات سجلٌّ يُضاف إليه بصفّ لا بهجرة';
END $$;

-- وحزمةٌ تحمل نطاقاً لا وجود له تُرفض.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.access_scope_packages (key, label, description, scopes)
    VALUES ('bad', 'حزمة فاسدة', 'تحمل نطاقاً مجهولاً', ARRAY['journey', 'لا-وجود-له']);
    RAISE EXCEPTION 'FAIL — قُبلت حزمةٌ بنطاقٍ غير معرّف';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — الحزمة لا تتجاوز السجلّ';
  END;
END $$;

-- ومنحٌ بنطاقٍ مجهول أو معطَّل يُرفض.
DO $$
DECLARE _req UUID;
BEGIN
  INSERT INTO public.orphan_access_requests (orphan_id, requester_id, reason)
  VALUES ('b3000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000005',
          'طلبٌ لفحص النطاق المجهول وما يترتّب عليه.')
  RETURNING id INTO _req;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.decide_orphan_access(_req, 'approved', ARRAY['نطاق-مخترع']);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — مُنح نطاقٌ غير معرّف فصار صلاحيةً صامتة';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — المنح لا يتجاوز السجلّ';
  END;
END $$;

-- وقبولٌ بلا نطاقٍ واحد مرفوض: رفضٌ يلبس ثوب القبول.
DO $$
DECLARE _req UUID;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000005';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.decide_orphan_access(_req, 'approved', ARRAY[]::TEXT[]);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبل الطلب ولم يُمنح شيء';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — القبول بلا نطاقٍ مرفوض';
  END;
END $$;


/* والقيد يُفحص **بالكتابة المباشرة** لا بالدالّة: الدالّة تمنع أيضاً،
   فالفحص عبرها يقيس حارسها لا القيد — وهو ما كشفه الإبطال. والكتابة
   المباشرة طريقٌ قائم في هذا النظام (`service_role` تستعمله). */
DO $$
DECLARE _req UUID;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000005';
  BEGIN
    UPDATE public.orphan_access_requests
       SET status = 'approved', decided_by = 'b1000000-0000-4000-8000-000000000001',
           decided_at = now(), expires_at = now() + interval '30 days',
           granted_scopes = ARRAY[]::TEXT[]
     WHERE id = _req;
    RAISE EXCEPTION 'FAIL — قبلت القاعدة إذناً بلا نطاقٍ واحد';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — القيد يمنع القبول الفارغ ولو كُتب مباشرةً';
  END;
END $$;


-- ---------------------------------------------------------------------
-- النطاق يحكم فعلاً — وهذا لبّ الفحص
-- ---------------------------------------------------------------------
DO $$
DECLARE _narrow UUID; _wide UUID;
BEGIN
  INSERT INTO public.orphan_access_requests (orphan_id, requester_id, reason)
  VALUES ('b3000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000003',
          'أتابع مسار الطفل في البرنامج دون تفاصيل شخصية.')
  RETURNING id INTO _narrow;

  INSERT INTO public.orphan_access_requests (orphan_id, requester_id, reason)
  VALUES ('b3000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000004',
          'شراكة مؤسّسية تستدعي الاطّلاع الكامل على الملفّ.')
  RETURNING id INTO _wide;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.decide_orphan_access(_narrow, 'approved',
    ARRAY['journey', 'progress'], 'متابِع', 90);
  PERFORM public.decide_orphan_access(_wide, 'approved',
    ARRAY['identity', 'journey', 'progress', 'profile_deep'], 'شريك', 90);
  RESET ROLE;
  RAISE NOTICE 'PASS — الإدارة تمنح لكلٍّ ما تختاره له';
END $$;

-- الضيّق: لا اسم ولا صورة.
DO $$
DECLARE _v JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _v := public.orphan_view('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF NOT (_v ? 'detail') THEN
    RAISE EXCEPTION 'FAIL — القبول لم يفتح التفصيل الأساسي';
  END IF;
  IF _v->'detail'->>'real_name' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — ظهر الاسم الحقيقي بلا نطاق identity';
  END IF;
  IF _v->'detail'->>'photo_url' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — ظهرت الصورة بلا نطاق identity';
  END IF;
  IF NOT ((_v->'scopes')::text LIKE '%journey%') THEN
    RAISE EXCEPTION 'FAIL — النطاقات لا تُعاد للواجهة (%)', _v->'scopes';
  END IF;
  RAISE NOTICE 'PASS — الضيّق يرى التفصيل ولا يرى الاسم ولا الصورة';
END $$;

-- والواسع: اسمٌ وصورةٌ لأنّ له النطاق.
DO $$
DECLARE _v JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _v := public.orphan_view('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF _v->'detail'->>'real_name' IS NULL THEN
    RAISE EXCEPTION 'FAIL — حُجب الاسم عمّن مُنح نطاقه';
  END IF;
  IF _v->'detail'->>'photo_url' IS NULL THEN
    RAISE EXCEPTION 'FAIL — حُجبت صورةٌ مأذونٌ بها عمّن مُنح نطاقها';
  END IF;
  RAISE NOTICE 'PASS — الواسع يرى ما مُنح له';
END $$;

-- والملفّ العميق يتبع نطاقه لا الإذن المجرّد.
DO $$
DECLARE _n JSONB; _w JSONB; _secs TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _n := public.orphan_profile('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _w := public.orphan_profile('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  SELECT string_agg(s->>'section', ',' ORDER BY s->>'section') INTO _secs
    FROM jsonb_array_elements(_n->'sections') s;
  IF _secs IS DISTINCT FROM 'education' THEN
    RAISE EXCEPTION 'FAIL — الضيّق رأى أقساماً عميقة (%)', _secs;
  END IF;
  IF _n::text LIKE '%ربو%' THEN
    RAISE EXCEPTION 'FAIL — تسرّب مضمونٌ صحّيّ إلى الضيّق';
  END IF;

  SELECT string_agg(s->>'section', ',' ORDER BY s->>'section') INTO _secs
    FROM jsonb_array_elements(_w->'sections') s;
  IF _secs IS DISTINCT FROM 'education,health' THEN
    RAISE EXCEPTION 'FAIL — الواسع حُجب عنه ما مُنح له (%)', _secs;
  END IF;
  RAISE NOTICE 'PASS — الملفّ العميق يتبع نطاقه لا الإذن المجرّد';
END $$;

-- والدائرة تملك النطاقات كلَّها ضمناً.
DO $$
DECLARE _s TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _s := public.my_orphan_scopes('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF NOT ('identity' = ANY(_s)) OR NOT ('profile_deep' = ANY(_s)) THEN
    RAISE EXCEPTION 'FAIL — الدائرة لا تملك النطاقات ضمناً (%)', _s;
  END IF;
  RAISE NOTICE 'PASS — صلةُ الدائرة هي الإذن';
END $$;

-- والغريب لا يملك شيئاً.
DO $$
DECLARE _s TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _s := public.my_orphan_scopes('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF cardinality(_s) <> 0 THEN
    RAISE EXCEPTION 'FAIL — الغريب يملك نطاقات (%)', _s;
  END IF;
  RAISE NOTICE 'PASS — الغريب بلا نطاق';
END $$;


-- ---------------------------------------------------------------------
-- التعديل والسحب والانقضاء
-- ---------------------------------------------------------------------
DO $$
DECLARE _req UUID; _v JSONB;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000004' AND status = 'approved';

  -- تضييقٌ بعد المنح: سحبُ الإذن كلِّه لتضييق نطاقٍ عقوبةٌ لا تصحيح.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.amend_orphan_access(_req, ARRAY['journey'], 'انتهت الشراكة الكاملة');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _v := public.orphan_view('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF _v->'detail'->>'real_name' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — التضييق لم يُغلق الاسم';
  END IF;
  IF NOT (_v ? 'detail') THEN
    RAISE EXCEPTION 'FAIL — التضييق سحب الإذن كلَّه';
  END IF;
  RAISE NOTICE 'PASS — التعديل يضيّق ولا يسحب';
END $$;

-- والتضييق إلى لا شيء مرفوض: ذاك سحب.
DO $$
DECLARE _req UUID;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000004' AND status = 'approved';
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.amend_orphan_access(_req, ARRAY[]::TEXT[]);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبل تضييقٌ إلى لا شيء بدل السحب';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — التضييق إلى لا شيء يُحال إلى السحب';
  END;
END $$;

-- والانقضاء يُسقط النطاقات كلَّها.
DO $$
DECLARE _s TEXT[];
BEGIN
  UPDATE public.orphan_access_requests SET expires_at = now() - interval '1 day'
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000003';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _s := public.my_orphan_scopes('b3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF cardinality(_s) <> 0 THEN
    RAISE EXCEPTION 'FAIL — بقيت نطاقات بعد الانقضاء (%)', _s;
  END IF;
  RAISE NOTICE 'PASS — الانقضاء يُسقط النطاقات كلَّها';
END $$;

-- والأثر يحمل ما فُتح: «أُذن له» وحدها لا تكفي للمراجعة بعد سنة.
DO $$
DECLARE _meta JSONB;
BEGIN
  SELECT meta INTO _meta FROM public.audit_log
   WHERE action = 'orphan.access_approved'
     AND entity_id = 'b3000000-0000-4000-8000-00000000000b'
   ORDER BY created_at DESC LIMIT 1;
  IF _meta IS NULL OR NOT (_meta ? 'scopes') THEN
    RAISE EXCEPTION 'FAIL — الأثر لا يحمل النطاقات الممنوحة (%)', _meta;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'orphan.access_amended'
                    AND entity_id = 'b3000000-0000-4000-8000-00000000000b') THEN
    RAISE EXCEPTION 'FAIL — التعديل لم يترك أثراً';
  END IF;
  RAISE NOTICE 'PASS — الأثر يحمل ما فُتح وما عُدّل';
END $$;


-- ---------------------------------------------------------------------
-- المحادثة — مستند القرار
-- ---------------------------------------------------------------------
DO $$
DECLARE _req UUID; _t JSONB; _n INTEGER;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000003';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  PERFORM public.post_access_message(_req, 'أعمل في مؤسسة خيرية وأرغب بمتابعة أثر الدعم.');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.post_access_message(_req, 'أرسل لنا خطاب المؤسسة من فضلك.');
  _t := public.access_thread(_req);
  RESET ROLE;

  IF jsonb_array_length(_t) <> 2 THEN
    RAISE EXCEPTION 'FAIL — المحادثة % رسالة لا اثنتين', jsonb_array_length(_t);
  END IF;
  IF (_t->1->>'from_admin')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — صفة الكاتب لا تُميَّز';
  END IF;
  RAISE NOTICE 'PASS — المحادثة تجري بين الإدارة وصاحب الطلب وتُحفظ';
END $$;

-- ولا يكتب فيها ولا يقرؤها غريب.
DO $$
DECLARE _req UUID; _n INTEGER;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'b1000000-0000-4000-8000-000000000003';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  BEGIN
    PERFORM public.post_access_message(_req, 'أقحم نفسي في محادثة غيري.');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — كتب غريبٌ في محادثة غيره';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.access_request_messages WHERE request_id = _req;
  RESET ROLE;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — قرأ غريبٌ محادثة غيره (%)', _n;
  END IF;
  RAISE NOTICE 'PASS — المحادثة لطرفيها وحدهما';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص النطاقات اجتازت ──'; END $$;

ROLLBACK;
