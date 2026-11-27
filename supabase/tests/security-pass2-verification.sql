-- مراجعة الأمن، الدفعة الثانية — إثبات: المصادقة الثنائية للحاسم، وسجلّ الدفاع، ومفتاحا الإيقاف
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9600000-0000-4000-8000-000000000001', 'sp2-admin@example.test', '{}'::jsonb),
  ('a9600000-0000-4000-8000-000000000002', 'sp2-sponsor@example.test', '{}'::jsonb),
  ('a9600000-0000-4000-8000-000000000003', 'sp2-org@example.test', '{"role":"care_org"}'::jsonb),
  ('a9600000-0000-4000-8000-000000000004', 'sp2-super@example.test', '{}'::jsonb),
  ('a9600000-0000-4000-8000-000000000005', 'sp2-entry@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a9600000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a9620000-0000-4000-8000-000000000001', 'a9600000-0000-4000-8000-000000000003', 'جهة الدفعة الثانية', 'approved');
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('SN', 'a9600000-0000-4000-8000-000000000004', 'supervisor'),
  ('SN', 'a9600000-0000-4000-8000-000000000005', 'data_entry');

DO $$
DECLARE _o UUID; _a UUID; _r JSONB; _ok BOOLEAN; _n BIGINT;
  _admin2 TEXT := '{"sub":"a9600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  _admin1 TEXT := '{"sub":"a9600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
  _sup1 TEXT := '{"sub":"a9600000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}';
  _sup2 TEXT := '{"sub":"a9600000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}';
  _entry1 TEXT := '{"sub":"a9600000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}';
BEGIN
  PERFORM set_config('request.jwt.claims', _admin2, true);
  PERFORM public.admin_golden_import('wamy', 'SN', NULL,
    '[{"external_ref":"sp2-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"آدم جوب","birth_date":"2014-06-01","gender":"male"}}]'::jsonb);
  PERFORM public.admin_link_create_unmatched('SN');
  SELECT orphan_id INTO _o FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'sp2-1';
  UPDATE public.orphans SET status = 'approved', approved_at = now(), monthly_need = 100,
         org_id = 'a9620000-0000-4000-8000-000000000001' WHERE id = _o;
  -- إزاحة عمرٍ حرجة رفعها المدير نفسه: تنبيهٌ حرج وتعارض
  PERFORM public.admin_golden_import('wamy', 'SN', NULL,
    '[{"external_ref":"sp2-1","observed_at":"2026-11-02T00:00:00Z","fields":{"birth_date":"2007-06-01"}}]'::jsonb);
  SELECT id INTO _a FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift' AND status = 'open';
  IF _a IS NULL THEN RAISE EXCEPTION 'FAIL — لا تنبيه للإثبات'; END IF;

  -- ١) المدير بلا عامل وبجلسة aal1: mfa_required في كل قرار، ويُسجَّل
  _n := (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_mfa_required');
  PERFORM set_config('request.jwt.claims', _admin1, true);
  IF public.admin_alert_resolve(_a, 'false_positive', 'x')->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.admin_conflict_resolve((SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND status = 'open'), 'keep')->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.admin_conflicts_resolve_bulk(ARRAY[gen_random_uuid()], 'keep')->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.admin_country_source_set('SN', NULL, 'none')->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.country_staff_set('SN', 'sp2-sponsor@example.test', 'viewer')->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.admin_approve_unlock(gen_random_uuid())->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.admin_apply_unlock(gen_random_uuid())->>'code' IS DISTINCT FROM 'mfa_required' THEN
    RAISE EXCEPTION 'FAIL — قرارٌ حاسم مضى بجلسة aal1';
  END IF;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_mfa_required') - _n <> 7 THEN
    RAISE EXCEPTION 'FAIL — رفض mfa_required لم يُسجَّل';
  END IF;
  RAISE NOTICE 'PASS — F6: المدير بلا aal2 لا يحسم (mfa_required) ويُسجَّل الرفض';

  -- ٢) المشرف بجلسة aal1: mfa_required؛ ومُدخل البيانات لا يُعدّ حاسماً (country_forbidden)
  PERFORM set_config('request.jwt.claims', _sup1, true);
  IF public.admin_alert_resolve(_a, 'false_positive', 'x')->>'code' IS DISTINCT FROM 'mfa_required'
     OR public.country_staff_set('SN', 'sp2-sponsor@example.test', 'viewer')->>'code' IS DISTINCT FROM 'mfa_required' THEN
    RAISE EXCEPTION 'FAIL — المشرف حسم بجلسة aal1';
  END IF;
  IF public.country_can('SN', 'approve') THEN RAISE EXCEPTION 'FAIL — country_can يقبل aal1'; END IF;
  PERFORM set_config('request.jwt.claims', _entry1, true);
  _ok := false;
  BEGIN PERFORM public.admin_alert_resolve(_a, 'false_positive', 'x');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مُدخل البيانات لم يُرفض بالنطاق'; END IF;
  RAISE NOTICE 'PASS — F6: المشرف يحتاج aal2، ومن ليس حاسماً يبقى country_forbidden';

  -- ٣) رفض العينين يُسجَّل (المدير رفع الإزاحة بنفسه)
  PERFORM set_config('request.jwt.claims', _admin2, true);
  _n := (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_four_eyes_refused');
  IF public.admin_alert_resolve(_a, 'false_positive', 'x')->>'code' IS DISTINCT FROM 'four_eyes_required' THEN
    RAISE EXCEPTION 'FAIL — من رفع حسم تنبيهه';
  END IF;
  IF (SELECT count(*) FROM public.integrity_log WHERE kind = 'sec_four_eyes_refused') - _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — رفض العينين لم يُسجَّل';
  END IF;
  -- المشرف بجلسة aal2 يحسم
  PERFORM set_config('request.jwt.claims', _sup2, true);
  IF NOT COALESCE((public.admin_alert_resolve(_a, 'false_positive', 'خطأ إدخال')->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL — المشرف بجلسة aal2 لم يحسم';
  END IF;
  RAISE NOTICE 'PASS — رفض العينين يُسجَّل، والمشرف بجلسة aal2 يحسم';

  -- ٤) التجميد: لا كفالة جديدة ولا كتابة ذهبية، ورفعه يعيد الملف
  PERFORM set_config('request.jwt.claims', _admin2, true);
  PERFORM public.admin_conflict_resolve((SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND status = 'open'), 'keep');
  IF NOT public.golden_accepts_new_support(_o) THEN RAISE EXCEPTION 'FAIL — الملف لم يعد مقبولاً قبل التجميد'; END IF;
  IF (public.admin_orphan_freeze(_o, ' ')->>'code') IS DISTINCT FROM 'note_required' THEN
    RAISE EXCEPTION 'FAIL — تجميدٌ بلا سبب';
  END IF;
  _r := public.admin_orphan_freeze(_o, 'بلاغ تلاعب قيد التحقيق');
  IF public.admin_security_switches(_o)->'frozen'->>'reason' IS DISTINCT FROM 'بلاغ تلاعب قيد التحقيق' THEN
    RAISE EXCEPTION 'FAIL — حال التجميد لا تظهر للإدارة';
  END IF;
  IF NOT (_r->>'ok')::boolean OR public.golden_accepts_new_support(_o)
     OR (public.public_verification(_o)->>'accepts')::boolean
     OR public.golden_trust(_o)->>'state' <> 'flagged' THEN
    RAISE EXCEPTION 'FAIL — الملف المجمَّد ما زال يقبل الكفالة: %', _r;
  END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status)
    VALUES ('a9600000-0000-4000-8000-000000000002', _o, 50, 'USD', 'pending_payment');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — كفالةٌ أُدرجت لملفٍّ مجمَّد'; END IF;
  _r := public.admin_golden_import('wamy', 'SN', NULL,
    '[{"external_ref":"sp2-1","observed_at":"2026-11-03T00:00:00Z","fields":{"gender":"female"}}]'::jsonb);
  IF (_r->>'observed')::int <> 0 OR _r->'skipped'->0->>'reason' IS DISTINCT FROM 'orphan_frozen' THEN
    RAISE EXCEPTION 'FAIL — الرفع كتب في ملفٍّ مجمَّد: %', _r;
  END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.orphan_field_state (orphan_id, field, value, from_role) VALUES (_o, 'gender', '"female"', 'wamy');
  EXCEPTION WHEN insufficient_privilege THEN _ok := SQLERRM = 'orphan_frozen';
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حالة حقلٍ كُتبت لملفٍّ مجمَّد'; END IF;
  -- الرفع يحتاج aal2
  PERFORM set_config('request.jwt.claims', _admin1, true);
  IF public.admin_orphan_unfreeze(_o)->>'code' IS DISTINCT FROM 'mfa_required' THEN
    RAISE EXCEPTION 'FAIL — رُفع التجميد بجلسة aal1';
  END IF;
  PERFORM set_config('request.jwt.claims', _admin2, true);
  _r := public.admin_orphan_unfreeze(_o);
  IF NOT (_r->>'ok')::boolean OR NOT public.golden_accepts_new_support(_o) THEN
    RAISE EXCEPTION 'FAIL — رفع التجميد لم يُعد الملف';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'sec_orphan_frozen' AND orphan_id = _o)
     OR NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'sec_orphan_unfrozen' AND orphan_id = _o) THEN
    RAISE EXCEPTION 'FAIL — التجميد ورفعه لم يُسجَّلا';
  END IF;
  RAISE NOTICE 'PASS — التجميد يوقف الكفالة الجديدة والكتابة الذهبية، ورفعه بعاملٍ ثانٍ';

  -- ٥) إيقاف دخول الندوة للإدارة وحدها، والخادم يقرؤه
  PERFORM set_config('request.jwt.claims', _sup2, true);
  _ok := false;
  BEGIN PERFORM public.admin_sso_set_disabled(true); EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غير المدير أوقف الدخول'; END IF;
  PERFORM set_config('request.jwt.claims', _admin2, true);
  PERFORM public.admin_sso_set_disabled(true);
  IF NOT public.sso_disabled() THEN RAISE EXCEPTION 'FAIL — الإيقاف لم يُحفظ'; END IF;
  PERFORM public.admin_sso_set_disabled(false);
  IF public.sso_disabled() THEN RAISE EXCEPTION 'FAIL — الإعادة لم تُحفظ'; END IF;
  RAISE NOTICE 'PASS — مفتاح إيقاف دخول الندوة للإدارة وحدها';

  -- ٦) إخفاق الدخول يُسجَّل بسببٍ نظيف، وإبطال المفتاح يُسجَّل
  PERFORM public.sso_log_failure('origin_denied');
  PERFORM public.sso_log_failure('eyJhbGciOi.payload.sig');
  IF (SELECT array_agg(detail->>'reason' ORDER BY id) FROM public.integrity_log WHERE kind = 'sec_sso_failure')
     <> ARRAY['origin_denied', 'other'] THEN
    RAISE EXCEPTION 'FAIL — سبب الإخفاق لم يُنظَّف';
  END IF;
  RAISE NOTICE 'PASS — إخفاق دخول الندوة يُسجَّل بسببه وحده';
END $$;

-- ٧) الصلاحيات: الدوال الداخلية مغلقة، والسجلّ للإدارة وحدها
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.sso_log_failure(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sso_disabled()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.security_event(text, jsonb, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mfa_refusal(text, uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_orphan_freeze(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.sso_log_failure(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — صلاحيات دوال الدفعة الثانية';
  END IF;
  RAISE NOTICE 'PASS — الدوال الداخلية مغلقة عن العميل';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الدفعة الثانية اجتازت ──'; END $$;
ROLLBACK;
