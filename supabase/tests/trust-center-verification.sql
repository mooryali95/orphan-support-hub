-- مركز الثقة: قراءة الإدارة وحدها عبر الدول الأساسية — إثبات
--   • الزائر بلا تنفيذ، والدوالّ DEFINER بمسار بحثٍ مثبَّت.
--   • غير المدير يُرفض، ومشرف الدولة نفسه يُرفض (المركز للإدارة لا للفرق).
--   • الأعمار بفئاتها، والأقدم أوّلاً، والفريق ودعواته، والسجلّ بصفحاته
--     ومرشّحاته، والأسابيع الثمانية، ولا قيم حقولٍ في السجلّ.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data, last_sign_in_at) VALUES
  ('a9800000-0000-4000-8000-000000000001', 'tc-admin@example.test', '{}'::jsonb, now()),
  ('a9800000-0000-4000-8000-000000000002', 'tc-user@example.test', '{}'::jsonb, now()),
  ('a9800000-0000-4000-8000-000000000003', 'tc-sup@example.test', '{}'::jsonb, now()),
  ('a9800000-0000-4000-8000-000000000004', 'tc-invited@example.test', '{}'::jsonb, NULL);
INSERT INTO public.user_roles (user_id, role) VALUES ('a9800000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('SD', 'a9800000-0000-4000-8000-000000000003', 'supervisor'),
  ('SD', 'a9800000-0000-4000-8000-000000000004', 'supervisor');

SET LOCAL session_replication_role = replica;
INSERT INTO public.orphans (id, code, display_name, country, country_code, status)
VALUES ('a9810000-0000-4000-8000-000000000001', 'TC-SD-1', 'ملف الاختبار', 'السودان', 'SD', 'approved'),
       ('a9810000-0000-4000-8000-000000000002', 'TC-SD-2', 'ملف موثّق', 'السودان', 'SD', 'approved'),
       ('a9810000-0000-4000-8000-000000000003', 'TC-SD-3', 'ملف قديم', 'السودان', 'SD', 'approved');
INSERT INTO public.orphan_field_observations (orphan_id, field, role, source, value, observed_at) VALUES
  ('a9810000-0000-4000-8000-000000000002', 'display_name', 'wamy', 'wamy', '"x"', now() - interval '2 days'),
  ('a9810000-0000-4000-8000-000000000003', 'display_name', 'wamy', 'wamy', '"y"', now() - interval '400 days');
INSERT INTO public.data_conflicts (orphan_id, field, kind, risk, created_at) VALUES
  ('a9810000-0000-4000-8000-000000000001', 'birth_date', 'critical_change', 'critical', now() - interval '10 days'),
  ('a9810000-0000-4000-8000-000000000001', 'gender', 'critical_change', 'critical', now() - interval '2 days'),
  ('a9810000-0000-4000-8000-000000000001', 'guardian', 'disagreement', 'medium', now() - interval '1 hour');
INSERT INTO public.data_conflicts (orphan_id, field, kind, risk, status, resolution, resolved_at, created_at) VALUES
  ('a9810000-0000-4000-8000-000000000001', 'health_status', 'disagreement', 'medium', 'resolved', 'use_wamy',
   now() - interval '1 hour', now() - interval '20 days');
INSERT INTO public.data_alerts (country_code, field, code, severity, created_at)
VALUES ('SD', 'display_name', 'bulk_change', 'critical', now() - interval '5 hours');
SET LOCAL session_replication_role = origin;

INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta, created_at) VALUES
  ('a9800000-0000-4000-8000-000000000001', 'golden_conflict_resolve', 'orphans', 'a9810000-0000-4000-8000-000000000001',
   '{"field":"health_status","choice":"use_wamy","value":"secret","was":"old"}', now() - interval '1 hour'),
  ('a9800000-0000-4000-8000-000000000001', 'country_staff_set', 'country_staff', 'a9800000-0000-4000-8000-000000000003',
   '{"country":"SD","from":null,"to":"supervisor"}', now() - interval '2 hours'),
  ('a9800000-0000-4000-8000-000000000001', 'country_source_mode', 'countries', NULL,
   '{"country":"TH","from":"none","to":"shadow"}', now() - interval '3 hours'),
  ('a9800000-0000-4000-8000-000000000001', 'orphan_reviewed', 'orphans', NULL, '{"country":"SD"}', now());

