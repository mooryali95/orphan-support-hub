-- =====================================================================
-- تحديثات الطفل للكافل — إثبات (هجرة 20261201100000_child_updates)
-- ---------------------------------------------------------------------
--   الرفع لفريق دولة الطفل وحده، وبموافقة الوليّ وحدود الحجم والمدّة؛
--   الحسم بعينين أُخريين وجلسة aal2 (والمدير ليس مستثنى)؛ الرفض بسببٍ
--   يُسجَّل؛ الطفل المجمَّد لا يستقبل تحديثاً؛ الكافل النشط يرى المعتمد
--   وحده، والخزنة لا تُجيز وسيطاً لغيره.
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1a00000-0000-4000-8000-000000000001', 'cu-admin@example.test', '{}'::jsonb),
  ('c1a00000-0000-4000-8000-000000000002', 'cu-sponsor@example.test', '{}'::jsonb),
  ('c1a00000-0000-4000-8000-000000000003', 'cu-other@example.test', '{}'::jsonb),
  ('c1a00000-0000-4000-8000-000000000004', 'cu-super@example.test', '{}'::jsonb),
  ('c1a00000-0000-4000-8000-000000000005', 'cu-entry@example.test', '{}'::jsonb),
  ('c1a00000-0000-4000-8000-000000000006', 'cu-foreign@example.test', '{}'::jsonb),
  ('c1a00000-0000-4000-8000-000000000007', 'cu-viewer@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('c1a00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('SN', 'c1a00000-0000-4000-8000-000000000004', 'supervisor'),
  ('SN', 'c1a00000-0000-4000-8000-000000000005', 'data_entry'),
  ('SN', 'c1a00000-0000-4000-8000-000000000007', 'viewer'),
  ('LK', 'c1a00000-0000-4000-8000-000000000006', 'supervisor');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, status, approved_at, country, country_code)
VALUES ('c1c00000-0000-4000-8000-000000000001', 'CU-1', 'طفل التحديثات', 100, 'USD', 'approved', now(), 'SN', 'SN');
INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('c1a00000-0000-4000-8000-000000000002', 'c1c00000-0000-4000-8000-000000000001', 50, 'USD', 'active', now()),
       ('c1a00000-0000-4000-8000-000000000003', 'c1c00000-0000-4000-8000-000000000001', 50, 'USD', 'cancelled', now());
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
  ('child-updates', 'c1c00000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg', '{"size": 120000}'),
  ('child-updates', 'c1c00000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.jpg', '{"size": 6000000}'),
  ('child-updates', 'c1c00000-0000-4000-8000-000000000001/33333333-3333-4333-8333-333333333333.mp4', '{"size": 9000000}'),
  ('child-updates', 'c1c00000-0000-4000-8000-000000000001/44444444-4444-4444-8444-444444444444.jpg', '{"size": 50000}');

DO $$
DECLARE _o UUID := 'c1c00000-0000-4000-8000-000000000001';
  _p1 TEXT := 'c1c00000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg';
  _big TEXT := 'c1c00000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.jpg';
  _vid TEXT := 'c1c00000-0000-4000-8000-000000000001/33333333-3333-4333-8333-333333333333.mp4';
  _pos TEXT := 'c1c00000-0000-4000-8000-000000000001/44444444-4444-4444-8444-444444444444.jpg';
  _r JSONB; _ok BOOLEAN; _photo UUID; _video UUID; _note UUID; _n BIGINT;
  _admin2 TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  _sup1 TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}';
  _sup2 TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}';
  _entry TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
  _viewer TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal2"}';
  _foreign TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}';
  _sponsor TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
  _other TEXT := '{"sub":"c1a00000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}';
