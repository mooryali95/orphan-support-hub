-- =====================================================================
-- المرحلة 4 — إثبات: التقارير والخط الزمني والإشعارات
-- =====================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase4-verification.sql
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- قفل البريد افتراضه مقفول (هجرة 20260828110000)، وهو سلوك مقصود يفحصه
-- `notification-prefs-verification.sql`. وهذه المجموعة موضوعها آليّة
-- الطابور نفسها، فتُرفع هنا داخل معاملتها وحدها لتُفحص تلك الآليّة.
UPDATE public.platform_settings SET email_on_hold = false WHERE id;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'p4-admin@example.test', '{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000002', 'p4-org@example.test', '{"role":"care_org"}'::jsonb),
  ('e1000000-0000-4000-8000-000000000003', 'p4-sponsor@example.test', '{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000004', 'p4-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('e1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('e2000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000002', 'جهة التقارير', 'approved');

INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status, approved_at)
VALUES ('e3000000-0000-4000-8000-00000000000b', 'RPT-1', 'يتيم التقارير',
        'e2000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000002',
        200, 'approved', now());

INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, status)
VALUES ('e4000000-0000-4000-8000-00000000000c', 'e1000000-0000-4000-8000-000000000003',
        'e3000000-0000-4000-8000-00000000000b', 200, 'active');

-- ---------------------------------------------------------------------
-- الترحيب: كل حساب جديد يجد إشعاراً
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'welcome') THEN
    RAISE EXCEPTION 'FAIL — a new account received no welcome notification';
  END IF;
  RAISE NOTICE 'PASS — a new account receives a welcome notification';
END $$;

-- ---------------------------------------------------------------------
-- صيغة الفترة: بلا تثبيتها يصير الترتيب نصّياً بلا معنى
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.submit_progress_report(jsonb_build_object(
      'orphan_id', 'e3000000-0000-4000-8000-00000000000b', 'period', 'مارس 2026'));
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a free-form period was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — the report period must be YYYY-MM';
  END;
END $$;

-- ---------------------------------------------------------------------
-- من لا يملك الملف لا يكتب عنه تقريراً
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  BEGIN
    PERFORM public.submit_progress_report(jsonb_build_object(
      'orphan_id', 'e3000000-0000-4000-8000-00000000000b', 'period', '2026-03',
      'summary', 'تقرير مزوَّر'));
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a stranger filed a report on an orphan';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — only those who manage the profile may report on it';
  END;
END $$;

-- ---------------------------------------------------------------------
-- التقرير المقدَّم لا يراه الكافل قبل الاعتماد
-- ---------------------------------------------------------------------
DO $$
DECLARE _res JSONB; _report UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _res := public.submit_progress_report(jsonb_build_object(
    'orphan_id', 'e3000000-0000-4000-8000-00000000000b',
    'period', '2026-03',
    'education_note', 'انتقل إلى الصف الخامس',
    'summary', 'تحسّن ملحوظ'));
  _report := (_res->>'id')::uuid;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  IF EXISTS (SELECT 1 FROM public.progress_reports WHERE id = _report) THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a sponsor saw a report before it was approved';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — an unapproved report is hidden from the sponsor';

  -- والتقديم ترك أثراً في الخط الزمني وسجلّ التدقيق
  IF NOT EXISTS (SELECT 1 FROM public.timeline_events
                  WHERE orphan_id = 'e3000000-0000-4000-8000-00000000000b'
                    AND event_type = 'report.submitted') THEN
    RAISE EXCEPTION 'FAIL — submitting a report left no timeline entry';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'report.submitted' AND entity_id = _report) THEN
    RAISE EXCEPTION 'FAIL — submitting a report left no audit entry';
  END IF;
  RAISE NOTICE 'PASS — submitting writes both a timeline entry and an audit entry';
END $$;

