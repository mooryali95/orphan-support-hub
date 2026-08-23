-- =====================================================================
-- المرحلة 7 — إثبات: التعليق والخدمات وتحديد المعدّل والامتثال
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'p7-admin@example.test', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', 'p7-org@example.test', '{"role":"care_org"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000003', 'p7-sponsor@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('f1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000002', 'جهة الخدمات', 'approved');

INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status, approved_at)
VALUES ('f3000000-0000-4000-8000-00000000000b', 'SVC-1', 'يتيم الخدمات',
        'f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000002',
        150, 'approved', now());

-- ---------------------------------------------------------------------
-- التعليق افتراضي: بيئة جديدة تبدأ مغلقة لا مفتوحة
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT (SELECT payments_on_hold FROM public.platform_settings WHERE id) THEN
    RAISE EXCEPTION 'FAIL — electronic collection is open by default';
  END IF;
  RAISE NOTICE 'PASS — collection starts on hold, opening it is a deliberate act';
END $$;

-- ورفعه من العميل ممنوع، ولو كان إدارة: الإعداد يُكتب من الخادم وحده.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    UPDATE public.platform_settings SET payments_on_hold = false WHERE id;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a client lifted the payment hold';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — the payment hold cannot be lifted from the client';
  END;
END $$;

-- ---------------------------------------------------------------------
-- الكتالوج: يُقرأ للعموم، ولا يُكتب إلا من الإدارة
-- ---------------------------------------------------------------------
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO _n FROM public.programs;
  RESET ROLE;
  IF _n < 6 THEN RAISE EXCEPTION 'FAIL — the visitor cannot see the catalogue (%)', _n; END IF;
  RAISE NOTICE 'PASS — the programme catalogue is public (% programmes)', _n;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    INSERT INTO public.programs (slug, title, summary, category, monthly_price)
    VALUES ('fake', 'برنامج ملفَّق', 'وعد بلا مراجعة', 'education', 999);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an organisation added a programme to the catalogue';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — only an admin writes the catalogue';
  END;
END $$;

-- ---------------------------------------------------------------------
-- الالتحاق: السعر من الكتالوج، والحالة `proposed`
-- ---------------------------------------------------------------------
DO $$
DECLARE _e UUID; _price NUMERIC; _st public.enrollment_status; _prog UUID;
BEGIN
  SELECT id INTO _prog FROM public.programs WHERE slug = 'basic-education-support';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  -- الجهة تُرسل سعراً وحالة مزوَّرين: كلاهما يُتجاهَل
  INSERT INTO public.program_enrollments (orphan_id, program_id, monthly_price, status)
  VALUES ('f3000000-0000-4000-8000-00000000000b', _prog, 1, 'funded')
  RETURNING id INTO _e;
  RESET ROLE;

  SELECT monthly_price, status INTO _price, _st FROM public.program_enrollments WHERE id = _e;
  IF _price <> 60 THEN
    RAISE EXCEPTION 'FAIL — the enrolment price was taken from the client (%)', _price;
  END IF;
  RAISE NOTICE 'PASS — the price is copied from the catalogue, never from the client';

  IF _st <> 'proposed' THEN
    RAISE EXCEPTION 'FAIL — an organisation self-funded an enrolment (%)', _st;
  END IF;
  RAISE NOTICE 'PASS — an enrolment starts as proposed; funding is server-managed';

  -- ولا تستطيع رفعها إلى funded لاحقاً
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    UPDATE public.program_enrollments SET status = 'funded' WHERE id = _e;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — an organisation marked its own enrolment funded';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — an organisation cannot mark an enrolment funded';
  END;

  -- والسعر مثبَّت: تغيير الكتالوج لا يُغيّر ما اتُّفق عليه
  UPDATE public.programs SET monthly_price = 500 WHERE id = _prog;
  IF (SELECT monthly_price FROM public.program_enrollments WHERE id = _e) <> 60 THEN
    RAISE EXCEPTION 'FAIL — changing the catalogue changed an existing enrolment';
  END IF;
  RAISE NOTICE 'PASS — the agreed price survives a catalogue change';
END $$;

