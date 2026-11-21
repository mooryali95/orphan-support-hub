-- =====================================================================
-- بناء البيانات من لوحة الإدارة — إثبات
-- =====================================================================
--   • الصلاحية: الزائر بلا تنفيذ، وغير المدير يُرفض، والأدوات الداخلية بلا
--     منح، وسجلّ المناطق مغلقٌ على العموم.
--   • المناطق: قبول قائمةٍ مبدئية، ورفض المكرّر، وإعادة تسميةٍ لا تمسّ ما
--     تملكه منصّة تشغيل ولا المقفول.
--   • الشخص: البلد رمزٌ من السجلّ (لا نصّ حرّ)، والمنطقة من مناطق دولته،
--     والعملة عملة الدولة، ولا يُنشر، والسرّي في جدوله.
--   • التكرار: يُعاد قبل الكتابة، ولا يُكتب إلا بتأكيد؛ والفحص بلا كتابة.
--   • الدفعة: صفٌّ فاشل لا يُسقط غيره، والتجربة لا تكتب، ومراجع العرض
--     التجريبي مرفوضة.
--   • المجموعة: محلّية تُنشأ وتُعدَّل، والمرآوية لا تُمسّ؛ والعضو يتبع
--     مجموعته دولةً ومنطقة، والتعارض يُعاد ولا يُستبدل صامتاً.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/data-building-verification.sql
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('dbe00000-0000-4000-8000-000000000001', 'entry-admin@example.test', '{}'::jsonb),
  ('dbe00000-0000-4000-8000-000000000002', 'entry-user@example.test', '{}'::jsonb),
  ('dbe00000-0000-4000-8000-000000000003', 'entry-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('dbe00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('dbe10000-0000-4000-8000-00000000000a', 'dbe00000-0000-4000-8000-000000000003', 'جهة الإدخال', 'approved');

INSERT INTO public.countries (code, name_ar, name_local, status, currency, sort_order) VALUES
  ('JO', 'الأردن', 'Jordan', 'planned', 'USD', 20),
  ('XK', 'كوسوفو', 'Kosova', 'planned', 'EUR', 21)
ON CONFLICT (code) DO UPDATE SET currency = EXCLUDED.currency;

-- طفلٌ مرآوي (تملكه منصّة التشغيل) وطفلٌ منشور مقفول، يُبنيان بدور المالك.
INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region)
VALUES ('dbe20000-0000-4000-8000-000000000001', 'rowad-albania', 'g-entry-1', 'مجموعة مرآوية', 'AL', 'تيرانا');
SET LOCAL session_replication_role = replica;
INSERT INTO public.orphans (id, code, display_name, country, country_code, region, currency, status,
                            external_source, external_ref, created_by)
VALUES ('dbe30000-0000-4000-8000-000000000001', 'ENT-SYNC-1', 'طفل المرآة', 'ألبانيا', 'AL', 'تيرانا القديمة', 'EUR',
        'under_review', 'rowad-albania', 'c-entry-1', 'dbe00000-0000-4000-8000-000000000001'),
       ('dbe30000-0000-4000-8000-000000000002', 'ENT-LOCK-1', 'طفل مقفول', 'ألبانيا', 'AL', 'تيرانا القديمة', 'EUR',
        'approved', NULL, NULL, 'dbe00000-0000-4000-8000-000000000001'),
       ('dbe30000-0000-4000-8000-000000000003', 'ENT-FREE-1', 'طفل حرّ', 'ألبانيا', 'AL', 'تيرانا القديمة', 'EUR',
        'under_review', NULL, NULL, 'dbe00000-0000-4000-8000-000000000001');
INSERT INTO public.orphan_locks (orphan_id, reason) VALUES ('dbe30000-0000-4000-8000-000000000002', 'manual');
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.as_admin() RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    '{"sub":"dbe00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
$$;

DO $$ BEGIN RAISE NOTICE '── الصلاحية'; END $$;

