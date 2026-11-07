-- =====================================================================
-- حماية الحشد بلا كلفةٍ تربيعية — إثبات (PERF-01 / RT-01 / PERF-03)
-- ---------------------------------------------------------------------
-- الاستغلال: `cohort_is_safe` كانت تمسح كلّ الأطفال المنشورين لكلّ طفلٍ
-- في الدليل، فيتجاوز نداءُ الزائر مهلة Supabase (نحو ٣ ثوانٍ) من بضع
-- مئات، ويظهر الدليل فارغاً بصمت. الفحص الأخير هنا يبذر ألفي طفل ويطلب
-- الدليل تحت مهلة ٣ ثوانٍ: يسقط قبل الهجرة 20261106120000 ويمرّ بعدها.
--
-- والإصلاح لا يُقبل إلا إن كان الحجب نفسه حرفاً: التعريفات القديمة
-- تُنسخ هنا كما كانت (في pg_temp) وتُقارن مخرجاتها بالجديدة على بياناتٍ
-- مولّدة فيها كلّ الحالات الحدّية: حشدٌ من أربعة منشورين ومعهم غير
-- منشورين، حشدٌ من خمسة بالضبط، منطقةٌ فارغة، تاريخ ميلادٍ مجهول وآخر
-- في المستقبل، مسافةٌ زائدة في اسم المنطقة، وحدّ الفئة العمرية.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c0400000-0000-4000-8000-000000000001', 'cq-admin@example.test', '{}'::jsonb),
  ('c0400000-0000-4000-8000-000000000002', 'cq-org@example.test', '{"role":"care_org"}'::jsonb),
  ('c0400000-0000-4000-8000-000000000003', 'cq-sponsor@example.test', '{}'::jsonb),
  ('c0400000-0000-4000-8000-000000000004', 'cq-sponsor2@example.test', '{}'::jsonb),
  ('c0400000-0000-4000-8000-000000000005', 'cq-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('c0400000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('c0400000-0000-4000-8000-00000000000a',
        'c0400000-0000-4000-8000-000000000002', 'جهة الحشود', 'approved');

-- ---------------------------------------------------------------------
-- البيانات: حالاتٌ حدّية صريحة، ثم ملءٌ عشوائيّ ببذرةٍ ثابتة
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _cq (
  n INT, region TEXT, gender TEXT, birth DATE,
  status public.orphan_status, stage TEXT
);
INSERT INTO _cq
-- أربعة منشورون + ثلاثة غير منشورين بالصفات نفسها: الحشد أربعة → محجوب.
SELECT g, 'Four', 'male', CURRENT_DATE - interval '9 years',
       (CASE WHEN g <= 4 THEN 'approved' WHEN g <= 6 THEN 'under_review' ELSE 'draft' END)::public.orphan_status,
       'ابتدائي'
  FROM generate_series(1, 7) g
UNION ALL
-- خمسة بالضبط، ثلاثة معتمدون واثنان مكفولان كلّياً → ظاهر.
SELECT g, 'Five', 'female', CURRENT_DATE - interval '9 years',
       (CASE WHEN g <= 3 THEN 'approved' ELSE 'fully_sponsored' END)::public.orphan_status,
       'متوسط'
  FROM generate_series(1, 5) g
UNION ALL
-- «Five » بمسافة: حشدٌ آخر من واحد → محجوب.
SELECT 1, 'Five ', 'female', CURRENT_DATE - interval '9 years', 'approved', 'متوسط'
UNION ALL
-- منطقةٌ مجهولة وميلادٌ مجهول: ستّة → ظاهر (NULL كقيمةٍ واحدة).
SELECT g, NULL, 'male', NULL, 'approved', NULL FROM generate_series(1, 6) g
UNION ALL
-- منطقةٌ مجهولة، ميلادان في المستقبل وواحدٌ مجهول: كلّها «unknown» → ثلاثة.
SELECT g, NULL, 'female',
       CASE WHEN g <= 2 THEN (CURRENT_DATE + 30) END, 'approved', '  '
  FROM generate_series(1, 3) g
UNION ALL
-- منطقةٌ فارغة: خمسة → ظاهر، لكنّها لا تُدرج في الخيارات.
SELECT g, '', 'male', CURRENT_DATE - interval '16 years', 'approved', 'ثانوي'
  FROM generate_series(1, 5) g
UNION ALL
-- حدّ الفئة: ثلاثة في الحادية عشرة وثلاثة في الثانية عشرة → حشدان من ثلاثة.
SELECT g, 'Edge', 'male',
       CASE WHEN g <= 3 THEN CURRENT_DATE - interval '11 years 360 days'
            ELSE CURRENT_DATE - interval '12 years 5 days' END,
       'approved', 'ابتدائي'
  FROM generate_series(1, 6) g;

DO $$ BEGIN PERFORM setseed(0.2026); END $$;
INSERT INTO _cq
SELECT g,
       CASE WHEN random() < 0.08 THEN NULL
            ELSE 'CQ-R' || floor(power(random(), 2) * 10)::int END,
       CASE WHEN random() < 0.5 THEN 'male' ELSE 'female' END,
       CASE WHEN random() < 0.05 THEN NULL
            ELSE CURRENT_DATE - (floor(random() * 6600))::int END,
       (CASE WHEN random() < 0.75 THEN 'approved'
             WHEN random() < 0.6 THEN 'fully_sponsored'
             ELSE 'submitted' END)::public.orphan_status,
       (ARRAY['روضة', 'ابتدائي', 'متوسط', 'ثانوي', NULL])[1 + floor(random() * 5)::int]
  FROM generate_series(1, 170) g;

INSERT INTO public.orphans
  (code, display_name, gender, birth_date, country, region, education_stage,
   org_id, created_by, monthly_need, funded_monthly, status, approved_at, created_at)
SELECT 'CQ-' || row_number() OVER (ORDER BY c.region NULLS FIRST, c.n, c.gender, c.status),
       'طفل حشد ' || row_number() OVER (ORDER BY c.region NULLS FIRST, c.n, c.gender, c.status),
       c.gender, c.birth, 'بلد الحشود', c.region, c.stage,
       'c0400000-0000-4000-8000-00000000000a', 'c0400000-0000-4000-8000-000000000002',
       100 + (c.n % 7) * 25,
       CASE WHEN c.status = 'fully_sponsored' THEN 100 + (c.n % 7) * 25
            ELSE (c.n % 4) * 20 END,
       c.status,
       now() - ((c.n * 13) % 300) * interval '1 day',
       now() - ((c.n * 17) % 400) * interval '1 day'
  FROM _cq c;

-- ---------------------------------------------------------------------
-- التعريفات القديمة كما كانت قبل 20261106120000 — مرجع المقارنة
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.old_cohort_is_safe(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT (
    SELECT count(*) FROM public.orphans x, public.orphans o
     WHERE o.id = _orphan
       AND x.status IN ('approved', 'fully_sponsored')
       AND x.country IS NOT DISTINCT FROM o.country
       AND x.region IS NOT DISTINCT FROM o.region
       AND x.gender IS NOT DISTINCT FROM o.gender
       AND public.age_band_of(x.birth_date) = public.age_band_of(o.birth_date)
  ) >= public.cohort_min();
$fn$;

CREATE FUNCTION pg_temp.old_list_orphan_cards(
  _country TEXT DEFAULT NULL, _region TEXT DEFAULT NULL, _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL, _education_stage TEXT DEFAULT NULL, _funding TEXT DEFAULT NULL,
  _building BOOLEAN DEFAULT NULL, _search TEXT DEFAULT NULL, _sort TEXT DEFAULT 'waiting',
  _limit INT DEFAULT 24, _offset INT DEFAULT 0, _group UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           CASE WHEN pg_temp.old_cohort_is_safe(o.id) THEN o.region END AS region,
           CASE WHEN pg_temp.old_cohort_is_safe(o.id) THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           /* والجهة تُحجب مع المنطقة منذ 20261106140000 (١ب) — حكمٌ لا أداء. */
           o.status, CASE WHEN pg_temp.old_cohort_is_safe(o.id) THEN o.org_id END AS org_id,
           o.created_at, o.group_id,
           public.age_band_of(o.birth_date) AS age_band,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
               JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building,
           GREATEST(0, (now()::date - COALESCE(o.approved_at, o.created_at)::date))::INTEGER
             AS waiting_days,
           (SELECT count(*) FROM public.orphan_profile_sections p
             WHERE p.orphan_id = o.id)::INTEGER AS profile_sections,
           (o.photo_consent IN ('granted', 'face_hidden')) AS consent_documented,
           EXISTS (SELECT 1 FROM public.progress_reports r
                    WHERE r.orphan_id = o.id AND r.status = 'approved'
                      AND r.updated_at > now() - interval '90 days') AS recent_report
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       AND (_group IS NULL OR b.group_id = _group)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN _sort = 'documented' THEN f.profile_sections END DESC,
          CASE WHEN _sort = 'documented' THEN f.recent_report END DESC,
          CASE WHEN COALESCE(_sort,'waiting') = 'waiting' THEN f.waiting_days END DESC,
          f.id
      ) AS ord
        FROM filtered f
       ORDER BY ord
       LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 60)
      OFFSET GREATEST(COALESCE(_offset, 0), 0)
    ) t;

  RETURN jsonb_build_object('rows', _rows, 'total', _total);
