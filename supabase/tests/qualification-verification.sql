-- =====================================================================
-- بناء الأهلية — إثبات
-- ---------------------------------------------------------------------
-- ثلاثة أشياء تُفحص هنا لأن سكوتها أخطر من صراخها:
--   الإذن — إدخال قاصرٍ في برنامج بغير ولاية.
--   المقياس — خريطةٌ مجموعها ليس مئة، أو عتبةٌ تُتجاوَز فيُقال «أهل» لمن
--             لم يستقرّ بناؤه.
--   الصلاحية — من يكتب حكماً على طفل.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'q-admin@example.test', '{}'::jsonb),
  ('c1000000-0000-4000-8000-000000000002', 'q-org@example.test', '{"role":"care_org"}'::jsonb),
  ('c1000000-0000-4000-8000-000000000003', 'q-supervisor@example.test', '{}'::jsonb),
  ('c1000000-0000-4000-8000-000000000004', 'q-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('c1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('c2000000-0000-4000-8000-00000000000a',
        'c1000000-0000-4000-8000-000000000002', 'جهة الأهلية', 'approved');

INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status, approved_at)
VALUES ('c3000000-0000-4000-8000-00000000000b', 'AHL-1', 'يتيم الأهلية',
        'c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000002',
        200, 'approved', now());

INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'c4000000-0000-4000-8000-00000000000c',
       'c3000000-0000-4000-8000-00000000000b', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';


-- ---------------------------------------------------------------------
-- البرنامج التأهيلي لا يكون دعوى: القيد يمنع الادّعاء
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.programs (slug, title, summary, category, monthly_price, kind)
    VALUES ('fake-qualification', 'تأهيل مدّعى', 'بلا مفهوم ولا سمة',
            'rehabilitation', 50, 'qualification');
    RAISE EXCEPTION 'FAIL — قُبل برنامج «تأهيلي» بلا مفهوم ولا سمة ولا عمليات';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — لا يُسمّى البرنامج تأهيلاً بلا مفهوم وسمة ومدخلات وعمليات';
  END;
END $$;

DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.programs p
    JOIN public.qualification_concepts c ON c.id = p.concept_id
    JOIN public.qualification_traits t ON t.id = p.target_trait_id
   WHERE p.kind = 'qualification'
     AND cardinality(p.inputs) > 0
     AND cardinality(p.processes) > 0
     AND cardinality(p.deliverables) > 0;
  IF _n = 0 THEN
    RAISE EXCEPTION 'FAIL — لا برنامج تأهيلي مكتمل الأركان في الكتالوج';
  END IF;
  RAISE NOTICE 'PASS — البرنامج التأهيلي يحمل مدخلاته وعملياته ومخرجاته ومفهومه وسمته';
END $$;

-- والمفهوم يشير إلى سمة لا العكس: «المفهوم وسيلة والسمة غاية».
DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.qualification_concepts
   WHERE trait_id IS NULL OR cardinality(actions) = 0 OR cardinality(system_support) = 0;
  IF _n > 0 THEN
    RAISE EXCEPTION 'FAIL — مفهومٌ بلا سمة أو بلا أفعال أو بلا نظام يدعمه';
  END IF;
  RAISE NOTICE 'PASS — كل مفهوم مُحلَّل بأداة التشغيل: مقصد وأصل وسمة وأفعال ونظام';
END $$;


-- ---------------------------------------------------------------------
-- الإذن: لا تقدّم في برنامجٍ على قاصرٍ بغير ولاية
-- ---------------------------------------------------------------------
-- الشرطان (إذنٌ ومشرف) يُفحصان **معزولَين**. وأول صياغةٍ لهذا الفحص لم
-- تعزلهما: جُرِّب التقدّم بلا إذنٍ ولا مشرف، فمرّ الفحص وهو لا يقيس شيئاً
-- — إذ نزعُ شرط الإذن وحده كان يبقيه ناجحاً لأن شرط المشرف يلتقطه.
-- فيُعيَّن المشرف أولاً ليبقى الإذن وحده هو المتغيّر.