DO $$
DECLARE _fn TEXT; _open TEXT;
BEGIN
  -- كلّ دوالّ الإدارة: الزائر بلا تنفيذ، DEFINER، ومسار البحث مثبَّت.
  SELECT string_agg(p.proname, ', ') INTO _open
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('admin_data_overview', 'admin_regions', 'admin_save_region', 'admin_seed_regions',
                       'admin_find_persons', 'admin_add_person', 'admin_import_persons', 'admin_groups',
                       'admin_save_group', 'admin_group_members', 'admin_set_group_member',
                       'admin_remove_group_member')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR NOT p.prosecdef OR p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF _open IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — دالّةٌ مفتوحة للزائر أو بلا DEFINER/search_path: %', _open;
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('admin_data_overview', 'admin_regions', 'admin_save_region', 'admin_seed_regions',
                         'admin_find_persons', 'admin_add_person', 'admin_import_persons', 'admin_groups',
                         'admin_save_group', 'admin_group_members', 'admin_set_group_member',
                         'admin_remove_group_member')) <> 12 THEN
    RAISE EXCEPTION 'FAIL — دوالّ بناء البيانات ليست اثنتي عشرة';
  END IF;
  -- الأدوات الداخلية بلا منح لأحدٍ من العموم.
  SELECT string_agg(p.proname, ', ') INTO _open
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname LIKE 'data\_entry\_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _open IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — أداةٌ داخلية ممنوحة للعموم: %', _open;
  END IF;
  IF has_table_privilege('anon', 'public.country_regions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.country_regions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.country_regions', 'INSERT')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.country_regions'::regclass) THEN
    RAISE EXCEPTION 'FAIL — سجلّ المناطق مفتوحٌ على العموم أو بلا RLS';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbe00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  FOREACH _fn IN ARRAY ARRAY[
    $q$SELECT public.admin_data_overview()$q$,
    $q$SELECT public.admin_regions('AL')$q$,
    $q$SELECT public.admin_save_region(NULL, 'AL', 'منطقة')$q$,
    $q$SELECT public.admin_seed_regions('AL', '[]'::jsonb)$q$,
    $q$SELECT public.admin_find_persons()$q$,
    $q$SELECT public.admin_add_person('{}'::jsonb)$q$,
    $q$SELECT public.admin_import_persons('[{}]'::jsonb)$q$,
    $q$SELECT public.admin_groups()$q$,
    $q$SELECT public.admin_save_group(NULL, 'مجموعة', 'AL')$q$,
    $q$SELECT public.admin_group_members('dbe20000-0000-4000-8000-000000000001')$q$,
    $q$SELECT public.admin_set_group_member('dbe20000-0000-4000-8000-000000000001', 'dbe30000-0000-4000-8000-000000000003')$q$,
    $q$SELECT public.admin_remove_group_member('dbe30000-0000-4000-8000-000000000003')$q$] LOOP
    BEGIN
      EXECUTE _fn;
      RAISE EXCEPTION 'FAIL — غير المدير نفّذ: %', _fn;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.data_entry_check_person('{}'::jsonb);
    RAISE EXCEPTION 'FAIL — المسجَّل نفّذ أداة الفحص الداخلية';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — للإدارة وحدها: 12 دالّة DEFINER بمسار بحثٍ مثبَّت، الزائر بلا تنفيذ، وغير المدير يُرفض، والأدوات الداخلية وسجلّ المناطق بلا منح';
END $$;

DO $$ BEGIN RAISE NOTICE '── المناطق'; END $$;

