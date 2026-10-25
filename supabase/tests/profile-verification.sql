-- =====================================================================
-- البروفايل الكامل — إثبات
-- ---------------------------------------------------------------------
-- البروفايل سجلٌّ عميق عن طفل: صحّتُه وأسرتُه ووضعُه النفسيّ. وثلاثة
-- أشياء تُفحص هنا:
--   من يكتب   — هل يكتب فيه من ليس حوله؟
--   من يقرأ   — هل يفتح إذنُ الاطّلاع ملفّاً طبّياً؟
--   ما يُكتب  — هل يصير الحقل كيساً مفتوحاً؟
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'pf-admin@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'pf-org@example.test', '{"role":"care_org"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'pf-sup@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000004', 'pf-sponsor@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000005', 'pf-stranger@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000006', 'pf-guardian@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('a1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.supervisor_profiles (user_id, level, independence_index, certified_at)
VALUES ('a1000000-0000-4000-8000-000000000003', 'applied', 90, now());

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a2000000-0000-4000-8000-00000000000a',
        'a1000000-0000-4000-8000-000000000002', 'جهة البروفايل', 'approved');

INSERT INTO public.orphans
  (id, code, display_name, org_id, created_by, guardian_id, country, monthly_need,
   status, approved_at)
VALUES ('a3000000-0000-4000-8000-00000000000b', 'PF-1', 'طفل البروفايل',
        'a2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000006', 'السعودية', 200, 'approved', now());

INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'a4000000-0000-4000-8000-00000000000c',
       'a3000000-0000-4000-8000-00000000000b', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';
INSERT INTO public.enrollment_roles (enrollment_id, role, person_id)
VALUES ('a4000000-0000-4000-8000-00000000000c', 'supervisor',
        'a1000000-0000-4000-8000-000000000003');

/* كافلٌ له إذنُ اطّلاعٍ قائم — لا كفالة: نريد أن نقيس الإذن وحده. */
INSERT INTO public.orphan_access_requests
  (orphan_id, requester_id, reason, status, decided_by, decided_at, expires_at,
   granted_scopes)
VALUES ('a3000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000004',
        'أنوي الكفالة وأحتاج الاطّلاع على تفاصيل الملفّ.', 'approved',
        'a1000000-0000-4000-8000-000000000001', now(), now() + interval '90 days',
        /* نطاقاتٌ لا تشمل `profile_deep`: فحصُ البروفايل يقيس أنّ
           الأقسام الحسّاسة محجوبة عمّن لم يُمنحها. */
        ARRAY['journey', 'progress']);


-- ---------------------------------------------------------------------
-- من يكتب: من حول الطفل لا من يدفع
-- ---------------------------------------------------------------------
DO $$
DECLARE _who TEXT; _blocked INTEGER := 0;
BEGIN
  FOREACH _who IN ARRAY ARRAY[
    'a1000000-0000-4000-8000-000000000004',  -- كافلٌ مأذونٌ له بالاطّلاع
    'a1000000-0000-4000-8000-000000000005'   -- غريب
  ] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SET LOCAL request.jwt.claims = %L',
                     json_build_object('sub', _who, 'role', 'authenticated')::text);
      PERFORM public.save_orphan_profile_section(
        'a3000000-0000-4000-8000-00000000000b', 'education',
        '{"grade":"الخامس"}'::jsonb);
      RESET ROLE;
      RAISE EXCEPTION 'FAIL — كتب في البروفايل من ليس حول الطفل (%)', _who;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      _blocked := _blocked + 1;
    END;
  END LOOP;
  IF _blocked <> 2 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً (% من ٢)', _blocked;
  END IF;
  RAISE NOTICE 'PASS — لا يكتب البروفايل كافلٌ مأذونٌ له ولا غريب';
END $$;

