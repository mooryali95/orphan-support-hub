-- =====================================================================
-- الثقة بجهة الرعاية ومساءلة الإدارة — إثبات (المرحلة صفر، المجموعة DB-B)
-- ---------------------------------------------------------------------
-- كل فحصٍ هنا يبدأ من الاستغلال كما رآه المدقّق: نداءٌ مباشر بالمفتاح
-- المنشور من حساب الجهة أو الوليّ أو الإدارة، لا من الشاشة. الأبواب:
--   CP-01 + DB-02  الجهة تُدخل أيّ حسابٍ دائرةَ الطفل بلا قرارٍ ولا أجلٍ
--                  ولا أثر، وتضع أيّ حسابٍ وليّاً له
--   CP-02 + DB-01  الجهة تنقض سحبَ الوليّ لموافقة الصورة، وتزوّر من وافق
--                  ومن راجع
--   CP-06          ملفٌّ بلا وثيقةٍ موثَّقة يُعتمد ويُنشر
--   DB-07 + CP-10  ما اعتُمد يُعدَّل بعد الاعتماد ويبقى منشوراً
--   GAP-03         تفعيل كفالةٍ وتسجيل صرفٍ بلا أثر في audit_log
--   DB-05          إثبات وصولٍ لملفٍّ غير موجود، ووثيقةٌ موثَّقة تُستبدل وتُحذف
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('dbb00000-0000-4000-8000-000000000001', 'tb-admin@example.test', '{}'::jsonb),
  ('dbb00000-0000-4000-8000-000000000002', 'tb-org@example.test', '{"role":"care_org"}'::jsonb),
  ('dbb00000-0000-4000-8000-000000000003', 'tb-stranger@example.test', '{}'::jsonb),
  ('dbb00000-0000-4000-8000-000000000004', 'tb-guardian@example.test', '{}'::jsonb),
  ('dbb00000-0000-4000-8000-000000000005', 'tb-supervisor@example.test', '{}'::jsonb),
  ('dbb00000-0000-4000-8000-000000000006', 'tb-sponsor@example.test', '{}'::jsonb),
  ('dbb00000-0000-4000-8000-000000000007', 'tb-account-guardian@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('dbb00000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.supervisor_profiles (user_id, level, active, certified_at, certified_by)
VALUES ('dbb00000-0000-4000-8000-000000000005', 'foundational', true, now(),
        'dbb00000-0000-4000-8000-000000000001');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('dbb20000-0000-4000-8000-00000000000a',
        'dbb00000-0000-4000-8000-000000000002', 'جهة الثقة', 'approved');

/* C1 منشورٌ غير مكفول، ووليّه حسابٌ على المنصّة.
   C2 مرفوعٌ للمراجعة بلا وثيقةٍ واحدة.
   C3 منشورٌ مكفول (فهو مقفول). */
INSERT INTO public.orphans
  (id, code, display_name, gender, birth_date, city, country, region, story,
   org_id, created_by, guardian_id, monthly_need, status, approved_at)
VALUES
  ('dbb30000-0000-4000-8000-000000000001', 'TB-1', 'أرديت', 'male',
   CURRENT_DATE - interval '9 years', 'تيرانا', 'ألبانيا', 'تيرانا', 'قصّةٌ راجعتها الإدارة.',
   'dbb20000-0000-4000-8000-00000000000a', 'dbb00000-0000-4000-8000-000000000002',
   'dbb00000-0000-4000-8000-000000000004', 150, 'approved', now() - interval '30 days'),
  ('dbb30000-0000-4000-8000-000000000002', 'TB-2', 'إلير', 'male',
   CURRENT_DATE - interval '8 years', 'دورس', 'ألبانيا', 'دورس', 'قصّةٌ لم تُراجع.',
   'dbb20000-0000-4000-8000-00000000000a', 'dbb00000-0000-4000-8000-000000000002',
   NULL, 120, 'submitted', NULL),
  ('dbb30000-0000-4000-8000-000000000003', 'TB-3', 'بليريم', 'male',
   CURRENT_DATE - interval '10 years', 'شكودر', 'ألبانيا', 'شكودر', 'قصّةٌ راجعتها الإدارة.',
   'dbb20000-0000-4000-8000-00000000000a', 'dbb00000-0000-4000-8000-000000000002',
   NULL, 100, 'approved', now() - interval '60 days');

INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status, started_at)
VALUES ('dbb00000-0000-4000-8000-000000000006', 'dbb30000-0000-4000-8000-000000000003',
        40, 'USD', 'active', now() - interval '20 days');

