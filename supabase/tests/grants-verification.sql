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

-- =====================================================================
-- لقطة التصنيف — كلّ كائنٍ جديد يفشل هنا حتى يُصنَّف (مراجعة المرحلة صفر)
-- ---------------------------------------------------------------------
-- الفحوص أعلاه تلتقط أنماطاً بعينها (TRUNCATE، كتابة الزائر، الحذف،
-- التسلسلات) وقائمةً ثابتة من الدوالّ. فدالّةٌ `SECURITY DEFINER` جديدة
-- يُبقيها المنح الافتراضي مفتوحةً للزائر، أو جدولٌ جديد يُبقي SELECT/
-- INSERT/UPDATE للعموم معتمداً على RLS وحدها، كانا يمرّان. واللقطتان هنا
-- تُغلقان ذلك: أيّ فرقٍ — زيادةً أو نقصاً — يفشل ويُسمّى، فتُصنِّف الهجرة
-- الجديدة كائنها صراحةً (بالسحب والمنح)، ثم تُحدَّث اللقطة في المراجعة نفسها.
-- =====================================================================

-- دوالّ DEFINER التي ينفّذها الزائر — كلٌّ منها مقصودٌ له.
DO $$
DECLARE _allowed TEXT[] := ARRAY[
    -- ما يقرؤه الزائر: الدليل والخارطة والصفحة والكتالوج والترجمة
    'enrollment_supervisor_standing(uuid)',
    'geo_stats()',
    'list_orphan_cards(text,text,text,text,text,text,boolean,text,text,integer,integer,uuid)',
    'orphan_filter_options()',
    'orphan_funding_state(uuid)',
    'orphan_program_plan(uuid)',
    'orphan_qualification(uuid)',
    'orphan_trust(uuid)',
    'orphan_view(uuid)',
    'public_operating_links()', -- مجاميع الدول المتّصلة بالتشغيل لمنصة الرؤية (بلا صفوف)
    'public_offices_map()', -- مكاتب الندوة على الخريطة: الاسم والدولة والمدينة والفئة ووسم التجريبي (بلا أعضاء)
    'public_ui_locales()',
    'published_regions()',
    'published_ui_messages(text)',
    'sponsorship_pay_options(uuid)', -- عملات الدفع لملفٍّ منشور وسعرها المعروض (بلا بيانات طفل)
    'suggest_orphans_for_amount(numeric,uuid,integer)',
    'support_catalog(text)',
    'trait_model(text)',
    -- دوالّ مُشغّلات: لا تُستدعى إلا مُشغّلاً، فالتنفيذ المباشر يُرفض
    'anchor_invoice()',
    'block_sponsorship_in_emergency()',
    'guard_locked_money()',
    'guard_locked_orphan()',
    'guard_locked_scores()',
    'issue_invoice()',
    'lock_on_disbursement()',
    'lock_on_pledge()',
    'lock_on_sponsorship()',
    'ui_translation_log()',
    -- مساعداتٌ تُستدعى من سياسات أو دوالّ العموم، ولا تُعيد بيانات طفل
    'brand_name()',
    'cohort_is_safe(uuid)',
    'is_donor_owner(uuid)',
    'orphan_is_locked(uuid)',
    'pledge_in_office(uuid,uuid)',
    'resolve_country_code(text)',
    'unlock_context_allows(uuid,text)',
    'unsubscribe_by_token(uuid)'];
  _now TEXT[]; _extra TEXT; _gone TEXT;
BEGIN
  SELECT array_agg(p.oid::regprocedure::text ORDER BY 1) INTO _now
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  SELECT string_agg(f, ', ') INTO _extra FROM unnest(_now) f WHERE f <> ALL (_allowed);
  SELECT string_agg(f, ', ') INTO _gone FROM unnest(_allowed) f WHERE f <> ALL (_now);
  IF _extra IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — دالّة DEFINER مفتوحةٌ للزائر ولم تُصنَّف: %', _extra
      USING HINT = 'اسحبها من anon (REVOKE ALL ... FROM PUBLIC, anon) أو أضفها إلى القائمة بسبب.';
  END IF;
  IF _gone IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — دالّةٌ مقصودةٌ للزائر أُغلقت أو غاب اسمها: %', _gone;
  END IF;
  RAISE NOTICE 'PASS — DB-09: دوالّ DEFINER التي ينفّذها الزائر هي المصنَّفة وحدها (% دالّة)', cardinality(_now);
