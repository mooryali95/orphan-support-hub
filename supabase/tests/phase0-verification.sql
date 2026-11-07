-- =====================================================================
-- المرحلة 0 — إثبات إغلاق الثغرات
-- =====================================================================
-- ينفّذ هذا الملف سيناريوهات الاستغلال الفعلية الموثّقة في
-- docs/analysis-and-roadmap.ar.md ويفشل بصوتٍ عالٍ إذا نجح أيٌّ منها.
--
-- التشغيل:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase0-verification.sql
--
-- كل شيء داخل معاملة تنتهي بـ ROLLBACK — لا يبقى أي أثر في القاعدة.
-- يتطلّب اتصالاً بصلاحيات superuser/postgres لأنه ينتحل الأدوار عبر SET ROLE.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

\set attacker '''a0000000-0000-4000-8000-000000000001'''
\set sponsor  '''b0000000-0000-4000-8000-000000000002'''
\set orgowner '''c0000000-0000-4000-8000-000000000003'''
\set admin    '''d0000000-0000-4000-8000-000000000004'''

-- ---------------------------------------------------------------------
-- C1 — الدور لا يُقرأ من بيانات التسجيل التي يتحكّم بها العميل
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (:attacker, 'attacker@example.test', '{"full_name":"Attacker","role":"admin"}'::jsonb),
  (:sponsor,  'sponsor@example.test',  '{"full_name":"Sponsor"}'::jsonb),
  (:orgowner, 'org@example.test',      '{"full_name":"Org","role":"care_org"}'::jsonb),
  (:admin,    'admin@example.test',    '{"full_name":"Admin"}'::jsonb);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = 'a0000000-0000-4000-8000-000000000001' AND role = 'admin') THEN
    RAISE EXCEPTION 'FAIL C1 — signup metadata granted the admin role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = 'a0000000-0000-4000-8000-000000000001' AND role = 'sponsor') THEN
    RAISE EXCEPTION 'FAIL C1 — attacker did not fall back to sponsor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = 'c0000000-0000-4000-8000-000000000003' AND role = 'care_org') THEN
    RAISE EXCEPTION 'FAIL C1 — legitimate care_org self-assignment was broken';
  END IF;
  RAISE NOTICE 'PASS C1 — admin refused at signup, sponsor/care_org still work';
END $$;

-- المدير يُسند يدوياً عبر service_role فقط (انظر docs/runbook.ar.md)
INSERT INTO public.user_roles (user_id, role) VALUES (:admin, 'admin');

-- ---------------------------------------------------------------------
-- تجهيز: جهة رعاية معتمدة وملف يتيم منشور
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

INSERT INTO public.care_organizations (id, owner_id, name, city, region)
VALUES ('e0000000-0000-4000-8000-000000000009', :orgowner, 'جمعية الاختبار', 'الرياض', 'الرياض');

-- C4 — الحالة تُفرض 'pending' مهما أرسل العميل
DO $$
BEGIN
  IF (SELECT status FROM public.care_organizations
      WHERE id = 'e0000000-0000-4000-8000-000000000009') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL C4 — organization was not forced to pending on insert';
  END IF;
  RAISE NOTICE 'PASS C4a — new organization forced to pending';
END $$;

-- C4 — المالك يحاول اعتماد جهته
DO $$
BEGIN
  BEGIN
    UPDATE public.care_organizations SET status = 'approved'
    WHERE id = 'e0000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'FAIL C4 — organization self-approved';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C4b — self-approval rejected';
  END;
END $$;

-- C4 — جهة ثانية لنفس المالك
DO $$
BEGIN
  BEGIN
    INSERT INTO public.care_organizations (owner_id, name) VALUES
      ('c0000000-0000-4000-8000-000000000003', 'جهة ثانية');
    RAISE EXCEPTION 'FAIL C4 — one owner registered two organizations';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS C4c — duplicate organization rejected';
  END;
END $$;

-- C5 — جهة غير معتمدة تحاول رفع ملف
DO $$
BEGIN
  BEGIN
    INSERT INTO public.orphans (code, display_name, monthly_need, org_id, created_by, status)
    VALUES ('T-0001', 'ملف', 100, 'e0000000-0000-4000-8000-000000000009',
            'c0000000-0000-4000-8000-000000000003', 'approved');
    RAISE EXCEPTION 'FAIL C5 — pending organization created an orphan profile';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C5a — pending organization cannot create profiles';
  END;