END $fn$;

CREATE FUNCTION pg_temp.old_orphan_filter_options()
RETURNS JSONB LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT o.country) FROM public.orphans o
                            WHERE o.status IN ('approved','fully_sponsored')
                              AND COALESCE(btrim(o.country), '') <> ''), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT o.region) FROM public.orphans o
                          WHERE o.status IN ('approved','fully_sponsored')
                            AND COALESCE(btrim(o.region), '') <> ''
                            AND pg_temp.old_cohort_is_safe(o.id)), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(DISTINCT o.education_stage) FROM public.orphans o
                         WHERE o.status IN ('approved','fully_sponsored')
                           AND COALESCE(btrim(o.education_stage), '') <> ''
                           AND pg_temp.old_cohort_is_safe(o.id)), '[]'::jsonb));
$fn$;

CREATE FUNCTION pg_temp.old_suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL, _region TEXT DEFAULT NULL, _limit INT DEFAULT 12)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, gender TEXT,
  country TEXT, region TEXT, education_stage TEXT, age_band public.age_band,
  monthly_need NUMERIC, funded_monthly NUMERIC, currency TEXT,
  status public.orphan_status, org_id UUID, created_at TIMESTAMPTZ,
  gap NUMERIC, building BOOLEAN, completes BOOLEAN, in_region BOOLEAN,
  waiting_days INTEGER)
