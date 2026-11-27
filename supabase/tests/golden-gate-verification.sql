-- شرط الثقة على الكفالة الجديدة — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9900000-0000-4000-8000-000000000001', 'gg-admin@example.test', '{}'::jsonb),
  ('a9900000-0000-4000-8000-000000000002', 'gg-sponsor@example.test', '{}'::jsonb),
  ('a9900000-0000-4000-8000-000000000003', 'gg-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO auth.users (id, email) VALUES ('a9900000-0000-4000-8000-000000000009', 'gg-admin2@example.test');
INSERT INTO public.user_roles (user_id, role) VALUES ('a9900000-0000-4000-8000-000000000001', 'admin'), ('a9900000-0000-4000-8000-000000000009', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a9920000-0000-4000-8000-000000000001', 'a9900000-0000-4000-8000-000000000003', 'جهة البوابة', 'approved');

DO $$
DECLARE _o UUID; _a UUID; _ok BOOLEAN; _codes TEXT[]; _st TEXT; _x RECORD;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_golden_import('wamy', 'SN', NULL,
    '[{"external_ref":"gg-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"عمر سال","birth_date":"2014-06-01","gender":"male"}}]'::jsonb);
  PERFORM public.admin_link_create_unmatched('SN');
  SELECT orphan_id INTO _o FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'gg-1';
  UPDATE public.orphans SET status = 'approved', approved_at = now(), monthly_need = 100,
         org_id = 'a9920000-0000-4000-8000-000000000001' WHERE id = _o;

  IF NOT public.golden_accepts_new_support(_o) THEN RAISE EXCEPTION 'FAIL — ملفٌّ موثّق رُفض'; END IF;

  -- إزاحة عمرٍ حرجة: الملف موسوم
  PERFORM public.admin_golden_import('wamy', 'SN', NULL,
    '[{"external_ref":"gg-1","observed_at":"2026-11-02T00:00:00Z","fields":{"birth_date":"2007-06-01"}}]'::jsonb);
  IF public.golden_accepts_new_support(_o) THEN RAISE EXCEPTION 'FAIL — الموسوم قُبل'; END IF;

  -- 1) الإدراج يُرفض، للإدارة وللكافل
  _ok := false;
  BEGIN
    INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status)
    VALUES ('a9900000-0000-4000-8000-000000000002', _o, 50, 'USD', 'pending_payment');
  EXCEPTION WHEN insufficient_privilege THEN _ok := SQLERRM = 'file_under_verification';
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — كفالةٌ أُدرجت لملفٍّ موسوم'; END IF;

  -- 2) الاقتراحات لا تعرضه، والشارة تقول ذلك
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}';
  SELECT array_agg(code) INTO _codes FROM public.suggest_orphans_for_sponsor(1000, NULL, 48);
  IF (SELECT code FROM public.orphans WHERE id = _o) = ANY(COALESCE(_codes, '{}'))
     OR EXISTS (SELECT 1 FROM public.suggest_orphans_for_amount(1000, NULL, 50) s WHERE s.id = _o) THEN
    RAISE EXCEPTION 'FAIL — الموسوم مقترح';
  END IF;
  IF (public.public_verification(_o)->>'accepts')::boolean THEN RAISE EXCEPTION 'FAIL — الشارة تقبل الموسوم'; END IF;
  RAISE NOTICE 'PASS — الموسوم لا يُكفل ولا يُقترح، والشارة تقول ذلك';

  -- 3) حسم التنبيه والتعارض يعيده تلقائياً
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  SELECT id INTO _a FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift' AND status = 'open';
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000009","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_alert_resolve(_a, 'false_positive', 'خطأ إدخال صُحّح');
  PERFORM public.admin_conflict_resolve(
    (SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND status = 'open'), 'keep');
  IF NOT public.golden_accepts_new_support(_o) THEN RAISE EXCEPTION 'FAIL — الملف لم يعد بعد الحسم'; END IF;
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status)
  VALUES ('a9900000-0000-4000-8000-000000000002', _o, 50, 'USD', 'pending_payment');
  RAISE NOTICE 'PASS — الحسم يعيد الملف للكفالة دون خطوةٍ أخرى';

  -- 4) المؤكَّد يبقى موسوماً، والكفالة القائمة لا تُمسّ
  PERFORM public.admin_golden_import('wamy', 'SN', NULL,
    '[{"external_ref":"gg-1","observed_at":"2026-11-03T00:00:00Z","fields":{"birth_date":"2005-01-01"}}]'::jsonb);
  SELECT id INTO _a FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift' AND status = 'open';
  SET LOCAL request.jwt.claims = '{"sub":"a9900000-0000-4000-8000-000000000009","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_alert_resolve(_a, 'confirmed', 'تلاعبٌ مؤكَّد بالميلاد');
  PERFORM public.admin_conflict_resolve(
    (SELECT id FROM public.data_conflicts WHERE orphan_id = _o AND status = 'open'), 'keep');
  IF public.golden_accepts_new_support(_o)
     OR NOT EXISTS (SELECT 1 FROM public.sponsorships WHERE orphan_id = _o AND status = 'pending_payment') THEN
    RAISE EXCEPTION 'FAIL — المؤكَّد قُبل أو الكفالة القائمة مُسّت';
  END IF;
  RAISE NOTICE 'PASS — التلاعب المؤكَّد يبقي الملف موسوماً، والكفالة القائمة باقية';

  -- 5) البوابة السريعة تطابق golden_trust في كل ملفّ
  FOR _x IN SELECT id FROM public.orphans LOOP
    _st := public.golden_trust(_x.id)->>'state';
    IF public.golden_accepts_new_support(_x.id) <> (_st IN ('verified', 'legacy', 'stale')) THEN
      RAISE EXCEPTION 'FAIL — البوابة تخالف golden_trust (%) للملف %', _st, _x.id;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — البوابة السريعة تطابق حالة الثقة';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص شرط الثقة اجتازت ──'; END $$;
ROLLBACK;