-- خطّة الطفل تُعرض للزائر: هي ما يشتريه الكافل
DO $$
DECLARE _plan JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _plan := public.orphan_program_plan('f3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF jsonb_array_length(_plan) < 1 THEN
    RAISE EXCEPTION 'FAIL — the visitor cannot see what the money buys';
  END IF;
  IF _plan->0->>'deliverables' IS NULL THEN
    RAISE EXCEPTION 'FAIL — the plan does not state the deliverables';
  END IF;
  RAISE NOTICE 'PASS — the visitor sees the programme, its price and its deliverables';
END $$;

-- ---------------------------------------------------------------------
-- M6 — تحديد المعدّل
-- ---------------------------------------------------------------------
DO $$
DECLARE _r JSONB; _i INTEGER;
BEGIN
  FOR _i IN 1..3 LOOP
    _r := public.hit_rate_limit('test', 'ident-a', 3, 60);
    IF NOT (_r->>'allowed')::boolean THEN
      RAISE EXCEPTION 'FAIL — a request within the limit was blocked at %', _i;
    END IF;
  END LOOP;

  _r := public.hit_rate_limit('test', 'ident-a', 3, 60);
  IF (_r->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL — the limit was exceeded without being blocked';
  END IF;
  RAISE NOTICE 'PASS — the limit blocks exactly after it is exceeded';

  -- هوية أخرى لا تتأثّر: الحدّ لكل هوية لا للنظام
  _r := public.hit_rate_limit('test', 'ident-b', 3, 60);
  IF NOT (_r->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL — one identity exhausting its quota blocked another';
  END IF;
  RAISE NOTICE 'PASS — the limit is per identity, not global';

  -- ومجال آخر لنفس الهوية لا يتأثّر
  _r := public.hit_rate_limit('other', 'ident-a', 3, 60);
  IF NOT (_r->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL — one bucket exhausting its quota blocked another';
  END IF;
  RAISE NOTICE 'PASS — buckets are counted independently';
END $$;

-- العدّاد محجوب عن العميل: عدّاد يكتبه العميل عدّادٌ يُصفّره العميل.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.hit_rate_limit('test', 'ident-a', 999, 60);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a client could drive the rate limiter';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — the rate limiter is server-only';
  END;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    DELETE FROM public.rate_limits;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a client could clear the rate limit counters';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — the counters cannot be cleared from the client';
  END;
END $$;

-- ---------------------------------------------------------------------
-- الامتثال: سياسة الاحتفاظ مكتوبة وتغطّي الحسّاس
-- ---------------------------------------------------------------------
DO $$
DECLARE _missing TEXT;
BEGIN
  SELECT string_agg(e, '، ') INTO _missing FROM unnest(ARRAY[
    'orphan_private', 'orphan_documents', 'orphans.photo_url',
    'sponsorship_payments', 'audit_log'
  ]) e
  WHERE NOT EXISTS (SELECT 1 FROM public.data_retention_policy p WHERE p.entity = e);

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — no retention policy for: %', _missing;
  END IF;
  RAISE NOTICE 'PASS — every sensitive category has a documented retention policy';

  IF EXISTS (SELECT 1 FROM public.data_retention_policy WHERE COALESCE(note,'') = '') THEN
    RAISE EXCEPTION 'FAIL — a retention entry has no justification';
  END IF;
  RAISE NOTICE 'PASS — every retention entry states its justification';
END $$;

-- ---------------------------------------------------------------------
-- صحّة النظام: للإدارة وحدها، وتكشف ما يجب أن يبقى صفراً
-- ---------------------------------------------------------------------
DO $$
DECLARE _h JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.system_health();
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — a sponsor read the system health dashboard';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — system health is admin-only';
  END;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  _h := public.system_health();
  RESET ROLE;

  IF NOT (_h ? 'payments' AND _h ? 'email' AND _h ? 'queues' AND _h ? 'privacy') THEN
    RAISE EXCEPTION 'FAIL — the health payload is incomplete: %', _h;
  END IF;
  -- هذا العدّاد يجب أن يبقى صفراً؛ ظهوره يعني خللاً في حارس الموافقة.
  IF (_h->'privacy'->>'photos_without_consent')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL — a published photo exists without consent';
  END IF;
  RAISE NOTICE 'PASS — health reports payments, email, queues and privacy';
  RAISE NOTICE 'PASS — no published photo lacks consent';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المرحلة 7 اجتازت ──'; END $$;

ROLLBACK;
