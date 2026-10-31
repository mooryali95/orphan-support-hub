-- بدء تشغيل المكتب — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d1000000-0000-4000-8000-00000000b001', 'ob-member@example.test', '{}'::jsonb),
  ('d1000000-0000-4000-8000-00000000b002', 'ob-admin@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('d1000000-0000-4000-8000-00000000b002', 'admin');
INSERT INTO public.countries (code, name_ar, name_local, status) VALUES ('AL', 'ألبانيا', 'Shqipëri', 'active')
  ON CONFLICT (code) DO UPDATE SET status = 'active';
INSERT INTO public.offices (id, name, country_code) VALUES ('d2000000-0000-4000-8000-00000000b001', 'مكتب ألبانيا', 'AL');
INSERT INTO public.office_members (office_id, user_id, role)
  VALUES ('d2000000-0000-4000-8000-00000000b001', 'd1000000-0000-4000-8000-00000000b001', 'manager');
INSERT INTO public.mirror_sync_state (source, entity, last_run_at, last_error)
  VALUES ('rowad-albania', 'groups', now(), 'secret-token-in-error-text');

DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-00000000b001","role":"authenticated"}';
  _j := public.office_dashboard('d2000000-0000-4000-8000-00000000b001');
  RESET ROLE;
  IF (_j->>'members')::int <> 1 THEN RAISE EXCEPTION 'FAIL — عدد الأعضاء: %', _j; END IF;
  IF _j->'platform'->>'key' <> 'rowad-albania' OR (_j->'platform'->>'has_error')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — منصّة الدولة أو حال المزامنة: %', _j->'platform';
  END IF;
  IF _j->'platform'->'last_error' <> 'null'::jsonb OR _j::text LIKE '%secret-token%' THEN
    RAISE EXCEPTION 'FAIL — نصّ خطأ المزامنة تسرّب إلى عضو المكتب: %', _j->'platform';
  END IF;
  RAISE NOTICE 'PASS — عضو المكتب يرى الأعداد وحال المنصّة بلا نصّ الخطأ';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d1000000-0000-4000-8000-00000000b002","role":"authenticated"}';
  _j := public.office_dashboard('d2000000-0000-4000-8000-00000000b001');
  RESET ROLE;
  IF _j->'platform'->>'last_error' <> 'secret-token-in-error-text' THEN
    RAISE EXCEPTION 'FAIL — الإدارة لا ترى نصّ الخطأ: %', _j->'platform';
  END IF;
  RAISE NOTICE 'PASS — الإدارة ترى نصّ خطأ المزامنة';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص بدء تشغيل المكتب اجتازت ──'; END $$;
ROLLBACK;
