-- لقطة الثقة الأسبوعية — إثبات
--   • الجدول للإدارة قراءةً وحدها، ولا كتابة لأحدٍ من الواجهة.
--   • trust_snapshot_take لـ service_role وحده، وتكرارها في الأسبوع صفٌّ واحد.
--   • القيم تطابق golden_verified_count، والأسبوع بلا لقطة «لم يُسجَّل».
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data, last_sign_in_at) VALUES
  ('a9900000-0000-4000-8000-000000000001', 'ts-admin@example.test', '{}'::jsonb, now()),
  ('a9900000-0000-4000-8000-000000000002', 'ts-user@example.test', '{}'::jsonb, now());
INSERT INTO public.user_roles (user_id, role) VALUES ('a9900000-0000-4000-8000-000000000001', 'admin');

SET LOCAL session_replication_role = replica;
INSERT INTO public.orphans (id, code, display_name, country, country_code, status)
VALUES ('a9910000-0000-4000-8000-000000000001', 'TS-SD-1', 'ملف موثّق', 'السودان', 'SD', 'approved'),
       ('a9910000-0000-4000-8000-000000000002', 'TS-SD-2', 'ملف معلَّم', 'السودان', 'SD', 'approved');
INSERT INTO public.orphan_field_observations (orphan_id, field, role, source, value, observed_at) VALUES
  ('a9910000-0000-4000-8000-000000000001', 'display_name', 'wamy', 'wamy', '"x"', now() - interval '1 day'),
  ('a9910000-0000-4000-8000-000000000002', 'display_name', 'wamy', 'wamy', '"y"', now() - interval '1 day');
INSERT INTO public.data_alerts (orphan_id, country_code, field, code, severity)
VALUES ('a9910000-0000-4000-8000-000000000002', 'SD', 'display_name', 'bulk_change', 'critical');
SET LOCAL session_replication_role = origin;
DELETE FROM public.trust_snapshots;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_n INT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    format('{"sub":"a9900000-0000-4000-8000-00000000000%s","role":"authenticated"}', _n), true);
$$;

DO $$ BEGIN RAISE NOTICE '── لقطة الثقة الأسبوعية'; END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.trust_snapshot_take()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trust_snapshot_take()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.trust_snapshot_take()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — اللقطة ليست لـ service_role وحده';
  END IF;
  IF has_table_privilege('anon', 'public.trust_snapshots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.trust_snapshots', 'INSERT')
     OR has_table_privilege('authenticated', 'public.trust_snapshots', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.trust_snapshots', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL — الجدول مفتوحٌ لغير قراءة الإدارة';
  END IF;
  RAISE NOTICE 'PASS — التنفيذ لـ service_role وحده، والجدول قراءةٌ لا كتابة';
END $$;

DO $$
DECLARE _n INT; _rows INT;
BEGIN
  _n := public.trust_snapshot_take();
  _n := public.trust_snapshot_take();
  SELECT count(*) INTO _rows FROM public.trust_snapshots;
  IF _rows <> (SELECT count(*) FROM public.countries WHERE live_focus) OR _n <> _rows THEN
    RAISE EXCEPTION 'FAIL — التكرار في الأسبوع أنشأ صفوفاً (%)', _rows;
  END IF;
  IF EXISTS (SELECT 1 FROM public.trust_snapshots
              WHERE week_start <> date_trunc('week', now() AT TIME ZONE 'UTC')::date) THEN
    RAISE EXCEPTION 'FAIL — اللقطة ليست لأسبوع الاثنين الجاري';
  END IF;
  RAISE NOTICE 'PASS — لقطتان في أسبوعٍ واحد صفٌّ واحد لكل دولة أساسية';
END $$;

DO $$
DECLARE _s public.trust_snapshots;
BEGIN
  SELECT * INTO _s FROM public.trust_snapshots WHERE country_code = 'SD';
  IF _s.verified <> public.golden_verified_count('SD')
     OR _s.files <> (SELECT count(*) FROM public.orphans WHERE country_code = 'SD' AND exited_at IS NULL)
     OR _s.flagged < 1 OR _s.alerts_critical_open < 1 THEN
    RAISE EXCEPTION 'FAIL — قيم اللقطة لا تطابق العدّ السريع: %', row_to_json(_s);
  END IF;
  RAISE NOTICE 'PASS — الموثَّق يطابق golden_verified_count، والمعلَّم والتنبيه محسوبان';
END $$;

DO $$
DECLARE _r JSONB; _ok BOOLEAN;
BEGIN
  PERFORM pg_temp.as_user(2);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.trust_snapshots) <> 0 THEN
    RAISE EXCEPTION 'FAIL — غير المدير قرأ اللقطات';
  END IF;
  BEGIN
    PERFORM public.admin_trust_weekly('SD');
    _ok := false;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غير المدير قرأ التقرير الأسبوعي'; END IF;
  BEGIN
    PERFORM public.trust_snapshot_take();
    _ok := false;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — المستخدم أخذ لقطة'; END IF;

  PERFORM pg_temp.as_user(1);
  IF (SELECT count(*) FROM public.trust_snapshots) = 0 THEN
    RAISE EXCEPTION 'FAIL — المدير لا يقرأ اللقطات';
  END IF;
  _r := public.admin_trust_weekly('SD');
  RESET ROLE;
  IF (_r->'weeks'->7->>'recorded')::boolean IS NOT TRUE
     OR (_r->'weeks'->7->>'verified_share')::int
        <> floor(public.golden_verified_count('SD') * 100.0 / (_r->>'files')::int)::int
     OR (_r->'weeks'->6->>'recorded')::boolean IS NOT FALSE
     OR _r->'weeks'->6->'verified_share' <> 'null'::jsonb
     OR _r->>'recorded_from' <> to_char(date_trunc('week', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD') THEN
    RAISE EXCEPTION 'FAIL — الأسابيع لا تحمل اللقطة كما خُزّنت: %', _r;
  END IF;
  RAISE NOTICE 'PASS — غير المدير يُرفض، والمدير يرى حصّة الأسبوع المسجَّل و«لم يُسجَّل» قبله';
END $$;

ROLLBACK;