INSERT INTO public.enrollment_roles (enrollment_id, role, person_id)
VALUES ('c4000000-0000-4000-8000-00000000000c', 'supervisor',
        'c1000000-0000-4000-8000-000000000003');

DO $$
BEGIN
  BEGIN
    UPDATE public.program_enrollments SET stage = 'trait'
     WHERE id = 'c4000000-0000-4000-8000-00000000000c';
    RAISE EXCEPTION 'FAIL — تقدّم البرنامج بلا إذن الولي (والمشرف معيَّن)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — لا يتقدّم البرنامج بلا إذن موثَّق من الولي أو الوصي';
  END;
END $$;

-- ووليٌّ مسجَّل بلا توقيع وقتٍ ليس إذناً.
INSERT INTO public.enrollment_roles (enrollment_id, role, person_name)
VALUES ('c4000000-0000-4000-8000-00000000000c', 'guardian', 'ولي الأمر');

DO $$
BEGIN
  BEGIN
    UPDATE public.program_enrollments SET stage = 'trait'
     WHERE id = 'c4000000-0000-4000-8000-00000000000c';
    RAISE EXCEPTION 'FAIL — وليٌّ مسجَّل بلا إذن موثَّق عُدّ إذناً';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — تسجيل الولي وحده ليس إذناً: يلزم توثيق الإذن';
  END;
END $$;

UPDATE public.enrollment_roles SET consent_at = now(), consent_document = 'consent.pdf'
 WHERE enrollment_id = 'c4000000-0000-4000-8000-00000000000c' AND role = 'guardian';

DO $$
DECLARE _stage public.qualification_stage;
BEGIN
  UPDATE public.program_enrollments SET stage = 'trait'
   WHERE id = 'c4000000-0000-4000-8000-00000000000c';
  SELECT stage INTO _stage FROM public.program_enrollments
   WHERE id = 'c4000000-0000-4000-8000-00000000000c';
  IF _stage <> 'trait' THEN
    RAISE EXCEPTION 'FAIL — لم يتقدّم البرنامج رغم اكتمال شروطه (%)', _stage;
  END IF;
  RAISE NOTICE 'PASS — بالإذن والمشرف يتقدّم البرنامج';
END $$;

-- وشرط المشرف يُفحص معزولاً كذلك: التحاقٌ له إذنٌ ولا مشرف له.
DO $$
DECLARE _e UUID;
BEGIN
  INSERT INTO public.orphans (id, code, display_name, org_id, created_by,
                              monthly_need, status, approved_at)
  VALUES ('c3000000-0000-4000-8000-00000000000e', 'AHL-3', 'يتيم بلا مشرف',
          'c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000002',
          200, 'approved', now());

  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price)
  SELECT 'c3000000-0000-4000-8000-00000000000e', p.id, p.monthly_price
    FROM public.programs p WHERE p.slug = 'ahliyyah-foundational'
  RETURNING id INTO _e;

  INSERT INTO public.enrollment_roles
    (enrollment_id, role, person_name, consent_at, consent_document)
  VALUES (_e, 'guardian', 'ولي ثانٍ', now(), 'consent-2.pdf');

  BEGIN
    UPDATE public.program_enrollments SET stage = 'trait' WHERE id = _e;
    RAISE EXCEPTION 'FAIL — تقدّم البرنامج بلا مشرف (والإذن موثَّق)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — لا يتقدّم البرنامج بلا مشرف معتمَد';
  END;
END $$;

-- وإذنٌ بلا وثيقة دعوى: الجهة هي من توثّقه لا الوليّ، فتوقيعُ وقتٍ بلا
-- ما يُثبته إقرارٌ من الجهة على نفسها.
DO $$
BEGIN
  BEGIN
    UPDATE public.enrollment_roles SET consent_at = now(), consent_document = NULL
     WHERE enrollment_id = 'c4000000-0000-4000-8000-00000000000c' AND role = 'guardian';
    RAISE EXCEPTION 'FAIL — قُبل إذنٌ بلا وثيقة تُثبته';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — الإذن يحتاج وثيقةً تُثبته، لا توقيع وقتٍ وحده';
  END;
