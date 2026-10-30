-- =====================================================================
-- لغات الواجهة — إثبات
-- الخطر: ترجمةٌ تظهر للزائر قبل أن يراجعها أحد، أو يكتبها من ليس مراجعاً،
-- أو تمحو مسودّةٌ آليةٌ تصحيحَ إنسان، أو تُطلق لغةٌ فارغة، أو يضيع أثر التغيير.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('bd100000-0000-4000-8000-000000000001', 'i18n-admin@example.test', '{}'::jsonb),
  ('bd100000-0000-4000-8000-000000000002', 'i18n-reviewer@example.test', '{}'::jsonb),
  ('bd100000-0000-4000-8000-000000000003', 'i18n-user@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('bd100000-0000-4000-8000-000000000001', 'admin');

DO $$
DECLARE _v JSONB; _n INT; _ok BOOLEAN;
BEGIN
  -- ١) الإدارة تفعّل الألبانية لألبانيا، وتسمّي مراجعاً
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.admin_enable_locale('sq', 'Shqip', 'ltr', 'AL');
  PERFORM public.admin_enable_locale('sq', 'Shqip', 'ltr', 'XK');
  PERFORM public.admin_set_locale_reviewer('sq', 'i18n-reviewer@example.test', true);
  RESET ROLE;
  IF (SELECT countries FROM public.ui_locales WHERE code = 'sq') <> ARRAY['AL', 'XK'] THEN
    RAISE EXCEPTION 'FAIL — الدولة الثانية لم تُضف إلى اللغة';
  END IF;
  RAISE NOTICE 'PASS — الإدارة تفعّل اللغة لدولها وتسمّي مراجعيها';

  -- ٢) غير المراجع لا يكتب ولا يقرأ المسودّات
  _ok := false;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.ui_translation_save('sq', '[{"key":"x/y.title","text":"T","source_hash":"aaaaaaaaaaaa"}]');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مستخدمٌ عادي كتب ترجمة'; END IF;
  RAISE NOTICE 'PASS — الكتابة للمراجعين والإدارة وحدهم';

  -- ٣) المراجع يحفظ مسودّةً آلية؛ لا تظهر للعموم، ولا تطغى على تصحيحه
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.ui_translation_save('sq',
    '[{"key":"x/y.title","text":"Titull (makinë)","source_hash":"aaaaaaaaaaaa","origin":"machine"},
      {"key":"x/y.lead","text":"Hyrje","source_hash":"bbbbbbbbbbbb","origin":"machine"}]');
  PERFORM public.ui_translation_save('sq', '[{"key":"x/y.title","text":"Titulli","source_hash":"aaaaaaaaaaaa"}]', true);
  _n := public.ui_translation_save('sq',
    '[{"key":"x/y.title","text":"Titull (makinë 2)","source_hash":"aaaaaaaaaaaa","origin":"machine"}]');
  RESET ROLE;
  IF _n <> 0 OR (SELECT text FROM public.ui_translations WHERE locale = 'sq' AND key = 'x/y.title') <> 'Titulli' THEN
    RAISE EXCEPTION 'FAIL — مسودّةٌ آلية محت تصحيح المراجع';
  END IF;
  IF (SELECT status FROM public.ui_translations WHERE locale = 'sq' AND key = 'x/y.title') <> 'reviewed' THEN
    RAISE EXCEPTION 'FAIL — حفظ المراجع مع «راجعتُ» لم يُسجَّل مراجَعاً';
  END IF;
  RAISE NOTICE 'PASS — المسودّة الآلية لا تطغى على تصحيح إنسان، والتصحيح يُحفظ مراجَعاً باسمه';

  -- ٤) لا نشر إلا للإدارة، وللمراجَع وحده؛ ولا إطلاق للغةٍ فارغة
  _ok := false;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.admin_set_locale_status('sq', 'live');
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'nothing_published';
  END;
  _n := public.ui_translation_publish('sq', ARRAY['x/y.title', 'x/y.lead']);
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — أُطلقت لغةٌ بلا نصٍّ منشور'; END IF;
  IF _n <> 1 OR (SELECT status FROM public.ui_translations WHERE key = 'x/y.lead') <> 'draft' THEN
    RAISE EXCEPTION 'FAIL — نُشرت مسودّةٌ لم تُراجَع (نُشر %)', _n;
  END IF;
  RAISE NOTICE 'PASS — يُنشر المراجَع وحده، ولا تُطلق لغةٌ فارغة';

  _ok := false;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.ui_translation_publish('sq', ARRAY['x/y.title']);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — المراجع نشر بنفسه'; END IF;
  RAISE NOTICE 'PASS — المراجع يراجع، والإدارة تنشر';

  -- ٥) العموم: لا شيء قبل الإطلاق، والمنشور وحده بعده
  SET LOCAL ROLE anon;
  _v := public.published_ui_messages('sq');
  RESET ROLE;
  IF jsonb_array_length(_v) <> 0 THEN RAISE EXCEPTION 'FAIL — ظهرت ترجماتٌ لغةٍ لم تُطلق'; END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.admin_set_locale_status('sq', 'live');
  RESET ROLE;
  SET LOCAL ROLE anon;
  _v := public.published_ui_messages('sq');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.public_ui_locales()) x WHERE x->>'code' = 'sq') THEN
    RAISE EXCEPTION 'FAIL — اللغة المطلقة لا تظهر في القائمة العامة';
  END IF;
  RESET ROLE;
  IF jsonb_array_length(_v) <> 1 OR _v->0->>'text' <> 'Titulli' THEN
    RAISE EXCEPTION 'FAIL — العموم يرون غير المنشور: %', _v;
  END IF;
  RAISE NOTICE 'PASS — الزائر لا يرى إلا المنشور، في لغةٍ مطلقة';

  -- ٦) تغيّر النصّ يُعيد المنشور مسودّة، والسجلّ يحفظ كل خطوة ولا يُمحى
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bd100000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.ui_translation_save('sq', '[{"key":"x/y.title","text":"Titulli i ri","source_hash":"cccccccccccc"}]');
  RESET ROLE;
  IF (SELECT status FROM public.ui_translations WHERE key = 'x/y.title') <> 'draft' THEN
    RAISE EXCEPTION 'FAIL — تعديل نصٍّ منشور بقي منشوراً بلا مراجعة';
  END IF;
  SELECT count(*) INTO _n FROM public.ui_translation_revisions WHERE locale = 'sq' AND key = 'x/y.title';
  IF _n < 4 THEN RAISE EXCEPTION 'FAIL — سجلّ المراجعات ناقص (%)', _n; END IF;
  _ok := false;
  BEGIN
    DELETE FROM public.ui_translation_revisions;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذف سجلّ المراجعات'; END IF;
  RAISE NOTICE 'PASS — التعديل يعيد المراجعة، والسجلّ كامل ولا يُحذف';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص لغات الواجهة اجتازت ──'; END $$;
ROLLBACK;
