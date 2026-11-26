-- محرّك التحقق: التطبيع والكواشف والتنبيهات وشارة الكافل — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9500000-0000-4000-8000-000000000001', 'gi-admin@example.test', '{}'::jsonb);
INSERT INTO auth.users (id, email) VALUES ('a9500000-0000-4000-8000-000000000009', 'second-admin-a95000@example.test');
INSERT INTO public.user_roles (user_id, role) VALUES ('a9500000-0000-4000-8000-000000000001', 'admin'), ('a9500000-0000-4000-8000-000000000009', 'admin');

DO $$
DECLARE _r JSONB; _o UUID; _o2 UUID; _q UUID; _ok BOOLEAN; _a UUID;
BEGIN
  -- التطبيع يطوي ما لا يغيّر المعنى
  IF public.golden_canon('أحمَدُ  مُحـمّد') <> public.golden_canon('احمد محمد')
     OR public.golden_canon(E'Ali‏') <> 'ali'
     OR public.golden_canon('Аli') <> 'ali'                -- الألف سيريلية
     OR public.golden_canon('فاطمة ١٢') <> public.golden_canon('فاطمه 12')
     OR public.golden_distance('سالم', 'سالمة') <> 1 THEN
    RAISE EXCEPTION 'FAIL — التطبيع أو المسافة';
  END IF;
  RAISE NOTICE 'PASS — التطبيع يطوي التشكيل والهمزات والتاء والمحارف الخفية والحروف المتشابهة';

  SET LOCAL request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"فاطمة أحمد","birth_date":"2012-05-01","gender":"female","education_stage":"السادس"}}]'::jsonb);
  PERFORM public.admin_link_create_unmatched('AL');
  SELECT orphan_id INTO _o FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'g-1';

  -- 1) شكليّ: لا تعارض، ومعلومةٌ لا تحذير
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-1","observed_at":"2026-11-02T00:00:00Z","fields":{"display_name":"فاطمه احمد"}}]'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.data_alerts WHERE orphan_id = _o AND code = 'cosmetic_change' AND severity = 'info')
     OR EXISTS (SELECT 1 FROM public.data_conflicts WHERE orphan_id = _o AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL — التغيير الشكليّ';
  END IF;

  -- 2) محارف خفية: تحذير
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    jsonb_build_array(jsonb_build_object('external_ref', 'g-1', 'observed_at', '2026-11-03T00:00:00Z',
      'fields', jsonb_build_object('display_name', E'فاطمه‏ احمد'))));
  IF NOT EXISTS (SELECT 1 FROM public.data_alerts WHERE orphan_id = _o AND code = 'hidden_characters' AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL — المحارف الخفية لم تُكشف';
  END IF;

  -- 3) تعديل حرف: تحذير
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-1","observed_at":"2026-11-04T00:00:00Z","fields":{"display_name":"فاطمه احمر"}}]'::jsonb);
  IF (SELECT (detail->>'distance')::int FROM public.data_alerts WHERE orphan_id = _o AND code = 'subtle_edit' AND status = 'open') <> 1 THEN
    RAISE EXCEPTION 'FAIL — تعديل الحرف لم يُكشف';
  END IF;
  RAISE NOTICE 'PASS — الشكليّ معلومة، والخفيّ وتعديل الحرف تحذير';

  -- 4) إزاحة العمر عبر 18: حرج، والملف موسوم، ولا كفالة جديدة
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-1","observed_at":"2026-11-05T00:00:00Z","fields":{"birth_date":"2008-01-01"}}]'::jsonb);
  IF NOT (SELECT (detail->>'crosses_adulthood')::boolean FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift')
     OR public.golden_trust(_o)->>'state' <> 'flagged'
     OR public.golden_accepts_new_support(_o) THEN
    RAISE EXCEPTION 'FAIL — إزاحة العمر: %', public.golden_trust(_o);
  END IF;
  RAISE NOTICE 'PASS — إزاحة العمر حرجة تسم الملف وتمنع الكفالة الجديدة';

  -- الإنذار الكاذب لا يعود للقيمة نفسها، والتأكيد يحتاج ملاحظة
  SELECT id INTO _a FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift' AND status = 'open';
  SET LOCAL request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-000000000009","role":"authenticated"}';
  _r := public.admin_alert_resolve(_a, 'confirmed');
  IF _r->>'code' <> 'note_required' THEN RAISE EXCEPTION 'FAIL — تأكيد بلا ملاحظة'; END IF;
  _r := public.admin_alert_resolve(_a, 'false_positive', 'تصحيح من السجل المدني');
  SET LOCAL request.jwt.claims = '{"sub":"a9500000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-1","observed_at":"2026-11-06T00:00:00Z","fields":{"birth_date":"2012-05-01"}}]'::jsonb);
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-1","observed_at":"2026-11-07T00:00:00Z","fields":{"birth_date":"2008-01-01"}}]'::jsonb);
  IF EXISTS (SELECT 1 FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift' AND status = 'open'
               AND subject = '2008-01-01') THEN
    RAISE EXCEPTION 'FAIL — الإنذار الكاذب عاد';
  END IF;
  -- والعودة إلى قيمةٍ سابقة خلال 60 يوماً تذبذب
  IF NOT EXISTS (SELECT 1 FROM public.data_alerts WHERE orphan_id = _o AND code = 'flip_flop' AND field = 'birth_date') THEN
    RAISE EXCEPTION 'FAIL — التذبذب لم يُكشف';
  END IF;
  RAISE NOTICE 'PASS — الإنذار الكاذب لا يعود، والتأكيد بملاحظة، والتذبذب يُكشف';

  -- 5) ملفٌّ مكرَّر بالاسم المطبَّع والميلاد والجنس: حرج
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"g-2","observed_at":"2026-11-08T00:00:00Z",
       "fields":{"display_name":"فاطمة احمر","birth_date":"2012-05-01","gender":"female"}}]'::jsonb);
  SELECT id INTO _q FROM public.source_link_queue WHERE source = 'wamy' AND external_ref = 'g-2';
  -- ملفٌّ مربوطٌ بالندوة لا يُقترح لسجلٍّ آخر منها: هذا بالضبط ما يكشفه التكرار.
  IF (SELECT _o = ANY(candidates) FROM public.source_link_queue WHERE id = _q) THEN
    RAISE EXCEPTION 'FAIL — ملفٌّ مربوط اقتُرح لسجلٍّ ثانٍ من المصدر نفسه';
  END IF;
  _r := public.admin_link_resolve(_q, 'create');
  _o2 := (_r->>'orphan_id')::uuid;
  IF (SELECT detail->>'other_id' FROM public.data_alerts WHERE orphan_id = _o2 AND code = 'possible_duplicate')::uuid IS DISTINCT FROM _o THEN
    RAISE EXCEPTION 'FAIL — التكرار لم يُكشف';
  END IF;
  RAISE NOTICE 'PASS — سجلٌّ ثانٍ بالإملاء المختلف نفسه ميلاداً وجنساً يُنذر بالتكرار';

  -- 6) المكتب بإملاءٍ آخر: لا تعارض
  PERFORM public.admin_country_source_set('AL', 'rowad-albania', 'shadow');
  PERFORM public.admin_golden_import('office', 'AL', 'rowad-albania',
    '[{"external_ref":"r-1","fields":{"display_name":"فاطِمَه احمر","gender":"female"}}]'::jsonb);
  SELECT id INTO _q FROM public.source_link_queue WHERE source = 'rowad-albania' AND external_ref = 'r-1';
  PERFORM public.admin_link_resolve(_q, 'link', _o);
  IF EXISTS (SELECT 1 FROM public.data_conflicts WHERE orphan_id = _o AND field = 'display_name' AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL — الإملاء صار تعارضاً';
  END IF;
  RAISE NOTICE 'PASS — اختلاف الإملاء بين المصدرين ليس تعارضاً';

  RESET request.jwt.claims;
  -- 7) شارة الكافل: للمنشور وحده، بلا تفاصيل
  IF public.public_verification(_o) IS NOT NULL THEN RAISE EXCEPTION 'FAIL — شارةٌ لملفٍّ غير منشور'; END IF;
  UPDATE public.orphans SET status = 'approved' WHERE id = _o;
  _r := public.public_verification(_o);
  IF _r->>'level' <> 'under_review' OR (_r->>'accepts')::boolean OR (SELECT count(*) FROM jsonb_object_keys(_r)) <> 3 THEN
    RAISE EXCEPTION 'FAIL — الشارة: %', _r;
  END IF;
  _ok := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.admin_alerts(NULL);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — الزائر قرأ التنبيهات'; END IF;
  SET LOCAL ROLE anon;
  _r := public.public_verification(_o);
  RESET ROLE;
  RAISE NOTICE 'PASS — الكافل يرى درجةً موجزة لملفٍّ منشور، والتنبيهات للإدارة وحدها';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص محرّك التحقق اجتازت ──'; END $$;
ROLLBACK;