-- وثائق C1 موثَّقة ومرفوعةٌ فعلاً في الخزنة، ووثيقة موافقة صورةٍ موثَّقة.
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
  ('orphan-documents', 'dbb30000-0000-4000-8000-000000000001/death.pdf', '{"eTag":"e1"}'),
  ('orphan-documents', 'dbb30000-0000-4000-8000-000000000001/guardianship.pdf', '{"eTag":"e2"}'),
  ('orphan-documents', 'dbb30000-0000-4000-8000-000000000001/photo-consent.pdf', '{"eTag":"e3"}'),
  ('orphan-documents', 'dbb30000-0000-4000-8000-000000000001/draft.pdf', '{"eTag":"e4"}'),
  ('orphan-documents', 'dbb30000-0000-4000-8000-000000000003/photo-consent.pdf', '{"eTag":"e5"}'),
  ('orphan-documents', 'dbb30000-0000-4000-8000-000000000003/photo-consent-unverified.pdf', '{"eTag":"e6"}');
INSERT INTO public.orphan_documents
  (id, orphan_id, doc_type, kind, storage_path, file_name, verified, verified_by, verified_at)
VALUES
  ('dbb50000-0000-4000-8000-000000000001', 'dbb30000-0000-4000-8000-000000000001',
   'death_certificate', 'death_certificate', 'dbb30000-0000-4000-8000-000000000001/death.pdf',
   'death.pdf', true, 'dbb00000-0000-4000-8000-000000000001', now()),
  ('dbb50000-0000-4000-8000-000000000002', 'dbb30000-0000-4000-8000-000000000001',
   'guardianship_proof', 'guardianship_proof',
   'dbb30000-0000-4000-8000-000000000001/guardianship.pdf', 'guardianship.pdf', true,
   'dbb00000-0000-4000-8000-000000000001', now()),
  ('dbb50000-0000-4000-8000-000000000003', 'dbb30000-0000-4000-8000-000000000001',
   'photo_consent', 'photo_consent', 'dbb30000-0000-4000-8000-000000000001/photo-consent.pdf',
   'photo-consent.pdf', true, 'dbb00000-0000-4000-8000-000000000001', now()),
  ('dbb50000-0000-4000-8000-000000000004', 'dbb30000-0000-4000-8000-000000000001',
   'other', 'other', 'dbb30000-0000-4000-8000-000000000001/draft.pdf', 'draft.pdf', false,
   NULL, NULL),
  ('dbb50000-0000-4000-8000-000000000005', 'dbb30000-0000-4000-8000-000000000003',
   'photo_consent', 'photo_consent', 'dbb30000-0000-4000-8000-000000000003/photo-consent.pdf',
   'photo-consent.pdf', true, 'dbb00000-0000-4000-8000-000000000001', now()),
  ('dbb50000-0000-4000-8000-000000000006', 'dbb30000-0000-4000-8000-000000000003',
   'photo_consent', 'photo_consent',
   'dbb30000-0000-4000-8000-000000000003/photo-consent-unverified.pdf',
   'photo-consent-unverified.pdf', false, NULL, NULL);

INSERT INTO public.program_enrollments (id, orphan_id, program_id, monthly_price)
SELECT 'dbb40000-0000-4000-8000-000000000001', 'dbb30000-0000-4000-8000-000000000001',
       p.id, p.monthly_price
  FROM public.programs p WHERE p.slug = 'ahliyyah-foundational';

INSERT INTO public.progress_reports
  (id, orphan_id, org_id, period, summary, education_note, status, created_by, published_at)
VALUES ('dbb60000-0000-4000-8000-000000000001', 'dbb30000-0000-4000-8000-000000000003',
        'dbb20000-0000-4000-8000-00000000000a', '2026-10', 'نصٌّ راجعته الإدارة',
        'انتقل إلى الصفّ الخامس', 'approved', 'dbb00000-0000-4000-8000-000000000002', now());

INSERT INTO public.disbursements (id, org_id, orphan_id, amount, currency, period_start, status)
VALUES ('dbb70000-0000-4000-8000-000000000001', 'dbb20000-0000-4000-8000-00000000000a',
        'dbb30000-0000-4000-8000-000000000003', 40, 'USD', date_trunc('month', now())::date,
        'transferred');


-- =====================================================================
-- CP-01 + DB-02 — الدائرة لا تُفتح إلا بقرار الإدارة، ولأجل، وبأثر
-- =====================================================================