END $$;

-- و«إذن المشرف» لا معنى له: الإذن للولي والوصي وحدهما.
DO $$
BEGIN
  BEGIN
    UPDATE public.enrollment_roles SET consent_at = now(), consent_document = 'x.pdf'
     WHERE enrollment_id = 'c4000000-0000-4000-8000-00000000000c' AND role = 'supervisor';
    RAISE EXCEPTION 'FAIL — وُثّق إذنٌ من المشرف';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — الإذن للولي أو الوصي لا لدورٍ آخر';
  END;
END $$;

-- ومشرفان في وقت واحد مسؤوليةٌ ضائعة بينهما.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.enrollment_roles (enrollment_id, role, person_name)
    VALUES ('c4000000-0000-4000-8000-00000000000c', 'supervisor', 'مشرف ثانٍ');
    RAISE EXCEPTION 'FAIL — قُبل مشرفان حيّان لالتحاق واحد';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS — دورٌ حيّ واحد من كل نوع لكل التحاق';
  END;
END $$;


-- ---------------------------------------------------------------------
-- المقياس: مئةٌ لا غير
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
      '{"dirayah": 40, "himmah": 30}'::jsonb, 'baseline');
    RAISE EXCEPTION 'FAIL — قُبلت خريطة مجموعها 70';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — خريطة مجموعها ليس مئة تُرفض';
  END;

  BEGIN
    PERFORM public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
      '{"dirayah": 60, "ghost_trait": 40}'::jsonb, 'baseline');
    RAISE EXCEPTION 'FAIL — قُبلت سمة غير معروفة';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — سمة غير معروفة تُرفض';
  END;

  BEGIN
    PERFORM public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
      '{"dirayah": 110, "himmah": -10}'::jsonb, 'baseline');
    RAISE EXCEPTION 'FAIL — قُبلت درجة سالبة';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — الدرجات أعدادٌ غير سالبة';
  END;
END $$;


-- ---------------------------------------------------------------------
-- العتبة: الجوهرية ≥ 50، ودونها «تحت العتبة» لا رسوب
-- ---------------------------------------------------------------------
DO $$
DECLARE _r JSONB;
BEGIN
  -- مثال المنهجية الحرفي: الدراية 55، الحمية 23، المآلات 10، التدبير 7، العزم 5.
  _r := public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
        '{"dirayah":55,"himmah":23,"maalat":10,"tadbir":7,"azm":5}'::jsonb, 'baseline');

  IF _r->>'core_trait' <> 'الدراية' THEN
    RAISE EXCEPTION 'FAIL — الجوهرية ليست الدراية (%)', _r->>'core_trait';
  END IF;
  IF (_r->>'below_threshold')::boolean THEN
    RAISE EXCEPTION 'FAIL — 55 عُدّت تحت العتبة';
  END IF;
  IF _r->>'relational_trait' <> 'الحمية' THEN
    RAISE EXCEPTION 'FAIL — الاتصالية ليست الحمية (%)', _r->>'relational_trait';
  END IF;
  RAISE NOTICE 'PASS — الجوهرية هي الأعلى فوق العتبة، والاتصالية التي تليها';
END $$;

DO $$
DECLARE _r JSONB;
BEGIN
  -- أعلى سمة 35 (<50) → لا جوهرية معتمدة.
  _r := public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
        '{"dirayah":35,"himmah":30,"azm":20,"rushd":15}'::jsonb, 'progress');

  IF _r->>'core_trait' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — اعتُمدت جوهرية تحت العتبة (%)', _r->>'core_trait';
  END IF;
  IF NOT (_r->>'below_threshold')::boolean THEN
    RAISE EXCEPTION 'FAIL — لم تُوسم الحالة تحت العتبة';
  END IF;
  RAISE NOTICE 'PASS — أعلى سمة دون 50 لا تُعتمد جوهرية: البناء لم يستقرّ بعد';
