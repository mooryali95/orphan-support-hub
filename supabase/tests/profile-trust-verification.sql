-- =====================================================================
-- إشارات الثقة — إثبات
-- ---------------------------------------------------------------------
-- الإشارة تُخبر كم نعرف عن الطفل، ولا تُخبر ماذا نعرف. فالفحص من
-- الجهتين: الأعداد تصل الزائر، والمحتوى لا يصل. وفرز «الأكثر توثيقاً»
-- يقدّم من وُثِّق لا من كُتب عنه أكثر.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1000000-0000-4000-8000-000000000002', 't-org@example.test', '{"role":"care_org"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000003', 't-stranger@example.test', '{}'::jsonb);

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('f2000000-0000-4000-8000-00000000000a',
        'f1000000-0000-4000-8000-000000000002', 'جهة الثقة', 'approved');

/* طفلان متماثلان في كل شيء إلا التوثيق: الأوّل بلا شيء، والثاني سيُوثَّق. */
INSERT INTO public.orphans
  (id, code, display_name, gender, birth_date, country, region, org_id, created_by,
   monthly_need, status, approved_at)
VALUES
  ('f3000000-0000-4000-8000-00000000000b', 'TR-BARE', 'طفل . بلا', 'male',
   CURRENT_DATE - interval '9 years', 'ألبانيا', 'تيرانا',
   'f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000002',
   100, 'approved', now() - interval '50 days'),
  ('f3000000-0000-4000-8000-00000000000c', 'TR-DOCD', 'طفل . موثّق', 'male',
   CURRENT_DATE - interval '9 years', 'ألبانيا', 'تيرانا',
   'f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000002',
   100, 'approved', now() - interval '10 days');

-- ---------------------------------------------------------------------
-- قبل التوثيق: الإشارات كلّها صفرٌ ولا، والبطاقة لا تحمل حقلاً جديداً معرِّفاً
-- ---------------------------------------------------------------------
DO $$
DECLARE _j JSONB; _row JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_search => 'TR-DOCD');
  RESET ROLE;
  _row := _j->'rows'->0;
  IF _row IS NULL THEN RAISE EXCEPTION 'FAIL — الملفّ غائب عن الدليل'; END IF;
  IF (_row->>'profile_sections')::int <> 0 OR (_row->>'consent_documented')::boolean
     OR (_row->>'recent_report')::boolean THEN
    RAISE EXCEPTION 'FAIL — إشاراتٌ قبل أيّ توثيق: %', _row;
  END IF;
  IF _row ? 'story' OR _row ? 'city' OR _row ? 'birth_date' OR _row ? 'photo_url'
     OR _row ? 'data' OR _row ? 'note' THEN
    RAISE EXCEPTION 'FAIL — البطاقة تحمل حقلاً مُعرِّفاً: %', _row;
  END IF;
  RAISE NOTICE 'PASS — قبل التوثيق: الإشارات صفرٌ ولا، والبطاقة بلا حقلٍ معرِّف';
END $$;

-- ---------------------------------------------------------------------
-- التوثيق: قسمان من البروفايل، موافقة صورة بإخفاء الوجه، تقريرٌ معتمد
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.save_orphan_profile_section('f3000000-0000-4000-8000-00000000000c', 'education',
    '{"school_name":"مدرسة النور","grade":"الرابع"}'::jsonb, NULL);
  PERFORM public.save_orphan_profile_section('f3000000-0000-4000-8000-00000000000c', 'health',
    '{"general_state":"جيّدة","chronic_conditions":"ربو خفيف"}'::jsonb, NULL);
  RESET ROLE;
END $$;

UPDATE public.orphans SET photo_url = 'media/tr.jpg', photo_consent = 'face_hidden'
 WHERE id = 'f3000000-0000-4000-8000-00000000000c';

INSERT INTO public.progress_reports (orphan_id, org_id, period, summary, status, created_by)
VALUES ('f3000000-0000-4000-8000-00000000000c', 'f2000000-0000-4000-8000-00000000000a',
        '2026-10', 'بخير', 'approved', 'f1000000-0000-4000-8000-000000000002');