CREATE OR REPLACE FUNCTION pg_temp.as_user(_n INT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    format('{"sub":"a9800000-0000-4000-8000-00000000000%s","role":"authenticated"}', _n), true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.denied(_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN true;
END $$;

DO $$ BEGIN RAISE NOTICE '── مركز الثقة'; END $$;

DO $$
DECLARE _open TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO _open
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'admin_trust_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR NOT p.prosecdef OR p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF _open IS NOT NULL THEN RAISE EXCEPTION 'FAIL — دالّةٌ مفتوحة للزائر أو بلا DEFINER: %', _open; END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname LIKE 'admin_trust_%') <> 5 THEN
    RAISE EXCEPTION 'FAIL — دوالّ مركز الثقة ليست خمساً';
  END IF;
  RAISE NOTICE 'PASS — الزائر بلا تنفيذ، والدوالّ الخمس DEFINER بمسارٍ مثبَّت';
END $$;

DO $$
DECLARE _n INT;
BEGIN
  FOR _n IN 2..3 LOOP
    PERFORM pg_temp.as_user(_n);
    IF NOT pg_temp.denied('SELECT public.admin_trust_overview()')
       OR NOT pg_temp.denied('SELECT public.admin_trust_aging()')
       OR NOT pg_temp.denied('SELECT public.admin_trust_team()')
       OR NOT pg_temp.denied('SELECT public.admin_trust_decisions()')
       OR NOT pg_temp.denied($q$SELECT public.admin_trust_weekly('SD')$q$) THEN
      RAISE EXCEPTION 'FAIL — غير المدير (%) قرأ مركز الثقة', _n;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — غير المدير ومشرف الدولة يُرفضان في الدوالّ الخمس';
END $$;

DO $$
DECLARE _r JSONB; _sd JSONB; _p JSONB;
BEGIN
  PERFORM pg_temp.as_user(1);
  _r := public.admin_trust_overview();
  IF jsonb_array_length(_r) <> (SELECT count(*) FROM public.countries WHERE live_focus) THEN
    RAISE EXCEPTION 'FAIL — النظرة ليست على الدول الأساسية: %', _r;
  END IF;
  SELECT x INTO _sd FROM jsonb_array_elements(_r) x WHERE x->>'code' = 'SD';
  IF (_sd->>'critical')::int <> 3 OR (_sd->>'other')::int <> 1 OR (_sd->>'files')::int < 1 THEN
    RAISE EXCEPTION 'FAIL — أعداد السودان: %', _sd;
  END IF;
  IF EXISTS (SELECT 1 FROM public.countries c WHERE c.live_focus
               AND public.golden_verified_count(c.code) <> (
                 SELECT count(*) FROM public.orphans o WHERE o.country_code = c.code AND o.exited_at IS NULL
                    AND public.golden_trust(o.id)->>'state' = 'verified'))
     OR public.golden_verified_count('SD') < 1 THEN
    RAISE EXCEPTION 'FAIL — عدّ الموثَّق بجملةٍ واحدة يخالف golden_trust';
  END IF;
  RAISE NOTICE 'PASS — النظرة: الدول الأساسية وحدها، والحرج تعارضاتٌ وتنبيهات، وعدّ الموثَّق يطابق golden_trust';

  _r := public.admin_trust_aging();
  SELECT x INTO _sd FROM jsonb_array_elements(_r->'buckets') x WHERE x->>'code' = 'SD';
  IF (_sd->>'lt1')::int <> 1 OR (_sd->>'d1_3')::int <> 1 OR (_sd->>'d3_7')::int <> 0 OR (_sd->>'gt7')::int <> 1
     OR _r->'oldest'->0->>'field' <> 'birth_date' OR (_r->>'total')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL — فئات العمر أو الترتيب: %', _r;
  END IF;
  RAISE NOTICE 'PASS — العمر بفئاته الأربع، والأقدم أوّلاً';

  SELECT x INTO _sd FROM jsonb_array_elements(public.admin_trust_team()) x WHERE x->>'code' = 'SD';
  IF (_sd->>'supervisors')::int <> 2 OR (_sd->>'active_supervisors')::int <> 1 OR (_sd->>'pending')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL — فريق السودان: %', _sd;
  END IF;
  RAISE NOTICE 'PASS — الفريق بأدواره، والمدعوّ لم يدخل لا يُحسب في العينين';

  _p := public.admin_trust_decisions(NULL, NULL, NULL, NULL, 2);
  IF jsonb_array_length(_p->'rows') <> 2 OR NOT (_p->>'has_more')::boolean
     OR _p->'rows'->0->>'actor_email' <> 'tc-admin@example.test'
     OR _p::text LIKE '%secret%' OR _p::text LIKE '%orphan_reviewed%' THEN
    RAISE EXCEPTION 'FAIL — الصفحة الأولى: %', _p;
  END IF;
  _r := public.admin_trust_decisions(NULL, NULL, (_p->'rows'->1->>'created_at')::timestamptz,
                                     (_p->'rows'->1->>'id')::uuid, 2);
  IF jsonb_array_length(_r->'rows') <> 1 OR (_r->>'has_more')::boolean
     OR _r->'rows'->0->>'action' <> 'country_source_mode' THEN
    RAISE EXCEPTION 'FAIL — الصفحة الثانية: %', _r;
  END IF;
  IF jsonb_array_length(public.admin_trust_decisions('SD')->'rows') <> 2
     OR jsonb_array_length(public.admin_trust_decisions(NULL, 'country_source_mode')->'rows') <> 1
     OR public.admin_trust_decisions('SD')->'rows'->0->>'file_code' <> 'TC-SD-1' THEN
    RAISE EXCEPTION 'FAIL — مرشّح الدولة أو الإجراء';
  END IF;
  RAISE NOTICE 'PASS — السجلّ بصفحاتٍ بالمؤشّر ومرشّحات، وبريد الفاعل، وبلا قيم حقول';

  _r := public.admin_trust_weekly('SD');
  IF jsonb_array_length(_r->'weeks') <> 8
     OR (SELECT sum((w->>'settled')::int) FROM jsonb_array_elements(_r->'weeks') w) <> 1
     OR (_r->'weeks'->7->>'open_at_end')::int <> 4 THEN
    RAISE EXCEPTION 'FAIL — الأسابيع الثمانية: %', _r;
  END IF;
  IF public.admin_trust_weekly('JO')->>'code' <> 'country_unknown' THEN
    RAISE EXCEPTION 'FAIL — دولةٌ غير أساسية';
  END IF;
  RAISE NOTICE 'PASS — ثمانية أسابيع بما فُتح وما حُسم والمتراكم، والدولة غير الأساسية مرفوضة';
END $$;

ROLLBACK;
