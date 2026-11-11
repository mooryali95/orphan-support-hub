-- =====================================================================
-- خروج الطفل يوقف المال — إثبات (GAP-05)
-- =====================================================================
-- كان أرشفة الطفل تترك كفالاته «نشطة»، ويُقبل تجديدها، ولا يعلم الكافل.
-- الآن: سببٌ مُهيكل للخروج، والكفالات تنتهي بسببها، والتحصيل اللاحق
-- يُرفض، والكافل يتلقّى إشعارين (الثاني يعرض طفلاً ينتظر)، والإدارة ترى
-- الخروج في صندوق القرارات.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/child-exit-verification.sql
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b3f00000-0000-4000-8000-000000000001', 'b3x-admin1@example.test', '{}'::jsonb),
  ('b3f00000-0000-4000-8000-000000000002', 'b3x-admin2@example.test', '{}'::jsonb),
  ('b3f00000-0000-4000-8000-000000000003', 'b3x-admin3@example.test', '{}'::jsonb),
  ('b3f00000-0000-4000-8000-000000000004', 'b3x-sponsor-a@example.test', '{}'::jsonb),
  ('b3f00000-0000-4000-8000-000000000005', 'b3x-sponsor-b@example.test', '{}'::jsonb),
  ('b3f00000-0000-4000-8000-000000000006', 'b3x-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('b3f00000-0000-4000-8000-000000000001', 'admin'),
  ('b3f00000-0000-4000-8000-000000000002', 'admin'),
  ('b3f00000-0000-4000-8000-000000000003', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b3f10000-0000-4000-8000-00000000000a', 'b3f00000-0000-4000-8000-000000000006', 'جهة الخروج', 'approved');
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, org_id, created_by, status, approved_at)
VALUES ('b3f20000-0000-4000-8000-000000000001', 'B3X-1', 'الطفل الخارج', 200, 'EUR',
        'b3f10000-0000-4000-8000-00000000000a', 'b3f00000-0000-4000-8000-000000000006', 'approved', now()),
       ('b3f20000-0000-4000-8000-000000000002', 'B3X-2', 'طفلٌ ينتظر', 150, 'EUR',
        'b3f10000-0000-4000-8000-00000000000a', 'b3f00000-0000-4000-8000-000000000006', 'approved', now()),
       ('b3f20000-0000-4000-8000-000000000003', 'B3X-3', 'طفل الدولار', 150, 'USD',
        'b3f10000-0000-4000-8000-00000000000a', 'b3f00000-0000-4000-8000-000000000006', 'approved', now()),
       ('b3f20000-0000-4000-8000-000000000004', 'B3X-4', 'غير مقفول', 100, 'EUR',
        'b3f10000-0000-4000-8000-00000000000a', 'b3f00000-0000-4000-8000-000000000006', 'approved', now());

-- A: كفالة Creem نشطة (تقفل الملف).  B: طلبٌ بانتظار الدفع.
INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, provider, provider_subscription_id, started_at)
VALUES ('b3f30000-0000-4000-8000-000000000001', 'b3f00000-0000-4000-8000-000000000004',
        'b3f20000-0000-4000-8000-000000000001', 80, 'EUR', 'active', 'creem', 'sub_x_1', now() - interval '20 days'),
       ('b3f30000-0000-4000-8000-000000000002', 'b3f00000-0000-4000-8000-000000000005',
        'b3f20000-0000-4000-8000-000000000001', 40, 'EUR', 'pending_payment', NULL, NULL, NULL),
       ('b3f30000-0000-4000-8000-000000000003', 'b3f00000-0000-4000-8000-000000000005',
        'b3f20000-0000-4000-8000-000000000004', 40, 'EUR', 'pending_payment', NULL, NULL, NULL);
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_payment_id, paid_at)
VALUES ('b3f30000-0000-4000-8000-000000000001', 'b3f00000-0000-4000-8000-000000000004', 80, 'EUR', 'paid', 'creem', 'ord_x_1', now() - interval '20 days');

DO $$ BEGIN RAISE NOTICE '── سبب الخروج'; END $$;

-- طلب الأرشفة يحمل سبب الخروج المُهيكل، وإلا رُفض.
DO $$
DECLARE _req UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_request_unlock('b3f20000-0000-4000-8000-000000000001', 'archive', '{}'::jsonb,
      'تخرّج الطفل من البرنامج هذا العام');
    RAISE EXCEPTION 'FAIL — GAP-05: أرشفةٌ بلا سبب خروجٍ مُهيكل';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_request_unlock('b3f20000-0000-4000-8000-000000000001', 'archive',
      '{"exit_reason":"vanished"}'::jsonb, 'تخرّج الطفل من البرنامج هذا العام');
    RAISE EXCEPTION 'FAIL — GAP-05: سبب خروجٍ خارج القائمة';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — GAP-05: الأرشفة تحتاج سبب خروجٍ من القائمة';