DO $$
DECLARE _j JSONB; _row JSONB; _v JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_search => 'TR-DOCD');
  _v := public.orphan_view('f3000000-0000-4000-8000-00000000000c');
  RESET ROLE;
  _row := _j->'rows'->0;
  IF (_row->>'profile_sections')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL — عدد الأقسام % لا 2', _row->>'profile_sections';
  END IF;
  IF NOT (_row->>'consent_documented')::boolean THEN
    RAISE EXCEPTION 'FAIL — موافقة الصورة لم تُقرأ';
  END IF;
  IF NOT (_row->>'recent_report')::boolean THEN
    RAISE EXCEPTION 'FAIL — التقرير الحديث لم يُقرأ';
  END IF;
  /* العدد يصل، والمحتوى لا: اسم المدرسة والربو لا يظهران في البطاقة ولا في الصفحة للزائر. */
  IF _j::text LIKE '%مدرسة النور%' OR _j::text LIKE '%ربو%'
     OR _v::text LIKE '%مدرسة النور%' OR _v::text LIKE '%ربو%' THEN
    RAISE EXCEPTION 'FAIL — محتوى البروفايل تسرّب إلى الزائر';
  END IF;
  IF (_v->>'profile_sections')::int <> 2 OR NOT (_v->>'consent_documented')::boolean
     OR NOT (_v->>'recent_report')::boolean THEN
    RAISE EXCEPTION 'FAIL — الصفحة لا تحمل إشارات البطاقة نفسها: %', _v;
  END IF;
  RAISE NOTICE 'PASS — الإشارات تصل الزائر عدداً ونعم/لا، والمحتوى لا يصل';
END $$;

-- ---------------------------------------------------------------------
-- تقريرٌ أقدم من تسعين يوماً لا يُعدّ حديثاً
-- ---------------------------------------------------------------------
/* مشغّل BEFORE UPDATE يعيد updated_at إلى الآن، فيُدرج التقرير القديم بتاريخه. */
DELETE FROM public.progress_reports WHERE orphan_id = 'f3000000-0000-4000-8000-00000000000c';
INSERT INTO public.progress_reports
  (orphan_id, org_id, period, summary, status, created_by, created_at, updated_at)
VALUES ('f3000000-0000-4000-8000-00000000000c', 'f2000000-0000-4000-8000-00000000000a',
        '2026-07', 'بخير', 'approved', 'f1000000-0000-4000-8000-000000000002',
        now() - interval '91 days', now() - interval '91 days');

DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_search => 'TR-DOCD');
  RESET ROLE;
  IF (_j->'rows'->0->>'recent_report')::boolean THEN
    RAISE EXCEPTION 'FAIL — تقريرٌ من 91 يوماً عُدّ حديثاً';
  END IF;
  RAISE NOTICE 'PASS — التقرير يُعدّ حديثاً تسعين يوماً فقط';
END $$;

-- ---------------------------------------------------------------------
-- الفرز «الأكثر توثيقاً» يقدّم الموثَّق وإن كان أحدث انتظاراً
-- ---------------------------------------------------------------------
DO $$
DECLARE _j JSONB; _first TEXT; _wait TEXT;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_search => 'TR-', _sort => 'documented');
  _first := _j->'rows'->0->>'code';
  _j := public.list_orphan_cards(_search => 'TR-', _sort => 'waiting');
  _wait := _j->'rows'->0->>'code';
  RESET ROLE;
  IF _first <> 'TR-DOCD' THEN
    RAISE EXCEPTION 'FAIL — فرز التوثيق قدّم % لا TR-DOCD', _first;
  END IF;
  IF _wait <> 'TR-BARE' THEN
    RAISE EXCEPTION 'FAIL — فرز الانتظار قدّم % لا TR-BARE', _wait;
  END IF;
  RAISE NOTICE 'PASS — «الأكثر توثيقاً» يقدّم الموثَّق، و«الأطول انتظاراً» لا يتأثّر';
END $$;

-- ---------------------------------------------------------------------
-- الغريب يرى الإشارات ولا يرى البروفايل — الباب ما زال واحداً
-- ---------------------------------------------------------------------
DO $$
DECLARE _p JSONB; _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _p := public.orphan_profile('f3000000-0000-4000-8000-00000000000c');
  SELECT count(*) INTO _n FROM public.orphan_profile_sections
   WHERE orphan_id = 'f3000000-0000-4000-8000-00000000000c';
  RESET ROLE;
  IF (_p->>'may_read')::boolean OR _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — الغريب قرأ البروفايل أو الجدول: % / %', _p, _n;
  END IF;
  RAISE NOTICE 'PASS — الغريب يرى العدد ولا يرى الجدول ولا الدالّة';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص إشارات الثقة اجتازت ──'; END $$;

ROLLBACK;
