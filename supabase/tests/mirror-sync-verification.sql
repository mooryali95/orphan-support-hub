-- مزامنة المرآة مع الرواد — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ac100000-0000-4000-8000-000000000001', 'ms-org@example.test', '{"role":"care_org"}'::jsonb),
  ('ac100000-0000-4000-8000-000000000002', 'ms-user@example.test', '{}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ac200000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000001', 'جهة الرواد', 'approved');
UPDATE public.operating_platforms SET org_id = 'ac200000-0000-4000-8000-000000000001' WHERE key = 'rowad-albania';
INSERT INTO public.api_clients (id, name, client_key, secret_hash, org_id, scopes, source) VALUES
  ('ac300000-0000-4000-8000-000000000001', 'مزامنة الرواد', 'ck_live_rowad', 'x', NULL, ARRAY['mirror:write'], 'rowad-albania'),
  ('ac300000-0000-4000-8000-000000000002', 'شريك قراءة', 'ck_live_read', 'x', NULL, ARRAY['orphans:read'], NULL);

DO $$
DECLARE _r JSONB; _ok BOOLEAN;
BEGIN
  -- لا تكتب إلا service_role
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"ac100000-0000-4000-8000-000000000002","role":"authenticated"}';
    PERFORM public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'groups', '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مستخدمٌ نادى باب المزامنة مباشرة'; END IF;

  SET LOCAL ROLE service_role;
  _r := public.mirror_apply('ac300000-0000-4000-8000-000000000002', 'groups',
          '[{"external_ref":"c1","name":"س"}]'::jsonb);
  RESET ROLE;
  IF (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — مفتاحٌ بلا mirror:write كتب المرآة'; END IF;
  RAISE NOTICE 'PASS — الباب لـ service_role وحده، والمفتاح يحتاج mirror:write';

  SET LOCAL ROLE service_role;
  _r := public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'groups',
          '[{"external_ref":"class-7","name":"مجموعة السلام","region":"تيرانا","supervisor_name":"المعلّم ب"}]'::jsonb,
          '{}', now(), 'class-7');
  _r := public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'students',
          '[{"external_ref":"st-1","display_name":"طالب أ","gender":"female","age":10,"group_ref":"class-7"},
            {"external_ref":"st-2"}]'::jsonb);
  RESET ROLE;
  IF (_r->>'applied')::int <> 1 OR jsonb_array_length(_r->'skipped') <> 1 THEN
    RAISE EXCEPTION 'FAIL — دفعة الطلاب: %', _r;
  END IF;
  IF (SELECT status FROM public.orphans WHERE external_ref = 'st-1') <> 'under_review'
     OR (SELECT country_code FROM public.orphans WHERE external_ref = 'st-1') <> 'AL'
     OR (SELECT public.age_band_of(birth_date) FROM public.orphans WHERE external_ref = 'st-1') <> 'age_6_11'
     OR (SELECT g.name FROM public.orphans o JOIN public.mirror_groups g ON g.id = o.group_id WHERE o.external_ref = 'st-1') <> 'مجموعة السلام' THEN
    RAISE EXCEPTION 'FAIL — الطالب المستورَد: حالة أو بلد أو فئة أو مجموعة خاطئة';
  END IF;
  RAISE NOTICE 'PASS — الطلاب يصلون «قيد المراجعة» بمجموعتهم وبلد المنصّة وفئةٍ عمرية من العمر';

  SET LOCAL ROLE service_role;
  PERFORM public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'trait_dimensions',
            '[{"key":"NAFS","label_ar":"حفظ النفس"}]'::jsonb);
  PERFORM public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'traits',
            '[{"external_ref":"tr-1","dimension_key":"NAFS","name_ar":"الصبر","elements":["يهدأ عند الغضب"]}]'::jsonb);
  _r := public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'trait_scores',
            '[{"external_ref":"ev-1","student_ref":"st-1","trait_ref":"tr-1","score":7,"scale_max":10,"observed_at":"2026-10-01T00:00:00Z"}]'::jsonb);
  -- التكرار لا يُضاعف
  _r := public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'trait_scores',
            '[{"external_ref":"ev-1","student_ref":"st-1","trait_ref":"tr-1","score":8,"scale_max":10,"observed_at":"2026-10-01T00:00:00Z"}]'::jsonb);
  RESET ROLE;
  IF (SELECT count(*) FROM public.orphan_trait_scores WHERE external_ref = 'ev-1') <> 1
     OR (SELECT score FROM public.orphan_trait_scores WHERE external_ref = 'ev-1') <> 8 THEN
    RAISE EXCEPTION 'FAIL — الدرجة تكرّرت أو لم تتحدّث';
  END IF;
  RAISE NOTICE 'PASS — نموذج السمات ودرجاته يصلان، والدفعة المكرّرة تُحدِّث ولا تُضاعف';

  -- الحذف والمطابقة
  SET LOCAL ROLE service_role;
  PERFORM public.mirror_apply('ac300000-0000-4000-8000-000000000001', 'students', '[]'::jsonb, ARRAY['st-1']);
  _r := public.mirror_reconcile('ac300000-0000-4000-8000-000000000001', 'groups', ARRAY['class-7', 'class-9']);
  RESET ROLE;
  IF (SELECT external_deleted_at FROM public.orphans WHERE external_ref = 'st-1') IS NULL
     OR (SELECT status FROM public.orphans WHERE external_ref = 'st-1') <> 'under_review' THEN
    RAISE EXCEPTION 'FAIL — الحذف مسح أو غيّر الحالة بدل العلامة';
  END IF;
  IF NOT (_r->'drift'->'missing_here') @> '["class-9"]' THEN
    RAISE EXCEPTION 'FAIL — المطابقة لم تكشف الناقص: %', _r;
  END IF;
  IF (SELECT cursor_ref FROM public.mirror_sync_state WHERE source = 'rowad-albania' AND entity = 'groups') <> 'class-7' THEN
    RAISE EXCEPTION 'FAIL — المؤشّر لم يُحفظ';
  END IF;
  RAISE NOTICE 'PASS — المحذوف هناك علامةٌ هنا، والمطابقة تكتب الانحراف، والمؤشّر محفوظ';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص المزامنة اجتازت ──'; END $$;
ROLLBACK;