-- ---------------------------------------------------------------------
-- الاعتماد يُشعر كل كافل — وهذا هو المنتج
-- ---------------------------------------------------------------------
DO $$
DECLARE _report UUID; _before INTEGER; _after INTEGER;
BEGIN
  SELECT id INTO _report FROM public.progress_reports WHERE period = '2026-03';
  SELECT count(*) INTO _before FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'report_published';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.review_progress_report(_report, 'approved');
  RESET ROLE;

  SELECT count(*) INTO _after FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'report_published';

  IF _after <> _before + 1 THEN
    RAISE EXCEPTION 'FAIL — approving a report did not notify the sponsor (% -> %)', _before, _after;
  END IF;
  RAISE NOTICE 'PASS — approving a report notifies every live sponsor';

  IF (SELECT published_at FROM public.progress_reports WHERE id = _report) IS NULL THEN
    RAISE EXCEPTION 'FAIL — an approved report has no published_at';
  END IF;
  RAISE NOTICE 'PASS — approval stamps the publication time';

  -- والآن يراه الكافل — عبر الدالّة التي تختار الأعمدة، لا الجدول (CP-03)
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.orphan_progress_reports('e3000000-0000-4000-8000-00000000000b')->'reports') r
     WHERE (r->>'id')::uuid = _report) THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — the sponsor cannot see the approved report';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — the sponsor sees the report once approved';
END $$;

-- التقرير المعتمَد لا يُعدَّل: الكافل رآه.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.submit_progress_report(jsonb_build_object(
      'orphan_id', 'e3000000-0000-4000-8000-00000000000b',
      'period', '2026-03', 'summary', 'نصّ مُبدَّل بعد الاعتماد'));
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an approved report was rewritten';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — an approved report cannot be rewritten';
  END;
END $$;

-- الرفض يلزمه سبب، ويُشعر الجهة لا الكافل.
DO $$
DECLARE _res JSONB; _report UUID; _sponsor_before INTEGER; _sponsor_after INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _res := public.submit_progress_report(jsonb_build_object(
    'orphan_id', 'e3000000-0000-4000-8000-00000000000b', 'period', '2026-04', 'summary', 'مسودّة'));
  _report := (_res->>'id')::uuid;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.review_progress_report(_report, 'rejected');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a report rejection without a note was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS — rejecting a report requires a note';
  END;
  RESET ROLE;

  -- العدّان يُؤخذان خارج أي دور: تحت `authenticated` تحجب RLS إشعارات
  -- غير المستدعي، فيصير العدّ «قبل» صفراً دائماً و«بعد» حقيقياً —
  -- فيبدو أن إشعاراً أُضيف وإن لم يُضَف شيء.
  SELECT count(*) INTO _sponsor_before FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.review_progress_report(_report, 'rejected', 'الصور غير واضحة');
  RESET ROLE;

  SELECT count(*) INTO _sponsor_after FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003';
  IF _sponsor_after <> _sponsor_before THEN
    RAISE EXCEPTION 'FAIL — a rejected report reached the sponsor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'e1000000-0000-4000-8000-000000000002' AND kind = 'report_rejected') THEN
    RAISE EXCEPTION 'FAIL — the organisation was not told its report was returned';
  END IF;
  RAISE NOTICE 'PASS — a rejected report reaches the organisation, never the sponsor';

  -- وإعادة التقديم تُعيده إلى الطابور
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  PERFORM public.submit_progress_report(jsonb_build_object(
    'orphan_id', 'e3000000-0000-4000-8000-00000000000b', 'period', '2026-04', 'summary', 'مصحَّح'));
  RESET ROLE;
  IF (SELECT status FROM public.progress_reports WHERE id = _report) <> 'submitted' THEN
    RAISE EXCEPTION 'FAIL — resubmitting did not return the report to the queue';
  END IF;
  RAISE NOTICE 'PASS — resubmitting a rejected report returns it to the queue';
END $$;

-- ---------------------------------------------------------------------
-- الإشعارات: لا تُزوَّر ولا تُقرأ لغير صاحبها
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  IF EXISTS (SELECT 1 FROM public.notifications
              WHERE user_id = 'e1000000-0000-4000-8000-000000000003') THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — one user could read another user notifications';
  END IF;
  RAISE NOTICE 'PASS — notifications are readable only by their owner';

  BEGIN
    INSERT INTO public.notifications (user_id, title)
    VALUES ('e1000000-0000-4000-8000-000000000003', 'إشعار مزوَّر');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a client forged a notification';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — clients cannot write notifications at all';
  END;
END $$;

-- ---------------------------------------------------------------------
-- الخط الزمني: يُقرأ لمن يخصّه، ولا يُكتب من العميل
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  IF NOT EXISTS (SELECT 1 FROM public.timeline_events
                  WHERE orphan_id = 'e3000000-0000-4000-8000-00000000000b') THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a sponsor cannot see the timeline of the orphan they sponsor';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — a sponsor sees the timeline of the orphan they sponsor';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  IF EXISTS (SELECT 1 FROM public.timeline_events
              WHERE orphan_id = 'e3000000-0000-4000-8000-00000000000b') THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a stranger read the orphan timeline';
  END IF;

  BEGIN
    INSERT INTO public.timeline_events (orphan_id, actor_id, event_type)
    VALUES ('e3000000-0000-4000-8000-00000000000b',
            'e1000000-0000-4000-8000-000000000004', 'حدث ملفّق');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL regression — a client wrote a timeline event';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS regression — the timeline is still server-only';
  END;
