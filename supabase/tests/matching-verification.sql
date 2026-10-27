-- =====================================================================
-- المطابقة — إثبات
-- ---------------------------------------------------------------------
-- المرشِّح ليس عرضاً بل **حكمٌ على من يُرى أولاً**. وثلاثة أشياء تُفحص
-- هنا لأن سكوتها يُنتج ظلماً هادئاً:
--   الترتيب — أيّهما يعلو: البناءُ القائم أم أكبرُ ثغرة.
--   الجوع  — هل يُدفَن صغيرُ الثغرة أبداً مهما انتظر.
--   التسريب — هل يُعيد المرشِّح عموداً لا يملكه الزائر.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'm-org@example.test', '{"role":"care_org"}'::jsonb),
  ('d1000000-0000-4000-8000-000000000002', 'm-sponsor@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000003', 'm-sup@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-000000000004', 'm-other@example.test', '{}'::jsonb);

INSERT INTO public.supervisor_profiles (user_id, level, independence_index, certified_at)
VALUES ('d1000000-0000-4000-8000-000000000003', 'applied', 90, now());

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('d2000000-0000-4000-8000-00000000000a',
        'd1000000-0000-4000-8000-000000000001', 'جهة المطابقة', 'approved');

UPDATE public.profiles
   SET monthly_budget = 100, preferred_region = 'الرياض'
 WHERE id = 'd1000000-0000-4000-8000-000000000002';

/* أربعة ملفّات مصمّمة ليفترق بها الترتيبان:

   BIG   — ثغرة 300، أقدمُ الجميع، بلا بناء   → يتصدّر بالمنطق القديم
   BUILD — ثغرة 200، أحدث، بناؤه قائم          → يتصدّر بالمنطق الجديد
   SMALL — ثغرة 20، قديم، بلا بناء             → مدفونٌ أبداً بالقديم
   MINE  — يكفله صاحبُ الجلسة جزئياً وتبقى ثغرة → لا يُرشَّح له وحده          */
INSERT INTO public.orphans
  (id, code, display_name, org_id, created_by, monthly_need, funded_monthly,
   region, status, approved_at)
VALUES
  ('d3000000-0000-4000-8000-00000000000b', 'MT-BIG', 'كبير الثغرة',
   'd2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000001',
   300, 0, 'الرياض', 'approved', now() - interval '400 days'),
  ('d3000000-0000-4000-8000-00000000000c', 'MT-BUILD', 'قائم البناء',
   'd2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000001',
   200, 0, 'الرياض', 'approved', now() - interval '10 days'),
  ('d3000000-0000-4000-8000-00000000000d', 'MT-SMALL', 'صغير الثغرة',
   'd2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000001',
   120, 100, 'مكة المكرمة', 'approved', now() - interval '300 days'),
  ('d3000000-0000-4000-8000-00000000000e', 'MT-MINE', 'مكفول عندي',
   'd2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000001',
   150, 0, 'الرياض', 'approved', now() - interval '200 days');

-- بناءٌ قائم لـBUILD وحده: التحاقٌ حيّ بمشرفٍ معتمَد وإذنٍ موثَّق.
INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'd4000000-0000-4000-8000-00000000000f',
       'd3000000-0000-4000-8000-00000000000c', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';
INSERT INTO public.enrollment_roles (enrollment_id, role, person_id)
VALUES ('d4000000-0000-4000-8000-00000000000f', 'supervisor',
        'd1000000-0000-4000-8000-000000000003');
INSERT INTO public.enrollment_roles
  (enrollment_id, role, person_name, consent_at, consent_document)
VALUES ('d4000000-0000-4000-8000-00000000000f', 'guardian', 'الولي', now(), 'c.pdf');

-- والتحاقٌ واقف لـBIG: بلا مشرفٍ ولا إذن — ليُفحَص أن الوقوف هو الفارق
-- لا وجودُ البرنامج من عدمه.
INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price)
SELECT 'd3000000-0000-4000-8000-00000000000b', p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';

INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status)
VALUES ('d1000000-0000-4000-8000-000000000002',
        'd3000000-0000-4000-8000-00000000000e', 50, 'USD', 'active');


-- ---------------------------------------------------------------------
-- البناءُ القائم يعلو على أكبر ثغرةٍ وأقدمِ انتظار
-- ---------------------------------------------------------------------
DO $$
DECLARE _codes TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT array_agg(s.code ORDER BY s.ord) INTO _codes
    FROM (SELECT code, row_number() OVER () AS ord
            FROM public.suggest_orphans_for_sponsor()) s;
  RESET ROLE;

  IF _codes[1] <> 'MT-BUILD' THEN
    RAISE EXCEPTION 'FAIL — تصدّر % لا قائمُ البناء (%)', _codes[1], _codes;
  END IF;
  RAISE NOTICE 'PASS — البناء القائم يتصدّر، لا أكبرُ ثغرة';
