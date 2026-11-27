-- =====================================================================
-- أدوات الإدارة، الدفعة الثانية — إثبات (هجرة 20261203100000_admin_pass2)
-- ---------------------------------------------------------------------
--   الطوابير بصفحاتٍ بالمؤشّر بلا تكرارٍ ولا فجوة، والعدّاد يطابقها؛
--   البحث بنطاق الإدارة أو country_can 'read' وعلى golden_canon، ولا يعيد من
--   الطفل غير حقول القوائم؛ سجلّ القرارات للإدارة وحدها، وأحداث sec_* في مرشّحها.
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a2a00000-0000-4000-8000-000000000001', 'ap-admin@example.test', '{}'::jsonb),
  ('a2a00000-0000-4000-8000-000000000002', 'ap-sponsor@example.test', '{}'::jsonb),
  ('a2a00000-0000-4000-8000-000000000003', 'ap-lk@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, full_name) VALUES ('a2a00000-0000-4000-8000-000000000001', 'سارة المراجِعة')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.user_roles (user_id, role) VALUES ('a2a00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('LK', 'a2a00000-0000-4000-8000-000000000003', 'viewer');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, status, approved_at, country, country_code) VALUES
  ('a2c00000-0000-4000-8000-000000000001', 'AP-SN-1', 'أمينة الاختبار', 100, 'USD', 'approved', now(), 'SN', 'SN'),
  ('a2c00000-0000-4000-8000-000000000002', 'AP-SN-2', 'يوسف الاختبار', 100, 'USD', 'approved', now(), 'SN', 'SN'),
  ('a2c00000-0000-4000-8000-000000000003', 'AP-LK-1', 'امينة سريلانكا', 100, 'USD', 'approved', now(), 'LK', 'LK');
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at) VALUES
  ('a2d00000-0000-4000-8000-000000000001', 'a2a00000-0000-4000-8000-000000000002',
   'a2c00000-0000-4000-8000-000000000001', 50, 'USD', 'active', now());
-- خمسة تعارضات مفتوحة بثلاث درجات وأوقاتٍ متساوية جزئياً (لاختبار كسر التعادل بالمعرّف).
INSERT INTO public.data_conflicts (id, orphan_id, field, kind, risk, status, current_value, proposed_value, created_at) VALUES
  ('a2e00000-0000-4000-8000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'birth_date', 'critical_change', 'critical', 'open', '"2013-06-01"', '"2013-07-01"', now() - interval '3 hours'),
  ('a2e00000-0000-4000-8000-000000000002', 'a2c00000-0000-4000-8000-000000000001', 'display_name', 'disagreement', 'medium', 'open', '"a"', '"b"', now() - interval '2 hours'),
  ('a2e00000-0000-4000-8000-000000000003', 'a2c00000-0000-4000-8000-000000000002', 'display_name', 'disagreement', 'medium', 'open', '"a"', '"b"', now() - interval '2 hours'),
  ('a2e00000-0000-4000-8000-000000000004', 'a2c00000-0000-4000-8000-000000000002', 'birth_date', 'critical_change', 'critical', 'open', '"2014-01-01"', '"2014-02-01"', now() - interval '1 hour'),
  ('a2e00000-0000-4000-8000-000000000005', 'a2c00000-0000-4000-8000-000000000003', 'display_name', 'disagreement', 'medium', 'open', '"a"', '"b"', now()),
  ('a2e00000-0000-4000-8000-000000000006', 'a2c00000-0000-4000-8000-000000000002', 'gender', 'disagreement', 'critical', 'dismissed', '"m"', '"f"', now() - interval '5 hours');
UPDATE public.data_conflicts SET resolution = 'kept', resolved_by = 'a2a00000-0000-4000-8000-000000000001',
       resolved_at = now() - interval '30 minutes' WHERE id = 'a2e00000-0000-4000-8000-000000000006';
INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta, created_at) VALUES
  ('a2a00000-0000-4000-8000-000000000001', 'golden_conflict_resolve', 'orphans', 'a2c00000-0000-4000-8000-000000000001',
   '{"field":"birth_date","choice":"accept","value":"2013-07-01","was":"2013-06-01"}', now() - interval '2 days');