LANGUAGE sql STABLE AS $fn$
  WITH me AS (
    SELECT COALESCE(_budget, p.monthly_budget) AS budget,
           COALESCE(NULLIF(btrim(COALESCE(_region, '')), ''), p.preferred_region) AS region
      FROM (SELECT NULL::UUID) z
      LEFT JOIN public.profiles p ON p.id = auth.uid()
  ),
  cand AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country, o.birth_date,
           o.monthly_need, o.funded_monthly, o.currency, o.status, o.org_id,
           o.created_at, o.approved_at,
           pg_temp.old_cohort_is_safe(o.id) AS safe,
           o.region AS raw_region, o.education_stage AS raw_stage,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
              JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id
                AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building
      FROM public.orphans o
     WHERE o.status = 'approved'
       AND (o.monthly_need - o.funded_monthly) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.sponsorships s
          WHERE s.orphan_id = o.id
            AND s.sponsor_id = auth.uid()
            AND s.status IN ('pending_payment', 'active', 'paused')
       )
  ),
  masked AS (
    SELECT c.*,
           CASE WHEN c.safe THEN c.raw_region END AS m_region,
           CASE WHEN c.safe THEN c.raw_stage END AS m_stage
      FROM cand c
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.m_region,
         c.m_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status,
         CASE WHEN c.safe THEN c.org_id END,  -- محجوبةٌ منذ 20261106140000 (١ب)
         c.created_at,
         c.gap,
         c.building,
         (me.budget IS NOT NULL AND c.gap <= me.budget) AS completes,
         (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) AS in_region,
         GREATEST(0, (now()::date - COALESCE(c.approved_at, c.created_at)::date))::INTEGER
    FROM masked c CROSS JOIN me
   ORDER BY
     c.building DESC,
     (me.budget IS NOT NULL AND c.gap <= me.budget) DESC,
     (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) DESC,
     COALESCE(c.approved_at, c.created_at) ASC,
     c.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 48);
