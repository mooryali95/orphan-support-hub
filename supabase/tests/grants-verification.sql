-- =====================================================================
-- الصلاحيات كما على البثّ — إثبات (DB-04 + DB-09)
-- ---------------------------------------------------------------------
-- قاعدة Supabase تمنح anon وauthenticated كلَّ شيء على أيّ جدولٍ أو
-- تسلسلٍ أو دالّةٍ تُنشأ في public. والمحاكاة (harness.sql) صارت تحمل
-- الصلاحيات الافتراضية نفسها، فما يمرّ هنا يمرّ هناك.
--
-- الفحص يقيس **الصلاحية** لا السياسة: سياسةٌ `FOR ALL` تسمح بالحذف،
-- فلا يحجبه إلا غيابُ المنح. وهذا بالضبط ما كان البثّ يفتقده.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- الفحص لا يقيس شيئاً إن لم تحمل المحاكاة الصلاحيات الافتراضية.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
       AND d.defaclacl::text LIKE '%anon=%') THEN
    RAISE EXCEPTION 'FAIL — المحاكاة بلا صلاحيات Supabase الافتراضية: الفحص لا يقيس البثّ';
  END IF;
  RAISE NOTICE 'PASS — المحاكاة تحمل صلاحيات Supabase الافتراضية على public';
END $$;

-- لا TRUNCATE ولا REFERENCES ولا TRIGGER لأحدٍ من العموم على أيّ جدول.
DO $$
DECLARE _bad TEXT;
BEGIN
  SELECT string_agg(format('%s:%s:%s', c.relname, r.rol, p.priv), ', ')
    INTO _bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r(rol)
   CROSS JOIN unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
   WHERE c.relkind IN ('r', 'p')
     AND has_table_privilege(r.rol, c.oid, p.priv);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — صلاحياتٌ لم تقصدها الهجرات: %', left(_bad, 400);
  END IF;
  RAISE NOTICE 'PASS — DB-09: لا TRUNCATE ولا REFERENCES ولا TRIGGER للعموم';
END $$;

-- الزائر لا يكتب في أيّ جدول.
DO $$
DECLARE _bad TEXT;
BEGIN
  SELECT string_agg(format('%s:%s', c.relname, p.priv), ', ')
    INTO _bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p(priv)
   WHERE c.relkind IN ('r', 'p')
     AND (has_table_privilege('anon', c.oid, p.priv)
          OR (p.priv <> 'DELETE' AND has_any_column_privilege('anon', c.oid, p.priv)));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — الزائر يكتب: %', left(_bad, 400);
  END IF;
  RAISE NOTICE 'PASS — DB-09: الزائر لا يملك كتابةً على أيّ جدول';
END $$;

-- والمسجَّل لا يحذف إلا حيث قصدت الهجرات (سياسات الإدارة والمكاتب والاحتياج).
DO $$
DECLARE _bad TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO _bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind IN ('r', 'p')
     AND has_table_privilege('authenticated', c.oid, 'DELETE')
     AND c.relname NOT IN ('countries', 'institution_kinds', 'office_members',
                           'office_roles', 'offices', 'orphan_needs');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — المسجَّل يحذف من: %', left(_bad, 400);
  END IF;
  RAISE NOTICE 'PASS — DB-04: المسجَّل لا يحذف إلا من الجداول الستّة المقصودة';
END $$;

-- الاستغلال نفسه: مالك الجهة يحذف تسجيلاً مموَّلاً وهوية الطفل.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('db400000-0000-4000-8000-000000000002', 'g-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('db400000-0000-4000-8000-00000000000a',
        'db400000-0000-4000-8000-000000000002', 'جهة الصلاحيات', 'approved');
INSERT INTO public.orphans (id, code, display_name, org_id, created_by, monthly_need, status)
VALUES ('db400000-0000-4000-8000-00000000000b', 'GR-1', 'طفل . ص',
        'db400000-0000-4000-8000-00000000000a', 'db400000-0000-4000-8000-000000000002',
        100, 'approved');
INSERT INTO public.orphan_private (orphan_id, full_name, national_id)
VALUES ('db400000-0000-4000-8000-00000000000b', 'Real Name', 'NID-9');