END $$;

-- الإدارة تعتمد الجهة
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}';
UPDATE public.care_organizations SET status = 'approved'
WHERE id = 'e0000000-0000-4000-8000-000000000009';

-- ---------------------------------------------------------------------
-- C5 — كافل عادي بلا جهة يحاول إنشاء ملف يتيم
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.orphans (code, display_name, monthly_need, created_by, status)
    VALUES ('T-0002', 'ملف ملفّق', 500, 'a0000000-0000-4000-8000-000000000001', 'approved');
    RAISE EXCEPTION 'FAIL C5 — any authenticated user created a public orphan profile';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C5b — orphan creation without an approved org rejected';
  END;
END $$;

-- ---------------------------------------------------------------------
-- C5 — الجهة المعتمدة ترفع ملفاً: الحالة تُحصر في draft/submitted
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

INSERT INTO public.orphans (id, code, display_name, monthly_need, org_id, created_by, status, funded_monthly, approved_at)
VALUES ('f0000000-0000-4000-8000-00000000000a', 'T-0003', 'محمد . ت', 200,
        'e0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000003',
        'approved', 999, now());

DO $$
DECLARE r RECORD;
BEGIN
  SELECT status, funded_monthly, approved_at INTO r
  FROM public.orphans WHERE id = 'f0000000-0000-4000-8000-00000000000a';
  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'FAIL C5 — self-published status survived insert (got %)', r.status;
  END IF;
  IF r.funded_monthly <> 0 OR r.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL C5 — funding/approval fields were client-writable on insert';
  END IF;
  RAISE NOTICE 'PASS C5c — insert forced to draft with funding/approval cleared';
END $$;

-- الجهة ترسل للمراجعة (مسموح)، ثم تحاول الاعتماد (ممنوع)
UPDATE public.orphans SET status = 'submitted' WHERE id = 'f0000000-0000-4000-8000-00000000000a';

DO $$
BEGIN
  BEGIN
    UPDATE public.orphans SET status = 'approved' WHERE id = 'f0000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'FAIL C5 — organization approved its own orphan profile';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C5d — self-approval of orphan profile rejected';
  END;
  BEGIN
    UPDATE public.orphans SET funded_monthly = 5000 WHERE id = 'f0000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'FAIL C5 — funded_monthly was client-writable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C5e — funded_monthly write rejected';
  END;
END $$;

-- الإدارة تعتمد الملف (المسار المشروع) — بعد توثيق شهادة الوفاة وإثبات
-- الوصاية: لا يُنشر ملفٌّ بدونهما (CP-06).
RESET ROLE;
INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, verified)
VALUES ('f0000000-0000-4000-8000-00000000000a', 'death_certificate', 'death_certificate',
        'f0000000-0000-4000-8000-00000000000a/dc.pdf', true),
       ('f0000000-0000-4000-8000-00000000000a', 'guardianship_proof', 'guardianship_proof',
        'f0000000-0000-4000-8000-00000000000a/gp.pdf', true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}';
UPDATE public.orphans SET status = 'approved', approved_at = now()
WHERE id = 'f0000000-0000-4000-8000-00000000000a';

DO $$
BEGIN
  IF (SELECT status FROM public.orphans WHERE id = 'f0000000-0000-4000-8000-00000000000a') <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — admin could not approve an orphan profile';
  END IF;
  RAISE NOTICE 'PASS — admin approval path still works';
END $$;

-- ---------------------------------------------------------------------
-- C2 — الكافل ينشئ كفالة ثم يحاول تفعيلها
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, status, currency)
VALUES ('11110000-0000-4000-8000-00000000000b', :sponsor,
        'f0000000-0000-4000-8000-00000000000a', 50, 'active', 'EUR');