-- (١) الجهة تُسند «مرشداً» لحسابٍ غريب: يُسجَّل معلّقاً ولا يفتح شيئاً.
DO $$
DECLARE _role UUID; _circle BOOLEAN; _scopes TEXT[]; _prof JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _role := public.assign_enrollment_role('dbb40000-0000-4000-8000-000000000001', 'mentor',
             NULL, 'tb-stranger@example.test', NULL, NULL);
  RESET ROLE;
  PERFORM set_config('tb.mentor_role', _role::text, true);

  IF (SELECT approval FROM public.enrollment_roles WHERE id = _role) IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'FAIL — دورٌ بحساب أسندته الجهة لم يُعلَّق لقرار الإدارة';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _circle := public.in_orphan_circle('dbb30000-0000-4000-8000-000000000001');
  _scopes := public.my_orphan_scopes('dbb30000-0000-4000-8000-000000000001');
  _prof := public.orphan_profile('dbb30000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _circle OR cardinality(_scopes) > 0 OR (_prof->>'may_read')::boolean THEN
    RAISE EXCEPTION 'FAIL — CP-01: إسناد الجهة وحده أدخل الغريب الدائرة (scopes=%)', _scopes;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'enrollment_role.assigned' AND entity_id = _role
                    AND actor_id = 'dbb00000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL — CP-01: الإسناد بلا أثرٍ في audit_log';
  END IF;
  RAISE NOTICE 'PASS — CP-01: إسناد الجهة لحسابٍ يُعلَّق لقرار الإدارة ولا يفتح شيئاً، ويُسجَّل';
END $$;

-- (٢) ولا بابَ خلفي: الكتابة المباشرة على الأدوار مغلقة.
DO $$
DECLARE _blocked INTEGER := 0;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    INSERT INTO public.enrollment_roles (enrollment_id, role, person_id, person_name)
    VALUES ('dbb40000-0000-4000-8000-000000000001', 'guardian',
            'dbb00000-0000-4000-8000-000000000003', 'صديق');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _blocked := _blocked + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.enrollment_roles SET approval = 'approved', expires_at = now() + interval '9 years'
     WHERE id = current_setting('tb.mentor_role')::uuid;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _blocked := _blocked + 1;
  END;
  IF _blocked <> 2 THEN
    RAISE EXCEPTION 'FAIL — DB-02: الجهة تكتب الأدوار مباشرةً فتلتفّ على القرار';
  END IF;
  RAISE NOTICE 'PASS — DB-02: لا إدراج ولا اعتماد ذاتيّ مباشر على enrollment_roles';
END $$;

-- (٣) ولا تضع الجهة أيّ حسابٍ «وليّاً» للطفل.
DO $$
DECLARE _ok BOOLEAN := false;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.orphans SET guardian_id = 'dbb00000-0000-4000-8000-000000000003'
     WHERE id = 'dbb30000-0000-4000-8000-000000000003';
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok OR (SELECT guardian_id FROM public.orphans
                  WHERE id = 'dbb30000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — DB-02: الجهة جعلت حساباً غريباً وليّاً للطفل';
  END IF;
  RAISE NOTICE 'PASS — DB-02: guardian_id لا تكتبه الجهة';
END $$;

-- (٤) قرار الإدارة يفتح — لأجلٍ، وبنطاق الدور، وبأثر.
DO $$
DECLARE _role UUID := current_setting('tb.mentor_role')::uuid; _scopes TEXT[]; _exp TIMESTAMPTZ;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  BEGIN
    PERFORM public.decide_enrollment_role(_role, 'approved', 90, NULL);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — صاحب الدور اعتمد نفسه';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.decide_enrollment_role(_role, 'approved', 90, 'مرشدٌ معروفٌ للجهة');
  RESET ROLE;

  SELECT expires_at INTO _exp FROM public.enrollment_roles WHERE id = _role;
  IF _exp IS NULL OR _exp > now() + interval '91 days' THEN
    RAISE EXCEPTION 'FAIL — CP-01: الدور المعتمد بلا أجل (%)', _exp;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _scopes := public.my_orphan_scopes('dbb30000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF NOT ('journey' = ANY(_scopes)) THEN
    RAISE EXCEPTION 'FAIL — المرشد المعتمد لا يرى رحلة الطفل: %', _scopes;
  END IF;
  IF _scopes && ARRAY['identity', 'location', 'contact', 'profile_deep'] THEN
    RAISE EXCEPTION 'FAIL — CP-01: المرشد يملك الهوية والموقع والملفّ العميق ضمناً: %', _scopes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'enrollment_role.approved' AND entity_id = _role
                    AND actor_id = 'dbb00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — CP-01: الاعتماد بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — CP-01: الإدارة وحدها تعتمد، لأجلٍ، والمرشد بلا هويةٍ ولا موقعٍ ولا ملفٍّ عميق';
END $$;

-- (٥) والأجل ينقضي فعلاً.
DO $$
DECLARE _circle BOOLEAN;
BEGIN
  UPDATE public.enrollment_roles SET expires_at = now() - interval '1 minute'
   WHERE id = current_setting('tb.mentor_role')::uuid;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  _circle := public.in_orphan_circle('dbb30000-0000-4000-8000-000000000001');
  RESET ROLE;
  IF _circle THEN
    RAISE EXCEPTION 'FAIL — CP-01: الدور المنقضي ما زال يفتح الدائرة';
  END IF;
  RAISE NOTICE 'PASS — CP-01: الدور المنقضي لا يفتح الدائرة';
END $$;

-- (٦) والمشرف المعتمد من الإدارة لا ينتظر قراراً ثانياً — لكنّ له أجلاً.
DO $$
DECLARE _role UUID; _r public.enrollment_roles; _circle BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _role := public.assign_enrollment_role('dbb40000-0000-4000-8000-000000000001', 'supervisor',
             NULL, 'tb-supervisor@example.test', NULL, NULL);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  _circle := public.in_orphan_circle('dbb30000-0000-4000-8000-000000000001');
  RESET ROLE;
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  IF _r.approval <> 'approved' OR _r.expires_at IS NULL OR NOT _circle THEN
    RAISE EXCEPTION 'FAIL — المشرف المعتمد لم يُقبل باعتماده أو بلا أجل: % %', _r.approval, _r.expires_at;
  END IF;
  RAISE NOTICE 'PASS — CP-01: المشرف المعتمد يدخل باعتماده، ولدوره أجل';
END $$;

-- (٧) وإنهاء الدور له أثر.
DO $$
DECLARE _role UUID := current_setting('tb.mentor_role')::uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM public.end_enrollment_role(_role, 'انتهت المهمّة');
  RESET ROLE;
  IF (SELECT ended_at FROM public.enrollment_roles WHERE id = _role) IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.audit_log
                     WHERE action = 'enrollment_role.ended' AND entity_id = _role) THEN
    RAISE EXCEPTION 'FAIL — CP-01: إنهاء الدور بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — CP-01: إنهاء الدور يُسجَّل';
END $$;

-- (٨) وتغيير الوليّ — ولو من الإدارة — يُسجَّل.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  UPDATE public.orphans SET guardian_id = 'dbb00000-0000-4000-8000-000000000007'
   WHERE id = 'dbb30000-0000-4000-8000-000000000002';
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'orphan.guardian_changed'
                    AND entity_id = 'dbb30000-0000-4000-8000-000000000002'
                    AND actor_id = 'dbb00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — DB-02: تغيير الوليّ بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — DB-02: تغيير الوليّ يُسجَّل بفاعله';
END $$;


-- =====================================================================
-- CP-02 + DB-01 — سحبُ الوليّ لا تنقضه الجهة، ولا يُزوَّر من وافق
-- =====================================================================
DO $$
DECLARE _ok BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  PERFORM public.guardian_set_photo_consent('dbb30000-0000-4000-8000-000000000001', 'withdrawn');
  RESET ROLE;

  -- الاستغلال كما رآه المدقّق: الجهة تعيد «موافقة» بنصٍّ حرّ وصورةٍ وتنسبها للوليّ.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.orphans
       SET photo_consent = 'granted', photo_consent_doc = 'e-consent:forged',
           photo_consent_by = 'dbb00000-0000-4000-8000-000000000004',
           photo_url = 'dbb30000-0000-4000-8000-000000000001/face.jpg'
     WHERE id = 'dbb30000-0000-4000-8000-000000000001';
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok OR (SELECT photo_consent FROM public.orphans
                  WHERE id = 'dbb30000-0000-4000-8000-000000000001') <> 'withdrawn' THEN
    RAISE EXCEPTION 'FAIL — CP-02: الجهة نقضت سحب الوليّ بكتابةٍ مباشرة';
  END IF;

  -- ولا عبر الدالّة ولو بوثيقةٍ موثَّقة: السحب يلتزم حتى يعود الوليّ أو تقرّر الإدارة.
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    PERFORM public.record_photo_consent('dbb30000-0000-4000-8000-000000000001', 'granted',
              'dbb50000-0000-4000-8000-000000000003', NULL);
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — CP-02: الجهة أعادت الموافقة بعد سحب الوليّ';
  END IF;
  RAISE NOTICE 'PASS — CP-02: سحب الوليّ لا تنقضه الجهة — لا مباشرةً ولا بالدالّة';
END $$;

DO $$
DECLARE _o public.orphans;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.record_photo_consent('dbb30000-0000-4000-8000-000000000001', 'face_hidden',
            'dbb50000-0000-4000-8000-000000000003', NULL);
  RESET ROLE;
  SELECT * INTO _o FROM public.orphans WHERE id = 'dbb30000-0000-4000-8000-000000000001';
  IF _o.photo_consent <> 'face_hidden'
     OR _o.photo_consent_by IS DISTINCT FROM 'dbb00000-0000-4000-8000-000000000001'::uuid
     OR _o.photo_consent_doc IS DISTINCT FROM 'doc:dbb50000-0000-4000-8000-000000000003'
     OR NOT EXISTS (SELECT 1 FROM public.audit_log
                     WHERE action = 'orphan.photo_consent'
                       AND entity_id = 'dbb30000-0000-4000-8000-000000000001'
                       AND actor_id = 'dbb00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL — CP-02: قرار الإدارة بعد السحب بلا وثيقةٍ أو فاعلٍ أو أثر: %', to_jsonb(_o);
  END IF;
  RAISE NOTICE 'PASS — CP-02: الإدارة وحدها تعيد الموافقة بعد السحب، بوثيقةٍ موثَّقة وبأثر';
END $$;

-- DB-01: من راجع ومن وافق لا تكتبه الجهة.
DO $$
DECLARE _blocked INTEGER := 0;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.orphans SET reviewed_by = 'dbb00000-0000-4000-8000-000000000001',
                              reviewed_at = now()
     WHERE id = 'dbb30000-0000-4000-8000-000000000003';
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _blocked := _blocked + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.orphans SET photo_consent = 'face_hidden',
                              photo_consent_by = 'dbb00000-0000-4000-8000-000000000004'
     WHERE id = 'dbb30000-0000-4000-8000-000000000003';
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _blocked := _blocked + 1;
  END;
  IF _blocked <> 2 THEN
    RAISE EXCEPTION 'FAIL — DB-01: الجهة تكتب المراجِع أو صاحب الموافقة بنفسها';
  END IF;
  RAISE NOTICE 'PASS — DB-01: reviewed_by وphoto_consent_* لا تُكتب مباشرةً';
END $$;

-- والموافقة التي توثّقها الجهة تحتاج وثيقةً وثّقتها الإدارة، ويُكتب فاعلها الحقيقي.
DO $$
DECLARE _ok BOOLEAN := false; _o public.orphans;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    PERFORM public.record_photo_consent('dbb30000-0000-4000-8000-000000000003', 'granted',
              'dbb50000-0000-4000-8000-000000000006', NULL);
    RESET ROLE;
  EXCEPTION WHEN check_violation THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — DB-01: موافقة صورةٍ كاملة بوثيقةٍ لم توثّقها الإدارة';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM public.record_photo_consent('dbb30000-0000-4000-8000-000000000003', 'granted',
            'dbb50000-0000-4000-8000-000000000005', NULL);
  RESET ROLE;
  SELECT * INTO _o FROM public.orphans WHERE id = 'dbb30000-0000-4000-8000-000000000003';
  IF _o.photo_consent <> 'granted'
     OR _o.photo_consent_by IS DISTINCT FROM 'dbb00000-0000-4000-8000-000000000002'::uuid
     OR _o.photo_consent_doc IS DISTINCT FROM 'doc:dbb50000-0000-4000-8000-000000000005' THEN
    RAISE EXCEPTION 'FAIL — DB-01: الموافقة المسجَّلة لا تحمل وثيقتها وفاعلها: %', to_jsonb(_o);
  END IF;
  RAISE NOTICE 'PASS — DB-01: موافقة الجهة بوثيقةٍ موثَّقة، وفاعلها من الجلسة لا من الطلب';
END $$;

-- وإذن الالتحاق لوليٍّ له حساب: يوافق هو بنفسه، لا تكتبه الجهة عنه.
DO $$
DECLARE _role UUID; _ok BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _role := public.assign_enrollment_role('dbb40000-0000-4000-8000-000000000001', 'guardian',
             NULL, 'tb-account-guardian@example.test', NULL, NULL);
  BEGIN
    PERFORM public.record_enrollment_consent(_role, 'ورقة موقّعة');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok OR (SELECT consent_at FROM public.enrollment_roles WHERE id = _role) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — DB-01: الجهة كتبت إذن وليٍّ له حسابٌ نيابةً عنه';
  END IF;
  RAISE NOTICE 'PASS — DB-01: إذن الوليّ صاحب الحساب لا تكتبه الجهة عنه';
END $$;


-- =====================================================================
-- CP-06 — لا اعتماد بلا شهادة وفاةٍ وإثبات وصايةٍ موثَّقين
-- =====================================================================
DO $$
DECLARE _ok BOOLEAN := false; _anon JSONB;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    PERFORM public.review_orphan('dbb30000-0000-4000-8000-000000000002', 'approved', NULL, NULL);
    RESET ROLE;
  EXCEPTION WHEN check_violation THEN RESET ROLE; _ok := true;
  END;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  _anon := public.orphan_view('dbb30000-0000-4000-8000-000000000002');
  RESET ROLE;
  IF NOT _ok OR _anon <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — CP-06: ملفٌّ بلا وثيقةٍ واحدة اعتُمد ونُشر';
  END IF;

  -- ولا الاعتماد المباشر بالجدول.
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    UPDATE public.orphans SET status = 'approved'
     WHERE id = 'dbb30000-0000-4000-8000-000000000002';
    RESET ROLE;
  EXCEPTION WHEN check_violation THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — CP-06: الاعتماد المباشر بالجدول يلتفّ على شرط الوثائق';
  END IF;
  RAISE NOTICE 'PASS — CP-06: لا يُعتمد ملفٌّ بلا وثائق — لا بالدالّة ولا بالجدول';
END $$;

DO $$
DECLARE _ok BOOLEAN := false;
BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('orphan-documents', 'dbb30000-0000-4000-8000-000000000002/death.pdf'),
    ('orphan-documents', 'dbb30000-0000-4000-8000-000000000002/guardianship.pdf');
  INSERT INTO public.orphan_documents (id, orphan_id, doc_type, kind, storage_path, file_name)
  VALUES ('dbb50000-0000-4000-8000-000000000021', 'dbb30000-0000-4000-8000-000000000002',
          'death_certificate', 'death_certificate',
          'dbb30000-0000-4000-8000-000000000002/death.pdf', 'death.pdf'),
         ('dbb50000-0000-4000-8000-000000000022', 'dbb30000-0000-4000-8000-000000000002',
          'guardianship_proof', 'guardianship_proof',
          'dbb30000-0000-4000-8000-000000000002/guardianship.pdf', 'guardianship.pdf');

  -- مرفوعةٌ لم تُفتح: لا تكفي.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    PERFORM public.review_orphan('dbb30000-0000-4000-8000-000000000002', 'approved', NULL, NULL);
    RESET ROLE;
  EXCEPTION WHEN check_violation THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — CP-06: وثائق لم توثّقها الإدارة كفت للاعتماد';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM public.verify_document('dbb50000-0000-4000-8000-000000000021', true, NULL);
  PERFORM public.verify_document('dbb50000-0000-4000-8000-000000000022', true, NULL);
  PERFORM public.review_orphan('dbb30000-0000-4000-8000-000000000002', 'approved', NULL, NULL);
  RESET ROLE;
  IF (SELECT status FROM public.orphans WHERE id = 'dbb30000-0000-4000-8000-000000000002') <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — CP-06: الملفّ الموثَّق لم يُعتمد';
  END IF;
  RAISE NOTICE 'PASS — CP-06: بعد توثيق شهادة الوفاة وإثبات الوصاية يُعتمد الملفّ';
END $$;


-- =====================================================================
-- DB-07 + CP-10 — ما يُعدَّل بعد الاعتماد يعود للمراجعة ويغيب عن العموم
-- =====================================================================
DO $$
DECLARE _anon JSONB; _st TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  UPDATE public.orphans SET display_name = 'Ardit Hoxha, Rruga e Kavajës 12'
   WHERE id = 'dbb30000-0000-4000-8000-000000000002';
  RESET ROLE;

  SELECT status::text INTO _st FROM public.orphans WHERE id = 'dbb30000-0000-4000-8000-000000000002';
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  _anon := public.orphan_view('dbb30000-0000-4000-8000-000000000002');
  RESET ROLE;
  IF _st NOT IN ('submitted', 'under_review') OR _anon <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — CP-10: اسمٌ وعنوانٌ لم يُراجعا نُشرا فوراً (status=%)', _st;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'orphan.sent_back_to_review'
                    AND entity_id = 'dbb30000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL — DB-07: الإعادة للمراجعة بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — CP-10: تعديل الاسم بعد الاعتماد يُعيد الملفّ للمراجعة ويحجبه عن العموم';
END $$;

-- والطفل المكفول: القصّة والمدينة تعودان للمراجعة أيضاً.
DO $$
DECLARE _st TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  UPDATE public.orphans SET story = 'rewritten after approval', city = 'حيٌّ جديد'
   WHERE id = 'dbb30000-0000-4000-8000-000000000003';
  RESET ROLE;
  SELECT status::text INTO _st FROM public.orphans WHERE id = 'dbb30000-0000-4000-8000-000000000003';
  IF _st NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'FAIL — DB-07: قصّة طفلٍ مكفول أُعيدت كتابتها وبقيت معتمدة (%)', _st;
  END IF;
  RAISE NOTICE 'PASS — DB-07: تعديل قصّة الطفل المكفول ومدينته يعيده للمراجعة';
END $$;

-- والصورة من خارج خزنة المنصّة لا تُقبل (تتبّعُ الزائرين).
DO $$
DECLARE _ok BOOLEAN := false;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.orphans SET photo_url = 'https://evil.example/x.jpg'
     WHERE id = 'dbb30000-0000-4000-8000-000000000003';
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — DB-07: صورةٌ من نطاقٍ خارجيّ قُبلت';
  END IF;
  RAISE NOTICE 'PASS — DB-07: الصورة من خزنة المنصّة وحدها';
END $$;

-- والتقرير المعتمد: تعديله يعيده للمراجعة، ولا يصل الكافلَ النصُّ الجديد.
DO $$
DECLARE _st TEXT; _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  UPDATE public.progress_reports SET summary = 'Text the admin never reviewed'
   WHERE id = 'dbb60000-0000-4000-8000-000000000001';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000006","role":"authenticated"}', true);
  _j := public.orphan_progress_reports('dbb30000-0000-4000-8000-000000000003');
  RESET ROLE;
  SELECT status::text INTO _st FROM public.progress_reports
   WHERE id = 'dbb60000-0000-4000-8000-000000000001';
  IF _st <> 'submitted' OR _j::text LIKE '%never reviewed%' THEN
    RAISE EXCEPTION 'FAIL — DB-07: تقريرٌ معتمد عُدّل فوصل الكافل بلا مراجعة (status=%)', _st;
  END IF;
  RAISE NOTICE 'PASS — DB-07: تعديل التقرير المعتمد يعيده للمراجعة ويحجبه عن الكافل';
END $$;


-- =====================================================================
-- GAP-03 — تفعيل الكفالة وتسجيل الصرف من الإدارة يتركان أثراً
-- =====================================================================
DO $$
DECLARE _s UUID; _d UUID;
BEGIN
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status)
  VALUES ('dbb00000-0000-4000-8000-000000000006', 'dbb30000-0000-4000-8000-000000000001',
          10, 'USD', 'pending_payment')
  RETURNING id INTO _s;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  UPDATE public.sponsorships SET status = 'active' WHERE id = _s;
  INSERT INTO public.disbursements (org_id, orphan_id, amount, currency, status)
  VALUES ('dbb20000-0000-4000-8000-00000000000a', 'dbb30000-0000-4000-8000-000000000001',
          10, 'USD', 'transferred')
  RETURNING id INTO _d;
  UPDATE public.disbursements SET amount = 99 WHERE id = _d;
  RESET ROLE;

  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'sponsorship.status_changed' AND entity_id = _s
                    AND actor_id = 'dbb00000-0000-4000-8000-000000000001'
                    AND meta->>'from' = 'pending_payment' AND meta->>'to' = 'active') THEN
    RAISE EXCEPTION 'FAIL — GAP-03: الإدارة فعّلت كفالةً بلا دفعٍ ولا أثر';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'disbursement.created' AND entity_id = _d
                    AND actor_id = 'dbb00000-0000-4000-8000-000000000001')
     OR NOT EXISTS (SELECT 1 FROM public.audit_log
                     WHERE action = 'disbursement.updated' AND entity_id = _d
                       AND meta->'changes'->'amount'->>'to' = '99.00') THEN
    RAISE EXCEPTION 'FAIL — GAP-03: صرفٌ سُجّل أو عُدّل بلا أثر';
  END IF;
  RAISE NOTICE 'PASS — GAP-03: تفعيل الكفالة وإنشاء الصرف وتعديله تُسجَّل بفاعلها';