BEGIN
  -- ١) الرفع: الدولة وحدها، والمشاهد لا يرفع، وعضو دولةٍ أخرى لا يعرف شيئاً
  FOREACH _r IN ARRAY ARRAY[_viewer::jsonb, _foreign::jsonb] LOOP
    PERFORM set_config('request.jwt.claims', _r::text, true);
    _ok := false;
    BEGIN
      PERFORM public.child_update_create(_o, 'note', NULL, 'ملاحظة', NULL, false);
    EXCEPTION WHEN insufficient_privilege THEN _ok := SQLERRM = 'country_forbidden';
    END;
    IF NOT _ok THEN RAISE EXCEPTION 'FAIL — رفعٌ من خارج فريق الرفع في الدولة'; END IF;
  END LOOP;
  RAISE NOTICE 'PASS — الرفع لفريق دولة الطفل (مشرف/مُدخل)، لا للمشاهد ولا لدولةٍ أخرى';

  -- ٢) الموافقة والحدود
  PERFORM set_config('request.jwt.claims', _entry, true);
  IF public.child_update_create(_o, 'photo', _p1, 'في المدرسة', 'At school', false)->>'code' IS DISTINCT FROM 'consent_required'
     OR public.child_update_create(_o, 'photo', _big, 'كبيرة', NULL, true)->>'code' IS DISTINCT FROM 'file_too_large'
     OR public.child_update_create(_o, 'photo', _vid, 'امتداد', NULL, true)->>'code' IS DISTINCT FROM 'path_invalid'
     OR public.child_update_create(_o, 'photo', 'other/../x.jpg', 'مسار', NULL, true)->>'code' IS DISTINCT FROM 'path_invalid'
     OR public.child_update_create(_o, 'photo', _o::text || '/55555555-5555-4555-8555-555555555555.jpg', 'غائب', NULL, true)->>'code' IS DISTINCT FROM 'file_missing'
     OR public.child_update_create(_o, 'video', _vid, 'طويل', NULL, true, 75)->>'code' IS DISTINCT FROM 'video_too_long'
     OR public.child_update_create(_o, 'note', NULL, '  ', NULL, false)->>'code' IS DISTINCT FROM 'caption_invalid' THEN
    RAISE EXCEPTION 'FAIL — رفعٌ تجاوز الموافقة أو الحدود';
  END IF;
  _photo := (public.child_update_create(_o, 'photo', _p1, 'في المدرسة', 'At school', true)->>'id')::uuid;
  _video := (public.child_update_create(_o, 'video', _vid, 'يقرأ', 'Reading', true, 42, _pos)->>'id')::uuid;
  _note := (public.child_update_create(_o, 'note', NULL, 'أتمّ الفصل', NULL, false)->>'id')::uuid;
  IF _photo IS NULL OR _video IS NULL OR _note IS NULL THEN RAISE EXCEPTION 'FAIL — رفعٌ صحيح لم يُقبل'; END IF;
  IF public.child_update_create(_o, 'photo', _p1, 'مكرّر', NULL, true)->>'code' IS DISTINCT FROM 'path_invalid' THEN
    RAISE EXCEPTION 'FAIL — ملفٌّ واحد لتحديثين';
  END IF;
  RAISE NOTICE 'PASS — موافقة الوليّ شرطٌ للوسيط، والصورة ≤5MB، والمقطع mp4 ≤60 ثانية، والمسار في مجلّد الطفل';

  -- ٣) الكافل لا يرى المعلّق
  PERFORM set_config('request.jwt.claims', _sponsor, true);
  IF jsonb_array_length(public.my_child_updates(_o)->'items') <> 0 THEN RAISE EXCEPTION 'FAIL — الكافل رأى تحديثاً معلّقاً'; END IF;

  -- ٤) الحسم: aal2، والعينان، والمدير ليس مستثنى
  PERFORM set_config('request.jwt.claims', _sup1, true);
  IF public.child_update_review(_photo, 'approve')->>'code' IS DISTINCT FROM 'mfa_required' THEN
    RAISE EXCEPTION 'FAIL — حسمٌ بجلسة aal1';
  END IF;
  PERFORM set_config('request.jwt.claims', _entry, true);
  _ok := false;
  BEGIN PERFORM public.child_update_review(_photo, 'approve');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مُدخل البيانات حسم'; END IF;
  PERFORM set_config('request.jwt.claims', _foreign, true);
  _ok := false;
  BEGIN PERFORM public.child_update_review(_photo, 'approve');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مشرف دولةٍ أخرى حسم'; END IF;
  -- المدير يرفع ثم يحاول حسم ما رفعه
  PERFORM set_config('request.jwt.claims', _admin2, true);
  _r := public.child_update_create(_o, 'note', NULL, 'ملاحظة المدير', NULL, false);
  _n := (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_four_eyes_refused');
  IF public.child_update_review((_r->>'id')::uuid, 'approve')->>'code' IS DISTINCT FROM 'four_eyes_required' THEN
    RAISE EXCEPTION 'FAIL — المدير حسم ما رفعه بنفسه';
  END IF;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_four_eyes_refused') - _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — المدير حسم ما رفعه بنفسه';
  END IF;
  PERFORM set_config('request.jwt.claims', _sup2, true);
  IF (public.child_update_review((_r->>'id')::uuid, 'approve')->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — المشرف لم يحسم ما رفعه المدير';
  END IF;
  RAISE NOTICE 'PASS — الحسم لمشرف الدولة بجلسة aal2 ومن غير الرافع، والمدير ليس مستثنى';

  -- ٥) الرفض بسببٍ ويُسجَّل
  IF public.child_update_review(_note, 'reject', ' ')->>'code' IS DISTINCT FROM 'reason_required' THEN
    RAISE EXCEPTION 'FAIL — رفضٌ بلا سبب';
  END IF;
  PERFORM public.child_update_review(_note, 'reject', 'يذكر اسم المدرسة');
  IF NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'child_update_rejected' AND orphan_id = _o
                    AND detail->>'update' = _note::text) THEN
    RAISE EXCEPTION 'FAIL — الرفض لم يُسجَّل';
  END IF;
  IF public.child_update_review(_note, 'approve')->>'code' IS DISTINCT FROM 'update_closed' THEN
    RAISE EXCEPTION 'FAIL — تحديثٌ محسوم حُسم ثانيةً';
  END IF;
  PERFORM public.child_update_review(_photo, 'approve');
  RAISE NOTICE 'PASS — الرفض بسببٍ يُكتب في integrity_log، والمحسوم لا يُعاد';

  -- ٦) التجميد: لا رفع ولا اعتماد
  PERFORM set_config('request.jwt.claims', _admin2, true);
  PERFORM public.admin_orphan_freeze(_o, 'بلاغ قيد التحقيق');
  PERFORM set_config('request.jwt.claims', _sup2, true);
  IF public.child_update_create(_o, 'note', NULL, 'بعد التجميد', NULL, false)->>'code' IS DISTINCT FROM 'orphan_frozen'
     OR public.child_update_review(_video, 'approve')->>'code' IS DISTINCT FROM 'orphan_frozen'
     OR public.can_upload_child_update(_o::text || '/66666666-6666-4666-8666-666666666666.jpg') THEN
    RAISE EXCEPTION 'FAIL — طفلٌ مجمَّد استقبل تحديثاً';
  END IF;
  DELETE FROM public.orphan_freezes WHERE orphan_id = _o;
  RAISE NOTICE 'PASS — الطفل المجمَّد لا يُرفع له تحديثٌ ولا يُعتمد';

  -- ٧) القراءة: الكافل النشط يرى المعتمد وحده، والمنتهية كفالته لا يرى شيئاً
  PERFORM set_config('request.jwt.claims', _sponsor, true);
  _r := public.my_child_updates(_o);
  IF jsonb_array_length(_r->'items') <> 2
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'items') e WHERE e->>'id' IN (_note::text, _video::text))
     OR _r::text LIKE '%reject%' OR _r::text LIKE '%uploaded_by%' THEN
    RAISE EXCEPTION 'FAIL — الكافل رأى غير المعتمد أو حقول المراجعة: %', _r;
  END IF;
  IF NOT public.can_view_child_update(_p1) OR public.can_view_child_update(_vid) OR public.can_view_child_update(_pos) THEN
    RAISE EXCEPTION 'FAIL — إذن الخزنة للكافل لا يطابق المعتمد';
  END IF;
  PERFORM set_config('request.jwt.claims', _other, true);
  IF jsonb_array_length(public.my_child_updates(_o)->'items') <> 0 OR public.can_view_child_update(_p1) THEN
    RAISE EXCEPTION 'FAIL — كافلٌ منتهية كفالته رأى التحديثات';
  END IF;
  RAISE NOTICE 'PASS — الكافل النشط يرى المعتمد وحده بلا حقول المراجعة، وغيره لا يرى شيئاً';

  -- ٨) الطابور: فريق الدولة يرى معلّقها، والمدير يرى الكلّ، والكافل لا شيء
  PERFORM set_config('request.jwt.claims', _viewer, true);
  IF jsonb_array_length(public.child_update_queue('SN')->'items') <> 1 OR NOT public.can_view_child_update(_vid) THEN
    RAISE EXCEPTION 'FAIL — فريق الدولة لا يرى المعلّق';
  END IF;
  PERFORM set_config('request.jwt.claims', _admin2, true);
  IF jsonb_array_length(public.child_update_queue(NULL)->'items') <> 1 OR public.child_updates_pending_count() <> 1 THEN
    RAISE EXCEPTION 'FAIL — طابور اليوم لا يعدّ المعلّق';
  END IF;
  PERFORM set_config('request.jwt.claims', _sponsor, true);
  _ok := false;
  BEGIN PERFORM public.child_update_queue('SN');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok OR public.child_updates_pending_count() <> 0 THEN RAISE EXCEPTION 'FAIL — الكافل رأى الطابور'; END IF;
  PERFORM set_config('request.jwt.claims', _entry, true);
  IF public.child_update_children('SN', 'CU')->'items'->0->>'code' IS DISTINCT FROM 'CU-1' THEN
    RAISE EXCEPTION 'FAIL — مُدخل البيانات لا يجد طفل دولته';
  END IF;
  RAISE NOTICE 'PASS — الطابور لفريق الدولة والمدير وحدهما';
END $$;

-- ٩) الجدول مغلقٌ أمام العموم، والخزنة خاصّة
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.child_updates', 'SELECT')
     OR has_table_privilege('anon', 'public.child_updates', 'SELECT')
     OR has_function_privilege('anon', 'public.my_child_updates(uuid)', 'EXECUTE')
     OR (SELECT public FROM storage.buckets WHERE id = 'child-updates') THEN
    RAISE EXCEPTION 'FAIL — child_updates مفتوح';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE '%child_update%' AND p.prosecdef
                AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
    RAISE EXCEPTION 'FAIL — دالّة تحديثات بلا search_path مثبّت';
  END IF;
  RAISE NOTICE 'PASS — الجدول بلا منحٍ مباشر، والخزنة خاصّة، والدوالّ بمسارٍ مثبّت';
END $$;

ROLLBACK;