DO $$
DECLARE r RECORD;
BEGIN
  SELECT status, currency INTO r FROM public.sponsorships
  WHERE id = '11110000-0000-4000-8000-00000000000b';
  IF r.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'FAIL C2 — sponsorship was created already active (got %)', r.status;
  END IF;
  IF r.currency <> 'USD' THEN
    RAISE EXCEPTION 'FAIL C2 — client-supplied currency survived (got %)', r.currency;
  END IF;
  IF (SELECT funded_monthly FROM public.orphans WHERE id = 'f0000000-0000-4000-8000-00000000000a') <> 0 THEN
    RAISE EXCEPTION 'FAIL C2 — unpaid sponsorship counted toward funding';
  END IF;
  RAISE NOTICE 'PASS C2a — insert forced to pending_payment, currency taken from the orphan';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.sponsorships SET status = 'active'
    WHERE id = '11110000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'FAIL C2 — sponsor activated their own sponsorship without paying';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C2b — self-activation rejected';
  END;
  BEGIN
    UPDATE public.sponsorships SET amount = 999999
    WHERE id = '11110000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'FAIL C2 — sponsor rewrote the pledged amount';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C2c — amount tampering rejected';
  END;
  BEGIN
    UPDATE public.sponsorships SET provider_subscription_id = 'sub_forged'
    WHERE id = '11110000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'FAIL C2 — sponsor wrote payment provider fields';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C2d — provider field tampering rejected';
  END;
END $$;

-- الإلغاء يبقى متاحاً للكافل
UPDATE public.sponsorships SET status = 'cancelled', ended_at = now()
WHERE id = '11110000-0000-4000-8000-00000000000b';
DO $$
BEGIN
  IF (SELECT status FROM public.sponsorships WHERE id = '11110000-0000-4000-8000-00000000000b') <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL — sponsor can no longer cancel their sponsorship';
  END IF;
  RAISE NOTICE 'PASS C2e — cancellation still works for the sponsor';
END $$;

-- كفالة على ملف غير منشور
DO $$
BEGIN
  BEGIN
    INSERT INTO public.orphans (id, code, display_name, monthly_need, status, created_by)
    VALUES ('f0000000-0000-4000-8000-00000000000c', 'T-0004', 'مسودة', 100, 'draft', 'd0000000-0000-4000-8000-000000000004');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------
-- C3 — تزوير قيد دفع
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, status, paid_at)
    VALUES ('11110000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002',
            5000, 'paid', now());
    RAISE EXCEPTION 'FAIL C3 — sponsor forged a paid payment record';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS C3 — payment ledger is not client-writable';
  END;
END $$;

-- ---------------------------------------------------------------------
-- H1 — الجهة تعتمد تقريرها الدوري
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

INSERT INTO public.progress_reports (id, orphan_id, period, summary, status, review_note)
VALUES ('22220000-0000-4000-8000-00000000000d', 'f0000000-0000-4000-8000-00000000000a',
        '2026-Q3', 'تقرير', 'approved', 'اعتمدته بنفسي');

DO $$
DECLARE r RECORD;
BEGIN
  SELECT status, review_note INTO r FROM public.progress_reports
  WHERE id = '22220000-0000-4000-8000-00000000000d';
  IF r.status <> 'submitted' OR r.review_note IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL H1 — report self-approved on insert (status %, note %)', r.status, r.review_note;
  END IF;
  RAISE NOTICE 'PASS H1a — report forced to submitted with review_note cleared';
  BEGIN
    UPDATE public.progress_reports SET status = 'approved'
    WHERE id = '22220000-0000-4000-8000-00000000000d';
    RAISE EXCEPTION 'FAIL H1 — organization approved its own report';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H1b — report self-approval rejected';
  END;
END $$;

-- ---------------------------------------------------------------------
-- H4 — حقن حدث في الخط الزمني
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.timeline_events (orphan_id, actor_id, event_type, detail)
    VALUES ('f0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000003',
            'forged', 'حدث ملفّق');
    RAISE EXCEPTION 'FAIL H4 — timeline is client-writable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H4 — timeline writes are server-only';
  END;
END $$;

-- ---------------------------------------------------------------------
-- H2 — الأعمدة الداخلية أمام الزائر
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '';