END $$;


-- =====================================================================
-- DB-05 — الإثبات ملفٌّ موجود، والموثَّق لا يُستبدل ولا يُحذف
-- =====================================================================
DO $$
DECLARE _ok BOOLEAN := false; _st TEXT;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    PERFORM public.confirm_disbursement_delivery('dbb70000-0000-4000-8000-000000000001',
              'dbb30000-0000-4000-8000-000000000003/does-not-exist.pdf', NULL);
    RESET ROLE;
  EXCEPTION WHEN no_data_found THEN RESET ROLE; _ok := true;
  END;
  SELECT status INTO _st FROM public.disbursements WHERE id = 'dbb70000-0000-4000-8000-000000000001';
  IF NOT _ok OR _st <> 'transferred' THEN
    RAISE EXCEPTION 'FAIL — DB-05: وصولٌ «موثَّق» بملفٍّ غير موجود (status=%)', _st;
  END IF;

  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('orphan-documents', 'dbb30000-0000-4000-8000-000000000003/delivery.pdf', '{"eTag":"d1"}');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM public.confirm_disbursement_delivery('dbb70000-0000-4000-8000-000000000001',
            'dbb30000-0000-4000-8000-000000000003/delivery.pdf', NULL);
  -- ثم تحاول محوه أو استبداله.
  DELETE FROM storage.objects
   WHERE bucket_id = 'orphan-documents'
     AND name = 'dbb30000-0000-4000-8000-000000000003/delivery.pdf';
  UPDATE storage.objects SET metadata = '{"eTag":"swapped"}'
   WHERE bucket_id = 'orphan-documents'
     AND name = 'dbb30000-0000-4000-8000-000000000003/delivery.pdf';
  RESET ROLE;
  IF (SELECT metadata->>'eTag' FROM storage.objects
       WHERE name = 'dbb30000-0000-4000-8000-000000000003/delivery.pdf') IS DISTINCT FROM 'd1'
     OR (SELECT delivery_proof_etag FROM public.disbursements
          WHERE id = 'dbb70000-0000-4000-8000-000000000001') IS DISTINCT FROM 'd1' THEN
    RAISE EXCEPTION 'FAIL — DB-05: إثبات الوصول حُذف أو استُبدل بعد التأكيد';
  END IF;
  RAISE NOTICE 'PASS — DB-05: الإثبات يجب أن يكون موجوداً، ويُجمَّد بعد التأكيد مع بصمته';