END $$;

-- والعتبة عند 50 بالضبط لا فوقها: حدّ المنهجية «≥ 50».
DO $$
DECLARE _r JSONB;
BEGIN
  _r := public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
        '{"rushd":50,"himmah":30,"azm":20}'::jsonb, 'final');
  IF _r->>'core_trait' <> 'الرشد' OR (_r->>'below_threshold')::boolean THEN
    RAISE EXCEPTION 'FAIL — 50 بالضبط لم تُعتمد جوهرية (% / %)',
      _r->>'core_trait', _r->>'below_threshold';
  END IF;
  RAISE NOTICE 'PASS — العتبة شاملة: خمسون بالضبط تُعتمد';
END $$;

RESET ROLE;


-- ---------------------------------------------------------------------
-- الصلاحية: من يكتب حكماً على طفل
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  BEGIN
    PERFORM public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
      '{"dirayah":60,"himmah":40}'::jsonb, 'progress');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — غريبٌ كتب قياساً على طفل';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — القياس للمشرف المعتمَد أو الإدارة وحدهما';
  END;
END $$;

-- والجهة التي تدير الملف ليست المشرف: إدارة الملف لا تعني الحكم عليه.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.record_trait_assessment('c4000000-0000-4000-8000-00000000000c',
      '{"dirayah":60,"himmah":40}'::jsonb, 'progress');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — الجهة كتبت قياساً وهي ليست المشرف';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — إدارة الملف لا تُخوِّل الحكم عليه: القياس للمشرف';
  END;
END $$;

-- ولا تُكتب النتيجة مباشرةً على الجدول التفافاً على الحساب.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    INSERT INTO public.trait_assessments (enrollment_id, phase, scores, core_trait_id)
    VALUES ('c4000000-0000-4000-8000-00000000000c', 'progress',
            '{"dirayah":10,"himmah":90}'::jsonb,
            (SELECT id FROM public.qualification_traits WHERE slug = 'dirayah'));
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — كُتبت نتيجة مباشرةً بجوهرية مزوّرة';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — لا كتابة مباشرة: الجوهرية تُحسَب ولا تُرسَل';
  END;
END $$;


-- والدعوى الحقيقية ليست منعَ الكتابة بل أن **الحساب يغلب ما يُرسَل**:
-- حتى لو نفذت كتابةٌ من طريقٍ ما بجوهرية مزوّرة، يُصحّحها المُشغّل.
DO $$
DECLARE _id UUID; _stored TEXT; _wrong UUID;
BEGIN
  SELECT id INTO _wrong FROM public.qualification_traits WHERE slug = 'tadbir';

  -- كتابة مباشرة بصلاحية عليا، تحمل جوهريةً مخالفة للأرقام عمداً:
  -- الأرقام تقول «الحمية»، والمُرسَل يقول «التدبير».
  INSERT INTO public.trait_assessments
    (enrollment_id, phase, scores, core_trait_id, below_threshold)
  VALUES ('c4000000-0000-4000-8000-00000000000c', 'progress',
          '{"himmah":70,"dirayah":20,"azm":10}'::jsonb, _wrong, true)
  RETURNING id INTO _id;

  SELECT t.name INTO _stored FROM public.trait_assessments a
    JOIN public.qualification_traits t ON t.id = a.core_trait_id
   WHERE a.id = _id;

  IF _stored <> 'الحمية' THEN
    RAISE EXCEPTION 'FAIL — الجوهرية المُرسَلة غلبت المحسوبة (%)', _stored;
  END IF;
  IF (SELECT below_threshold FROM public.trait_assessments WHERE id = _id) THEN
    RAISE EXCEPTION 'FAIL — وسم «تحت العتبة» المُرسَل غلب المحسوب';
  END IF;

  DELETE FROM public.trait_assessments WHERE id = _id;
  RAISE NOTICE 'PASS — الحساب يغلب ما يُرسَل: الجوهرية من الأرقام لا من الطلب';
