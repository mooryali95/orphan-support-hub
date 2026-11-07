-- =====================================================================
-- ما وجدته المراجعة بعد إصلاحات المرحلة صفر — إثبات (المجموعة REV)
-- ---------------------------------------------------------------------
-- كل فحصٍ يبدأ من الاستغلال كما وصفه المراجِع: نداءٌ مباشر بالمفتاح
-- المنشور من زائرٍ أو حسابٍ أُنشئ للتوّ أو عضو دائرة أو جهة، لا من الشاشة.
--   CP-05  سجلّ الكفالة وقائمة المناطق وكتالوج الدعم والدليل بالمجموعة
--   CP-05  الخارطة: علامتا «صغيرة/مُخفاة» والترتيب بالعدد
--   CP-04  نصّ الاحتياج للعموم، وتعديله بلا مراجعة
--   CP-04  عضو الدائرة يقرأ اسم المدرسة من الجدول
--   CP-01  المشرف المنقضي أجلُه يعمل، والإذن من دورٍ معلّق يُحسب
--   CP-02  صورة الطفل في خزنةٍ عامّة تُسرد وتُنزَّل
--   DB-07  التعديل يُسقط الطفل المكفول من النشر ومن لوحة كافله
--   DB-07  الشريك: استيرادٌ ثم اعتمادٌ ثم مزامنة
--   CP-01  أدوار الدائرة تنقضي ولا تعود إلى الإدارة
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('dcc00000-0000-4000-8000-000000000001', 'rv-admin@example.test', '{}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000002', 'rv-org@example.test', '{"role":"care_org"}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000003', 'rv-newcomer@example.test', '{}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000004', 'rv-sponsor@example.test', '{}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000005', 'rv-supervisor@example.test', '{}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000006', 'rv-mentor@example.test', '{}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000007', 'rv-viewer@example.test', '{}'::jsonb),
  ('dcc00000-0000-4000-8000-000000000008', 'rv-guardian@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('dcc00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.supervisor_profiles (user_id, level, active, certified_at, certified_by)
VALUES ('dcc00000-0000-4000-8000-000000000005', 'foundational', true, now(),
        'dcc00000-0000-4000-8000-000000000001');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('dcc20000-0000-4000-8000-00000000000a',
        'dcc00000-0000-4000-8000-000000000002', 'جهة المراجعة', 'approved');

INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region)
VALUES ('dcc80000-0000-4000-8000-000000000001', 'rowad-albania', 'rv-g', 'Grupi Kukës-R',
        'AL', 'كوكس-مراجعة');

/* L طفلٌ وحيدٌ في منطقته (حشده ١)، وعضوٌ في مجموعة المرآة.
   S منشورٌ مكفول (فهو مقفول)، وله احتياجٌ وصورةٌ بوجهٍ مخفيّ.
   W منشورٌ له كافلٌ أوقف كفالته منذ أيام (ما زال في المهلة)، غير مقفول. */
INSERT INTO public.orphans
  (id, code, display_name, gender, birth_date, city, country, region, story,
   education_stage, org_id, created_by, monthly_need, status, approved_at, group_id)
VALUES
  ('dcc30000-0000-4000-8000-00000000000a', 'RV-L', 'أرديت', 'male',
   CURRENT_DATE - interval '9 years', 'كوكس', 'ألبانيا-مراجعة', 'كوكس-مراجعة', 'قصّة',
   'ابتدائي', 'dcc20000-0000-4000-8000-00000000000a', 'dcc00000-0000-4000-8000-000000000002',
   100, 'approved', now() - interval '10 days', 'dcc80000-0000-4000-8000-000000000001'),
  ('dcc30000-0000-4000-8000-00000000000b', 'RV-S', 'بليريم', 'male',
   CURRENT_DATE - interval '10 years', 'تيرانا', 'ألبانيا-مراجعة', 'تيرانا-مراجعة',
   'قصّةٌ راجعتها الإدارة.', 'ابتدائي', 'dcc20000-0000-4000-8000-00000000000a',
   'dcc00000-0000-4000-8000-000000000002', 100, 'approved', now() - interval '60 days', NULL),
  ('dcc30000-0000-4000-8000-00000000000c', 'RV-W', 'إلير', 'female',
   CURRENT_DATE - interval '7 years', 'دورس', 'ألبانيا-مراجعة', 'دورس-مراجعة',
   'قصّة', 'ابتدائي', 'dcc20000-0000-4000-8000-00000000000a',
   'dcc00000-0000-4000-8000-000000000002', 100, 'approved', now() - interval '60 days', NULL);