END $$;

-- والملفّ الواقف يبقى معروضاً: وقوفُه شأن الجهة لا ذنبُ الطفل، وإخفاؤه
-- يدفنه.
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.suggest_orphans_for_sponsor()
   WHERE code = 'MT-BIG';
  RESET ROLE;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — أُخفي الملفّ الواقف بدل أن يُؤخَّر';
  END IF;
  RAISE NOTICE 'PASS — الواقف يُؤخَّر ولا يُخفى';
END $$;


-- ---------------------------------------------------------------------
-- صغيرُ الثغرة لا يُدفَن: ما يُكمله اشتراكك يعلو على ما لا يُكمله
-- ---------------------------------------------------------------------
DO $$
DECLARE _small INTEGER; _big INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT s.ord INTO _small FROM (
    SELECT code, row_number() OVER () AS ord FROM public.suggest_orphans_for_sponsor()) s
   WHERE s.code = 'MT-SMALL';
  SELECT s.ord INTO _big FROM (
    SELECT code, row_number() OVER () AS ord FROM public.suggest_orphans_for_sponsor()) s
   WHERE s.code = 'MT-BIG';
  RESET ROLE;

  IF _small IS NULL OR _big IS NULL THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: ملفٌّ غائب عن الترشيح';
  END IF;
  IF _small > _big THEN
    RAISE EXCEPTION 'FAIL — صغيرُ الثغرة (%) دون كبيرها (%) رغم أن المئة تُكمله',
      _small, _big;
  END IF;
  RAISE NOTICE 'PASS — ما تُكمله ميزانيتك يعلو على ما لا تُكمله';
END $$;

-- والسببُ يُعاد مع الترشيح: ترشيحٌ بلا سببٍ نُخزةٌ لا توصية.
DO $$
DECLARE _r RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT * INTO _r FROM public.suggest_orphans_for_sponsor() WHERE code = 'MT-SMALL';
  RESET ROLE;

  IF _r.completes IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — ثغرته ٢٠ والميزانية ١٠٠ ولا يُقال إنه يُكمَل';
  END IF;
  IF _r.building IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL — قيل عن ملفٍّ بلا مشرفٍ ولا إذن إن بناءه قائم';
  END IF;
  IF _r.in_region IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL — «مكة المكرمة» تُحسب داخل تفضيل «الرياض»';
  END IF;
  IF _r.gap <> 20 THEN
    RAISE EXCEPTION 'FAIL — الثغرة المعادة % لا ٢٠', _r.gap;
  END IF;
  IF _r.waiting_days < 250 THEN
    RAISE EXCEPTION 'FAIL — أيام الانتظار % وهي نحو ٣٠٠', _r.waiting_days;
  END IF;
  RAISE NOTICE 'PASS — كل ترشيحٍ يحمل سببه: ثغرةً وبناءً وإكمالاً ومنطقةً وانتظاراً';
END $$;


-- ---------------------------------------------------------------------
-- ما يكفله المرء لا يُرشَّح له
-- ---------------------------------------------------------------------
DO $$
DECLARE _n INTEGER; _other INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.suggest_orphans_for_sponsor()
   WHERE code = 'MT-MINE';
  RESET ROLE;

  -- والملفّ نفسه يُرشَّح لغيره: الاستبعاد شخصيٌّ لا حذفٌ من الدليل.
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  SELECT count(*) INTO _other FROM public.suggest_orphans_for_sponsor()
   WHERE code = 'MT-MINE';
  RESET ROLE;

  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — رُشِّح للكافل ملفٌّ يكفله أصلاً';
  END IF;
  IF _other <> 1 THEN
    RAISE EXCEPTION 'FAIL — الاستبعاد الشخصي حذف الملفّ عن غيره';
  END IF;
  RAISE NOTICE 'PASS — ما تكفله لا يُرشَّح لك، ويبقى مرشَّحاً لغيرك';
END $$;

-- والمكفول بالكامل خارج الترشيح أصلاً.
DO $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.orphans SET funded_monthly = monthly_need
   WHERE code = 'MT-BIG';
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.suggest_orphans_for_sponsor()
   WHERE code = 'MT-BIG';
  RESET ROLE;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — رُشِّح ملفٌّ لا ثغرة فيه';
  END IF;
  RAISE NOTICE 'PASS — من اكتمل تمويله يخرج من الترشيح';
  UPDATE public.orphans SET funded_monthly = 0 WHERE code = 'MT-BIG';
END $$;