END $$;

-- صلاحيات anon وauthenticated على كلّ جدولٍ في public، جدولاً وعموداً.
-- السطر: الجدول|الدور|صلاحيات الجدول|صلاحيات الأعمدة حيث لا صلاحية جدول.
-- جدولٌ لا سطر له لا يملك العموم عليه شيئاً.
DO $$
DECLARE _expected TEXT[] := ARRAY[
    'access_request_messages|authenticated|SELECT|',
    'access_scope_packages|authenticated|SELECT|',
    'access_scopes|authenticated|SELECT|',
    'api_clients|authenticated|SELECT|',
    'api_import_jobs|authenticated|SELECT|',
    'audit_log|authenticated|SELECT|',
    'care_organizations|anon||SELECT(about,city,id,logo_url,name,region,status)',
    'care_organizations|authenticated|INSERT,SELECT,UPDATE|',
    'countries|anon|SELECT|',
    'countries|authenticated|DELETE,INSERT,SELECT,UPDATE|',
    'country_data_sources|authenticated|SELECT|',
    'data_conflicts|authenticated|SELECT|',
    'data_retention_policy|authenticated|SELECT|',
    'disbursements|authenticated|INSERT,SELECT,UPDATE|',
    'dispatch_runs|authenticated|SELECT|',
    'donor_entities|authenticated|SELECT,UPDATE|',
    'donor_members|authenticated|SELECT|',
    'enrollment_roles|authenticated|SELECT|',
    'enrollment_units|authenticated|SELECT|',
    'field_authority|authenticated|SELECT|',
    'guardian_e_consents|authenticated|SELECT|',
    'institution_kinds|anon|SELECT|',
    'institution_kinds|authenticated|DELETE,INSERT,SELECT,UPDATE|',
    'integrity_discrepancies|authenticated|SELECT|',
    'integrity_log|authenticated|SELECT|',
    'mirror_batches|authenticated|SELECT|',
    'mirror_groups|authenticated|SELECT|',
    'mirror_sync_state|authenticated|SELECT|',
    'money_issues|authenticated|SELECT|',
    'notification_prefs|authenticated|INSERT,SELECT,UPDATE|',
    'notifications|authenticated|SELECT|UPDATE(read_at)',
    'office_members|authenticated|DELETE,INSERT,SELECT,UPDATE|',
    'office_reports|authenticated|SELECT|',
    'office_roles|authenticated|DELETE,INSERT,SELECT,UPDATE|',
    'offices|authenticated|DELETE,INSERT,SELECT,UPDATE|',
    'operating_platforms|authenticated|INSERT,SELECT,UPDATE|',
    'ops_runs|authenticated|SELECT|',
    'orphan_access_requests|authenticated|SELECT|',
    'orphan_documents|authenticated|INSERT,SELECT,UPDATE|',
    'orphan_field_observations|authenticated|SELECT|',
    'orphan_field_state|authenticated|SELECT|',
    'orphan_locks|authenticated|SELECT|',
    'orphan_needs|authenticated|DELETE,INSERT,SELECT,UPDATE|',
    'orphan_pending_edits|authenticated|SELECT|',
    'orphan_private|authenticated|INSERT,SELECT,UPDATE|',
    'orphan_profile_sections|authenticated|SELECT|',
    'orphan_source_links|authenticated|SELECT|',
    'orphan_trait_scores|authenticated|SELECT|',
    'orphans|anon||SELECT(code,country,country_code,created_at,currency,display_name,funded_monthly,gender,id,monthly_need,status)',
    'orphans|authenticated|INSERT,UPDATE|SELECT(approved_at,code,country,country_code,created_at,currency,display_name,funded_monthly,gender,id,monthly_need,photo_consent,rejection_code,rejection_reason,status,updated_at)',
    'payment_events|authenticated|SELECT|',
    'platform_settings|authenticated|SELECT|',
    'pledge_deliveries|authenticated|SELECT|',
    'profiles|authenticated|INSERT,SELECT,UPDATE|',
    'program_enrollments|anon|SELECT|',
    'program_enrollments|authenticated|INSERT,SELECT,UPDATE|',
    'program_units|anon|SELECT|',
    'program_units|authenticated|SELECT|',
    'programs|anon|SELECT|',
    'programs|authenticated|SELECT|',
    'progress_reports|authenticated|INSERT,SELECT,UPDATE|',
    'qualification_concepts|anon|SELECT|',
    'qualification_concepts|authenticated|SELECT|',
    'qualification_traits|anon|SELECT|',
    'qualification_traits|authenticated|SELECT|',
    'source_link_queue|authenticated|SELECT|',
    'sponsorship_payments|authenticated|SELECT|',
    'sponsorships|authenticated|INSERT,SELECT,UPDATE|',
    'supervisor_profiles|authenticated|SELECT|',
    'support_pledges|authenticated|SELECT|',
    'timeline_events|authenticated|SELECT|',
    'trait_assessments|authenticated|SELECT|',
    'trait_definitions|anon|SELECT|',
    'trait_definitions|authenticated|SELECT|',
    'trait_dimensions|anon|SELECT|',
    'trait_dimensions|authenticated|SELECT|',
    'trait_score_revisions|authenticated|SELECT|',
    'ui_locale_reviewers|authenticated|SELECT|',
    'ui_locales|authenticated|SELECT|',
    'unlock_requests|authenticated|SELECT|',
    'user_roles|authenticated|SELECT|'];
  _now TEXT[]; _extra TEXT; _gone TEXT;