END $$;

DO $$ BEGIN RAISE NOTICE '── خروج طفلٍ مكفول'; END $$;

DO $$
DECLARE _req UUID; _r JSONB; _o public.orphans; _a public.sponsorships; _b public.sponsorships;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _req := public.admin_request_unlock('b3f20000-0000-4000-8000-000000000001', 'archive',
    '{"exit_reason":"graduated","exit_note":"أتمّ الثانوية"}'::jsonb, 'تخرّج الطفل من البرنامج هذا العام');
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM public.admin_approve_unlock(_req);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  PERFORM public.admin_approve_unlock(_req);
  _r := public.admin_apply_unlock(_req);
  RESET ROLE;
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — الطلب لم يُطبَّق: %', _r; END IF;

  SELECT * INTO _o FROM public.orphans WHERE id = 'b3f20000-0000-4000-8000-000000000001';
  IF _o.status <> 'archived' OR _o.exit_reason <> 'graduated' OR _o.exit_note <> 'أتمّ الثانوية'
     OR _o.exited_at IS NULL THEN
    RAISE EXCEPTION 'FAIL — GAP-05: سبب الخروج لم يُحفظ (% / %)', _o.status, _o.exit_reason;
  END IF;

  SELECT * INTO _a FROM public.sponsorships WHERE id = 'b3f30000-0000-4000-8000-000000000001';
  SELECT * INTO _b FROM public.sponsorships WHERE id = 'b3f30000-0000-4000-8000-000000000002';
  IF _a.status <> 'completed' OR _a.end_reason <> 'child_exit' OR _a.ended_at IS NULL THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الكفالة الجارية بقيت (% / %)', _a.status, _a.end_reason;
  END IF;
  IF _b.status <> 'cancelled' OR _b.end_reason <> 'child_exit' THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الطلب المعلّق بقي (%)', _b.status;
  END IF;
  IF _a.provider_cancel_state <> 'pending' OR _a.provider_cancel_mode <> 'immediate' THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الاشتراك لدى المزوّد لم يُطلب إلغاؤه فوراً';
  END IF;
  IF _o.funded_monthly <> 0 THEN
    RAISE EXCEPTION 'FAIL — التمويل بقي على طفلٍ خرج (%)', _o.funded_monthly;
  END IF;

  -- الإشعار الأول فوراً، بالسبب ودون مطالبةٍ بدفع.
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'b3f00000-0000-4000-8000-000000000004'
                    AND entity_id = _a.id AND title LIKE '%انتهت كفالتك%' AND body LIKE '%أتمّ مرحلته%') THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الكافل لم يُبلَّغ بالخروج وسببه';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE user_id = 'b3f00000-0000-4000-8000-000000000005' AND entity_id = _b.id) THEN
    RAISE EXCEPTION 'FAIL — GAP-05: صاحب الطلب المعلّق لم يُبلَّغ';
  END IF;
  -- الإشعار الثاني مجدول لا فوري.
  IF NOT EXISTS (SELECT 1 FROM public.sponsor_exit_followups
                  WHERE sponsorship_id = _a.id AND sent_at IS NULL AND due_at > now()) THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الإشعار الثاني لم يُجدول';
  END IF;
  RAISE NOTICE 'PASS — GAP-05: الخروج يُنهي الكفالات بسببه، ويطلب إلغاء الاشتراك فوراً، ويُبلغ الكافل';
END $$;

-- الإدارة ترى الخروج في صندوق القرارات.
DO $$
DECLARE _inbox JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _inbox := public.admin_decision_inbox();
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_inbox) i
                  WHERE i->>'kind' = 'money_issue' AND i->>'title' = 'الطفل الخارج'
                    AND i->>'subtitle' LIKE '%خروج%') THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الخروج غائب عن صندوق القرارات: %', _inbox;
  END IF;
  RAISE NOTICE 'PASS — GAP-05: الإدارة ترى الخروج وما أُنهي من كفالات في صندوق القرارات';
END $$;