-- ---------------------------------------------------------------------
-- الترتيب ثابتٌ بين نداءين: عشوائيةٌ تُقرأ تلاعباً
-- ---------------------------------------------------------------------
DO $$
DECLARE _a TEXT[]; _b TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  SELECT array_agg(s.code ORDER BY s.ord) INTO _a FROM (
    SELECT code, row_number() OVER () AS ord FROM public.suggest_orphans_for_sponsor()) s;
  SELECT array_agg(s.code ORDER BY s.ord) INTO _b FROM (
    SELECT code, row_number() OVER () AS ord FROM public.suggest_orphans_for_sponsor()) s;
  RESET ROLE;
  IF _a IS DISTINCT FROM _b THEN
    RAISE EXCEPTION 'FAIL — اختلف الترتيب بين نداءين (% ثم %)', _a, _b;
  END IF;
  RAISE NOTICE 'PASS — الترتيب ثابت بين نداءين';
END $$;


-- ---------------------------------------------------------------------
-- التسريب: المرشِّح `SECURITY DEFINER`، فلا يُعيد إلا ما يملكه الزائر
-- ---------------------------------------------------------------------
DO $$
DECLARE _extra TEXT;
BEGIN
  /* أعمدة الجدول التي لم تُمنح لـ`anon` — والمرشِّح لا يُعيد شيئاً منها.
     (`gap` و`building` وأخواتها محسوبةٌ لا أعمدةَ جدول.) */
  SELECT string_agg(c.column_name, '، ') INTO _extra
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'orphans'
     AND c.column_name NOT IN (
       SELECT cp.column_name FROM information_schema.column_privileges cp
        WHERE cp.table_name = 'orphans' AND cp.grantee = 'anon'
          AND cp.privilege_type = 'SELECT')
     AND c.column_name IN (
       SELECT a.attname FROM pg_proc p
        JOIN pg_type t ON t.oid = p.prorettype
        JOIN pg_attribute a ON a.attrelid = t.typrelid
        WHERE p.proname = 'suggest_orphans_for_sponsor' AND a.attnum > 0);

  IF _extra IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — المرشِّح يُعيد أعمدةً محجوبةً عن الزائر: %', _extra;
  END IF;
  RAISE NOTICE 'PASS — المرشِّح لا يلتفّ على منح الأعمدة';
END $$;

-- والتفضيلات تُقرأ لصاحبها وحده.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.my_sponsor_preferences();
  RESET ROLE;
  IF (_j->>'monthly_budget') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — قرأ غيرُ صاحبها ميزانيةَ الكافل';
  END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.my_sponsor_preferences();
  RESET ROLE;
  IF (_j->>'monthly_budget')::numeric <> 100 THEN
    RAISE EXCEPTION 'FAIL — لم يقرأ صاحبُها ميزانيته (%)', _j;
  END IF;
  RAISE NOTICE 'PASS — التفضيلات لصاحبها وحده';
END $$;

-- والمناطق تُقرأ من الملفّات لا من قائمةٍ مكتوبة.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.published_regions();
  RESET ROLE;
  IF NOT (_j ? 'الرياض') OR NOT (_j ? 'مكة المكرمة') THEN
    RAISE EXCEPTION 'FAIL — المناطق المعادة % لا تشمل المنشورَ فعلاً', _j;
  END IF;
  RAISE NOTICE 'PASS — المناطق تُقرأ من الملفّات المنشورة';
END $$;

-- والكتابة لصاحب الصفّ وحده، والقاعدة هي من تفرض ذلك لا الدالّة.
DO $$
DECLARE _j JSONB; _other NUMERIC;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.save_sponsor_preferences(250, 'مكة المكرمة');
  RESET ROLE;

  IF (_j->>'monthly_budget')::numeric <> 250 THEN
    RAISE EXCEPTION 'FAIL — لم تُحفظ التفضيلات (%)', _j;
  END IF;

  -- وميزانية غيره لم تُمسّ: `profiles_update_own` تحصر الكتابة بصفّه.
  SELECT p.monthly_budget INTO _other FROM public.profiles p
   WHERE p.id = 'd1000000-0000-4000-8000-000000000002';
  IF _other <> 100 THEN
    RAISE EXCEPTION 'FAIL — تغيّرت ميزانية كافلٍ آخر (%)', _other;
  END IF;
  RAISE NOTICE 'PASS — التفضيلات تُكتب لصاحبها ولا تمسّ غيره';
END $$;

-- وميزانيةٌ سالبة تُرفض: ترتيبٌ بُني على عددٍ لا معنى له ترتيبٌ مضلّل.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  BEGIN
    PERFORM public.save_sponsor_preferences(-10, NULL);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبلت ميزانية سالبة';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — الميزانية السالبة مرفوضة';
  END;
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المطابقة اجتازت ──'; END $$;

ROLLBACK;
