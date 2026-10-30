-- =====================================================================
-- الرحلة الكاملة — اختبارٌ شامل من أوّلها إلى آخرها
-- ---------------------------------------------------------------------
-- كل مجموعةٍ أخرى تُثبت حارساً واحداً بمعزل. هذه تُثبت أن الحرّاس
-- يعملون معاً في قصّةٍ واحدة كما يعيشها الناس:
--   جهةٌ تُسجّل طفلاً ← كافلٌ يبدأ كفالة ← يصل حدث الدفع ويُعالَج ←
--   تُصدَر فاتورةٌ برقم المعاملة الحقيقي ← يُقفل ملفّ الطفل ← يرى الكافل
--   الشهر بإيصاله وفاتورته ← يتحقّق من الإيصال ← يبحث بالرقم الحقيقي ←
--   يتعلّم الطفل جلسةً فيراها الكافل في شهرها ← لا تعديل ولا حذف لما
--   ثبت ← الغريب لا يرى شيئاً ← السلسلة سليمة وصحّة التشغيل غير حرجة.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('bc100000-0000-4000-8000-000000000001', 'e2e-org@example.test', '{"role":"care_org"}'::jsonb),
  ('bc100000-0000-4000-8000-000000000002', 'e2e-sponsor@example.test', '{}'::jsonb),
  ('bc100000-0000-4000-8000-000000000003', 'e2e-stranger@example.test', '{}'::jsonb),
  ('bc100000-0000-4000-8000-000000000004', 'e2e-admin@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('bc100000-0000-4000-8000-000000000004', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('bc200000-0000-4000-8000-000000000001', 'bc100000-0000-4000-8000-000000000001', 'جهة الرحلة', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
VALUES ('bc300000-0000-4000-8000-000000000001', 'E2E-1', 'طفل الرحلة', 'bc200000-0000-4000-8000-000000000001',
        'bc100000-0000-4000-8000-000000000001', 'ألبانيا', 'Tirana', 100, 'approved', now());

DO $$
DECLARE
  _s UUID := 'bc400000-0000-4000-8000-000000000001';
  _o UUID := 'bc300000-0000-4000-8000-000000000001';
  _p UUID := 'bc500000-0000-4000-8000-000000000001';
  _month TEXT := to_char(now(), 'YYYY-MM');
  _inv TEXT; _l JSONB; _m JSONB; _v JSONB; _q JSONB; _enr UUID; _prog UUID; _ok BOOLEAN;
BEGIN
  -- ١) الكافل يبدأ الكفالة — بانتظار الدفع، والملفّ لم يُقفل بعد
  INSERT INTO public.sponsorships (id, sponsor_id, orphan_id, amount, currency, status, started_at)
  VALUES (_s, 'bc100000-0000-4000-8000-000000000002', _o, 40, 'EUR', 'pending_payment', now());
  INSERT INTO public.sponsorship_payments (id, sponsorship_id, sponsor_id, amount, currency, status, provider, provider_ref)
  VALUES (_p, _s, 'bc100000-0000-4000-8000-000000000002', 40, 'EUR', 'pending', 'creem', 'ch_e2e_1');
  IF public.orphan_is_locked(_o) THEN RAISE EXCEPTION 'FAIL — قُفل الملفّ قبل أن يُدفع شيء'; END IF;
  IF (SELECT invoice_no FROM public.sponsorship_payments WHERE id = _p) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — دفعةٌ معلّقة أخذت فاتورة';
  END IF;
  RAISE NOTICE 'PASS ١ — كفالةٌ بانتظار الدفع: لا فاتورة ولا قفل';

  -- ٢) يصل حدث الدفع (كما يكتبه مسار الـwebhook بدور الخادم) ويُعالَج
  INSERT INTO public.payment_events (provider, provider_event_id, event_type, sponsorship_id, payment_id,
                                     payload, signature_verified, processed_at)
  VALUES ('creem', 'evt_e2e_1', 'checkout.completed', _s, _p, '{"order":"ord_e2e_1"}'::jsonb, true, now());
  UPDATE public.sponsorship_payments
     SET status = 'paid', paid_at = now(), provider_payment_id = 'ord_e2e_1',
         period_start = date_trunc('month', now())::date
   WHERE id = _p;
  UPDATE public.sponsorships SET status = 'active' WHERE id = _s;

  SELECT invoice_no INTO _inv FROM public.sponsorship_payments WHERE id = _p;
  IF _inv IS NULL OR _inv !~ '^INV-\d{4}-\d{6}$' THEN RAISE EXCEPTION 'FAIL — لا فاتورة بعد الدفع: %', _inv; END IF;
  IF NOT public.orphan_is_locked(_o) THEN RAISE EXCEPTION 'FAIL — الكفالة فعّلت ولم يُقفل الملفّ'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'payment_invoiced' AND detail::text LIKE '%' || _inv || '%') THEN
    RAISE EXCEPTION 'FAIL — الفاتورة لم تُثبَّت في سجلّ السلامة';
  END IF;
  RAISE NOTICE 'PASS ٢ — الدفع يُصدر فاتورة % ويُقفل الملفّ ويُثبَّت في السجلّ', _inv;

  -- ٣) الكافل يرى الشهر: مدفوع، بإيصال، وفاتورته برقم المعاملة الحقيقي
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bc100000-0000-4000-8000-000000000002","role":"authenticated"}';
  _l := public.sponsorship_ledger(_s);
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  RESET ROLE;
  _v := _m->'payments';
  IF _m IS NULL OR (_m->>'paid')::numeric <> 40 OR _m->>'receipt' IS NULL THEN
    RAISE EXCEPTION 'FAIL — الشهر لا يظهر مدفوعاً بإيصال: %', _m;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_v) x
                  WHERE x->>'invoice_no' = _inv AND x::text LIKE '%ord_e2e_1%') THEN
    RAISE EXCEPTION 'FAIL — الفاتورة لا تحمل رقم المعاملة الحقيقي: %', _v;
  END IF;
  RAISE NOTICE 'PASS ٣ — الكافل يرى شهره مدفوعاً بإيصال، وفاتورته مربوطة بالمعاملة';

  -- ٤) يتحقّق من الإيصال، ويبحث بالرقم الحقيقي فيجد نفس الفاتورة ونفس الإيصال
  SET LOCAL ROLE authenticated;
  _v := public.verify_ledger_receipt(_s, _month, _m->>'receipt');
  _q := public.lookup_payment('ord_e2e_1');
  RESET ROLE;
  IF NOT (_v->>'match')::boolean THEN RAISE EXCEPTION 'FAIL — الإيصال لا يطابق حقائقه'; END IF;
  IF NOT (_q->>'found')::boolean OR _q::text NOT LIKE '%' || _inv || '%' THEN
    RAISE EXCEPTION 'FAIL — البحث برقم المعاملة لم يجد الفاتورة: %', _q;
  END IF;
  RAISE NOTICE 'PASS ٤ — الإيصال يطابق، والبحث برقم المعاملة يجد الفاتورة';

  -- ٥) يتعلّم الطفل: جلسةٌ مقبولة تظهر للكافل في شهرها، بلا مخرجاتٍ ولا ملاحظات
  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price, status, started_at)
  SELECT _o, p.id, p.monthly_price, 'funded', now() FROM public.programs p
   WHERE p.slug = 'ahliyyah-foundational' RETURNING id, program_id INTO _enr, _prog;
  ALTER TABLE public.enrollment_units DISABLE TRIGGER USER;
  INSERT INTO public.enrollment_units (enrollment_id, unit_id, status, evidence, note, submitted_at, decided_at, decided_by)
  SELECT _enr, u.id, 'accepted', 'مخرَجٌ-خاص', 'ملاحظةٌ-خاصة', now(), now(), 'bc100000-0000-4000-8000-000000000001'
    FROM public.program_units u WHERE u.program_id = _prog AND u.active ORDER BY u.ordinal LIMIT 1;
  ALTER TABLE public.enrollment_units ENABLE TRIGGER USER;
  SET LOCAL ROLE authenticated;
  _q := public.sponsor_qualification(_o);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_q->'programs'->0->'units') x
                  WHERE x->>'status' = 'accepted' AND x->>'accepted_month' = _month) THEN
    RAISE EXCEPTION 'FAIL — ما تعلّمه الطفل لا يظهر في شهره: %', _q;
  END IF;
  IF _q::text LIKE '%خاص%' THEN RAISE EXCEPTION 'FAIL — رحلة الكافل تحمل مخرجاتٍ أو ملاحظات'; END IF;
  RAISE NOTICE 'PASS ٥ — ما تعلّمه الطفل يظهر للكافل في شهر دفعه، بلا تفاصيل خاصة';

  -- ٦) ما ثبت لا يُمسّ: الجهة لا تعدّل الملفّ المقفل، ولا أحد يحذف الفاتورة
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"bc100000-0000-4000-8000-000000000001","role":"authenticated"}';
    UPDATE public.orphans SET region = 'Durrës' WHERE id = _o;
    _ok := NOT FOUND;   -- إن لم تسمح السياسة أصلاً، فلا صفّ تغيّر
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok OR (SELECT region FROM public.orphans WHERE id = _o) <> 'Tirana' THEN
    RAISE EXCEPTION 'FAIL — الجهة عدّلت ملفّاً مقفلاً';
  END IF;
  _ok := false;
  BEGIN
    DELETE FROM public.sponsorship_payments WHERE id = _p;
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذفت دفعةٌ مفوترة'; END IF;
  RAISE NOTICE 'PASS ٦ — الملفّ المقفل لا يُعدَّل، والدفعة المفوترة لا تُحذف';

  -- ٧) الغريب لا يرى سجلّ الكفالة ولا رحلة الطفل ولا يجد الفاتورة
  -- الهوية تُضبط خارج الكتلة: الاستثناء يُرجع ما ضُبط داخلها.
  _ok := false;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bc100000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    _l := public.sponsorship_ledger(_s);
    _ok := _l IS NULL OR _l = 'null'::jsonb OR NOT (_l ? 'months');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  _q := public.sponsor_qualification(_o);
  _v := public.lookup_payment('ord_e2e_1');
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غريبٌ قرأ سجلّ كفالة'; END IF;
  IF (_q->>'allowed')::boolean OR (_v->>'found')::boolean THEN
    RAISE EXCEPTION 'FAIL — غريبٌ رأى رحلة الطفل أو وجد الفاتورة';
  END IF;
  RAISE NOTICE 'PASS ٧ — الغريب لا يرى السجلّ ولا الرحلة ولا الفاتورة';

  -- ٨) المشرف: السلسلة سليمة بعد الرحلة كلّها، وأحداث الدفع غير حرجة
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bc100000-0000-4000-8000-000000000004","role":"authenticated"}';
  _v := public.integrity_verify();
  _q := public.ops_health();
  RESET ROLE;
  IF NOT (_v->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — السلسلة انكسرت خلال الرحلة: %', _v; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_q->'checks') c
              WHERE c->>'key' IN ('integrity_chain', 'webhook_errors') AND c->>'level' <> 'ok') THEN
    RAISE EXCEPTION 'FAIL — رحلةٌ سليمة أطلقت تنبيهاً: %', _q->'checks';
  END IF;
  RAISE NOTICE 'PASS ٨ — السلسلة سليمة (% سطراً)، وصحّة التشغيل لا تنبّه على رحلةٍ سليمة', _v->>'checked';
END $$;
DO $$ BEGIN RAISE NOTICE '── الرحلة الكاملة اجتازت من أوّلها إلى آخرها ──'; END $$;
ROLLBACK;