$fn$;

-- ---------------------------------------------------------------------
-- ١) أمان الحشد لكلّ طفل: الجديد = القديم، والحالات الحدّية كما يجب
-- ---------------------------------------------------------------------
DO $$
DECLARE _bad TEXT; _n INTEGER; _pub INTEGER;
BEGIN
  SELECT count(*) INTO _pub FROM public.orphans WHERE status IN ('approved', 'fully_sponsored');
  SELECT count(*) INTO _n FROM public.cohort_safety();
  IF _n <> _pub OR (SELECT count(DISTINCT orphan_id) FROM public.cohort_safety()) <> _pub THEN
    RAISE EXCEPTION 'FAIL — cohort_safety() لا تغطّي المنشورين وحدهم مرّةً واحدة: % من %', _n, _pub;
  END IF;

  SELECT string_agg(o.code, ', ') INTO _bad
    FROM public.orphans o
    LEFT JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
   WHERE (o.status IN ('approved', 'fully_sponsored')
          AND cs.safe IS DISTINCT FROM pg_temp.old_cohort_is_safe(o.id))
      OR public.cohort_is_safe(o.id) IS DISTINCT FROM pg_temp.old_cohort_is_safe(o.id);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — حكم الحشد تغيّر لـ: %', left(_bad, 400);
  END IF;

  -- المرجع نفسه يحكم كما يجب على الحالات الحدّية (وإلا لم تُثبت المقارنة شيئاً).
  IF EXISTS (SELECT 1 FROM public.orphans o JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
              WHERE o.country = 'بلد الحشود'
                AND (   (o.region = 'Four' AND cs.safe)
                     OR (o.region = 'Five' AND NOT cs.safe)
                     OR (o.region = 'Five ' AND cs.safe)
                     OR (o.region IS NULL AND o.gender = 'male' AND o.birth_date IS NULL AND NOT cs.safe)
                     OR (o.region IS NULL AND o.gender = 'female'
                         AND public.age_band_of(o.birth_date) = 'unknown' AND cs.safe)
                     OR (o.region = '' AND NOT cs.safe)
                     OR (o.region = 'Edge' AND cs.safe))) THEN
    RAISE EXCEPTION 'FAIL — حالةٌ حدّية حُكم عليها خطأً';
  END IF;
  RAISE NOTICE 'PASS — PERF-01: حكم الحشد لكلّ طفلٍ (% منشوراً) مطابقٌ للتعريف القديم، والحالات الحدّية كما يجب', _pub;
END $$;