DO $$
DECLARE n INT;
BEGIN
  BEGIN
    EXECUTE 'SELECT guardian_id FROM public.orphans LIMIT 1';
    RAISE EXCEPTION 'FAIL H2 — anon can read orphans.guardian_id';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2a — orphans.guardian_id hidden from anon';
  END;
  BEGIN
    EXECUTE 'SELECT created_by FROM public.orphans LIMIT 1';
    RAISE EXCEPTION 'FAIL H2 — anon can read orphans.created_by';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2b — orphans.created_by hidden from anon';
  END;
  BEGIN
    EXECUTE 'SELECT external_ref FROM public.orphans LIMIT 1';
    RAISE EXCEPTION 'FAIL H2 — anon can read orphans.external_ref';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2c — orphans.external_ref hidden from anon';
  END;
  BEGIN
    EXECUTE 'SELECT owner_id FROM public.care_organizations LIMIT 1';
    RAISE EXCEPTION 'FAIL H2 — anon can read care_organizations.owner_id';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2d — care_organizations.owner_id hidden from anon';
  END;
  BEGIN
    EXECUTE 'SELECT contact_phone FROM public.care_organizations LIMIT 1';
    RAISE EXCEPTION 'FAIL H2 — anon can read care_organizations.contact_phone';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2e — organization contact details hidden from anon';
  END;

  -- الأعمدة العامة تبقى متاحة (وإلا تعطّل الدليل)
  SELECT count(*) INTO n FROM public.orphans WHERE status IN ('approved','fully_sponsored');
  IF n < 1 THEN RAISE EXCEPTION 'FAIL H2 — public directory returns nothing for anon'; END IF;
  RAISE NOTICE 'PASS H2f — public directory still readable by anon (% rows)', n;

  /* نصّ الاحتياج حرٌّ تكتبه الجهة وقد يدلّ على مكان الطفل، فسُحب من الزائر
     في مراجعة المرحلة صفر؛ التفصيل يصل من يحقّ له عبر orphan_view. */
  BEGIN
    SELECT count(*) INTO n FROM public.orphan_needs;
    RAISE EXCEPTION 'FAIL H2g — anon still reads orphan_needs (% rows)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2g — orphan_needs is closed to anon';
  END;

  -- شُدّد المنح لاحقاً في 20260823110111 (تدقيق Supabase الأمني): الدالة لم تعد
  -- قابلة للاستدعاء من العميل إطلاقاً. عند تفعيل المطابقة في المرحلة 5 يجب
  -- منح EXECUTE لـ authenticated صراحةً، أو استدعاؤها من الخادم عبر service_role.
  BEGIN
    PERFORM 1 FROM public.suggest_orphans_for_sponsor(200, NULL, 5);
    RAISE EXCEPTION 'FAIL H2 — anon can still execute suggest_orphans_for_sponsor';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS H2h — matching function not client-callable';
  END;
END $$;

-- الدالة لم تعد تُعيد الأعمدة الداخلية
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.parameters
    WHERE specific_schema = 'public'
      AND parameter_mode = 'OUT'
      AND parameter_name IN ('guardian_id','created_by','external_ref','rejection_reason')
      AND specific_name LIKE 'suggest_orphans_for_sponsor%'
  ) THEN
    RAISE EXCEPTION 'FAIL H2 — suggest_orphans_for_sponsor still returns internal columns';
  END IF;
  RAISE NOTICE 'PASS H2i — matching function returns public columns only';
END $$;

-- ---------------------------------------------------------------------
-- انحدار: مُشغّل التمويل يجب أن يعمل رغم حارس الأيتام (المخاطرة المُعلَنة)
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '';

INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, status, type, currency)
VALUES ('33330000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000002',
        'f0000000-0000-4000-8000-00000000000a', 200, 'active', 'monthly', 'USD');

DO $$
DECLARE r RECORD;
BEGIN
  SELECT funded_monthly, status INTO r FROM public.orphans
  WHERE id = 'f0000000-0000-4000-8000-00000000000a';
  IF r.funded_monthly <> 200 THEN
    RAISE EXCEPTION 'REGRESSION — recalc_orphan_funding blocked by the orphan guard (funded_monthly = %)', r.funded_monthly;
  END IF;
  IF r.status <> 'fully_sponsored' THEN
    RAISE EXCEPTION 'REGRESSION — funding trigger no longer flips status (got %)', r.status;
  END IF;
  RAISE NOTICE 'PASS regression — funding trigger works through the guard (funded=%, status=%)', r.funded_monthly, r.status;
END $$;

-- webhook المزوّد (service_role) يكتب الدفعة ويفعّل الكفالة
INSERT INTO public.sponsorship_payments (sponsorship_id, sponsor_id, amount, status, paid_at)
VALUES ('33330000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000002', 200, 'paid', now());
DO $$
BEGIN
  RAISE NOTICE 'PASS regression — service_role can still write the payment ledger';
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE '── جميع الفحوص اجتازت ──'; END $$;

ROLLBACK;