DO $$
DECLARE
  _admin TEXT := '{"sub":"a2a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  _lk TEXT := '{"sub":"a2a00000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
  _sponsor TEXT := '{"sub":"a2a00000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
  _p1 JSONB; _p2 JSONB; _p3 JSONB; _all JSONB; _ids TEXT[]; _r JSONB; _ok BOOLEAN; _f TEXT;
BEGIN
  -- ١) الصفحات بالمؤشّر
  PERFORM set_config('request.jwt.claims', _admin, true);
  _all := public.admin_conflicts(NULL, 500);
  _p1 := public.admin_conflicts(NULL, 2);
  _p2 := public.admin_conflicts(NULL, 2, _p1->1->'cursor');
  _p3 := public.admin_conflicts(NULL, 2, _p2->1->'cursor');
  SELECT array_agg(e->>'id' ORDER BY ord) INTO _ids
    FROM jsonb_array_elements(_p1 || _p2 || _p3) WITH ORDINALITY AS t(e, ord);
  IF jsonb_array_length(_p1) <> 2 OR jsonb_array_length(_p3) <> 1
     OR _ids IS DISTINCT FROM (SELECT array_agg(e->>'id' ORDER BY ord) FROM jsonb_array_elements(_all) WITH ORDINALITY AS t(e, ord))
     OR (SELECT count(DISTINCT x) FROM unnest(_ids) x) <> 5
     OR _all->0->>'risk' <> 'critical' OR _all->4->>'risk' <> 'medium' THEN
    RAISE EXCEPTION 'FAIL — صفحات التعارضات بالمؤشّر تكرّرت أو فوّتت: %', _ids;
  END IF;
  IF (public.admin_queue_counts(NULL)->>'conflicts')::int <> 5
     OR (public.admin_queue_counts('SN')->>'conflicts')::int <> 4 THEN
    RAISE EXCEPTION 'FAIL — عدّاد الطوابير لا يطابق';
  END IF;
  IF jsonb_array_length(public.admin_alerts(NULL, 1, '{"k":2,"at":"1970-01-01T00:00:00Z","id":"ffffffff-ffff-4fff-8fff-ffffffffffff"}')) <> 0
     OR jsonb_typeof(public.admin_link_queue(NULL, 5)) <> 'array'
     OR jsonb_typeof(public.child_update_queue(NULL, 5)->'items') <> 'array' THEN
    RAISE EXCEPTION 'FAIL — مؤشّر التنبيهات/الربط/التحديثات';
  END IF;
  RAISE NOTICE 'PASS — الطوابير بصفحاتٍ بالمؤشّر بلا تكرارٍ ولا فجوة، والعدّاد يطابق';

  -- ٢) النطاق: مطّلع سريلانكا لا يقرأ السنغال ولا يعدّها
  PERFORM set_config('request.jwt.claims', _lk, true);
  FOREACH _f IN ARRAY ARRAY['SELECT public.admin_conflicts(''SN'')', 'SELECT public.admin_queue_counts(''SN'')',
                            'SELECT public.admin_queue_counts(NULL)', 'SELECT public.admin_decision_log()'] LOOP
    _ok := false;
    BEGIN EXECUTE _f; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
    IF NOT _ok THEN RAISE EXCEPTION 'FAIL — تجاوز النطاق: %', _f; END IF;
  END LOOP;
  IF (public.admin_queue_counts('LK')->>'conflicts')::int <> 1 THEN RAISE EXCEPTION 'FAIL — عدّاد الدولة'; END IF;
  RAISE NOTICE 'PASS — الطوابير والعدّادات بنطاق country_can ''read''';

  -- ٣) البحث
  _r := public.admin_search('امينه');
  IF jsonb_array_length(_r->'children') <> 1 OR _r->'children'->0->>'code' <> 'AP-LK-1'
     OR _r->'sponsors' <> '[]'::jsonb OR _r->'sponsorships' <> '[]'::jsonb OR _r->'transfers' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL — بحث فريق الدولة تجاوز دوله أو رأى الكفلاء: %', _r;
  END IF;
  PERFORM set_config('request.jwt.claims', _admin, true);
  _r := public.admin_search('أمينة');
  IF jsonb_array_length(_r->'children') <> 2 THEN RAISE EXCEPTION 'FAIL — البحث القانوني: %', _r; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'children') e, jsonb_object_keys(e) k
              WHERE k NOT IN ('id', 'code', 'name', 'country', 'status')) THEN
    RAISE EXCEPTION 'FAIL — البحث أعاد حقلاً خاصّاً من الطفل';
  END IF;
  IF jsonb_array_length(public.admin_search('ap-sponsor')->'sponsors') <> 1
     OR jsonb_array_length(public.admin_search('ap-sn-1')->'sponsorships') <> 1
     OR jsonb_array_length(public.admin_search('a2d00000')->'sponsorships') <> 1
     OR jsonb_array_length(public.admin_search('%')->'children') <> 0
     OR jsonb_array_length(public.admin_search('a')->'children') <> 0 THEN
    RAISE EXCEPTION 'FAIL — بحث الكفلاء/الكفالات أو هروب المحارف';
  END IF;
  PERFORM set_config('request.jwt.claims', _sponsor, true);
  _ok := false;
  BEGIN PERFORM public.admin_search('أمينة'); EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — كافلٌ بحث'; END IF;
  RAISE NOTICE 'PASS — البحث بنطاق الإدارة أو الدولة، على golden_canon، بحقول القوائم وحدها';

  -- ٤) سجلّ القرارات
  PERFORM set_config('request.jwt.claims', _admin, true);
  PERFORM public.security_event('four_eyes_refused', '{"action":"conflict_resolve"}'::jsonb, 'a2c00000-0000-4000-8000-000000000001');
  _r := public.admin_decision_log('a2c00000-0000-4000-8000-000000000001');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'rows') e
                  WHERE e->>'action' = 'golden_conflict_resolve' AND e->>'actor' = 'سارة المراجِعة'
                    AND e->>'from' = '2013-06-01' AND e->>'to' = '2013-07-01' AND e->>'field' = 'birth_date')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'rows') e WHERE e->>'action' = 'sec_four_eyes_refused') THEN
    RAISE EXCEPTION 'FAIL — سجلّ الطفل: %', _r;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.admin_decision_log(NULL, 'security')->'rows') e
              WHERE e->>'action' NOT LIKE 'sec\_%')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(public.admin_decision_log(NULL, 'decisions')->'rows') e
              WHERE e->>'action' LIKE 'sec\_%')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.admin_decision_log('a2c00000-0000-4000-8000-000000000002')->'rows') e
              WHERE e->>'action' = 'golden_conflict_keep' AND e->>'from' = 'm') THEN
    RAISE EXCEPTION 'FAIL — مرشّح الأمن أو «أُبقيت»';
  END IF;
  _p1 := public.admin_decision_log('a2c00000-0000-4000-8000-000000000001', NULL, NULL, NULL, 1);
  _p2 := public.admin_decision_log('a2c00000-0000-4000-8000-000000000001', NULL,
           (_p1->'rows'->0->>'at')::timestamptz, _p1->'rows'->0->>'id', 1);
  IF NOT (_p1->>'has_more')::boolean OR (_p2->>'has_more')::boolean
     OR _p1->'rows'->0->>'id' = _p2->'rows'->0->>'id' THEN
    RAISE EXCEPTION 'FAIL — صفحات السجلّ';
  END IF;
  RAISE NOTICE 'PASS — سجلّ القرارات للإدارة: قيمٌ قبل/بعد، وsec_* في مرشّحه، وصفحاتٌ بالمؤشّر';

  -- ٥) الصلاحيات: SECURITY DEFINER بمسار بحثٍ مثبّت، ولا تنفيذ للمجهول
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('admin_conflicts', 'admin_alerts', 'admin_link_queue', 'child_update_queue',
                                'admin_queue_counts', 'admin_search', 'admin_decision_log')
              AND (NOT p.prosecdef OR NOT COALESCE(p.proconfig, '{}') @> ARRAY['search_path=public']
                   OR has_function_privilege('anon', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'FAIL — دالّةٌ بلا مسارٍ مثبّت أو مفتوحة للمجهول';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('admin_conflicts', 'admin_alerts', 'admin_link_queue', 'child_update_queue')) <> 4 THEN
    RAISE EXCEPTION 'FAIL — بقيت نسخةٌ قديمة من دوال الطوابير';
  END IF;
  RAISE NOTICE 'PASS — SECURITY DEFINER بمسارٍ مثبّت، ولا نسخ قديمة، ولا تنفيذ للمجهول';
END $$;
ROLLBACK;