-- ---------------------------------------------------------------------
-- ٢) الدليل: المخرجات نفسها حرفاً، بصفة الزائر، لكلّ فلترٍ وفرزٍ وصفحة
-- ---------------------------------------------------------------------
DO $$
DECLARE _p JSONB; _new JSONB; _old JSONB; _calls INTEGER := 0; _total INTEGER; _off INTEGER;
BEGIN
  FOR _p IN SELECT jsonb_array_elements('[
      {},
      {"sort":"closest","limit":60},
      {"sort":"newest","limit":60},
      {"sort":"documented","limit":60},
      {"country":"بلد الحشود","limit":60},
      {"country":"بلد الحشود","region":"Five","limit":60},
      {"country":"بلد الحشود","region":"Four","limit":60},
      {"region":"Five ","limit":60},
      {"region":"Edge","limit":60},
      {"region":"CQ-R0","limit":60},
      {"region":"CQ-R7","limit":60},
      {"education_stage":"ابتدائي","limit":60},
      {"education_stage":"متوسط","sort":"closest","limit":60},
      {"age_band":"age_6_11","limit":60},
      {"age_band":"unknown","limit":60},
      {"gender":"female","funding":"open","limit":60},
      {"funding":"full","sort":"newest","limit":60},
      {"building":false,"limit":60},
      {"search":"حشد 1","limit":60},
      {"search":"%","limit":60},
      {"search":"CQ-1_","limit":60},
      {"group":"c0400000-0000-4000-8000-0000000000ff"}
    ]'::jsonb)
  LOOP
    _off := 0;
    LOOP
      SET LOCAL ROLE anon;
      _new := public.list_orphan_cards(
        _country => _p->>'country', _region => _p->>'region', _age_band => _p->>'age_band',
        _gender => _p->>'gender', _education_stage => _p->>'education_stage',
        _funding => _p->>'funding', _building => (_p->>'building')::boolean,
        _search => _p->>'search', _sort => COALESCE(_p->>'sort', 'waiting'),
        _limit => COALESCE((_p->>'limit')::int, 24), _offset => _off,
        _group => (_p->>'group')::uuid);
      RESET ROLE;
      _old := pg_temp.old_list_orphan_cards(
        _country => _p->>'country', _region => _p->>'region', _age_band => _p->>'age_band',
        _gender => _p->>'gender', _education_stage => _p->>'education_stage',
        _funding => _p->>'funding', _building => (_p->>'building')::boolean,
        _search => _p->>'search', _sort => COALESCE(_p->>'sort', 'waiting'),
        _limit => COALESCE((_p->>'limit')::int, 24), _offset => _off,
        _group => (_p->>'group')::uuid);
      _calls := _calls + 1;
      IF _new IS DISTINCT FROM _old THEN
        RAISE EXCEPTION 'FAIL — الدليل اختلف عن القديم عند % (صفحة %): % صفّاً مقابل %',
          _p, _off, jsonb_array_length(_new->'rows'), jsonb_array_length(_old->'rows');
      END IF;
      _total := (_new->>'total')::int;
      _off := _off + COALESCE((_p->>'limit')::int, 24);
      -- الصفحات كلّها للفرز الافتراضي والأقرب؛ وللبقيّة الأولى تكفي.
      EXIT WHEN _off >= _total OR NOT (_p = '{"sort":"closest","limit":60}'::jsonb OR _p = '{}'::jsonb);
    END LOOP;
  END LOOP;

  -- والفلترة بمنطقةٍ محجوبة لا تُعيد أحداً: السؤال «هل في Four أحد؟» بلا جواب.
  SET LOCAL ROLE anon;
  _new := public.list_orphan_cards(_country => 'بلد الحشود', _region => 'Four');
  RESET ROLE;
  IF (_new->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL — الفلترة بمنطقةٍ حشدها أربعة تكشفهم: %', _new->>'total';
  END IF;
  SET LOCAL ROLE anon;
  _new := public.list_orphan_cards(_country => 'بلد الحشود', _region => 'Five');
  RESET ROLE;
  IF (_new->>'total')::int <> 5 THEN
    RAISE EXCEPTION 'FAIL — حشد الخمسة لا يظهر كاملاً: %', _new->>'total';
  END IF;
  RAISE NOTICE 'PASS — PERF-01: list_orphan_cards مطابقٌ للقديم حرفاً في % نداءً (فلاتر، فروز، صفحات، بحث)', _calls;
END $$;

-- ---------------------------------------------------------------------
-- ٣) خيارات الفلترة واقتراح الكافل: المخرجات نفسها
-- ---------------------------------------------------------------------
DO $$
DECLARE _new JSONB; _old JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _new := public.orphan_filter_options();
  RESET ROLE;
  _old := pg_temp.old_orphan_filter_options();
  IF _new IS DISTINCT FROM _old THEN
    RAISE EXCEPTION 'FAIL — خيارات الفلترة اختلفت: % مقابل %', _new, _old;
  END IF;
  IF _new->'regions' ? 'Four' OR _new->'regions' ? 'Five ' OR _new->'regions' ? 'Edge'
     OR _new->'regions' ? '' OR NOT _new->'regions' ? 'Five' THEN
    RAISE EXCEPTION 'FAIL — المناطق المعروضة لا تحترم الحدّ: %', _new->'regions';
  END IF;
  RAISE NOTICE 'PASS — PERF-01: orphan_filter_options مطابقٌ للقديم، ولا تُدرج منطقةٌ حشدها دون الحدّ';