END $$;


-- ---------------------------------------------------------------------
-- ولا تُعلَن الأهلية قبل قياسٍ ختامي
-- ---------------------------------------------------------------------
DO $$
DECLARE _e UUID;
BEGIN
  -- التحاق ثانٍ نظيف: له إذنٌ ومشرف، وبلا قياس ختامي.
  INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status, approved_at)
  VALUES ('c3000000-0000-4000-8000-00000000000d', 'AHL-2', 'يتيم ثانٍ',
          'c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000002',
          200, 'approved', now());

  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price)
  SELECT 'c3000000-0000-4000-8000-00000000000d', p.id, p.monthly_price
    FROM public.programs p WHERE p.slug = 'ahliyyah-foundational'
  RETURNING id INTO _e;

  INSERT INTO public.enrollment_roles
    (enrollment_id, role, person_name, consent_at, consent_document)
  VALUES (_e, 'trustee', 'الوصي', now(), 'consent-3.pdf');
  INSERT INTO public.enrollment_roles (enrollment_id, role, person_id)
  VALUES (_e, 'supervisor', 'c1000000-0000-4000-8000-000000000003');

  BEGIN
    UPDATE public.program_enrollments SET stage = 'qualified' WHERE id = _e;
    RAISE EXCEPTION 'FAIL — أُعلنت الأهلية بلا قياس ختامي';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — لا تُعلَن الأهلية قبل القياس الختامي';
  END;
END $$;

-- والوصي يقوم مقام الولي في الإذن — تأكيدٌ لا إعلان.
DO $$
DECLARE _e UUID; _ok BOOLEAN; _roles TEXT;
BEGIN
  SELECT e.id INTO _e FROM public.program_enrollments e
   WHERE e.orphan_id = 'c3000000-0000-4000-8000-00000000000d';

  SELECT string_agg(r.role::text, ',' ORDER BY r.role) INTO _roles
    FROM public.enrollment_roles r WHERE r.enrollment_id = _e AND r.ended_at IS NULL;

  -- شرطُ الفحص: لا وليَّ في هذا الالتحاق أصلاً، فالإذن من الوصي وحده.
  IF _roles LIKE '%guardian%' THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يعزل الوصي: يوجد وليٌّ أيضاً (%)', _roles;
  END IF;

  SELECT public.enrollment_has_consent(_e) INTO _ok;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — إذن الوصي وحده لم يُعتدّ به';
  END IF;
  RAISE NOTICE 'PASS — الوصي يقوم مقام الولي: إذنه وحده يُعتدّ به';
END $$;

-- ---------------------------------------------------------------------
-- حدّ العرض: ما اشتُري يُعرض، والحكم على الطفل لا يُعرض
-- ---------------------------------------------------------------------
DO $$
DECLARE _pub JSONB; _txt TEXT;
BEGIN
  SET LOCAL ROLE anon;
  SELECT public.orphan_qualification('c3000000-0000-4000-8000-00000000000b') INTO _pub;
  RESET ROLE;

  _txt := _pub::text;

  IF jsonb_array_length(_pub) = 0 THEN
    RAISE EXCEPTION 'FAIL — الزائر لا يرى البرنامج أصلاً';
  END IF;
  IF _txt NOT LIKE '%بناء الأهلية%' OR _txt NOT LIKE '%stage%' THEN
    RAISE EXCEPTION 'FAIL — العرض العام لا يذكر البرنامج ولا مرحلته';
  END IF;
  RAISE NOTICE 'PASS — الزائر يرى ما اشتُرِي وأين وصل';

  -- ولا يرى الدرجات ولا الحكم.
  IF _txt LIKE '%core_trait%' OR _txt LIKE '%below_threshold%'
     OR _txt LIKE '%scores%' OR _txt LIKE '%relational%' THEN
    RAISE EXCEPTION 'FAIL — العرض العام يسرّب خريطة سمات طفل';
  END IF;
  RAISE NOTICE 'PASS — خريطة السمات والحكم لا يظهران في العرض العام';