-- والوليُّ والمشرف والجهة يكتبون، وصفتُهم تُحسب لا تُرسل.
DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}';
  _r := public.save_orphan_profile_section(
    'a3000000-0000-4000-8000-00000000000b', 'family',
    '{"lives_with":"الأم","siblings_count":"3","housing_type":"إيجار"}'::jsonb,
    'الأسرة في سكنٍ مستأجر.');
  RESET ROLE;
  IF _r->>'role' IS DISTINCT FROM 'guardian' THEN
    RAISE EXCEPTION 'FAIL — صفة الوليّ لم تُحسب (%)', _r;
  END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _r := public.save_orphan_profile_section(
    'a3000000-0000-4000-8000-00000000000b', 'health',
    '{"general_state":"جيّدة","chronic_conditions":"ربو خفيف"}'::jsonb);
  RESET ROLE;
  IF _r->>'role' IS DISTINCT FROM 'supervisor' THEN
    RAISE EXCEPTION 'FAIL — صفة المشرف لم تُحسب (%)', _r;
  END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _r := public.save_orphan_profile_section(
    'a3000000-0000-4000-8000-00000000000b', 'education',
    '{"school_name":"مدرسة النور","grade":"الخامس","performance":"متفوّق"}'::jsonb);
  RESET ROLE;
  IF _r->>'role' IS DISTINCT FROM 'care_org' THEN
    RAISE EXCEPTION 'FAIL — صفة الجهة لم تُحسب (%)', _r;
  END IF;
  RAISE NOTICE 'PASS — الدائرة تكتب، وصفةُ الكاتب تُحسب من القاعدة لا تُرسل';
END $$;

-- وحقلٌ لا يعرفه القسم يُرفض: البروفايل مبنيٌّ لا كيسٌ مفتوح.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.save_orphan_profile_section(
      'a3000000-0000-4000-8000-00000000000b', 'education',
      '{"grade":"الخامس","رقم_الهوية":"1234567890"}'::jsonb);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبل حقلٌ لا يعرفه القسم';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — الحقول معروفة، فلا يصير البروفايل مكبّاً';
  END;
END $$;

-- وقسمٌ فارغٌ تماماً لا يُحفظ.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.save_orphan_profile_section(
      'a3000000-0000-4000-8000-00000000000b', 'social', '{}'::jsonb, NULL);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — حُفظ قسمٌ خالٍ فيُعرض «مُحدَّثاً» وهو فارغ';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — القسم الخالي لا يُحفظ';
  END;
END $$;


