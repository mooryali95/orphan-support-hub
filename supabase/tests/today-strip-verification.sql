-- =====================================================================
-- شريط «اليوم» لفريق الدولة — إثبات (هجرة 20261205100000_today_strip)
--   «تنتظر حسمك» لا يعدّ إلّا ما يحسمه المتّصل (مشرفٌ، وليس ممّا رفعه هو)،
--   و«متأخرة» عددٌ دقيق من الخادم، ولا عدّ لدولةٍ خارج النطاق.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a5a00000-0000-4000-8000-000000000001', 'ts-sup@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000002', 'ts-entry@example.test', '{}'::jsonb),
  ('a5a00000-0000-4000-8000-000000000003', 'ts-lk@example.test', '{}'::jsonb);
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('SN', 'a5a00000-0000-4000-8000-000000000001', 'supervisor'),
  ('SN', 'a5a00000-0000-4000-8000-000000000002', 'data_entry'),
  ('LK', 'a5a00000-0000-4000-8000-000000000003', 'supervisor');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, status, approved_at, country, country_code) VALUES
  ('a5c00000-0000-4000-8000-000000000001', 'TS-SN-1', 'طفل الاختبار', 100, 'USD', 'approved', now(), 'SN', 'SN');
INSERT INTO public.data_conflicts (id, orphan_id, field, kind, risk, status, current_value, proposed_value, created_at) VALUES
  ('a5e00000-0000-4000-8000-000000000001', 'a5c00000-0000-4000-8000-000000000001', 'display_name', 'disagreement', 'medium', 'open', '"a"', '"b"', now() - interval '4 days'),
  ('a5e00000-0000-4000-8000-000000000002', 'a5c00000-0000-4000-8000-000000000001', 'birth_date', 'critical_change', 'critical', 'open', '"2013-06-01"', '"2013-07-01"', now() - interval '1 hour');
INSERT INTO public.data_alerts (orphan_id, country_code, field, code, severity, status, raised_by, subject, created_at, updated_at)
SELECT 'a5c00000-0000-4000-8000-000000000001', 'SN', 'birth_date', s, 'critical', 'open', u, '', now() - interval '2 days', now()
  FROM (VALUES ('a5a00000-0000-4000-8000-000000000001'::uuid, 'age_shift'), (NULL::uuid, 'flip_flop')) v(u, s);

DO $$
DECLARE
  _sup TEXT := '{"sub":"a5a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
  _entry TEXT := '{"sub":"a5a00000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}';
  _lk TEXT := '{"sub":"a5a00000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
  _r JSONB; _ok BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', _sup, true);
  _r := public.admin_today_strip('SN');
  -- تعارضان + تنبيهٌ ليس منه (تنبيهه هو لا يُعدّ). المتأخّر: التعارض القديم والتنبيه الحرج بعد ٢٤ ساعة.
  IF (_r->>'settle')::int <> 3 OR (_r->>'overdue')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL — عدّ المشرف: %', _r;
  END IF;
  PERFORM set_config('request.jwt.claims', _entry, true);
  _r := public.admin_today_strip('SN');
  IF (_r->>'settle')::int <> 0 OR (_r->>'overdue')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL — مدخل البيانات لا يحسم: %', _r;
  END IF;
  PERFORM set_config('request.jwt.claims', _lk, true);
  BEGIN PERFORM public.admin_today_strip('SN'); EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — دولةٌ أخرى قرأت العدد'; END IF;
  IF has_function_privilege('anon', 'public.admin_today_strip(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — مفتوحة للمجهول';
  END IF;
  RAISE NOTICE 'PASS — شريط اليوم: ما يُحسم وحده، ومتأخّرٌ دقيق، وبنطاق الدولة';
END $$;
ROLLBACK;