-- التحصيل اللاحق مرفوض.
DO $$
DECLARE _r JSONB;
BEGIN
  SET LOCAL ROLE service_role;
  _r := public.record_provider_charge('b3f30000-0000-4000-8000-000000000001', 'creem', 'evt_x_2',
          'ord_x_2', NULL, 'sub_x_1', 80, 'EUR', now());
  RESET ROLE;
  IF _r->>'outcome' <> 'refused'
     OR (SELECT status FROM public.sponsorships WHERE id = 'b3f30000-0000-4000-8000-000000000001') <> 'completed' THEN
    RAISE EXCEPTION 'FAIL — GAP-05: تجديدٌ قُبل بعد خروج الطفل: %', _r;
  END IF;
  RAISE NOTICE 'PASS — GAP-05: التحصيل بعد الخروج يُرفض ولا يُعيد الكفالة';
END $$;

-- الإشعار الثاني: يعرض طفلاً ينتظر بالعملة نفسها.
DO $$
DECLARE _n INTEGER; _note public.notifications;
BEGIN
  UPDATE public.sponsor_exit_followups SET due_at = now() - interval '1 minute';
  SET LOCAL ROLE service_role;
  _n := public.send_due_exit_followups();
  RESET ROLE;
  SELECT * INTO _note FROM public.notifications
   WHERE user_id = 'b3f00000-0000-4000-8000-000000000004' AND title LIKE '%ينتظر%'
   ORDER BY created_at DESC LIMIT 1;
  IF _note.id IS NULL THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الإشعار الثاني لم يُرسل (%)', _n;
  END IF;
  IF _note.link IS NULL OR _note.link !~ '^/orphans/[0-9a-f-]{36}$'
     OR NOT EXISTS (SELECT 1 FROM public.orphans o
                     WHERE o.id = substr(_note.link, 10)::uuid AND o.currency = 'EUR'
                       AND o.status = 'approved' AND o.monthly_need > o.funded_monthly) THEN
    RAISE EXCEPTION 'FAIL — GAP-05: الطفل المقترح ليس بالعملة نفسها أو غائب (%)', _note.link;
  END IF;
  -- لا يُرسل مرّتين، ولا يُرسل لصاحب طلبٍ لم يُدفع.
  SET LOCAL ROLE service_role;
  _n := public.send_due_exit_followups();
  RESET ROLE;
  IF _n <> 0 OR (SELECT count(*) FROM public.notifications
                  WHERE user_id = 'b3f00000-0000-4000-8000-000000000004' AND title LIKE '%ينتظر%') <> 1 THEN
    RAISE EXCEPTION 'FAIL — الإشعار الثاني أُرسل مرّتين';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications
              WHERE user_id = 'b3f00000-0000-4000-8000-000000000005' AND title LIKE '%ينتظر%') THEN
    RAISE EXCEPTION 'FAIL — عرضٌ على صاحب طلبٍ لم يكفل';
  END IF;
  RAISE NOTICE 'PASS — GAP-05: الإشعار الثاني بعد مهلة، مرّةً واحدة، يعرض طفلاً ينتظر بالعملة نفسها';
END $$;

-- الطفل غير المقفول: الإدارة تُخرجه بسبب، والكفالة المعلّقة تُلغى.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_archive_child('b3f20000-0000-4000-8000-000000000004', 'transferred', NULL);
    RAISE EXCEPTION 'FAIL — غير المشرف أخرج طفلاً';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_archive_child('b3f20000-0000-4000-8000-000000000004', 'nope', NULL);
    RAISE EXCEPTION 'FAIL — سببٌ خارج القائمة';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.admin_archive_child('b3f20000-0000-4000-8000-000000000004', 'transferred', 'انتقل إلى جهةٍ أخرى');
  RESET ROLE;
  IF (SELECT exit_reason FROM public.orphans WHERE id = 'b3f20000-0000-4000-8000-000000000004') <> 'transferred'
     OR (SELECT status FROM public.sponsorships WHERE id = 'b3f30000-0000-4000-8000-000000000003') <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL — GAP-05: إخراج الطفل غير المقفول';
  END IF;
  RAISE NOTICE 'PASS — GAP-05: إخراج طفلٍ غير مقفول بسببٍ مُهيكل للإدارة وحدها، وكفالته المعلّقة تُلغى';
END $$;

-- الجهة لا تكتب سبب الخروج بنفسها.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b3f00000-0000-4000-8000-000000000006","role":"authenticated"}', true);
  BEGIN
    UPDATE public.orphans SET exit_reason = 'deceased' WHERE id = 'b3f20000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'FAIL — الجهة كتبت سبب الخروج';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS — سبب الخروج يُكتب بقرار الإدارة وحده';
END $$;

ROLLBACK;