INSERT INTO public.orphan_needs (orphan_id, category, title, monthly_amount)
VALUES ('dcc30000-0000-4000-8000-00000000000b', 'education', 'كتبٌ مدرسية', 30);

INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('dcc90000-0000-4000-8000-000000000001', 'dcc00000-0000-4000-8000-000000000004',
        'dcc30000-0000-4000-8000-00000000000b', 40, 'USD', 'active', now() - interval '20 days'),
       ('dcc90000-0000-4000-8000-000000000002', 'dcc00000-0000-4000-8000-000000000004',
        'dcc30000-0000-4000-8000-00000000000c', 40, 'USD', 'paused', now() - interval '90 days');

INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'dcc40000-0000-4000-8000-000000000001', 'dcc30000-0000-4000-8000-00000000000b',
       p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';


-- =====================================================================
-- CP-05 — حماية «أقلّ من ٥» لا تُلتفّ عليها
-- =====================================================================

-- (١) حسابٌ جديد يُنشئ كفالةً «بانتظار الدفع» بإدراجٍ مباشر ثم يقرأ السجلّ.
DO $$
DECLARE _s UUID; _card JSONB; _l JSONB;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT r INTO _card FROM jsonb_array_elements(public.list_orphan_cards(_limit := 60)->'rows') r
   WHERE r->>'code' = 'RV-L';
  RESET ROLE;
  IF _card IS NULL OR _card->>'region' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: البطاقة غائبة أو لا تحجب (%)', _card;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency)
  VALUES ('dcc00000-0000-4000-8000-000000000003', 'dcc30000-0000-4000-8000-00000000000a', 5, 'USD')
  RETURNING id INTO _s;
  _l := public.sponsorship_ledger(_s);
  IF _l->'orphan'->>'region' IS NOT NULL THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — CP-05: سجلّ الكفالة المعلّقة يكشف منطقة الحشد الصغير (%)',
      _l->'orphan'->>'region';
  END IF;
  UPDATE public.sponsorships SET status = 'cancelled' WHERE id = _s;
  _l := public.sponsorship_ledger(_s);
  RESET ROLE;
  IF _l->'orphan'->>'region' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — CP-05: السجلّ بعد الإلغاء يكشف المنطقة';
  END IF;
  RAISE NOTICE 'PASS — CP-05: كفالةٌ «بانتظار الدفع» (ثم ملغاة) لا تفتح منطقة الحشد الصغير في السجلّ';
END $$;

