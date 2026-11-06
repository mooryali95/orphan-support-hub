-- =====================================================================
-- انكشاف بيانات الطفل — إثبات (المرحلة صفر، المجموعة DB-A)
-- ---------------------------------------------------------------------
-- كل فحصٍ هنا يبدأ من الاستغلال كما رآه المدقّق لا من الشاشة: نداءٌ
-- مباشر بالمفتاح المنشور، أو دالّةٌ عامّة يُسأل عنها ما لا يُفترض أن
-- تُجيب عنه. الأبواب السبعة:
--   CP-03  الكافل يقرأ ملاحظة الصحّة في التقارير
--   CP-04  إذن «متابِع» وكفالة بخمسة دولارات تفتحان المدينة وتاريخ
--          الميلاد والقصّة واسم المدرسة
--   CP-05/DB-06  حماية «أقلّ من ٥» تُلتفّ عليها بقراءة الجدول مباشرةً،
--          وبدوالّ الاقتراح، وبطرح أعداد الخارطة
--   DB-03  الجهة الموقوفة تحتفظ بالهوية والعنوان والصحّة والوثائق
--   CP-12  الكافل السابق يبقى مطّلعاً إلى الأبد
--   CP-07  أطفال البذرة التجريبية منشورون قابلون للكفالة
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('da100000-0000-4000-8000-000000000001', 'x-admin@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000002', 'x-org@example.test', '{"role":"care_org"}'::jsonb),
  ('da100000-0000-4000-8000-000000000003', 'x-sponsor5@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000004', 'x-follower@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000005', 'x-former@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000006', 'x-stranger@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000007', 'x-partner@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000008', 'x-recent@example.test', '{}'::jsonb),
  ('da100000-0000-4000-8000-000000000009', 'x-legacy@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('da100000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('da200000-0000-4000-8000-00000000000a',
        'da100000-0000-4000-8000-000000000002', 'جهة الانكشاف', 'approved');

/* طفلٌ وحيد في منطقته (كوكس) — هو من بُنيت له حماية «أقلّ من ٥» —
   وستّةٌ في تيرانا من الجنس والفئة نفسيهما فيصحّ حشدهم. وبلدٌ خاصٌّ
   بالفحص كي لا تختلط أعداده بغيره. والمُنشئ هو مالك الجهة كما تفعل
   `start_orphan_draft`: فحجبُ الجهة الموقوفة لا يصحّ إن بقي له بابُ
   «أنا من أنشأه». */
INSERT INTO public.orphans
  (id, code, display_name, gender, birth_date, city, country, region, story,
   education_stage, org_id, created_by, monthly_need, status, approved_at)
VALUES
  ('da300000-0000-4000-8000-00000000000b', 'XE-LONE', 'أرديت', 'male',
   CURRENT_DATE - interval '9 years', 'Kukës, lagjja 3', 'ألبانيا-فحص', 'كوكس',
   'قصّةٌ فيها ظروف الأسرة ومكان سكنها.', 'primary',
   'da200000-0000-4000-8000-00000000000a', 'da100000-0000-4000-8000-000000000002',
   200, 'approved', now() - interval '40 days');

INSERT INTO public.orphans
  (id, code, display_name, gender, birth_date, city, country, region,
   education_stage, org_id, created_by, monthly_need, status, approved_at)
SELECT ('da300000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       'XE-T' || g, 'طفل ' || g, 'male', CURRENT_DATE - interval '9 years',
       'تيرانا', 'ألبانيا-فحص', 'تيرانا', 'primary',
       'da200000-0000-4000-8000-00000000000a', 'da100000-0000-4000-8000-000000000002',
       150, 'approved', now() - interval '30 days'
  FROM generate_series(1, 6) g;

INSERT INTO public.orphan_private (orphan_id, full_name, national_id, address, health_notes)
VALUES ('da300000-0000-4000-8000-00000000000b', 'Ardit Real', 'NID-111',
        'Rruga 1, Kukës', 'asthma');

INSERT INTO public.orphan_profile_sections (orphan_id, section, data)
VALUES ('da300000-0000-4000-8000-00000000000b', 'education',
        '{"school_name": "Shkolla 9-vjeçare Kukës", "grade": "5"}'::jsonb);

INSERT INTO public.progress_reports
  (orphan_id, org_id, period, summary, education_note, health_note, living_note,
   status, created_by)
VALUES ('da300000-0000-4000-8000-00000000000b', 'da200000-0000-4000-8000-00000000000a',
        '2026-10', 'شهرٌ طيّب', 'انتقل إلى الصفّ الخامس', 'Seizure episode in October',
        'السكن مستقرّ', 'approved', 'da100000-0000-4000-8000-000000000002');

INSERT INTO public.timeline_events (orphan_id, actor_id, event_type, detail)
VALUES ('da300000-0000-4000-8000-00000000000b', 'da100000-0000-4000-8000-000000000001',
        'report.published', '2026-10');

-- كافلٌ بخمسة دولارات، وكافلٌ سابق انتهت كفالته قبل أربع سنوات،
-- وكافلٌ أنهى قبل عشرة أيام (داخل مهلة التقرير الأخير).
INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status, started_at, ended_at)
VALUES
  ('da100000-0000-4000-8000-000000000003', 'da300000-0000-4000-8000-00000000000b',
   5, 'USD', 'active', now() - interval '20 days', NULL),
  ('da100000-0000-4000-8000-000000000005', 'da300000-0000-4000-8000-00000000000b',
   20, 'USD', 'completed', now() - interval '6 years', now() - interval '4 years'),
  ('da100000-0000-4000-8000-000000000008', 'da300000-0000-4000-8000-00000000000b',
   20, 'USD', 'completed', now() - interval '2 years', now() - interval '10 days'),
  ('da100000-0000-4000-8000-000000000009', 'da300000-0000-4000-8000-00000000000b',
   20, 'USD', 'completed', now() - interval '5 years', now() - interval '3 years');

/* المهلة تُحسب من لحظة تغيّر الحالة، لا من `ended_at` الذي يكتبه
   الكافل نفسه. والكفالة السابقة انتهت قبل أربع سنوات. */
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sponsorships'
                AND column_name = 'status_changed_at') THEN
    EXECUTE $q$
      UPDATE public.sponsorships SET status_changed_at = ended_at
       WHERE sponsor_id IN ('da100000-0000-4000-8000-000000000005',
                            'da100000-0000-4000-8000-000000000008')
    $q$;
    /* وصفٌّ سابقٌ للهجرة: لا لحظة تغيّرٍ مسجّلة، فيُقدَّر بـ`ended_at`. */
    EXECUTE $q$
      UPDATE public.sponsorships SET status_changed_at = NULL
       WHERE sponsor_id = 'da100000-0000-4000-8000-000000000009'
    $q$;
  END IF;