DO $$
DECLARE _t TEXT; _blocked INTEGER := 0;
BEGIN
  FOREACH _t IN ARRAY ARRAY['orphan_private', 'program_enrollments', 'enrollment_roles',
                            'progress_reports', 'orphan_documents', 'sponsorships'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims',
        '{"sub":"db400000-0000-4000-8000-000000000002","role":"authenticated"}', true);
      EXECUTE format('DELETE FROM public.%I', _t);
      RESET ROLE;
      RAISE EXCEPTION 'FAIL — مالك الجهة يحذف من %', _t;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      _blocked := _blocked + 1;
    END;
  END LOOP;
  IF (SELECT count(*) FROM public.orphan_private
       WHERE orphan_id = 'db400000-0000-4000-8000-00000000000b') <> 1 THEN
    RAISE EXCEPTION 'FAIL — حُذفت هوية الطفل';
  END IF;
  RAISE NOTICE 'PASS — DB-04: مالك الجهة لا يحذف الهوية ولا التسجيل ولا الأدوار ولا التقارير (% جداول)', _blocked;
END $$;

-- رقم الفاتورة لا يُحرق من الخارج، وتسلسلاته مغلقة.
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.next_invoice_no(now());
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — الزائر يحرق أرقام الفواتير';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM nextval('public.invoice_seq');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — المسجَّل يستهلك تسلسل الفواتير';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  RAISE NOTICE 'PASS — DB-09: next_invoice_no وتسلسلها مغلقان على العموم';
END $$;

DO $$
DECLARE _bad TEXT;
BEGIN
  SELECT string_agg(format('%s:%s', c.relname, r.rol), ', ')
    INTO _bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r(rol)
   WHERE c.relkind = 'S'
     AND (has_sequence_privilege(r.rol, c.oid, 'UPDATE')
          OR has_sequence_privilege(r.rol, c.oid, 'SELECT')
          OR (has_sequence_privilege(r.rol, c.oid, 'USAGE')
              AND NOT (r.rol = 'authenticated' AND c.relname = 'orphan_code_seq')));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — تسلسلاتٌ مفتوحة: %', _bad;
  END IF;
  RAISE NOTICE 'PASS — DB-09: التسلسلات مغلقة إلا رمز الملفّ للمسجَّل (يستهلكه start_orphan_draft)';
END $$;

-- جداول live-part4 السبعة عشر: لا شيء للزائر في الجهات المانحة والمكاتب والتعهّدات.
DO $$
DECLARE _t TEXT; _bad TEXT := '';
BEGIN
  FOREACH _t IN ARRAY ARRAY['donor_entities', 'donor_members', 'office_members', 'office_reports',
                            'support_pledges', 'pledge_deliveries', 'guardian_e_consents',
                            'mirror_sync_state', 'mirror_groups', 'orphan_trait_scores'] LOOP
    IF has_table_privilege('anon', ('public.' || _t)::regclass,
                           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege('anon', ('public.' || _t)::regclass, 'SELECT,INSERT,UPDATE') THEN
      _bad := _bad || _t || ' ';
    END IF;
  END LOOP;
  IF _bad <> '' THEN
    RAISE EXCEPTION 'FAIL — الزائر يملك صلاحيةً على: %', _bad;
  END IF;
  IF has_table_privilege('authenticated', 'public.donor_entities', 'INSERT,DELETE')
     OR has_table_privilege('authenticated', 'public.support_pledges', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'FAIL — المسجَّل يكتب مباشرةً في الجهات المانحة أو التعهّدات';
  END IF;
  RAISE NOTICE 'PASS — DB-09: منح live-part4 صار هجرة — الزائر بلا صلاحية على جداول الإصدار';
END $$;

-- والدوالّ: ما قصدته الهجرات للمسجَّل وحده لا يصل الزائر عبر المنح الافتراضي.
DO $$
DECLARE _f TEXT; _bad TEXT := '';
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'public.owns_org(uuid)', 'public.can_manage_orphan(uuid)', 'public.sponsors_orphan(uuid)',
    'public.can_view_orphan_detail(uuid)', 'public.my_orphan_scopes(uuid)',
    'public.request_orphan_access(uuid,text)', 'public.org_orphans()',
    'public.orphan_progress_reports(uuid)'] LOOP
    IF has_function_privilege('anon', _f::regprocedure, 'EXECUTE') THEN
      _bad := _bad || _f || ' ';
    END IF;
  END LOOP;
  IF _bad <> '' THEN
    RAISE EXCEPTION 'FAIL — الزائر ينفّذ دوالّ المسجَّلين: %', _bad;
  END IF;
  -- وما قُصد للعموم يبقى لهم: الدليل والخارطة لا يُغلقان.
  IF NOT has_function_privilege('anon', 'public.geo_stats()', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.orphan_view(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — أُغلق ما قُصد للزائر (الخارطة أو صفحة الطفل)';
  END IF;
  RAISE NOTICE 'PASS — DB-09: دوالّ المسجَّلين مغلقةٌ على الزائر، ودوالّ الدليل مفتوحة';
END $$;

ROLLBACK;
