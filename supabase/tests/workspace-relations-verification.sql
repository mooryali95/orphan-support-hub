-- =====================================================================
-- البوابات بما يملكه الحساب — إثبات (الدفعة ٢: UX-16)
-- ---------------------------------------------------------------------
-- my_workspaces يُخبر الواجهة بالإشراف والترجمة وحال الجهة، عن الحساب
-- نفسه وحده: فلا يُعرض «الإشراف» لغير المشرف، ويجد المترجم مدخله، ولا
-- يُقرأ «كافل» عنواناً لمن له دورٌ غيره.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b2f00000-0000-4000-8000-000000000001', 'b2f-sponsor@example.test', '{}'::jsonb),
  ('b2f00000-0000-4000-8000-000000000002', 'b2f-supervisor@example.test', '{}'::jsonb),
  ('b2f00000-0000-4000-8000-000000000003', 'b2f-translator@example.test', '{}'::jsonb),
  ('b2f00000-0000-4000-8000-000000000004', 'b2f-revoked@example.test', '{}'::jsonb);
INSERT INTO public.supervisor_profiles (user_id, level, active, certified_at) VALUES
  ('b2f00000-0000-4000-8000-000000000002', 'foundational', true, now()),
  ('b2f00000-0000-4000-8000-000000000004', 'foundational', false, now() - interval '30 days');
INSERT INTO public.ui_locales (code, name, dir, status) VALUES ('sq', 'Shqip', 'ltr', 'draft')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.ui_locale_reviewers (locale, user_id)
VALUES ('sq', 'b2f00000-0000-4000-8000-000000000003');
INSERT INTO public.care_organizations (owner_id, name, status)
VALUES ('b2f00000-0000-4000-8000-000000000001', 'جهة معلّقة', 'pending');

DO $$
DECLARE _w JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2f00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _w := public.my_workspaces();
  IF (_w->>'supervisor')::boolean OR jsonb_array_length(_w->'translator_locales') <> 0
     OR _w->>'care_org_status' <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — الكافل يُعرض مشرفاً أو مترجماً، أو حال جهته غائبة: %', _w;
  END IF;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2f00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _w := public.my_workspaces();
  IF NOT (_w->>'supervisor')::boolean OR _w->'care_org_status' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — المشرف المعتمد لا يُعرف مشرفاً: %', _w;
  END IF;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2f00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  IF (public.my_workspaces()->>'supervisor')::boolean THEN
    RAISE EXCEPTION 'FAIL — المشرف المسحوب اعتماده يُعرض مشرفاً';
  END IF;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2f00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _w := public.my_workspaces();
  IF _w->'translator_locales'->0->>'code' IS DISTINCT FROM 'sq' THEN
    RAISE EXCEPTION 'FAIL — المترجم لا يجد لغته: %', _w;
  END IF;
  RESET ROLE;
  IF has_function_privilege('anon', 'public.my_workspaces()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — البوابات مفتوحةٌ للزائر';
  END IF;
  RAISE NOTICE 'PASS — UX-16: البوابات بما يملكه الحساب — الإشراف للمعتمد وحده، والمترجم يجد لغته، وحال الجهة معلومة';
END $$;

ROLLBACK;