END $$;

-- إذن «متابِع» قائم (رحلةٌ وتقدّم فقط)، وإذن «شريك» بنطاقي الموقع والقصّة.
INSERT INTO public.orphan_access_requests
  (orphan_id, requester_id, reason, status, decided_by, decided_at, expires_at, granted_scopes)
VALUES
  ('da300000-0000-4000-8000-00000000000b', 'da100000-0000-4000-8000-000000000004',
   'أتابع مسار الطفل في البرنامج دون تفاصيل شخصية.', 'approved',
   'da100000-0000-4000-8000-000000000001', now(), now() + interval '90 days',
   ARRAY['journey', 'progress']);


-- =====================================================================
-- CP-03 — ملاحظة الصحّة لا تصل الكافل
-- =====================================================================
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  SELECT count(*) INTO _n FROM public.progress_reports
   WHERE orphan_id = 'da300000-0000-4000-8000-00000000000b' AND health_note IS NOT NULL;
  RESET ROLE;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — الكافل يقرأ ملاحظة الصحّة مباشرةً من الجدول (% صفّ)', _n;
  END IF;
  RAISE NOTICE 'PASS — CP-03: الكافل لا يقرأ ملاحظة الصحّة من الجدول';
END $$;

-- والكافل يصله التقرير المعتمد نفسه — بلا الصحّة وبلا المرفقات.
DO $$
DECLARE _j JSONB; _r JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _j := public.orphan_progress_reports('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;
  _r := _j->'reports'->0;
  IF NOT COALESCE((_j->>'allowed')::boolean, false) OR _r IS NULL THEN
    RAISE EXCEPTION 'FAIL — الكافل لا يصله التقرير المعتمد: %', _j;
  END IF;
  IF _r->>'education_note' IS DISTINCT FROM 'انتقل إلى الصفّ الخامس' THEN
    RAISE EXCEPTION 'FAIL — التقرير بلا محتواه التعليمي: %', _r;
  END IF;
  IF _r->>'health_note' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — التقرير يحمل الصحّة إلى الكافل: %', _r;
  END IF;
  IF jsonb_array_length(COALESCE(_r->'attachments', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'FAIL — مسارات المرفقات تصل الكافل: %', _r;
  END IF;
  RAISE NOTICE 'PASS — CP-03: الكافل يقرأ التقرير المعتمد بلا الصحّة ولا المرفقات';
END $$;

-- ومن حول الطفل يقرؤها كاملة — الحجب للكافل لا للجهة.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _j := public.orphan_progress_reports('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF _j->'reports'->0->>'health_note' IS DISTINCT FROM 'Seizure episode in October' THEN
    RAISE EXCEPTION 'FAIL — الجهة لا ترى ملاحظة الصحّة في تقريرها: %', _j;
  END IF;
  RAISE NOTICE 'PASS — CP-03: الجهة الراعية ترى تقريرها كاملاً';
END $$;

-- والغريب لا يصله شيء.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000006","role":"authenticated"}', true);
  _j := public.orphan_progress_reports('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF COALESCE((_j->>'allowed')::boolean, false) OR jsonb_array_length(_j->'reports') <> 0 THEN
    RAISE EXCEPTION 'FAIL — الغريب يقرأ التقارير: %', _j;
  END IF;
  RAISE NOTICE 'PASS — CP-03: الغريب لا يقرأ التقارير';
END $$;


-- =====================================================================
-- CP-04 — ما يحدّد مكان الطفل خلف نطاقٍ صريح
-- =====================================================================
DO $$
DECLARE _j JSONB; _who TEXT; _label TEXT;
BEGIN
  FOR _who, _label IN VALUES
    ('da100000-0000-4000-8000-000000000004', 'المتابِع'),
    ('da100000-0000-4000-8000-000000000003', 'كافل الخمسة دولارات')
  LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', _who), true);
    _j := public.orphan_view('da300000-0000-4000-8000-00000000000b');
    RESET ROLE;
    IF NOT (_j->>'may_view_detail')::boolean THEN
      RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: % بلا تفصيلٍ أصلاً', _label;
    END IF;
    IF _j->'detail'->>'city' IS NOT NULL OR _j->'detail'->>'birth_date' IS NOT NULL
       OR _j->'detail'->>'story' IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL — % يرى المدينة أو تاريخ الميلاد أو القصّة: %', _label, _j->'detail';
    END IF;
    IF _j->>'age_band' IS NULL THEN
      RAISE EXCEPTION 'FAIL — % لا يرى حتى الفئة العمرية', _label;
    END IF;
    /* والمتابِع لا يملك إلا ما مُنح: الرحلة والتقدّم. والكافل لا نطاق له
       ضمناً — صلته تفتح الاحتياج والتقارير، لا النطاقات. */
    IF _j->'scopes' IS DISTINCT FROM (CASE WHEN _label = 'المتابِع'
                                          THEN '["journey", "progress"]' ELSE '[]' END)::jsonb THEN
      RAISE EXCEPTION 'FAIL — نطاقات % ليست ما مُنح: %', _label, _j->'scopes';
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — CP-04: المتابِع والكافل العاديّ يريان الفئة العمرية لا المدينة ولا التاريخ ولا القصّة';
END $$;

-- واسم المدرسة يخرج من قسم التعليم ما لم يُمنح نطاق الموقع.
DO $$
DECLARE _j JSONB; _sec JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  _j := public.orphan_profile('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;
  SELECT s INTO _sec FROM jsonb_array_elements(_j->'sections') s WHERE s->>'section' = 'education';
  IF _sec IS NULL THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: قسم التعليم غائب: %', _j;
  END IF;
  IF _sec->'data' ? 'school_name' THEN
    RAISE EXCEPTION 'FAIL — المتابِع يرى اسم المدرسة: %', _sec;
  END IF;
  IF _sec->'data'->>'grade' IS DISTINCT FROM '5' THEN
    RAISE EXCEPTION 'FAIL — حُجب القسم كلّه لا اسم المدرسة وحده: %', _sec;
  END IF;
  RAISE NOTICE 'PASS — CP-04: اسم المدرسة محجوبٌ عن المتابِع، وبقيّة قسم التعليم ظاهرة';
END $$;

-- والدائرة ترى كلّ شيء — الحجب على من هو خارجها.
DO $$
DECLARE _j JSONB; _p JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _j := public.orphan_view('da300000-0000-4000-8000-00000000000b');
  _p := public.orphan_profile('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF _j->'detail'->>'city' IS DISTINCT FROM 'Kukës, lagjja 3'
     OR _j->'detail'->>'birth_date' IS NULL OR _j->'detail'->>'story' IS NULL THEN
    RAISE EXCEPTION 'FAIL — الجهة لا ترى تفصيل ملفّها: %', _j->'detail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p->'sections') s
                  WHERE s->>'section' = 'education' AND s->'data' ? 'school_name') THEN
    RAISE EXCEPTION 'FAIL — الجهة لا ترى اسم المدرسة: %', _p;
  END IF;
  RAISE NOTICE 'PASS — CP-04: دائرة الطفل ترى المدينة والتاريخ والقصّة والمدرسة';
END $$;

-- ونطاقا «الموقع» و«القصّة» حين تمنحهما الإدارة صراحةً يفتحان ما يخصّهما.
DO $$
DECLARE _j JSONB; _p JSONB;
BEGIN
  INSERT INTO public.orphan_access_requests
    (orphan_id, requester_id, reason, status, decided_by, decided_at, expires_at, granted_scopes)
  VALUES ('da300000-0000-4000-8000-00000000000b', 'da100000-0000-4000-8000-000000000007',
          'شريكٌ مؤسّسيّ بعقدٍ يزور الأسرة في مكانها.', 'approved',
          'da100000-0000-4000-8000-000000000001', now(), now() + interval '90 days',
          ARRAY['journey', 'location', 'story']);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000007","role":"authenticated"}', true);
  _j := public.orphan_view('da300000-0000-4000-8000-00000000000b');
  _p := public.orphan_profile('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF _j->'detail'->>'city' IS NULL OR _j->'detail'->>'birth_date' IS NULL
     OR _j->'detail'->>'story' IS NULL THEN
    RAISE EXCEPTION 'FAIL — المنح الصريح لا يفتح ما مُنح: %', _j->'detail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p->'sections') s
                  WHERE s->>'section' = 'education' AND s->'data' ? 'school_name') THEN
    RAISE EXCEPTION 'FAIL — نطاق الموقع لا يفتح اسم المدرسة: %', _p;
  END IF;
  RAISE NOTICE 'PASS — CP-04: نطاقا «الموقع» و«القصّة» يفتحان ما يخصّهما عند المنح الصريح';
END $$;

-- وحزمة «متابِع» نفسها لا تحمل الموقع ولا القصّة.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.access_scope_packages
              WHERE key IN ('follower', 'group_supporter')
                AND scopes && ARRAY['location', 'story']) THEN
    RAISE EXCEPTION 'FAIL — حزمة المتابع أو داعم المجموعة تحمل الموقع أو القصّة';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_scopes WHERE key = 'location' AND sensitivity = 3) THEN
    RAISE EXCEPTION 'FAIL — نطاق «الموقع» غير معرّف بحساسيته العليا';
  END IF;
  RAISE NOTICE 'PASS — CP-04: «الموقع» نطاقٌ من الدرجة الثالثة، والمتابعة لا تحمله';
END $$;


-- =====================================================================
-- CP-05 / DB-06 — حماية «أقلّ من ٥» لا تُلتفّ عليها
-- =====================================================================
DO $$
DECLARE _col TEXT; _role TEXT; _blocked INTEGER := 0;
BEGIN
  FOREACH _role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH _col IN ARRAY ARRAY['region', 'education_stage'] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', _role);
        PERFORM set_config('request.jwt.claims',
          '{"sub":"da100000-0000-4000-8000-000000000006","role":"authenticated"}', true);
        EXECUTE format('SELECT %I FROM public.orphans WHERE code = %L', _col, 'XE-LONE');
        RESET ROLE;
        RAISE EXCEPTION 'FAIL — % يقرأ «%» من الجدول مباشرةً', _role, _col;
      EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
        _blocked := _blocked + 1;
      END;
    END LOOP;
  END LOOP;
  IF _blocked <> 4 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً (% من ٤)', _blocked;
  END IF;
  RAISE NOTICE 'PASS — CP-05: المنطقة والمرحلة لا تُقرآن من الجدول لا للزائر ولا للمسجَّل';
END $$;

-- والبطاقة ما زالت تُقرأ — الحجب على العمودين لا على الدليل.
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO _n FROM public.orphans
   WHERE country = 'ألبانيا-فحص' AND display_name IS NOT NULL AND gender IS NOT NULL;
  RESET ROLE;
  IF _n <> 7 THEN RAISE EXCEPTION 'FAIL — البطاقة نفسها صارت محجوبة (%)', _n; END IF;
  RAISE NOTICE 'PASS — CP-05: أعمدة البطاقة الأخرى مقروءةٌ للزائر';
END $$;

-- اقتراح الفائض (للزائر) لا يُعيد منطقة الطفل الوحيد ولا مرحلته.
DO $$
DECLARE _r RECORD; _seen BOOLEAN := false;
BEGIN
  SET LOCAL ROLE anon;
  FOR _r IN SELECT * FROM public.suggest_orphans_for_amount(200, NULL, 10) LOOP
    IF _r.code = 'XE-LONE' THEN
      _seen := true;
      IF _r.region IS NOT NULL OR _r.education_stage IS NOT NULL THEN
        RESET ROLE;
        RAISE EXCEPTION 'FAIL — اقتراح الفائض يكشف «%» / «%»', _r.region, _r.education_stage;
      END IF;
    END IF;
  END LOOP;
  RESET ROLE;
  IF NOT _seen THEN RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: الطفل غائب عن الاقتراح'; END IF;
  RAISE NOTICE 'PASS — CP-05: اقتراح الفائض يحجب منطقة الحشد الصغير ومرحلته';
END $$;

-- واقتراحات الكافل لا تكشفها — ولا بسؤال «هل هو في منطقتي؟».
DO $$
DECLARE _r RECORD; _seen BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000006","role":"authenticated"}', true);
  FOR _r IN SELECT * FROM public.suggest_orphans_for_sponsor(500, 'كوكس', 48) LOOP
    IF _r.code = 'XE-LONE' THEN
      _seen := true;
      IF _r.region IS NOT NULL OR _r.education_stage IS NOT NULL OR _r.in_region THEN
        RESET ROLE;
        RAISE EXCEPTION 'FAIL — اقتراح الكافل يكشف المنطقة (%، %، in_region=%)',
          _r.region, _r.education_stage, _r.in_region;
      END IF;
    END IF;
  END LOOP;
  RESET ROLE;
  IF NOT _seen THEN RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: الطفل غائب عن الاقتراح'; END IF;
  RAISE NOTICE 'PASS — CP-05: اقتراح الكافل يحجب المنطقة ولا يجيب «في منطقتك»';
END $$;

-- وأعداد الخارطة لا تُطرح: (البلد − المناطق الظاهرة) لا يُعطي حشداً دون ٥.
DO $$
DECLARE _c JSONB; _vis INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  SELECT c INTO _c FROM jsonb_array_elements(public.geo_stats()->'countries') c
   WHERE c->>'country' = 'ألبانيا-فحص';
  RESET ROLE;
  IF _c IS NULL THEN RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: البلد غائب'; END IF;
  SELECT COALESCE(sum((r->>'total')::int), 0) INTO _vis
    FROM jsonb_array_elements(_c->'regions') r WHERE r->>'total' IS NOT NULL;
  IF (_c->>'total') IS NOT NULL
     AND (_c->>'total')::int - _vis BETWEEN 1 AND public.cohort_min() - 1 THEN
    RAISE EXCEPTION 'FAIL — الطرح يكشف حشداً صغيراً: البلد % − الظاهر % = %',
      _c->>'total', _vis, (_c->>'total')::int - _vis;
  END IF;
  IF (_c->>'total') IS NULL THEN
    RAISE EXCEPTION 'FAIL — حُجب عدد البلد كلّه بدل الإخفاء التكميلي: %', _c;
  END IF;
  RAISE NOTICE 'PASS — CP-05: الخارطة تُخفي تكميلياً فلا يكشف الطرحُ الحشدَ الصغير (البلد %، الظاهر %)',
    _c->>'total', _vis;
END $$;


-- =====================================================================
-- DB-03 — الجهة الموقوفة تفقد ما كان لها
-- =====================================================================
DO $$
DECLARE _priv INTEGER; _rep INTEGER; _manage BOOLEAN; _j JSONB; _org JSONB;
BEGIN
  UPDATE public.care_organizations SET status = 'suspended'
   WHERE id = 'da200000-0000-4000-8000-00000000000a';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  SELECT count(*) INTO _priv FROM public.orphan_private
   WHERE orphan_id = 'da300000-0000-4000-8000-00000000000b';
  SELECT count(*) INTO _rep FROM public.progress_reports
   WHERE orphan_id = 'da300000-0000-4000-8000-00000000000b';
  _manage := public.can_manage_orphan('da300000-0000-4000-8000-00000000000b');
  _j := public.orphan_view('da300000-0000-4000-8000-00000000000b');
  _org := public.org_orphans();
  RESET ROLE;

  IF _priv <> 0 OR _rep <> 0 OR _manage THEN
    RAISE EXCEPTION 'FAIL — الجهة الموقوفة تقرأ (الخاصّ %، التقارير %، تدير %)', _priv, _rep, _manage;
  END IF;
  IF _j ? 'detail' THEN
    RAISE EXCEPTION 'FAIL — الجهة الموقوفة ترى تفصيل الملفّ: %', _j->'detail';
  END IF;
  IF jsonb_array_length(_org) <> 0 THEN
    RAISE EXCEPTION 'FAIL — شاشة الجهة الموقوفة ما زالت تعرض أطفالها (%)', jsonb_array_length(_org);
  END IF;
  RAISE NOTICE 'PASS — DB-03: الجهة الموقوفة لا تقرأ الهوية ولا التقارير ولا تدير — ولو كانت منشئة الملفّ';

  -- وإعادتها تعيد ما كان: الإيقاف حجبٌ لا حذف.
  UPDATE public.care_organizations SET status = 'approved'
   WHERE id = 'da200000-0000-4000-8000-00000000000a';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  SELECT count(*) INTO _priv FROM public.orphan_private
   WHERE orphan_id = 'da300000-0000-4000-8000-00000000000b';
  RESET ROLE;
  IF _priv <> 1 THEN RAISE EXCEPTION 'FAIL — الإعادة لم تُعد الوصول (%)', _priv; END IF;
  RAISE NOTICE 'PASS — DB-03: إعادة اعتماد الجهة تعيد وصولها';
END $$;

-- والمرفوضة كالموقوفة.
DO $$
DECLARE _manage BOOLEAN;
BEGIN
  UPDATE public.care_organizations SET status = 'rejected'
   WHERE id = 'da200000-0000-4000-8000-00000000000a';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _manage := public.can_manage_orphan('da300000-0000-4000-8000-00000000000b')
             OR public.owns_org('da200000-0000-4000-8000-00000000000a');
  RESET ROLE;
  UPDATE public.care_organizations SET status = 'approved'
   WHERE id = 'da200000-0000-4000-8000-00000000000a';
  IF _manage THEN RAISE EXCEPTION 'FAIL — الجهة المرفوضة ما زالت تملك وتدير'; END IF;
  RAISE NOTICE 'PASS — DB-03: الجهة المرفوضة لا تملك ولا تدير';
END $$;


-- =====================================================================
-- CP-12 — الكفالة المنتهية لا تُبقي الملفّ مفتوحاً إلى الأبد
-- =====================================================================
DO $$
DECLARE _old BOOLEAN; _tl INTEGER; _recent BOOLEAN; _active BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  _old := public.can_view_orphan_detail('da300000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO _tl FROM public.timeline_events
   WHERE orphan_id = 'da300000-0000-4000-8000-00000000000b';

  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000008","role":"authenticated"}', true);
  _recent := public.can_view_orphan_detail('da300000-0000-4000-8000-00000000000b');

  PERFORM set_config('request.jwt.claims',
    '{"sub":"da100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _active := public.can_view_orphan_detail('da300000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF _old OR _tl <> 0 THEN
    RAISE EXCEPTION 'FAIL — كافلٌ انتهت كفالته قبل أربع سنوات ما زال يرى (تفصيل %، خطّ زمني %)', _old, _tl;
  END IF;
  IF NOT _recent THEN
    RAISE EXCEPTION 'FAIL — من أنهى قبل عشرة أيام فقد التقرير الأخير';
  END IF;
  IF NOT _active THEN
    RAISE EXCEPTION 'FAIL — الكافل الحاليّ فقد صلته';
  END IF;
  RAISE NOTICE 'PASS — CP-12: الكافل السابق يُغلق عنه الملفّ بعد المهلة، والحاليّ ومن أنهى قريباً يبقيان';
END $$;

-- والكافل لا يمدّ مهلته بنفسه: تعديل `ended_at` أو أيّ حقلٍ آخر لا يُجدّدها —
-- لا في صفٍّ جديد ولا في صفٍّ سابقٍ للهجرة بلا لحظة تغيّرٍ مسجّلة.
DO $$
DECLARE _who TEXT; _before BOOLEAN; _again BOOLEAN;
BEGIN
  FOREACH _who IN ARRAY ARRAY['da100000-0000-4000-8000-000000000005',
                              'da100000-0000-4000-8000-000000000009'] LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', _who), true);
    _before := public.can_view_orphan_detail('da300000-0000-4000-8000-00000000000b');
    UPDATE public.sponsorships SET ended_at = now(), message = NULL
     WHERE sponsor_id = _who::uuid;
    _again := public.can_view_orphan_detail('da300000-0000-4000-8000-00000000000b');
    RESET ROLE;
    IF _before OR _again THEN
      RAISE EXCEPTION 'FAIL — كافلٌ سابق (%) يرى الملفّ (قبل التعديل %، بعده %)', _who, _before, _again;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — CP-12: الكافل لا يمدّ المهلة بتعديل صفّ كفالته، ولو كان صفّاً سابقاً للهجرة';
END $$;


-- =====================================================================
-- CP-07 — أطفال البذرة التجريبية ليسوا منشورين ولا قابلين للكفالة
-- =====================================================================
DO $$
DECLARE _live INTEGER; _kept INTEGER; _orgs INTEGER; _cards JSONB;
BEGIN
  SELECT count(*) FILTER (WHERE o.status IN ('approved', 'fully_sponsored')), count(*)
    INTO _live, _kept
    FROM public.orphans o
   WHERE o.code IN ('ORP-1001', 'ORP-1002', 'ORP-1003', 'ORP-1004', 'ORP-1005')
     AND o.org_id IN ('11111111-1111-4111-8111-111111111111',
                      '22222222-2222-4222-8222-222222222222');
  SELECT count(*) INTO _orgs FROM public.care_organizations
   WHERE id IN ('11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222')
     AND status = 'approved';

  SET LOCAL ROLE anon;
  _cards := public.list_orphan_cards(_search => 'ORP-100');
  RESET ROLE;

  IF _kept <> 5 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً، أو حُذفت البذرة وسجلّها (% من ٥)', _kept;
  END IF;
  IF _live <> 0 OR _orgs <> 0 THEN
    RAISE EXCEPTION 'FAIL — البذرة التجريبية منشورة (% طفلاً، % جهة معتمدة)', _live, _orgs;
  END IF;
  IF (_cards->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL — دليل الزائر يعرض أطفال البذرة (%)', _cards->>'total';
  END IF;
  RAISE NOTICE 'PASS — CP-07: أطفال البذرة وجهتاها مؤرشفون لا محذوفون، وغائبون عن الدليل';
END $$;

ROLLBACK;