END $$;

DO $$
DECLARE _ok BOOLEAN := false; _left INTEGER;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    UPDATE public.orphan_documents
       SET storage_path = 'dbb30000-0000-4000-8000-000000000001/draft.pdf'
     WHERE id = 'dbb50000-0000-4000-8000-000000000001';
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; _ok := true;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — DB-05: وثيقةٌ موثَّقة أُعيد توجيهها إلى ملفٍّ آخر';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"dbb00000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  DELETE FROM storage.objects
   WHERE bucket_id = 'orphan-documents'
     AND name IN ('dbb30000-0000-4000-8000-000000000001/death.pdf',
                  'dbb30000-0000-4000-8000-000000000001/draft.pdf');
  UPDATE storage.objects SET metadata = '{"eTag":"overwritten"}'
   WHERE bucket_id = 'orphan-documents'
     AND name = 'dbb30000-0000-4000-8000-000000000001/guardianship.pdf';
  RESET ROLE;

  IF NOT EXISTS (SELECT 1 FROM storage.objects
                  WHERE name = 'dbb30000-0000-4000-8000-000000000001/death.pdf')
     OR (SELECT metadata->>'eTag' FROM storage.objects
          WHERE name = 'dbb30000-0000-4000-8000-000000000001/guardianship.pdf') <> 'e2' THEN
    RAISE EXCEPTION 'FAIL — DB-05: شهادةٌ موثَّقة حُذفت أو استُبدلت في الخزنة';
  END IF;
  -- والمسوّدة غير الموثَّقة تبقى للجهة تحذفها: التجميد للموثَّق وحده.
  SELECT count(*) INTO _left FROM storage.objects
   WHERE name = 'dbb30000-0000-4000-8000-000000000001/draft.pdf';
  IF _left <> 0 THEN
    RAISE EXCEPTION 'FAIL — DB-05: التجميد امتدّ إلى ما لم يُوثَّق';
  END IF;
  RAISE NOTICE 'PASS — DB-05: الوثيقة الموثَّقة لا يُغيَّر مسارها ولا يُحذف ملفّها ولا يُستبدل';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص الثقة والمساءلة اجتازت ──'; END $$;
ROLLBACK;