END $$;

-- ---------------------------------------------------------------------
-- الدفع: الحدث الذي ينتظره الكافل
-- ---------------------------------------------------------------------
DO $$
DECLARE _n INTEGER;
BEGIN
  INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, status)
  VALUES ('e4000000-0000-4000-8000-00000000000c', 'e1000000-0000-4000-8000-000000000003', 200, 'paid');

  PERFORM public.announce_payment('e4000000-0000-4000-8000-00000000000c', true, 200, 'USD');

  SELECT count(*) INTO _n FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'sponsorship_started';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — the first payment did not announce the sponsorship start (%)', _n;
  END IF;
  RAISE NOTICE 'PASS — the first payment announces the start of the sponsorship';

  -- الدفعة الثانية تجديد لا بداية
  INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, status)
  VALUES ('e4000000-0000-4000-8000-00000000000c', 'e1000000-0000-4000-8000-000000000003', 200, 'paid');
  PERFORM public.announce_payment('e4000000-0000-4000-8000-00000000000c', true, 200, 'USD');

  SELECT count(*) INTO _n FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'sponsorship_started';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — a renewal was announced as a new sponsorship';
  END IF;
  SELECT count(*) INTO _n FROM public.notifications
   WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'payment_succeeded';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — the renewal was not announced (%)', _n;
  END IF;
  RAISE NOTICE 'PASS — a renewal is announced as a renewal, not a new start';

  PERFORM public.announce_payment('e4000000-0000-4000-8000-00000000000c', false, 200, 'USD');
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'e1000000-0000-4000-8000-000000000003' AND kind = 'payment_failed') THEN
    RAISE EXCEPTION 'FAIL — a failed payment was not announced';
  END IF;
  RAISE NOTICE 'PASS — a failed payment is announced without alarming wording';
END $$;

-- ---------------------------------------------------------------------
-- اعتماد الملف يُشعر الجهة
-- ---------------------------------------------------------------------
DO $$
DECLARE _o UUID;
BEGIN
  INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status)
  VALUES (gen_random_uuid(), 'RPT-2', 'ملف للاعتماد',
          'e2000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000002',
          100, 'submitted')
  RETURNING id INTO _o;
  -- لا اعتماد بلا شهادة وفاةٍ وإثبات وصايةٍ موثَّقين (CP-06).
  INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, verified)
  VALUES (_o, 'death_certificate', 'death_certificate', _o || '/dc.pdf', true),
         (_o, 'guardianship_proof', 'guardianship_proof', _o || '/gp.pdf', true);

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.review_orphan(_o, 'approved');
  RESET ROLE;

  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'e1000000-0000-4000-8000-000000000002'
                    AND kind = 'orphan_approved' AND entity_id = _o) THEN
    RAISE EXCEPTION 'FAIL — approving a profile did not notify the organisation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.timeline_events
                  WHERE orphan_id = _o AND event_type = 'orphan.approved') THEN
    RAISE EXCEPTION 'FAIL — approving a profile left no timeline entry';
  END IF;
  RAISE NOTICE 'PASS — approving a profile notifies the organisation and marks the timeline';
END $$;

-- ---------------------------------------------------------------------
-- صندوق البريد: كل إشعار يبدأ معلّقاً
-- ---------------------------------------------------------------------
-- بالقفل مرفوعاً وبلا تفضيلات مكتومة — أي حين لا مانع — كل إشعار يدخل
-- الطابور. والموانع نفسها تُفحص في مجموعتها.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE email_state <> 'pending') THEN
    RAISE EXCEPTION 'FAIL — a notification started outside the pending state';
  END IF;
  RAISE NOTICE 'PASS — every notification enters the outbox as pending';
END $$;

-- عناوين المستلمين محجوبة عن العميل: هي مدخل إلى auth.users.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.notification_recipients(ARRAY[gen_random_uuid()]);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an admin client could read recipient email addresses';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — recipient addresses are reachable only by the server';
  END;
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المرحلة 4 اجتازت ──'; END $$;

ROLLBACK;