DO $$
DECLARE _r JSONB; _id UUID; _ok BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();

  _r := public.admin_seed_regions('AL', '[{"name_ar":"تيرانا القديمة","name_local":"Tiranë","geo_id":"ALB-1"},
                                         {"name_ar":"شكودر","name_local":"Shkodër"},
                                         {"name_ar":"تيرانا القديمه"}, {"name_ar":""}]'::jsonb);
  IF (_r->>'added')::int <> 2 OR (_r->>'skipped')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL — القائمة المبدئية: %', _r;
  END IF;
  -- إعادة القبول لا تكرّر.
  _r := public.admin_seed_regions('AL', '[{"name_ar":"شكودر"}]'::jsonb);
  IF (_r->>'added')::int <> 0 THEN RAISE EXCEPTION 'FAIL — القائمة المبدئية كرّرت منطقة: %', _r; END IF;

  BEGIN
    PERFORM public.admin_save_region(NULL, 'AL', 'شكودر');
  EXCEPTION WHEN unique_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — منطقةٌ مكرّرة قُبلت'; END IF;
  BEGIN
    PERFORM public.admin_save_region(NULL, 'ZZ', 'منطقة');
    RAISE EXCEPTION 'FAIL — منطقةٌ لدولةٍ غير معروفة قُبلت';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  _r := public.admin_regions('AL');
  IF jsonb_array_length(_r->'regions') <> 2
     OR (SELECT (x->>'children')::int FROM jsonb_array_elements(_r->'regions') x
          WHERE x->>'name_ar' = 'تيرانا القديمة') <> 3 THEN
    RAISE EXCEPTION 'FAIL — قائمة المناطق وأعدادها: %', _r;
  END IF;

  -- إعادة التسمية بلا طلب النقل: لا يتغيّر ملفّ، والناتج يقول كم بقي.
  SELECT (x->>'id')::uuid INTO _id FROM jsonb_array_elements(_r->'regions') x WHERE x->>'name_ar' = 'تيرانا القديمة';
  _r := public.admin_save_region(_id, 'AL', 'تيرانا', 'Tiranë', NULL, true, NULL, false);
  IF (_r->>'children_renamed')::int <> 0 OR (_r->>'children_left')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL — إعادة تسميةٍ بلا نقل غيّرت ملفّات: %', _r;
  END IF;
  _r := public.admin_regions('AL');
  IF jsonb_array_length(_r->'unmatched') <> 1 OR (_r->'unmatched'->0->>'children')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL — المناطق غير المطابقة لا تُعرض: %', _r->'unmatched';
  END IF;

  -- بالنقل: الحرّ وحده يتبع؛ المرآوي والمقفول باقيان.
  _r := public.admin_save_region(_id, 'AL', 'تيرانا القديمة', 'Tiranë', NULL, true, NULL, false);
  _r := public.admin_save_region(_id, 'AL', 'تيرانا', 'Tiranë', NULL, true, NULL, true);
  IF (_r->>'children_renamed')::int <> 1 OR (_r->>'children_left')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL — النقل مسّ ما لا يُمسّ أو لم ينقل الحرّ: %', _r;
  END IF;
  RESET ROLE;
  IF (SELECT region FROM public.orphans WHERE id = 'dbe30000-0000-4000-8000-000000000003') <> 'تيرانا'
     OR (SELECT region FROM public.orphans WHERE id = 'dbe30000-0000-4000-8000-000000000001') <> 'تيرانا القديمة'
     OR (SELECT region FROM public.orphans WHERE id = 'dbe30000-0000-4000-8000-000000000002') <> 'تيرانا القديمة' THEN
    RAISE EXCEPTION 'FAIL — مناطق الملفّات بعد النقل ليست كما يجب';
  END IF;
  RAISE NOTICE 'PASS — المناطق: قائمةٌ مبدئية بلا تكرار، ورفض المكرّر والدولة المجهولة، وإعادة تسميةٍ تنقل الحرّ وحده وتُظهر الباقي';
END $$;

DO $$ BEGIN RAISE NOTICE '── الشخص'; END $$;