END $$;

INSERT INTO public.profiles (id, preferred_region, monthly_budget)
VALUES ('c0400000-0000-4000-8000-000000000003', 'Five', 120)
ON CONFLICT (id) DO UPDATE SET preferred_region = EXCLUDED.preferred_region,
                               monthly_budget = EXCLUDED.monthly_budget;

DO $$
DECLARE _args RECORD; _new JSONB; _old JSONB; _calls INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  FOR _args IN
    SELECT * FROM (VALUES (NULL::numeric, NULL::text, 48), (60, 'Four', 48),
                          (200, 'Five', 48), (NULL, 'Edge', 48), (90, NULL, 12)) v(b, r, l)
  LOOP
    SET LOCAL ROLE authenticated;
    SELECT jsonb_agg(to_jsonb(s)) INTO _new
      FROM public.suggest_orphans_for_sponsor(_args.b, _args.r, _args.l) s;
    RESET ROLE;
    SELECT jsonb_agg(to_jsonb(s)) INTO _old
      FROM pg_temp.old_suggest_orphans_for_sponsor(_args.b, _args.r, _args.l) s;
    _calls := _calls + 1;
    IF _new IS DISTINCT FROM _old THEN
      RAISE EXCEPTION 'FAIL — اقتراح الكافل اختلف عند (%, %, %)', _args.b, _args.r, _args.l;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'PASS — PERF-01: suggest_orphans_for_sponsor مطابقٌ للقديم في % نداءات', _calls;
END $$;

-- ---------------------------------------------------------------------
-- ٤) المنح والتعريف: لا بابَ جديدٌ للعموم
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.cohort_safety()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cohort_safety()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — cohort_safety() مفتوحةٌ للعموم: تعدّد من حشده صغير';
  END IF;
  IF NOT has_function_privilege('anon', 'public.list_orphan_cards(text,text,text,text,text,text,boolean,text,text,integer,integer,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.orphan_filter_options()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.suggest_orphans_for_sponsor(numeric,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.suggest_orphans_for_sponsor(numeric,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — منح الدليل أو الاقتراح تغيّرت';
  END IF;
  IF (SELECT provolatile FROM pg_proc WHERE oid = 'public.age_band_of(date)'::regprocedure) <> 's' THEN
    RAISE EXCEPTION 'FAIL — age_band_of تقرأ CURRENT_DATE ومعلنةٌ IMMUTABLE';
  END IF;
  RAISE NOTICE 'PASS — PERF-01: cohort_safety() مغلقةٌ على العموم، والمنح كما كانت، وage_band_of صارت STABLE';
END $$;

-- ---------------------------------------------------------------------
-- ٥) الاستغلال: ألفا طفلٍ منشور، ومهلة الزائر ٣ ثوانٍ
-- ---------------------------------------------------------------------
DO $$ BEGIN PERFORM setseed(0.7); END $$;
INSERT INTO public.orphans
  (code, display_name, gender, birth_date, country, region, education_stage,
   org_id, created_by, monthly_need, status, approved_at)