END $$;

-- والقياس لا يُقرأ من غريبٍ ولو ناداه بدالّته.
DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  SELECT public.enrollment_assessments('c4000000-0000-4000-8000-00000000000c') INTO _r;
  RESET ROLE;

  IF jsonb_array_length(_r) <> 0 THEN
    RAISE EXCEPTION 'FAIL — غريبٌ قرأ قياسات طفل (% سجلّاً)', jsonb_array_length(_r);
  END IF;
  RAISE NOTICE 'PASS — القياس لا يُقرأ إلا لمن يملكه: السياسة تحكم لا الدالّة';
END $$;

-- ---------------------------------------------------------------------
-- طبقة التشغيل: الباب مفتوحٌ محروساً
-- ---------------------------------------------------------------------
DO $$
DECLARE _e UUID; _rid UUID; _stage public.qualification_stage;
BEGIN
  INSERT INTO public.orphans (id, code, display_name, org_id, created_by,
                              monthly_need, status, approved_at)
  VALUES ('c3000000-0000-4000-8000-00000000000f', 'AHL-4', 'يتيم التشغيل',
          'c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000002',
          200, 'approved', now());
  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price)
  SELECT 'c3000000-0000-4000-8000-00000000000f', p.id, p.monthly_price
    FROM public.programs p WHERE p.slug = 'ahliyyah-foundational'
  RETURNING id INTO _e;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';

  -- البريد المعروف يُحوَّل إلى حساب.
  _rid := public.assign_enrollment_role(_e, 'supervisor', 'مشرف',
            'q-supervisor@example.test');
  IF (SELECT person_id FROM public.enrollment_roles WHERE id = _rid)
     IS DISTINCT FROM 'c1000000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'FAIL — البريد المعروف لم يُربط بحسابه';
  END IF;

  -- والمجهول يُسجَّل باسمه لا يُرفض: كثيرٌ من الأولياء بلا حساب.
  _rid := public.assign_enrollment_role(_e, 'guardian', 'ولي التشغيل',
            'nobody@example.test', '05xxxxxxx');
  IF (SELECT person_id FROM public.enrollment_roles WHERE id = _rid) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — بريد مجهول أُنتج له حساب';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — الإسناد يربط البريد المعروف ويوثّق المجهول باسمه';

  -- الإذن يمرّ بالدالّة ويحتاج وثيقة.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.record_enrollment_consent(_rid, '   ');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبل توثيق إذنٍ بوثيقة فارغة';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — توثيق الإذن يرفض الوثيقة الفارغة';
  END;

  PERFORM public.record_enrollment_consent(_rid, 'consent-op.pdf');
  _stage := public.set_enrollment_stage(_e, 'trait');
  RESET ROLE;

  IF _stage <> 'trait' THEN
    RAISE EXCEPTION 'FAIL — لم تتقدّم المرحلة عبر الدالّة (%)', _stage;
  END IF;
  RAISE NOTICE 'PASS — بالتوثيق والمشرف تتقدّم المرحلة عبر الدالّة';

  -- ولا نكوص: مرحلةٌ بُلغت لا يُرجَع عنها بضغطة.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.set_enrollment_stage(_e, 'concept');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — نُكص عن مرحلةٍ بُلغت';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — لا نكوص عن مرحلةٍ بُلغت إلا من الإدارة';
  END;

  -- والغريب لا يُسند دوراً ولا يقدّم مرحلة.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  BEGIN
    PERFORM public.assign_enrollment_role(_e, 'mentor', 'دخيل');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — غريبٌ أسند دوراً';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — الإسناد وتقديم المرحلة لمن يدير الملف وحده';
  END;
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص بناء الأهلية اجتازت ──'; END $$;

ROLLBACK;