DO $$
DECLARE _r JSONB; _o public.orphans%ROWTYPE; _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();

  _r := public.admin_add_person('{"display_name":"أ","gender":"x","country":"ZZ","birth_date":"2999-01-01",
                                  "monthly_need":"abc","external_ref":"try-07"}'::jsonb);
  IF (_r->>'ok')::boolean OR NOT (_r->'errors' @> '["name_required","gender_invalid","country_unknown","birth_date_invalid","need_invalid","demo_reference"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — أخطاء الصفّ: %', _r->'errors';
  END IF;
  _r := public.admin_add_person('{"display_name":"سالم","gender":"male","country":"AL","region":"بغداد"}'::jsonb);
  IF NOT (_r->'errors' @> '["region_unknown"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — منطقةٌ من خارج مناطق الدولة قُبلت: %', _r;
  END IF;
  _r := public.admin_add_person('{"display_name":"سالم","gender":"male","country":"ألبانيا"}'::jsonb);
  IF NOT (_r->'errors' @> '["country_unknown"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — البلد نصّاً حرّاً قُبل: %', _r;
  END IF;

  -- الفحص بلا كتابة.
  SELECT count(*) INTO _n FROM public.orphans;
  _r := public.admin_add_person('{"display_name":"سالم","gender":"male","country":"AL","region":"Shkodër"}'::jsonb, false, true);
  IF NOT (_r->>'ok')::boolean OR NOT (_r->>'dry_run')::boolean OR _r->>'region' <> 'شكودر'
     OR (SELECT count(*) FROM public.orphans) <> _n THEN
    RAISE EXCEPTION 'FAIL — الفحص بلا كتابة كتب أو لم يردّ المنطقة إلى اسمها المعتمد: %', _r;
  END IF;

  _r := public.admin_add_person('{"display_name":"سالم","gender":"male","country":"al","region":"Shkodër",
                                  "birth_date":"2015-03-02","monthly_need":"40","full_name":"سالم الاسم الكامل",
                                  "guardian_phone":"+355000"}'::jsonb);
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — إضافة شخصٍ صحيح: %', _r; END IF;
  RESET ROLE;
  SELECT * INTO _o FROM public.orphans WHERE id = (_r->>'id')::uuid;
  IF _o.country_code <> 'AL' OR _o.country <> 'ألبانيا' OR _o.region <> 'شكودر' OR _o.currency <> 'EUR'
     OR _o.status <> 'under_review' OR _o.approved_at IS NOT NULL OR _o.monthly_need <> 40
     OR _o.created_by <> 'dbe00000-0000-4000-8000-000000000001' OR _o.external_source IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — الشخص المُدخَل: رمز/اسم/منطقة/عملة/حال = %/%/%/%/%',
      _o.country_code, _o.country, _o.region, _o.currency, _o.status;
  END IF;
  IF (SELECT full_name FROM public.orphan_private WHERE orphan_id = _o.id) <> 'سالم الاسم الكامل'
     OR NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'orphan.admin_entered' AND entity_id = _o.id) THEN
    RAISE EXCEPTION 'FAIL — السرّي أو أثر التدقيق غائب';
  END IF;

  -- مع جهةٍ معتمدة: مسودّةٌ تكملها الجهة، وعملة دولةٍ أخرى من سجلّها.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  _r := public.admin_add_person('{"display_name":"ليلى","gender":"female","country":"JO",
                                  "org_id":"dbe10000-0000-4000-8000-00000000000a"}'::jsonb);
  RESET ROLE;
  SELECT * INTO _o FROM public.orphans WHERE id = (_r->>'id')::uuid;
  IF _o.status <> 'draft' OR _o.currency <> 'USD' OR _o.country_code <> 'JO' OR _o.country <> 'الأردن'
     OR _o.org_id <> 'dbe10000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'FAIL — شخصٌ مع جهة: %/%/%', _o.status, _o.currency, _o.country_code;
  END IF;
  RAISE NOTICE 'PASS — الشخص: الأخطاء مسمّاة، والبلد رمزٌ من السجلّ لا نصّ، والمنطقة من مناطق دولته بالاسم المعتمد، والعملة عملة الدولة، ولا نشر، والسرّي في جدوله';
END $$;

DO $$ BEGIN RAISE NOTICE '── التكرار'; END $$;

DO $$
DECLARE _r JSONB; _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  SELECT count(*) INTO _n FROM public.orphans;

  -- الاسم نفسه بتشكيلٍ وهمزةٍ مختلفين في الدولة نفسها.
  _r := public.admin_add_person('{"display_name":"  سَالِم ","gender":"male","country":"AL","birth_date":"2015-03-02"}'::jsonb);
  IF (_r->>'ok')::boolean OR _r->>'code' <> 'possible_duplicate'
     OR NOT (_r->'duplicates'->0->'reasons' @> '["same_name","same_birth_date"]'::jsonb)
     OR (SELECT count(*) FROM public.orphans) <> _n THEN
    RAISE EXCEPTION 'FAIL — التكرار لم يُكشف أو كُتب: %', _r;
  END IF;
  -- الاسم الكامل نفسه باسمٍ مستعارٍ آخر.
  _r := public.admin_add_person('{"display_name":"سليم","gender":"male","country":"AL","full_name":"سالم الإسم الكامل"}'::jsonb);
  IF _r->>'code' <> 'possible_duplicate' OR NOT (_r->'duplicates'->0->'reasons' @> '["same_full_name"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — تطابق الاسم الكامل لم يُكشف: %', _r;
  END IF;
  -- الاسم نفسه في دولةٍ أخرى ليس تكراراً.
  _r := public.admin_add_person('{"display_name":"سالم","gender":"male","country":"JO"}'::jsonb, false, true);
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — دولةٌ أخرى عُدّت تكراراً: %', _r; END IF;
  -- بالتأكيد يُكتب.
  _r := public.admin_add_person('{"display_name":"سالم","gender":"male","country":"AL"}'::jsonb, true);
  IF NOT (_r->>'ok')::boolean OR (SELECT count(*) FROM public.orphans) <> _n + 1 THEN
    RAISE EXCEPTION 'FAIL — التأكيد لم يكتب: %', _r;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — التكرار: يُكشف بالاسم (مع اختلاف التشكيل) وبالاسم الكامل داخل الدولة، ولا يُكتب إلا بتأكيد';
END $$;

DO $$ BEGIN RAISE NOTICE '── الدفعة'; END $$;

DO $$
DECLARE _r JSONB; _n INTEGER; _rows JSONB := '[
    {"display_name":"هدى","gender":"female","country":"AL","region":"تيرانا","external_ref":"csv-1"},
    {"display_name":"","gender":"female","country":"AL"},
    {"display_name":"سالم","gender":"male","country":"AL"},
    {"display_name":"هدى","gender":"female","country":"AL","external_ref":"csv-1b"},
    {"display_name":"DEMO-طفل","gender":"male","country":"AL"},
    {"display_name":"نور","gender":"female","country":"JO","confirm_duplicate":true}]'::jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  SELECT count(*) INTO _n FROM public.orphans;

  _r := public.admin_import_persons(_rows, true);
  IF (_r->>'received')::int <> 6 OR (_r->>'ready')::int <> 3 OR (_r->>'invalid')::int <> 2
     OR (_r->>'duplicates')::int <> 1 OR (SELECT count(*) FROM public.orphans) <> _n THEN
    RAISE EXCEPTION 'FAIL — تجربة الدفعة: % (كُتب %)', _r - 'results', (SELECT count(*) FROM public.orphans) - _n;
  END IF;
  IF NOT (_r->'results'->4->'errors' @> '["demo_reference"]'::jsonb)
     OR _r->'results'->2->>'code' <> 'possible_duplicate' THEN
    RAISE EXCEPTION 'FAIL — نتائج الصفوف في التجربة: %', _r->'results';
  END IF;

  -- الكتابة: الصفّ الرابع تكرارٌ للأوّل داخل الدفعة نفسها، فيُمسَك.
  _r := public.admin_import_persons(_rows, false);
  IF (_r->>'ready')::int <> 2 OR (_r->>'invalid')::int <> 2 OR (_r->>'duplicates')::int <> 2
     OR (SELECT count(*) FROM public.orphans) <> _n + 2 THEN
    RAISE EXCEPTION 'FAIL — كتابة الدفعة: % (كُتب %)', _r - 'results', (SELECT count(*) FROM public.orphans) - _n;
  END IF;
  RESET ROLE;
  IF (SELECT status FROM public.orphans WHERE external_source = 'admin-entry' AND external_ref = 'csv-1') <> 'under_review' THEN
    RAISE EXCEPTION 'FAIL — المستورَد لم يقف عند المراجعة';
  END IF;
  -- إعادة رفع الملفّ نفسه لا تكرّر: المرجع نفسه يُمسَك.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  _r := public.admin_import_persons('[{"display_name":"اسم آخر","gender":"female","country":"AL","external_ref":"csv-1"}]'::jsonb, false);
  IF (_r->>'duplicates')::int <> 1 OR NOT (_r->'results'->0->'duplicates'->0->'reasons' @> '["same_reference"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — إعادة الرفع بالمرجع نفسه لم تُمسَك: %', _r;
  END IF;
  BEGIN
    PERFORM public.admin_import_persons('{}'::jsonb, true);
    RAISE EXCEPTION 'FAIL — حمولةٌ ليست قائمة قُبلت';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — الدفعة: التجربة لا تكتب، والصفّ الفاشل لا يُسقط غيره، والتكرار داخل الدفعة وعند إعادة الرفع يُمسَك، ومراجع العرض التجريبي مرفوضة';
END $$;

DO $$ BEGIN RAISE NOTICE '── المجموعات'; END $$;

DO $$
DECLARE _r JSONB; _g UUID; _gj UUID; _child UUID; _o public.orphans%ROWTYPE;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();

  BEGIN
    PERFORM public.admin_save_group(NULL, 'حلقة', 'AL', 'بغداد');
    RAISE EXCEPTION 'FAIL — مجموعةٌ بمنطقةٍ من خارج الدولة قُبلت';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  _g := (public.admin_save_group(NULL, 'حلقة شكودر', 'AL', 'شكودر')->>'id')::uuid;
  _gj := (public.admin_save_group(NULL, 'حلقة عمّان', 'JO')->>'id')::uuid;
  BEGIN
    PERFORM public.admin_save_group('dbe20000-0000-4000-8000-000000000001', 'اسم جديد', 'AL');
    RAISE EXCEPTION 'FAIL — مجموعةٌ مرآوية عُدّلت من هنا';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- المرآوي والمقفول لا يُضمّان.
  _r := public.admin_set_group_member(_g, 'dbe30000-0000-4000-8000-000000000001');
  IF _r->>'code' <> 'synced' OR _r->>'source' <> 'rowad-albania' THEN
    RAISE EXCEPTION 'FAIL — طفلٌ مرآوي ضُمّ: %', _r;
  END IF;
  _r := public.admin_set_group_member(_g, 'dbe30000-0000-4000-8000-000000000002');
  IF _r->>'code' <> 'locked' THEN RAISE EXCEPTION 'FAIL — ملفٌّ مقفول ضُمّ: %', _r; END IF;
  _r := public.admin_set_group_member('dbe20000-0000-4000-8000-000000000001', 'dbe30000-0000-4000-8000-000000000003');
  IF _r->>'code' <> 'group_synced' THEN RAISE EXCEPTION 'FAIL — ضمٌّ إلى مجموعةٍ مرآوية: %', _r; END IF;

  -- تعارض المنطقة يُعاد ولا يُكتب.
  _r := public.admin_set_group_member(_g, 'dbe30000-0000-4000-8000-000000000003');
  IF _r->>'code' <> 'conflict' OR _r->'conflict'->'region'->>'child' <> 'تيرانا'
     OR _r->'conflict'->'region'->>'group' <> 'شكودر' THEN
    RAISE EXCEPTION 'FAIL — تعارض المنطقة لم يُعَد: %', _r;
  END IF;
  RESET ROLE;
  IF (SELECT group_id FROM public.orphans WHERE id = 'dbe30000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — كُتبت العضوية مع تعارضٍ لم يُحسم';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  _r := public.admin_set_group_member(_g, 'dbe30000-0000-4000-8000-000000000003', false, 'keep');
  IF NOT (_r->>'ok')::boolean OR _r->>'region' <> 'تيرانا' THEN
    RAISE EXCEPTION 'FAIL — إبقاء منطقة الطفل: %', _r;
  END IF;

  -- طفلٌ بلا منطقة يأخذ منطقة مجموعته.
  _child := (public.admin_add_person('{"display_name":"يوسف","gender":"male","country":"AL"}'::jsonb)->>'id')::uuid;
  _r := public.admin_set_group_member(_g, _child);
  IF NOT (_r->>'ok')::boolean OR _r->>'region' <> 'شكودر' THEN
    RAISE EXCEPTION 'FAIL — المنطقة لم تتبع المجموعة: %', _r;
  END IF;

  -- دولةٌ أخرى: تعارضٌ ظاهر، ثم بالاختيار تتبع الدولة ورمزها وعملتها.
  _r := public.admin_set_group_member(_gj, _child);
  IF _r->>'code' <> 'conflict' OR _r->'conflict'->'country'->>'child' <> 'AL'
     OR _r->'conflict'->'country'->>'group' <> 'JO' OR NOT (_r->'conflict' ? 'group') THEN
    RAISE EXCEPTION 'FAIL — تعارض الدولة والمجموعة لم يُعَد: %', _r;
  END IF;
  _r := public.admin_set_group_member(_gj, _child, true, NULL, true);
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — النقل بعد الاختيار: %', _r; END IF;
  RESET ROLE;
  SELECT * INTO _o FROM public.orphans WHERE id = _child;
  IF _o.country_code <> 'JO' OR _o.country <> 'الأردن' OR _o.currency <> 'USD' OR _o.region IS NOT NULL
     OR _o.group_id <> _gj THEN
    RAISE EXCEPTION 'FAIL — بعد النقل: %/%/%/%', _o.country_code, _o.country, _o.currency, _o.region;
  END IF;

  -- شخصٌ يُدخَل مع مجموعته: دولةٌ مخالفة خطأ، ومنطقةٌ فارغة تتبع.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  _r := public.admin_add_person(jsonb_build_object('display_name', 'مريم', 'gender', 'female', 'country', 'JO', 'group_id', _g));
  IF NOT (_r->'errors' @> '["group_country_mismatch"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — مجموعةٌ من دولةٍ أخرى قُبلت: %', _r;
  END IF;
  _r := public.admin_add_person(jsonb_build_object('display_name', 'مريم', 'gender', 'female', 'country', 'AL', 'group_id', _g));
  IF NOT (_r->>'ok')::boolean OR _r->>'region' <> 'شكودر' OR NOT (_r->'warnings' @> '["region_from_group"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — شخصٌ مع مجموعة: %', _r;
  END IF;
  _r := public.admin_add_person(jsonb_build_object('display_name', 'خديجة', 'gender', 'female', 'country', 'AL',
                                                   'region', 'تيرانا', 'group_id', _g), false, true);
  IF NOT (_r->'warnings' @> '["group_region_differs"]'::jsonb) OR _r->>'region' <> 'تيرانا' THEN
    RAISE EXCEPTION 'FAIL — منطقةٌ تخالف المجموعة لم يُنبَّه إليها أو استُبدلت: %', _r;
  END IF;

  -- دولة المجموعة لا تُنقل وفيها أعضاء.
  BEGIN
    PERFORM public.admin_save_group(_g, 'حلقة شكودر', 'JO');
    RAISE EXCEPTION 'FAIL — نُقلت دولة مجموعةٍ فيها أعضاء';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  IF jsonb_array_length(public.admin_group_members(_g)) <> 2
     OR (SELECT (x->>'members')::int FROM jsonb_array_elements(public.admin_groups('AL')) x WHERE (x->>'id')::uuid = _g) <> 2
     OR (SELECT x->>'source' FROM jsonb_array_elements(public.admin_groups('AL')) x
          WHERE (x->>'id')::uuid = 'dbe20000-0000-4000-8000-000000000001') <> 'rowad-albania' THEN
    RAISE EXCEPTION 'FAIL — قائمة المجموعات وأعضائها';
  END IF;
  _r := public.admin_remove_group_member('dbe30000-0000-4000-8000-000000000003');
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — إخراج عضو: %', _r; END IF;
  RESET ROLE;
  SELECT * INTO _o FROM public.orphans WHERE id = 'dbe30000-0000-4000-8000-000000000003';
  IF _o.group_id IS NOT NULL OR _o.country_code <> 'AL' OR _o.region <> 'تيرانا' THEN
    RAISE EXCEPTION 'FAIL — إخراج العضو غيّر دولته أو منطقته';
  END IF;
  RAISE NOTICE 'PASS — المجموعات: محلّيةٌ تُنشأ والمرآوية لا تُمسّ، والمرآوي والمقفول لا يُضمّان، والتعارض يُعاد بقيمتيه ولا يُكتب حتى يُحسم، والعضو يتبع مجموعته دولةً وعملةً ومنطقة';
END $$;

DO $$ BEGIN RAISE NOTICE '── النظرة والبحث'; END $$;

DO $$
DECLARE _r JSONB; _al JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_admin();
  _r := public.admin_data_overview();
  SELECT x INTO _al FROM jsonb_array_elements(_r->'countries') x WHERE x->>'code' = 'AL';
  IF _al IS NULL OR (_al->>'regions')::int <> 2 OR (_al->>'children')::int < 5 OR (_al->>'groups')::int <> 2
     OR (_al->>'published')::int <> 1 OR _al->'sources'->0->>'key' <> 'rowad-albania'
     OR NOT (_al ? 'in_network') OR _r->>'platform_currency' IS NULL THEN
    RAISE EXCEPTION 'FAIL — نظرة الدول: %', _al;
  END IF;
  _r := public.admin_find_persons('طفل', 'AL', 10);
  IF jsonb_array_length(_r) <> 3
     OR (SELECT x->>'synced_source' FROM jsonb_array_elements(_r) x WHERE x->>'code' = 'ENT-SYNC-1') <> 'rowad-albania'
     OR NOT (SELECT (x->>'locked')::boolean FROM jsonb_array_elements(_r) x WHERE x->>'code' = 'ENT-LOCK-1') THEN
    RAISE EXCEPTION 'FAIL — البحث في الأشخاص: %', _r;
  END IF;
  -- محارف النمط لا تُفسَّر.
  IF jsonb_array_length(public.admin_find_persons('%', NULL, 10)) <> 0 THEN
    RAISE EXCEPTION 'FAIL — علامة النسبة فُسّرت نمطاً';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — النظرة والبحث: حال كلّ دولةٍ بأعدادها ومصادرها، والبحث يُظهر المرآوي والمقفول بوسمه';
END $$;

ROLLBACK;