BEGIN
  WITH roles AS (SELECT unnest(ARRAY['anon', 'authenticated']) AS rol),
  tbl AS (
    SELECT c.relname, r.rol,
           (SELECT string_agg(p, ',' ORDER BY p)
              FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
             WHERE has_table_privilege(r.rol, c.oid, p)) AS tpriv,
           (SELECT string_agg(x, ';' ORDER BY x) FROM (
              SELECT p || '(' || string_agg(a.attname, ',' ORDER BY a.attname) || ')' AS x
                FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) p
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
               WHERE NOT has_table_privilege(r.rol, c.oid, p)
                 AND has_column_privilege(r.rol, c.oid, a.attname, p)
               GROUP BY p) s) AS cpriv
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     CROSS JOIN roles r
     WHERE c.relkind IN ('r', 'p')
  )
  SELECT array_agg(relname || '|' || rol || '|' || COALESCE(tpriv, '') || '|' || COALESCE(cpriv, '')
                   ORDER BY relname, rol)
    INTO _now
    FROM tbl WHERE tpriv IS NOT NULL OR cpriv IS NOT NULL;

  SELECT string_agg(x, E'\n  ') INTO _extra FROM unnest(_now) x WHERE x <> ALL (_expected);
  SELECT string_agg(x, E'\n  ') INTO _gone FROM unnest(_expected) x WHERE x <> ALL (_now);
  IF _extra IS NOT NULL OR _gone IS NOT NULL THEN
    RAISE EXCEPTION E'FAIL — صلاحيات الجداول تخالف اللقطة.\n زائدٌ أو تغيّر:\n  %\n غائب:\n  %',
      COALESCE(_extra, '—'), COALESCE(_gone, '—')
      USING HINT = 'صنِّف الجدول الجديد: REVOKE ALL ... FROM anon, authenticated ثم امنح المقصود، وحدّث اللقطة.';
  END IF;
  RAISE NOTICE 'PASS — DB-04/DB-09: صلاحيات العموم على الجداول مطابقةٌ للّقطة سطراً سطراً (% سطراً)',
    cardinality(_now);
END $$;

ROLLBACK;