-- والكافل الحاليّ يرى المنطقة في سجلّه كما يراها في الملفّ.
DO $$
DECLARE _l JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  _l := public.sponsorship_ledger('dcc90000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _l->'orphan'->>'region' IS DISTINCT FROM 'تيرانا-مراجعة' THEN
    RAISE EXCEPTION 'FAIL — حُجبت المنطقة عن الكافل الحاليّ (%)', _l->'orphan';
  END IF;
  RAISE NOTICE 'PASS — CP-05: الكافل الحاليّ يرى المنطقة في السجلّ كما في الملفّ';
END $$;

-- (٢) قائمة مناطق الاقتراح لا تسرد منطقةً لا حشد آمناً فيها.
DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _r := public.published_regions();
  RESET ROLE;
  IF _r ? 'كوكس-مراجعة' THEN
    RAISE EXCEPTION 'FAIL — CP-05: published_regions تُنبئ بطفلٍ وحيدٍ في كوكس';
  END IF;
  RAISE NOTICE 'PASS — CP-05: published_regions لا تسرد منطقة الحشد الصغير';
END $$;

-- (٣) الزائر: كتالوج الدعم ← مجموعة كوكس ← أطفال المجموعة.
DO $$
DECLARE _g JSONB; _cards JSONB;
BEGIN
  SET LOCAL ROLE anon;
  SELECT g INTO _g FROM jsonb_array_elements(public.support_catalog()->'groups') g
   WHERE g->>'id' = 'dcc80000-0000-4000-8000-000000000001';
  _cards := public.list_orphan_cards(_group := 'dcc80000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _g IS NULL THEN RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: المجموعة غائبة'; END IF;
  IF _g->>'region' IS NOT NULL OR _g->>'children' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — CP-05: الكتالوج يُعلن منطقة المجموعة أو عددها الصغير (%)', _g;
  END IF;
  IF (SELECT bool_or(r->>'code' = 'RV-L') FROM jsonb_array_elements(_cards->'rows') r) THEN
    RAISE EXCEPTION 'FAIL — CP-05: «أطفال المجموعة» تُعيد طفل الحشد الصغير';
  END IF;
  IF public.support_catalog()->'regions' @> '[{"country":"AL","name":"كوكس-مراجعة"}]' THEN
    RAISE EXCEPTION 'FAIL — CP-05: منطقة المجموعة دخلت قائمة المناطق';
  END IF;
  RAISE NOTICE 'PASS — CP-05: المجموعة لا تُعلن منطقةً ولا عدداً صغيراً، ولا تقود إلى طفل الحشد الصغير';
END $$;

-- =====================================================================
-- CP-05 — الخارطة: الطرح لا يثبّت منطقةً مخفيّة
-- =====================================================================
-- «البلد ١٢، تيرانا ٦، شكودر ٥، كوكس ١»: كانت شكودر «مُخفاة» (≥٥) وكوكس
-- «صغيرة» (≥١)، فـ ١٢ − ٦ = ٥ + ١ بالضبط.
INSERT INTO public.orphans (code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
SELECT 'RV-G' || g, 'طفل ' || g, 'dcc20000-0000-4000-8000-00000000000a',
       'dcc00000-0000-4000-8000-000000000002', 'GeoLand-R', r, 100, 'approved', now()
  FROM (SELECT g, CASE WHEN g <= 6 THEN 'Tirana-R' WHEN g <= 11 THEN 'Shkodër-R' ELSE 'Kukës-R' END AS r
          FROM generate_series(1, 12) g) v;

DO $$
DECLARE _c JSONB; _hidden JSONB[]; _shown INTEGER; _h INTEGER; _rr INTEGER; _names TEXT[];
BEGIN
  SET LOCAL ROLE anon;
  SELECT c INTO _c FROM jsonb_array_elements(public.geo_stats()->'countries') c
   WHERE c->>'country' = 'GeoLand-R';
  RESET ROLE;
  IF _c IS NULL OR (_c->>'total')::int <> 12 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: البلد غائب أو عدده محجوب (%)', _c;
  END IF;

  SELECT array_agg(r ORDER BY ord), count(*)
    INTO _hidden, _h
    FROM jsonb_array_elements(_c->'regions') WITH ORDINALITY x(r, ord)
   WHERE r->>'total' IS NULL;
  SELECT COALESCE(sum((r->>'total')::int), 0) INTO _shown
    FROM jsonb_array_elements(_c->'regions') r WHERE r->>'total' IS NOT NULL;
  _rr := 12 - _shown;

  -- علامةٌ واحدة: المخفيّات لا تختلف إلا في الاسم.
  IF (SELECT count(DISTINCT (h - 'region')::text) FROM unnest(_hidden) h) > 1 THEN
    RAISE EXCEPTION 'FAIL — CP-05: المخفيّات بعلاماتٍ مختلفة تُفرّق الصغيرة عن المُخفاة: %', _hidden;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(_hidden) h WHERE h ? 'suppressed') THEN
    RAISE EXCEPTION 'FAIL — CP-05: علامة «suppressed» ما زالت تُنشر';
  END IF;
  -- والمخفيّات بالاسم لا بالعدد.
  SELECT array_agg(h->>'region' ORDER BY o) INTO _names FROM unnest(_hidden) WITH ORDINALITY u(h, o);
  IF _names IS DISTINCT FROM (SELECT array_agg(n ORDER BY n) FROM unnest(_names) n) THEN
    RAISE EXCEPTION 'FAIL — CP-05: المخفيّات مرتّبةٌ بعددها الحقيقي: %', _names;
  END IF;
  -- وأكبر ما يمكن أن تكونه مخفيّةٌ لا يقلّ عن الحدّ: لا تُثبَت صغيرةً بالطرح.
  IF _h > 0 AND _rr - _h + 1 < public.cohort_min() THEN
    RAISE EXCEPTION 'FAIL — CP-05: الباقي % على % مخفيّة يُثبت أنها صغيرة', _rr, _h;
  END IF;
  IF _h < 2 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: لا إخفاء تكميلي (%)', _c->'regions';
  END IF;
  RAISE NOTICE 'PASS — CP-05: الخارطة بعلامةٍ واحدة وترتيبٍ بالاسم — ١٢ − % لا يُثبّت أيّاً من % مخفيّة',
    _shown, _h;
END $$;


-- =====================================================================
-- CP-04 — نصّ الاحتياج
-- =====================================================================
DO $$
DECLARE _n INTEGER; _ok BOOLEAN := false; _v JSONB; _title TEXT;
BEGIN
  -- الجهة تضيف بنداً بنصٍّ يدلّ على مكانه — على طفلٍ منشور.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  INSERT INTO public.orphan_needs (orphan_id, category, title, monthly_amount, notes, text_reviewed)
  VALUES ('dcc30000-0000-4000-8000-00000000000b', 'education',
          'Books for Shkolla 9-vjeçare Kukës', 0, 'lives with grandmother at Rruga 5', true);
  RESET ROLE;

  -- الزائر بنداء REST.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims', '', true);
    SELECT count(*) INTO _n FROM public.orphan_needs;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — CP-04: الزائر يقرأ نصّ الاحتياج (% صفّاً)', _n;
  END IF;

  -- وحسابٌ جديد.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  SELECT count(*) INTO _n FROM public.orphan_needs
   WHERE orphan_id = 'dcc30000-0000-4000-8000-00000000000b';
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL — CP-04: حسابٌ جديد يقرأ نصّ الاحتياج (%)', _n; END IF;

  -- والكافل يرى البند بفئته ومبلغه، وعنوانه بعد أن تراه الإدارة.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  _v := public.orphan_view('dcc30000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF _v::text LIKE '%Shkolla%' OR _v::text LIKE '%grandmother%' THEN
    RAISE EXCEPTION 'FAIL — CP-04: نصٌّ لم يُراجَع وصل الكافل: %', _v->'detail'->'needs';
  END IF;
  IF jsonb_array_length(_v->'detail'->'needs') <> 2 THEN
    RAISE EXCEPTION 'FAIL — البند غاب عن الكافل كلّه بدل عنوانه: %', _v->'detail'->'needs';
  END IF;
  IF (SELECT text_reviewed FROM public.orphan_needs WHERE title LIKE 'Books for%') THEN
    RAISE EXCEPTION 'FAIL — CP-04: الجهة كتبت «راجعته الإدارة» بنفسها';
  END IF;
  RAISE NOTICE 'PASS — CP-04: نصّ الاحتياج لا يقرؤه الزائر ولا الغريب، ولا يصل الكافل قبل المراجعة';

  -- الإدارة ترفضه: يبقى البند بمبلغه وعنوانٍ محايد.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.review_orphan_edit('dcc30000-0000-4000-8000-00000000000b', 'rejected', NULL);
  RESET ROLE;
  SELECT title INTO _title FROM public.orphan_needs
   WHERE orphan_id = 'dcc30000-0000-4000-8000-00000000000b' AND category = 'education'
     AND title NOT LIKE 'كتب%';
  IF _title IS DISTINCT FROM 'بند' THEN
    RAISE EXCEPTION 'FAIL — رفض الإدارة لم يطوِ النصّ (%)', _title;
  END IF;
  RAISE NOTICE 'PASS — CP-04: رفض الإدارة يطوي النصّ ويُبقي البند';
END $$;


-- =====================================================================
-- CP-04 — المرشد لا يقرأ اسم المدرسة من الجدول
-- =====================================================================
INSERT INTO public.orphan_profile_sections (orphan_id, section, data, note)
VALUES ('dcc30000-0000-4000-8000-00000000000b', 'education',
        '{"grade":5,"school_name":"Shkolla Kukës"}', 'يمشي إلى المدرسة وحده');

DO $$
DECLARE _role UUID; _n INTEGER; _p JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _role := public.assign_enrollment_role('dcc40000-0000-4000-8000-000000000001', 'mentor',
             NULL, 'rv-mentor@example.test', NULL, NULL);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.decide_enrollment_role(_role, 'approved', 365, NULL);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000006","role":"authenticated"}', true);
  SELECT count(*) INTO _n FROM public.orphan_profile_sections
   WHERE orphan_id = 'dcc30000-0000-4000-8000-00000000000b';
  _p := public.orphan_profile('dcc30000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF NOT (_p->>'may_read')::boolean THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: المرشد المعتمد لا يقرأ الملفّ';
  END IF;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — CP-04: المرشد يقرأ الأقسام من الجدول مباشرةً (% صفّاً)', _n;
  END IF;
  IF _p::text LIKE '%Shkolla%' THEN
    RAISE EXCEPTION 'FAIL — CP-04: orphan_profile تكشف المدرسة للمرشد';
  END IF;
  RAISE NOTICE 'PASS — CP-04: المرشد يقرأ الملفّ عبر orphan_profile وحدها — لا اسم مدرسةٍ بنداء REST';
END $$;


-- =====================================================================
-- CP-01 — المشرف المنقضي أجلُه لا يعمل، والإذن من دورٍ معلّق لا يُحسب
-- =====================================================================
DO $$
DECLARE _role UUID; _list JSONB; _sup UUID; _ok BOOLEAN := false; _today JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _role := public.assign_enrollment_role('dcc40000-0000-4000-8000-000000000001', 'supervisor',
             NULL, 'rv-supervisor@example.test', NULL, NULL);
  RESET ROLE;

  -- الأجل ينقضي (كما يحدث بعد سنة).
  UPDATE public.enrollment_roles SET expires_at = now() - interval '1 day' WHERE id = _role;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  _list := public.my_supervised_enrollments();
  _today := public.my_supervisor_today();
  _sup := public.enrollment_supervisor('dcc40000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.record_unit_progress('dcc40000-0000-4000-8000-000000000001',
              (SELECT u.id FROM public.program_units u
                 JOIN public.program_enrollments e ON e.program_id = u.program_id
                WHERE e.id = 'dcc40000-0000-4000-8000-000000000001' AND u.active
                ORDER BY u.ordinal LIMIT 1),
              'accepted', 'محضر الجلسة', NULL);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;

  IF jsonb_array_length(_list) <> 0 OR jsonb_array_length(_today) <> 0 THEN
    RAISE EXCEPTION 'FAIL — CP-01: المشرف المنقضي أجلُه يرى قائمته (%)', _list;
  END IF;
  IF _sup IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — CP-01: enrollment_supervisor تُعيد مشرفاً منقضي الأجل';
  END IF;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — CP-01: المشرف المنقضي أجلُه سجّل تقويم جلسة';
  END IF;
  IF (public.enrollment_supervisor_standing('dcc40000-0000-4000-8000-000000000001')->>'assigned')::boolean THEN
    RAISE EXCEPTION 'FAIL — CP-01: الملفّ العامّ يُعلن مشرفاً منقضي الأجل';
  END IF;
  RAISE NOTICE 'PASS — CP-01: المشرف المنقضي أجلُه لا يرى قائمته ولا يسجّل ولا يُعلَن';

  -- التجديد يعيده.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.decide_enrollment_role(_role, 'approved', 365, 'renewed');
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  _sup := public.enrollment_supervisor('dcc40000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _sup IS DISTINCT FROM 'dcc00000-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'FAIL — تجديد الإدارة لم يُعد المشرف';
  END IF;
  RAISE NOTICE 'PASS — CP-01: تجديد الإدارة يعيد المشرف إلى عمله';
END $$;

DO $$
DECLARE _role UUID;
BEGIN
  -- وليٌّ بحساب أسندته الجهة (معلّق)، وإذنٌ مكتوبٌ قبل هذه القواعد.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _role := public.assign_enrollment_role('dcc40000-0000-4000-8000-000000000001', 'guardian',
             NULL, 'rv-guardian@example.test', NULL, NULL);
  RESET ROLE;
  UPDATE public.enrollment_roles SET consent_at = now(), consent_document = 'legacy' WHERE id = _role;

  IF public.enrollment_has_consent('dcc40000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — CP-01: إذنُ وليٍّ لم تعتمده الإدارة يُحسب';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.decide_enrollment_role(_role, 'approved', 365, NULL);
  RESET ROLE;
  IF NOT public.enrollment_has_consent('dcc40000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — اعتماد الوليّ لم يُحسب إذنه';
  END IF;
  UPDATE public.enrollment_roles SET expires_at = now() - interval '1 day' WHERE id = _role;
  IF public.enrollment_has_consent('dcc40000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — CP-01: إذن وليٍّ منقضي الأجل يُحسب';
  END IF;
  RAISE NOTICE 'PASS — CP-01: الإذن يُحسب من دورٍ معتمَدٍ لم ينقضِ وحده';
END $$;


-- =====================================================================
-- CP-01 — الدور الذي ينقضي يعود إلى صندوق الإدارة
-- =====================================================================
DO $$
DECLARE _inbox JSONB; _ctx JSONB; _role UUID;
BEGIN
  SELECT id INTO _role FROM public.enrollment_roles
   WHERE enrollment_id = 'dcc40000-0000-4000-8000-000000000001' AND role = 'mentor'
     AND ended_at IS NULL;
  UPDATE public.enrollment_roles SET expires_at = now() + interval '10 days' WHERE id = _role;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _inbox := public.admin_decision_inbox();
  _ctx := public.admin_decision_context('circle_role_renewal', _role);
  RESET ROLE;
  IF NOT _inbox @> jsonb_build_array(jsonb_build_object('kind', 'circle_role_renewal', 'id', _role)) THEN
    RAISE EXCEPTION 'FAIL — CP-01: دورٌ ينقضي بعد عشرة أيام لا يظهر في صندوق الإدارة';
  END IF;
  -- والوليّ المنقضي أجلُه (أعلاه) يظهر كذلك.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_inbox) i
                  WHERE i->>'kind' = 'circle_role_renewal' AND i->>'subtitle' LIKE '%انقضى%') THEN
    RAISE EXCEPTION 'FAIL — CP-01: الدور المنقضي لا يعود للإدارة';
  END IF;
  IF _ctx->>'expires_at' IS NULL OR _ctx->>'person_email' IS DISTINCT FROM 'rv-mentor@example.test' THEN
    RAISE EXCEPTION 'FAIL — سياق التجديد ناقص: %', _ctx;
  END IF;
  RAISE NOTICE 'PASS — CP-01: الدور الذي ينقضي خلال ٣٠ يوماً أو انقضى يعود إلى صندوق الإدارة للتجديد';
END $$;


-- =====================================================================
-- CP-02 — صورة الطفل في خزنةٍ خاصّة
-- =====================================================================
UPDATE public.orphans SET photo_consent = 'face_hidden',
                          photo_url = 'dcc30000-0000-4000-8000-00000000000b/face.jpg'
 WHERE id = 'dcc30000-0000-4000-8000-00000000000b';
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('public-media', 'dcc30000-0000-4000-8000-00000000000b/old-public.jpg'),
  ('orphan-photos', 'dcc30000-0000-4000-8000-00000000000b/face.jpg');
INSERT INTO public.orphan_access_requests
  (orphan_id, requester_id, reason, status, decided_by, decided_at, expires_at, granted_scopes)
VALUES ('dcc30000-0000-4000-8000-00000000000b', 'dcc00000-0000-4000-8000-000000000007',
        'شريكٌ مؤسّسيّ يتابع ملفّ الطفل بعقدٍ موقَّع', 'approved',
        'dcc00000-0000-4000-8000-000000000001', now(), now() + interval '30 days',
        ARRAY['identity']);

DO $$
DECLARE _anon INTEGER; _sponsor INTEGER; _viewer INTEGER; _after INTEGER; _v JSONB;
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'orphan-photos') THEN
    RAISE EXCEPTION 'FAIL — CP-02: خزنة صور الأطفال عامّة';
  END IF;
  IF public.photo_url_is_platform('dcc30000-0000-4000-8000-00000000000b',
       'https://abcd.supabase.co/storage/v1/object/public/public-media/dcc30000-0000-4000-8000-00000000000b/x.jpg') THEN
    RAISE EXCEPTION 'FAIL — CP-02: رابط الخزنة العامّة ما زال مقبولاً لصورة الطفل';
  END IF;

  -- الزائر يسرد مجلّد الطفل في الخزنتين.
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO _anon FROM storage.objects
   WHERE name LIKE 'dcc30000-0000-4000-8000-00000000000b/%';
  RESET ROLE;
  IF _anon <> 0 THEN
    RAISE EXCEPTION 'FAIL — CP-02: الزائر يسرد صور الطفل (% ملفّ)', _anon;
  END IF;

  -- الكافل بلا نطاق «الهوية».
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  SELECT count(*) INTO _sponsor FROM storage.objects
   WHERE name LIKE 'dcc30000-0000-4000-8000-00000000000b/%';
  -- ومن له «الهوية» بإذن الإدارة.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000007","role":"authenticated"}', true);
  SELECT count(*) INTO _viewer FROM storage.objects
   WHERE bucket_id = 'orphan-photos' AND name LIKE 'dcc30000-0000-4000-8000-00000000000b/%';
  _v := public.orphan_view('dcc30000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF _sponsor <> 0 THEN
    RAISE EXCEPTION 'FAIL — CP-02: الصورة تُقرأ بلا نطاق «الهوية» (% ملفّ)', _sponsor;
  END IF;
  IF _viewer <> 1 OR _v->'detail'->>'photo_url' IS DISTINCT FROM 'dcc30000-0000-4000-8000-00000000000b/face.jpg' THEN
    RAISE EXCEPTION 'FAIL — صاحب «الهوية» لا يصل الصورة (%، %)', _viewer, _v->'detail'->>'photo_url';
  END IF;

  -- الوليّ يسحب موافقته: لا رابط جديد بعدها.
  UPDATE public.orphans SET photo_consent = 'withdrawn'
   WHERE id = 'dcc30000-0000-4000-8000-00000000000b';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000007","role":"authenticated"}', true);
  SELECT count(*) INTO _after FROM storage.objects
   WHERE bucket_id = 'orphan-photos' AND name LIKE 'dcc30000-0000-4000-8000-00000000000b/%';
  RESET ROLE;
  IF _after <> 0 THEN
    RAISE EXCEPTION 'FAIL — CP-02: الصورة تُقرأ بعد سحب الموافقة';
  END IF;
  RAISE NOTICE 'PASS — CP-02: الصورة في خزنةٍ خاصّة — لا يسردها الزائر ولا من لا «هوية» له، وتُغلق بالسحب';
END $$;


-- =====================================================================
-- DB-07 — التعديل يُمسَك، والمنشور يبقى كما رُوجع
-- =====================================================================
DO $$
DECLARE _st TEXT; _v JSONB; _rows INTEGER; _story TEXT; _p JSONB;
BEGIN
  -- الجهة تصحّح حرفاً في قصّة طفلٍ مكفولٍ مقفول.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  UPDATE public.orphans SET story = 'قصّةٌ صُحّح فيها حرف.'
   WHERE id = 'dcc30000-0000-4000-8000-00000000000b';
  RESET ROLE;

  SELECT status::text, story INTO _st, _story FROM public.orphans
   WHERE id = 'dcc30000-0000-4000-8000-00000000000b';
  SELECT changes INTO _p FROM public.orphan_pending_edits
   WHERE orphan_id = 'dcc30000-0000-4000-8000-00000000000b';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  _v := public.orphan_view('dcc30000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO _rows FROM public.orphans WHERE id = 'dcc30000-0000-4000-8000-00000000000b';
  RESET ROLE;

  IF _st NOT IN ('approved', 'fully_sponsored') OR _v = 'null'::jsonb OR _rows <> 1 THEN
    RAISE EXCEPTION 'FAIL — DB-07: تصحيح حرفٍ أسقط الطفل المكفول من النشر ومن لوحة كافله (status=%)', _st;
  END IF;
  IF _story IS DISTINCT FROM 'قصّةٌ راجعتها الإدارة.' OR _p->>'story' IS DISTINCT FROM 'قصّةٌ صُحّح فيها حرف.' THEN
    RAISE EXCEPTION 'FAIL — DB-07: النصّ الجديد نُشر قبل المراجعة أو لم يُمسَك (%، %)', _story, _p;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'orphan.edit_held_for_review'
                    AND entity_id = 'dcc30000-0000-4000-8000-00000000000b') THEN
    RAISE EXCEPTION 'FAIL — DB-07: الإمساك بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — DB-07: تعديل قصّة الطفل المكفول يُمسَك للمراجعة، ويبقى منشوراً لكافله كما رُوجع';

  -- الإدارة تعتمد: يُكتب التعديل ويُطوى الإمساك.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  IF NOT public.admin_decision_inbox() @> jsonb_build_array(jsonb_build_object(
           'kind', 'orphan_edit', 'id', 'dcc30000-0000-4000-8000-00000000000b')) THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — DB-07: التعديل الممسوك لا يظهر في صندوق الإدارة';
  END IF;
  PERFORM public.review_orphan_edit('dcc30000-0000-4000-8000-00000000000b', 'approved', NULL);
  RESET ROLE;
  IF (SELECT story FROM public.orphans WHERE id = 'dcc30000-0000-4000-8000-00000000000b')
       IS DISTINCT FROM 'قصّةٌ صُحّح فيها حرف.'
     OR EXISTS (SELECT 1 FROM public.orphan_pending_edits
                 WHERE orphan_id = 'dcc30000-0000-4000-8000-00000000000b') THEN
    RAISE EXCEPTION 'FAIL — اعتماد الإدارة لم يكتب التعديل';
  END IF;
  RAISE NOTICE 'PASS — DB-07: اعتماد الإدارة يكتب التعديل الممسوك ويطويه';
END $$;

-- ومراجعةٌ تفتحها الإدارة لا تُغيّب الطفل عن كافله الحاليّ.
DO $$
DECLARE _v JSONB; _rows INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.review_orphan('dcc30000-0000-4000-8000-00000000000c', 'under_review', NULL, NULL);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  _v := public.orphan_view('dcc30000-0000-4000-8000-00000000000c');
  SELECT count(*) INTO _rows FROM public.orphans WHERE id = 'dcc30000-0000-4000-8000-00000000000c';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  IF public.orphan_view('dcc30000-0000-4000-8000-00000000000c') <> 'null'::jsonb THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — ملفٌّ قيد المراجعة ظهر لغير كافله';
  END IF;
  RESET ROLE;
  IF _v = 'null'::jsonb OR _rows <> 1 THEN
    RAISE EXCEPTION 'FAIL — DB-07: الكافل فقد طفله حين فُتحت مراجعته («ملف محذوف»)';
  END IF;
  RAISE NOTICE 'PASS — DB-07: الكافل الحاليّ يبقى يرى طفله ولو غاب عن النشر، وغيرُه لا يراه';
END $$;


-- =====================================================================
-- DB-07 — الشريك: استيرادٌ، ثم اعتمادٌ بوثائق، ثم مزامنة
-- =====================================================================
INSERT INTO public.api_clients (id, name, client_key, secret_hash, org_id, scopes)
VALUES ('dcc50000-0000-4000-8000-00000000000d', 'شريك المراجعة', 'ioso_live_review', 'x',
        'dcc20000-0000-4000-8000-00000000000a', ARRAY['orphans:import']);

DO $$
DECLARE _r JSONB; _id UUID; _st TEXT; _p JSONB; _err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);  -- مفتاح الخدمة: لا جلسة مستخدم
  SET LOCAL ROLE service_role;
  _r := public.import_orphan_record('dcc50000-0000-4000-8000-00000000000d', jsonb_build_object(
          'external_ref', 'RV-EXT-1', 'display_name', 'دريتون', 'country', 'ألبانيا-مراجعة',
          'region', 'تيرانا-مراجعة', 'story', 'قصّة الشريك', 'monthly_need', 80));
  RESET ROLE;
  _id := (_r->>'id')::uuid;
  IF _r->>'status' IS DISTINCT FROM 'under_review' THEN
    RAISE EXCEPTION 'FAIL — المستورَد لم يدخل للمراجعة: %', _r;
  END IF;

  -- بلا وثائق لا يُعتمد — والإدارة ترفعها وتوثّقها نيابةً عن الشريك.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dcc00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.review_orphan(_id, 'approved', NULL, NULL);
    _err := 'approved';
  EXCEPTION WHEN check_violation THEN _err := 'blocked';
  END;
  INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, file_name)
  VALUES (_id, 'death_certificate', 'death_certificate', _id || '/death.pdf', 'death.pdf'),
         (_id, 'guardianship_proof', 'guardianship_proof', _id || '/guardianship.pdf', 'g.pdf');
  UPDATE public.orphan_documents SET verified = true, verified_by = auth.uid(), verified_at = now()
   WHERE orphan_id = _id;
  PERFORM public.review_orphan(_id, 'approved', NULL, NULL);
  RESET ROLE;
  IF _err <> 'blocked' THEN
    RAISE EXCEPTION 'FAIL — CP-06: مستورَدٌ بلا وثائق اعتُمد';
  END IF;

  -- المزامنة: القيم نفسها لا تترك شيئاً، والوصف الجديد يُمسَك ولا يُسقط النشر.
  PERFORM set_config('request.jwt.claims', '', true);  -- مفتاح الخدمة: لا جلسة مستخدم
  SET LOCAL ROLE service_role;
  PERFORM public.import_orphan_record('dcc50000-0000-4000-8000-00000000000d', jsonb_build_object(
            'external_ref', 'RV-EXT-1', 'display_name', 'دريتون', 'story', 'قصّة الشريك'));
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.orphan_pending_edits WHERE orphan_id = _id) THEN
    RAISE EXCEPTION 'FAIL — DB-07: مزامنةٌ بالقيم نفسها أُمسكت كتعديل';
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);  -- مفتاح الخدمة: لا جلسة مستخدم
  SET LOCAL ROLE service_role;
  _r := public.import_orphan_record('dcc50000-0000-4000-8000-00000000000d', jsonb_build_object(
          'external_ref', 'RV-EXT-1', 'story', 'وصفٌ محدَّث من الشريك'));
  RESET ROLE;
  SELECT status::text INTO _st FROM public.orphans WHERE id = _id;
  SELECT changes INTO _p FROM public.orphan_pending_edits WHERE orphan_id = _id;
  IF _st <> 'approved' OR _r->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — DB-07: مزامنة الشريك أسقطت الطفل من النشر (%)', _st;
  END IF;
  IF _p->>'story' IS DISTINCT FROM 'وصفٌ محدَّث من الشريك'
     OR (SELECT story FROM public.orphans WHERE id = _id) <> 'قصّة الشريك' THEN
    RAISE EXCEPTION 'FAIL — DB-07: وصف الشريك نُشر بلا مراجعة أو لم يُمسَك (%)', _p;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'orphan.edit_held_for_review'
                    AND entity_id = _id AND meta->>'via' = 'service') THEN
    RAISE EXCEPTION 'FAIL — DB-07: إمساك المزامنة بلا أثرٍ يسمّي قناتها';
  END IF;
  RAISE NOTICE 'PASS — DB-07: الشريك — استيراد ← اعتمادٌ بوثائق موثَّقة ← مزامنةٌ تُمسَك ولا تُسقط النشر';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المراجعة اجتازت ──'; END $$;
ROLLBACK;