-- ---------------------------------------------------------------------
-- من يقرأ: إذنُ الاطّلاع لا يفتح ملفّاً طبّياً
-- ---------------------------------------------------------------------
DO $$
DECLARE _j JSONB; _secs TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.orphan_profile('a3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF (_j->>'may_read')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — حُجب البروفايل كلُّه عمّن أُذن له';
  END IF;
  IF (_j->>'may_write')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL — قيل لمن أُذن له إنه يكتب';
  END IF;

  SELECT string_agg(s->>'section', ',' ORDER BY s->>'section') INTO _secs
    FROM jsonb_array_elements(_j->'sections') s;
  IF _secs IS DISTINCT FROM 'education' THEN
    RAISE EXCEPTION 'FAIL — رأى المأذونُ له أقساماً حسّاسة (%)', _secs;
  END IF;
  IF (_j->>'hidden_sections')::int < 2 THEN
    RAISE EXCEPTION 'FAIL — لم يُقل له إنّ ثمّة محجوباً (%)', _j->>'hidden_sections';
  END IF;
  IF _j::text LIKE '%ربو%' OR _j::text LIKE '%إيجار%' THEN
    RAISE EXCEPTION 'FAIL — تسرّب مضمونٌ حسّاس إلى المأذون له';
  END IF;
  RAISE NOTICE 'PASS — إذنُ الاطّلاع يفتح التعليم ولا يفتح الصحّة ولا الأسرة';
END $$;

-- والدائرة ترى الكلّ.
DO $$
DECLARE _j JSONB; _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.orphan_profile('a3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  _n := jsonb_array_length(_j->'sections');
  IF _n <> 3 THEN
    RAISE EXCEPTION 'FAIL — الدائرة ترى % قسماً لا ثلاثة', _n;
  END IF;
  IF (_j->>'sees_sensitive')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — قيل للدائرة إنها لا ترى الحسّاس';
  END IF;
  RAISE NOTICE 'PASS — الدائرة ترى الأقسام كلّها';
END $$;

-- والغريب لا يرى شيئاً.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _j := public.orphan_profile('a3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF (_j->>'may_read')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL — قرأ الغريبُ بروفايل طفل';
  END IF;
  IF jsonb_array_length(_j->'sections') <> 0 THEN
    RAISE EXCEPTION 'FAIL — أُعيدت أقسامٌ لغريب';
  END IF;
  RAISE NOTICE 'PASS — الغريب لا يرى من البروفايل شيئاً';
END $$;

-- ولا يقرأه أحدٌ بالكتابة المباشرة على الجدول.
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.orphan_profile_sections
   WHERE orphan_id = 'a3000000-0000-4000-8000-00000000000b';
  RESET ROLE;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — قرأ المأذونُ له الجدول مباشرةً فتجاوز قسمة الحساسية (%)', _n;
  END IF;
  RAISE NOTICE 'PASS — الجدول نفسه محجوبٌ عن غير الدائرة، فلا يُلتفّ على القسمة';
END $$;


-- ---------------------------------------------------------------------
-- العمر والتمام
-- ---------------------------------------------------------------------
DO $$
DECLARE _j JSONB; _age INTEGER;
BEGIN
  /* التاريخ يُحرَّك مباشرةً هنا: الحارس لا يلمسه إلا عند تغيّر المضمون،
     فيصحّ التقديم بلا حيلة. */
  UPDATE public.orphan_profile_sections
     SET updated_at = now() - interval '400 days'
   WHERE orphan_id = 'a3000000-0000-4000-8000-00000000000b' AND section = 'education';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.orphan_profile('a3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  SELECT (s->>'age_days')::int INTO _age
    FROM jsonb_array_elements(_j->'sections') s WHERE s->>'section' = 'education';
  IF _age IS NULL OR _age < 350 THEN
    RAISE EXCEPTION 'FAIL — عمر القسم لا يُعرض (%)', _age;
  END IF;
  RAISE NOTICE 'PASS — كل قسمٍ يحمل عمره، فيُعرف ما قدُم';
END $$;

DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.orphan_profile_completeness('a3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF (_j->>'filled')::int <> 3 OR (_j->>'total')::int <> 6 THEN
    RAISE EXCEPTION 'FAIL — التمام % من %', _j->>'filled', _j->>'total';
  END IF;
  IF NOT (_j->'missing' ? 'aspiration') THEN
    RAISE EXCEPTION 'FAIL — الناقص لا يُسمّى (%)', _j;
  END IF;
  RAISE NOTICE 'PASS — التمام يُحسب والناقص يُسمّى';
END $$;

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  BEGIN
    PERFORM public.orphan_profile_completeness('a3000000-0000-4000-8000-00000000000b');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قرأ المأذونُ له تمامَ البروفايل';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — التمام للدائرة وحدها';
  END;
END $$;

-- وإعادةُ الحفظ بلا تغييرٍ لا تُجدّد التاريخ.
DO $$
DECLARE _before TIMESTAMPTZ; _after TIMESTAMPTZ;
BEGIN
  SELECT updated_at INTO _before FROM public.orphan_profile_sections
   WHERE orphan_id = 'a3000000-0000-4000-8000-00000000000b' AND section = 'education';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.save_orphan_profile_section(
    'a3000000-0000-4000-8000-00000000000b', 'education',
    '{"school_name":"مدرسة النور","grade":"الخامس","performance":"متفوّق"}'::jsonb);
  RESET ROLE;

  SELECT updated_at INTO _after FROM public.orphan_profile_sections
   WHERE orphan_id = 'a3000000-0000-4000-8000-00000000000b' AND section = 'education';

  IF _after IS DISTINCT FROM _before THEN
    RAISE EXCEPTION 'FAIL — حفظٌ بلا تغيير جدّد التاريخ فأظهر القديم حديثاً';
  END IF;

  -- وتغييرٌ حقيقيّ يُجدّده.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.save_orphan_profile_section(
    'a3000000-0000-4000-8000-00000000000b', 'education',
    '{"school_name":"مدرسة النور","grade":"السادس","performance":"متفوّق"}'::jsonb);
  RESET ROLE;

  SELECT updated_at INTO _after FROM public.orphan_profile_sections
   WHERE orphan_id = 'a3000000-0000-4000-8000-00000000000b' AND section = 'education';
  IF _after IS NOT DISTINCT FROM _before THEN
    RAISE EXCEPTION 'FAIL — تغييرٌ حقيقيّ لم يُجدّد التاريخ';
  END IF;
  RAISE NOTICE 'PASS — التاريخ يتحرّك بالتغيير لا باللمس';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص البروفايل اجتازت ──'; END $$;

ROLLBACK;