SELECT 'CQS-' || g, 'طفل حجم ' || g,
       CASE WHEN random() < 0.5 THEN 'male' ELSE 'female' END,
       CURRENT_DATE - (floor(random() * 6600))::int,
       (ARRAY['بلد أ', 'بلد ب', 'بلد ج', 'بلد د'])[1 + floor(random() * 4)::int],
       'م' || floor(power(random(), 2) * 30)::int,
       (ARRAY['روضة', 'ابتدائي', 'متوسط', 'ثانوي'])[1 + floor(random() * 4)::int],
       'c0400000-0000-4000-8000-00000000000a', 'c0400000-0000-4000-8000-000000000002',
       150, 'approved', now() - (g % 200) * interval '1 day'
  FROM generate_series(1, 2000) g;
ANALYZE public.orphans;

-- مهلة Supabase للزائر؛ قبل الإصلاح يُلغى النداء هنا (٣٧ ثانيةً عند ألفين).
SET LOCAL statement_timeout = '3s';
DO $$
DECLARE _t TIMESTAMPTZ; _ms NUMERIC; _worst NUMERIC := 0; _label TEXT; _j JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  FOREACH _label IN ARRAY ARRAY['cards', 'cards-closest', 'filters', 'suggest'] LOOP
    _t := clock_timestamp();
    BEGIN
      IF _label = 'suggest' THEN
        SET LOCAL ROLE authenticated;
        PERFORM count(*) FROM public.suggest_orphans_for_sponsor(NULL, NULL, 48);
      ELSE
        SET LOCAL ROLE anon;
        IF _label = 'cards' THEN
          _j := public.list_orphan_cards();
          IF (_j->>'total')::int < 2000 THEN
            RAISE EXCEPTION 'FAIL — الدليل لا يعدّ الألفين: %', _j->>'total';
          END IF;
        ELSIF _label = 'cards-closest' THEN
          _j := public.list_orphan_cards(_sort => 'closest', _offset => 120);
        ELSE
          _j := public.orphan_filter_options();
        END IF;
      END IF;
      RESET ROLE;
    EXCEPTION WHEN query_canceled THEN
      RESET ROLE;
      RAISE EXCEPTION 'FAIL — % تجاوز مهلة الزائر (٣ ثوانٍ) عند ألفي طفل: الدليل يظهر فارغاً', _label;
    END;
    _ms := extract(epoch FROM clock_timestamp() - _t) * 1000;
    _worst := GREATEST(_worst, _ms);
    IF _ms > 1000 THEN
      RAISE EXCEPTION 'FAIL — % استغرق % ms عند ألفي طفل (الميزانية ١٠٠٠)', _label, round(_ms);
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'PASS — PERF-01: الدليل والفلاتر والاقتراح عند +٢٠٠٠ طفل تحت ثانية (أبطؤها % ms)', round(_worst);
END $$;
SET LOCAL statement_timeout = 0;

-- ---------------------------------------------------------------------
-- ٦) PERF-03: السجلّ المالي والإشعارات — الشرط نفسه، يُحسب مرّة
-- ---------------------------------------------------------------------
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at)
SELECT ('c0400000-0000-4000-8000-0000000000b' || v.k)::uuid, v.sponsor,
       (SELECT id FROM public.orphans WHERE code = 'CQS-' || v.k), 50, 'USD', 'active', now()
  FROM (VALUES (1, 'c0400000-0000-4000-8000-000000000003'::uuid),
               (2, 'c0400000-0000-4000-8000-000000000004'::uuid)) v(k, sponsor);
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency)
SELECT CASE WHEN g <= 300 THEN 'c0400000-0000-4000-8000-0000000000b1'::uuid
            ELSE 'c0400000-0000-4000-8000-0000000000b2'::uuid END,
       CASE WHEN g <= 300 THEN 'c0400000-0000-4000-8000-000000000003'::uuid
            ELSE 'c0400000-0000-4000-8000-000000000004'::uuid END,
       50, 'USD'
  FROM generate_series(1, 302) g;
INSERT INTO public.notifications (user_id, title)
SELECT CASE WHEN g <= 40 THEN 'c0400000-0000-4000-8000-000000000003'::uuid
            ELSE 'c0400000-0000-4000-8000-000000000004'::uuid END, 'إشعار ' || g
  FROM generate_series(1, 43) g;

