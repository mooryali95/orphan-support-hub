-- تحصين بعد مراجعة الأمن — إثبات (من سيناريوهات الفريق الأحمر)
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('a9b00000-0000-4000-8000-000000000001', 'sh-admin@example.test', now()),
  ('a9b00000-0000-4000-8000-000000000002', 'sh-admin2@example.test', now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a9b00000-0000-4000-8000-000000000001', 'admin'), ('a9b00000-0000-4000-8000-000000000002', 'admin');

DO $$
DECLARE _o UUID; _ok BOOLEAN; _c UUID;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"a9b00000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.admin_golden_import('wamy', 'SD', NULL,
    '[{"external_ref":"sh-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"هدى","birth_date":"2013-06-01","gender":"female"}}]'::jsonb);
  PERFORM public.admin_link_create_unmatched('SD');
  SELECT orphan_id INTO _o FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'sh-1';

  -- 1) مديرٌ واحد لا يكتب هوية ملفٍّ تديره الندوة مباشرة
  _ok := false;
  BEGIN
    UPDATE public.orphans SET birth_date = DATE '2016-01-01' WHERE id = _o;
  EXCEPTION WHEN insufficient_privilege THEN _ok := SQLERRM = 'golden_managed';
  END;
  IF NOT _ok OR (SELECT birth_date FROM public.orphans WHERE id = _o) <> DATE '2013-06-01' THEN
    RAISE EXCEPTION 'FAIL — كتابةٌ مباشرة تجاوزت السجلّ الذهبي';
  END IF;

  -- 2) رمز الدولة لا يتغيّر وحده، ولو من مدير
  _ok := false;
  BEGIN
    UPDATE public.orphans SET country_code = 'TH' WHERE id = _o;
  EXCEPTION WHEN insufficient_privilege THEN _ok := SQLERRM IN ('country_code_derived', 'golden_managed');
  END;
  IF NOT _ok OR (SELECT country_code FROM public.orphans WHERE id = _o) <> 'SD' THEN
    RAISE EXCEPTION 'FAIL — نُقل الملف إلى دولةٍ أخرى بكتابةٍ مباشرة';
  END IF;
  RAISE NOTICE 'PASS — الهوية ورمز الدولة لا يُكتبان مباشرة';

  -- 3) والمسار المشروع يعمل: رفعٌ من الندوة ثم حسمٌ من مديرٍ آخر
  PERFORM public.admin_golden_import('wamy', 'SD', NULL,
    '[{"external_ref":"sh-1","observed_at":"2026-11-02T00:00:00Z","fields":{"birth_date":"2013-07-01"}}]'::jsonb);
  SELECT id INTO _c FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open';
  SET LOCAL request.jwt.claims = '{"sub":"a9b00000-0000-4000-8000-000000000002","role":"authenticated"}';
  _ok := (public.admin_conflict_resolve(_c, 'accept')->>'ok')::boolean;
  IF NOT _ok
     OR (SELECT birth_date FROM public.orphans WHERE id = _o) <> DATE '2013-07-01' THEN
    RAISE EXCEPTION 'FAIL — المسار المشروع لم يكتب الهوية';
  END IF;
  RAISE NOTICE 'PASS — التعديل يمرّ بالسجلّ الذهبي وقاعدة العينين وحدها';

  -- 4) تسليم رمز الدخول: مرّةً واحدة
  SET LOCAL ROLE service_role;
  PERFORM public.sso_handoff_put('a9b10000-0000-4000-8000-000000000001', 'hash-1');
  IF public.sso_handoff_take('a9b10000-0000-4000-8000-000000000001') <> 'hash-1'
     OR public.sso_handoff_take('a9b10000-0000-4000-8000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — رمز الدخول سُلِّم مرّتين';
  END IF;
  RESET ROLE;
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.sso_handoff_take('a9b10000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مستخدمٌ نادى تسليم الرمز'; END IF;
  RAISE NOTICE 'PASS — رمز الدخول يُسلَّم مرّةً واحدة ولمفتاح الخدمة وحده';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص التحصين اجتازت ──'; END $$;
ROLLBACK;
