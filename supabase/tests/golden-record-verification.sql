-- السجلّ الذهبي: الندوة رئيس، والمكتب مؤكِّد — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9100000-0000-4000-8000-000000000001', 'gr-admin@example.test', '{}'::jsonb),
  ('a9100000-0000-4000-8000-000000000002', 'gr-user@example.test', '{}'::jsonb);
INSERT INTO auth.users (id, email) VALUES ('a9100000-0000-4000-8000-000000000009', 'second-admin-a91000@example.test');
INSERT INTO public.user_roles (user_id, role) VALUES ('a9100000-0000-4000-8000-000000000001', 'admin'), ('a9100000-0000-4000-8000-000000000009', 'admin');
INSERT INTO public.api_clients (id, name, client_key, secret_hash, org_id, scopes, source) VALUES
  ('a9300000-0000-4000-8000-000000000001', 'الندوة', 'ck_live_wamy', 'x', NULL, ARRAY['records:primary'], NULL),
  ('a9300000-0000-4000-8000-000000000002', 'مكتب ألبانيا', 'ck_live_office', 'x', NULL, ARRAY['records:verify'], 'rowad-albania');

DO $$
DECLARE _r JSONB; _ok BOOLEAN; _o UUID; _q UUID;
BEGIN
  -- المفاتيح: المؤكِّد يحتاج منصّة، والرئيس بلا منصّة
  _ok := false;
  BEGIN
    INSERT INTO public.api_clients (name, client_key, secret_hash, scopes, source)
    VALUES ('خطأ', 'ck_live_bad', 'x', ARRAY['records:verify'], NULL);
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مفتاح تأكيدٍ بلا منصّة'; END IF;
  RAISE NOTICE 'PASS — مفتاح المكتب مربوطٌ بمنصّته، ومفتاح الندوة بلا منصّة';

  -- غير المشرف لا يرى ولا يستورد
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}';
    PERFORM public.admin_data_health();
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مستخدمٌ قرأ صحة البيانات'; END IF;
  _ok := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.orphan_field_observations;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — الزائر قرأ الملاحظات'; END IF;
  RAISE NOTICE 'PASS — الطبقة مغلقة على الإدارة';

  -- المشرف بهويته (claims)، والفحوص تقرأ الجداول بصلاحية المالك.
  SET LOCAL request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}';

  -- 1) استيراد الندوة: بلا رابط ← طابور، ثم إنشاءٌ جماعي «قيد المراجعة»
  _r := public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"w-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"ضحى المثال","birth_date":"2015-03-01","gender":"Female","education_stage":"الصف الثالث","sponsorship":"x"}}]'::jsonb);
  IF (_r->>'unlinked')::int <> 1 THEN RAISE EXCEPTION 'FAIL — السجلّ بلا رابط لم يقف في الطابور: %', _r; END IF;
  _r := public.admin_link_create_unmatched('AL');
  IF (_r->>'created')::int <> 1 THEN RAISE EXCEPTION 'FAIL — الإنشاء الجماعي: %', _r; END IF;
  SELECT orphan_id INTO _o FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'w-1';
  IF (SELECT status::text FROM public.orphans WHERE id = _o) <> 'under_review'
     OR (SELECT gender FROM public.orphans WHERE id = _o) <> 'female'
     OR (SELECT education_stage FROM public.orphans WHERE id = _o) <> 'الصف الثالث' THEN
    RAISE EXCEPTION 'FAIL — الملف المُنشأ';
  END IF;
  IF (SELECT value FROM public.orphan_field_state WHERE orphan_id = _o AND field = 'birth_date') <> '"2015-03-01"'
     OR EXISTS (SELECT 1 FROM public.orphan_field_observations WHERE orphan_id = _o AND field = 'sponsorship') THEN
    RAISE EXCEPTION 'FAIL — المصدر أو الحقل المالي';
  END IF;
  IF NOT public.golden_trust(_o) @> '{"state":"verified","basis":"primary_only","mode":"none","score":100}'::jsonb THEN
    RAISE EXCEPTION 'FAIL — الثقة بلا منصّة تشغيل: %', public.golden_trust(_o);
  END IF;
  RAISE NOTICE 'PASS — بلا منصّة تشغيل: الندوة تملك كل الحقول والملف موثّقٌ بمصدرها';

  -- 2) المكتب ممنوعٌ ما دام الوضع none
  _r := public.admin_golden_import('office', 'AL', 'rowad-albania',
    '[{"external_ref":"o-1","fields":{"education_stage":"الصف الرابع"}}]'::jsonb);
  IF _r->>'code' <> 'office_source_inactive' THEN RAISE EXCEPTION 'FAIL — مكتبٌ كتب بلا وضع: %', _r; END IF;

  -- 3) الظلّ: يُربط المكتب، ويُكشف الفرق، ولا تتغيّر القيمة
  _r := public.admin_country_source_set('AL', 'rowad-albania', 'shadow');
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — وضع الظل: %', _r; END IF;
  IF public.golden_trust(_o)->>'state' <> 'single_source' THEN RAISE EXCEPTION 'FAIL — بلا رابط مكتب يجب «مصدر واحد»'; END IF;
  _r := public.admin_golden_import('office', 'AL', 'rowad-albania',
    '[{"external_ref":"o-1","observed_at":"2026-11-10T00:00:00Z",
       "fields":{"display_name":"ضحى المثال","gender":"female","education_stage":"الصف الرابع","progress_report":"تقدّم جيد"}}]'::jsonb);
  SELECT id INTO _q FROM public.source_link_queue WHERE source = 'rowad-albania' AND external_ref = 'o-1';
  IF NOT (SELECT _o = ANY(candidates) FROM public.source_link_queue WHERE id = _q) THEN
    RAISE EXCEPTION 'FAIL — المرشّح لم يُقترح';
  END IF;
  _r := public.admin_link_resolve(_q, 'create');
  IF _r->>'code' <> 'create_primary_only' THEN RAISE EXCEPTION 'FAIL — المكتب أنشأ ملفاً: %', _r; END IF;
  _r := public.admin_link_resolve(_q, 'link', _o);
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — الربط: %', _r; END IF;
  IF (SELECT education_stage FROM public.orphans WHERE id = _o) <> 'الصف الثالث'
     OR (SELECT kind FROM public.data_conflicts WHERE orphan_id = _o AND field = 'education_stage' AND status = 'open') <> 'disagreement'
     OR public.golden_trust(_o)->>'state' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL — الظل غيّر القيمة أو لم يكشف الفرق';
  END IF;
  RAISE NOTICE 'PASS — الظل يقارن ولا يغيّر، والربط بالمرشّح يعيد تطبيق السجلّ المنتظر';

  -- 4) التفعيل: المكتب يملك الوضع الحالي، وإعادة التقييم تلقائية
  _r := public.admin_country_source_set('AL', 'rowad-albania', 'active');
  IF (_r->>'reevaluated')::int < 1 THEN RAISE EXCEPTION 'FAIL — لم يُعد التقييم: %', _r; END IF;
  IF (SELECT education_stage FROM public.orphans WHERE id = _o) <> 'الصف الرابع'
     OR (SELECT from_role FROM public.orphan_field_state WHERE orphan_id = _o AND field = 'education_stage') <> 'office'
     OR (SELECT value FROM public.orphan_field_state WHERE orphan_id = _o AND field = 'progress_report') <> '"تقدّم جيد"' THEN
    RAISE EXCEPTION 'FAIL — التفعيل لم ينقل السلطة للمكتب';
  END IF;
  -- الندوة تؤكّد القيمة نفسها: يُغلق الفرق تلقائياً
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"w-1","observed_at":"2026-11-12T00:00:00Z","fields":{"education_stage":"الصف الرابع","progress_report":"x"}}]'::jsonb);
  IF EXISTS (SELECT 1 FROM public.data_conflicts WHERE orphan_id = _o AND status = 'open')
     OR public.golden_trust(_o)->>'state' <> 'verified' THEN
    RAISE EXCEPTION 'FAIL — الاتفاق لم يغلق الفرق: %', public.golden_trust(_o);
  END IF;
  IF EXISTS (SELECT 1 FROM public.orphan_field_observations WHERE orphan_id = _o AND field = 'progress_report' AND role = 'wamy') THEN
    RAISE EXCEPTION 'FAIL — الندوة كتبت حقلاً بلا مؤكِّد';
  END IF;
  RAISE NOTICE 'PASS — التفعيل ينقل حقول المكتب إليه، واتفاق المصدرين يوثّق الملف';

  -- 5) الحرج: لا يتغيّر إلا باعتماد، والمرفوض لا يعود
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"w-1","observed_at":"2026-11-13T00:00:00Z","fields":{"birth_date":"2014-03-01","display_name":""}}]'::jsonb);
  IF (SELECT birth_date FROM public.orphans WHERE id = _o) <> DATE '2015-03-01'
     OR (SELECT display_name FROM public.orphans WHERE id = _o) <> 'ضحى المثال'
     OR (SELECT kind FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open') <> 'critical_change' THEN
    RAISE EXCEPTION 'FAIL — حقلٌ حرج تغيّر بلا اعتماد، أو الفارغ مسح قيمة';
  END IF;
  _r := public.admin_conflict_resolve((SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open'), 'keep');
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"w-1","observed_at":"2026-11-14T00:00:00Z","fields":{"birth_date":"2014-03-01"}}]'::jsonb);
  IF EXISTS (SELECT 1 FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL — المرفوض عاد';
  END IF;
  PERFORM public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"w-1","observed_at":"2026-11-15T00:00:00Z","fields":{"birth_date":"2014-04-01"}}]'::jsonb);
  -- العينان بلا استثناء: المدير الذي رفع التغيير لا يعتمده، ويعتمده مديرٌ آخر.
  IF public.admin_conflict_resolve((SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open'), 'accept')->>'code' <> 'four_eyes_required' THEN
    RAISE EXCEPTION 'FAIL — مديرٌ اعتمد تغييراً حرجاً رفعه بنفسه';
  END IF;
  SET LOCAL request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000009","role":"authenticated"}';
  _r := public.admin_conflict_resolve((SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open'), 'accept');
  SET LOCAL request.jwt.claims = '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}';
  IF NOT (_r->>'ok')::boolean OR (SELECT birth_date FROM public.orphans WHERE id = _o) <> DATE '2014-04-01' THEN
    RAISE EXCEPTION 'FAIL — الاعتماد لم يطبّق: %', _r;
  END IF;
  -- الأقدم لا يغلب الأحدث
  _r := public.admin_golden_import('wamy', 'AL', NULL,
    '[{"external_ref":"w-1","observed_at":"2026-01-01T00:00:00Z","fields":{"birth_date":"2013-01-01","gender":"x"}}]'::jsonb);
  IF (_r->>'skipped_count')::int <> 2 THEN RAISE EXCEPTION 'FAIL — الأقدم أو غير الصالح مرّ: %', _r; END IF;
  RAISE NOTICE 'PASS — الحرج باعتماد، والمرفوض لا يعود، والأقدم وغير الصالح يُتخطّيان';

  RESET ROLE;

  -- 6) الواجهة البرمجية: النواة نفسها بمفتاح الخدمة
  SET LOCAL ROLE service_role;
  _r := public.golden_ingest('a9300000-0000-4000-8000-000000000002', 'AL',
    '[{"external_ref":"o-1","observed_at":"2026-11-20T00:00:00Z","fields":{"city":"تيرانا","birth_date":"2014-04-01"}}]'::jsonb);
  RESET ROLE;
  IF (_r->>'observed')::int <> 2 OR (SELECT city FROM public.orphans WHERE id = _o) <> 'تيرانا' THEN
    RAISE EXCEPTION 'FAIL — مفتاح المكتب: %', _r;
  END IF;
  RAISE NOTICE 'PASS — مفتاح المكتب يكتب حقوله ويؤكّد حقول الندوة';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص السجلّ الذهبي اجتازت ──'; END $$;
ROLLBACK;