CREATE FUNCTION pg_temp.explain_lines(_sql TEXT)
RETURNS SETOF TEXT LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY EXECUTE 'EXPLAIN (COSTS OFF) ' || _sql;
END $fn$;

DO $$
DECLARE _who TEXT; _uid UUID; _pay INTEGER; _spn INTEGER; _ntf INTEGER; _plan TEXT;
        _want RECORD;
BEGIN
  IF (SELECT count(*) FROM public.sponsorship_payments
       WHERE sponsor_id = 'c0400000-0000-4000-8000-000000000003') < 300 THEN
    RAISE EXCEPTION 'FAIL — البذر لم يكتب السجلّ المالي';
  END IF;
  FOREACH _who IN ARRAY ARRAY['sponsor', 'sponsor2', 'stranger', 'admin'] LOOP
    _uid := CASE _who WHEN 'sponsor' THEN 'c0400000-0000-4000-8000-000000000003'
                      WHEN 'sponsor2' THEN 'c0400000-0000-4000-8000-000000000004'
                      WHEN 'stranger' THEN 'c0400000-0000-4000-8000-000000000005'
                      ELSE 'c0400000-0000-4000-8000-000000000001' END::uuid;
    -- المتوقَّع بالتعريف: الكافل يرى ما له، والإدارة ترى السجلّ كلّه.
    SELECT (SELECT count(*) FROM public.sponsorship_payments
             WHERE _who = 'admin' OR sponsor_id = _uid) AS pay,
           (SELECT count(*) FROM public.sponsorships
             WHERE id IN ('c0400000-0000-4000-8000-0000000000b1', 'c0400000-0000-4000-8000-0000000000b2')
               AND (_who = 'admin' OR sponsor_id = _uid)) AS spn,
           (SELECT count(*) FROM public.notifications WHERE user_id = _uid) AS ntf
      INTO _want;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO _pay FROM public.sponsorship_payments;
    SELECT count(*) INTO _spn FROM public.sponsorships
     WHERE id IN ('c0400000-0000-4000-8000-0000000000b1', 'c0400000-0000-4000-8000-0000000000b2');
    SELECT count(*) INTO _ntf FROM public.notifications;
    RESET ROLE;
    IF (_pay, _spn, _ntf) <> (_want.pay, _want.spn, _want.ntf)
       OR (_who = 'sponsor' AND (_pay, _spn) <> (300, 1))
       OR (_who = 'stranger' AND (_pay, _spn) <> (0, 0))
       OR (_who = 'admin' AND _spn <> 2) THEN
      RAISE EXCEPTION 'FAIL — PERF-03 غيّر من يرى ماذا: % يرى % دفعة و% كفالة و% إشعاراً',
        _who, _pay, _spn, _ntf;
    END IF;
  END LOOP;

  -- الخطّة: لا نداء لـ is_admin() ولا auth.uid() داخل مرشّح الصفّ.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(l, E'\n') INTO _plan FROM (
    SELECT * FROM pg_temp.explain_lines('SELECT * FROM public.sponsorship_payments ORDER BY paid_at DESC LIMIT 50')
    UNION ALL SELECT * FROM pg_temp.explain_lines('SELECT * FROM public.sponsorships')
    UNION ALL SELECT * FROM pg_temp.explain_lines('SELECT * FROM public.notifications')) q(l);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  -- (auth.uid() دالّة SQL تُدمج في الخطّة، فتظهر current_setting مكانها.)
  IF _plan ~ 'Filter: [^\n]*(is_admin\(\)|auth\.uid\(\)|current_setting\()' THEN
    RAISE EXCEPTION 'FAIL — PERF-03: الشرط ما زال يُنادى لكلّ صفّ:%', E'\n' || _plan;
  END IF;
  RAISE NOTICE 'PASS — PERF-03: السجلّ والكفالات والإشعارات بالرؤية نفسها، وauth.uid()/is_admin() تُحسبان مرّةً لا لكلّ صفّ';
END $$;

ROLLBACK;
