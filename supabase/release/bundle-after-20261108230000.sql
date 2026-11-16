-- ملف نشر كهاتين — كل الهجرات بعد 20261108230000
-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: 2026-11-16T05:16Z
BEGIN;

-- >>> migration 20261116100000 reconcile_live_drizzle
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261116100000') THEN
    RAISE EXCEPTION 'الهجرة 20261116100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- مصالحة ما طبّقه Lovable على البثّ (drizzle 0003 و0004) مع المرحلة صفر
-- ---------------------------------------------------------------------
-- طبّق Lovable على البثّ مباشرةً، خارج هذه السلسلة:
--   0003  دعم التأهيل والدعم العيني لدول شبكة WAMY: عمود
--         `countries.in_network`، و`support_catalog` و`create_support_pledge`
--         يقبلان الدولة المفعّلة **أو** دولة الشبكة.
--   0004  حصر «من يشرف على هذا الالتحاق» بمن يحقّ له: المشرف نفسه أو
--         الإدارة أو من يرى رحلة الطفل؛ والدوالّ التي تحتاج الجواب للحساب
--         (البطاقة، الدليل، الاقتراح، التقويم) تسأل نسخةً داخليةً مغلقة.
--         وأغلق معه شهادة المشرف عن الزائر؛ وهي بلا هوية ومقصودةٌ له،
--         فتعود عامّة هنا ويبقى المعرّف وحده محصوراً.
--
-- وحزمة المرحلة صفر (20261106110000 و20261106120000) تعيد تعريف
-- `support_catalog` و`enrollment_supervisor` و`enrollment_supervisor_standing`
-- ودوالّ تستدعيها — فتُسقط الاثنين: دول الشبكة تختفي من كتالوج الدعم،
-- واسم المشرف يعود يُقرأ لكلّ مسجَّل. فهنا يُجمع الطرفان:
--   - شرط المرحلة صفر: الدور معتمَد (`approval`) ولم ينقضِ أجله؛
--   - وشرط Lovable: القارئ له حقّ؛
--   - و`in_network` في الكتالوج مع حماية الحشد من المرحلة صفر.
-- كلّها `IF NOT EXISTS` و`CREATE OR REPLACE`، فتُطبَّق على قاعدةٍ بُنيت من
-- المستودع وعلى البثّ معاً.
-- =====================================================================

ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS in_network BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.countries.in_network IS
  'Country has a public WAMY presence (office or field) on the main map; qualification/in-kind support may target it.';


-- ١) الكتالوج: نسخة المرحلة صفر (حماية الحشد) + دول الشبكة
CREATE OR REPLACE FUNCTION public.support_catalog(_country TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH c AS (
    SELECT code, name_ar FROM public.countries
     WHERE (status = 'active' OR in_network) AND (_country IS NULL OR code = _country)
  ),
  safety AS (SELECT * FROM public.cohort_safety()),
  gstat AS (
    SELECT o.group_id,
           count(*) FILTER (WHERE o.status = 'approved') AS n,
           count(*) FILTER (WHERE NOT s.safe) AS unsafe
      FROM public.orphans o
      JOIN safety s ON s.orphan_id = o.id
     WHERE o.group_id IS NOT NULL
     GROUP BY o.group_id
  ),
  grp AS (
    SELECT g.id, g.name, g.country_code, g.region,
           COALESCE(gs.n, 0) AS n, COALESCE(gs.unsafe, 0) = 0 AS region_ok
      FROM public.mirror_groups g
      LEFT JOIN gstat gs ON gs.group_id = g.id
     WHERE g.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar) ORDER BY name_ar)
                             FROM c), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('country', r.country, 'name', r.region))
                           FROM (SELECT g.country_code AS country, g.region FROM grp g
                                  WHERE g.region IS NOT NULL AND g.region_ok
                                 UNION
                                 SELECT o.country_code, o.region FROM public.offices o
                                  WHERE o.active AND o.region IS NOT NULL) r
                          WHERE r.country IN (SELECT code FROM c)), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', g.id, 'name', g.name, 'country', g.country_code,
                          'region', CASE WHEN g.region_ok THEN g.region END,
                          'children', CASE WHEN g.n >= public.cohort_min() THEN g.n END)
                        ORDER BY g.name, g.id)
                          FROM grp g
                         WHERE g.country_code IN (SELECT code FROM c)), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'name', o.name, 'kind', k.label, 'country', o.country_code,
                          'region', o.region)
                        ORDER BY o.name)
                          FROM public.care_organizations o
                          LEFT JOIN public.institution_kinds k ON k.key = o.kind
                         WHERE o.status = 'approved' AND o.country_code IN (SELECT code FROM c)), '[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.support_catalog(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_catalog(TEXT) TO anon, authenticated;


-- ٢) التعهّد يقبل دولة الشبكة كما يعرضها الكتالوج (drizzle 0003)
DO $pledge$
DECLARE _def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.create_support_pledge(text,text,text,numeric,text,text,text,integer)');
  IF _def IS NOT NULL AND _def NOT LIKE '%in_network%' THEN
    _def := replace(_def, 'WHERE code = _cc AND status = ''active''',
                          'WHERE code = _cc AND (status = ''active'' OR in_network)');
    EXECUTE _def;
  END IF;
END $pledge$;
REVOKE ALL ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, INTEGER)
  TO authenticated;


-- ٣) المشرف: نسخةٌ داخلية للحساب، ونسخةٌ عامّة لمن يحقّ له
CREATE OR REPLACE FUNCTION public._enrollment_supervisor_any(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
     AND r.approval = 'approved' AND r.expires_at > now()
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public._enrollment_supervisor_any(UUID) FROM PUBLIC, anon, authenticated;

/* الدوالّ التي تحسب بالمشرف (البطاقة للزائر، الدليل، الاقتراح، التقويم،
   حارس المرحلة) تسأل النسخة الداخلية — وإلا صار «في برنامج تأهيل» لا
   يظهر للزائر، والتقويم يُرفض لمن لا يرى الرحلة. */
DO $callers$
DECLARE f REGPROCEDURE; _def TEXT;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname NOT IN ('enrollment_supervisor', '_enrollment_supervisor_any')
              AND p.prosrc ~ '(^|[^_a-z])enrollment_supervisor\('
  LOOP
    _def := pg_get_functiondef(f);
    _def := regexp_replace(_def, '(^|[^_a-z.])(public\.)?enrollment_supervisor\(',
                           '\1public._enrollment_supervisor_any(', 'g');
    EXECUTE _def;
  END LOOP;
END $callers$;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
     AND r.approval = 'approved' AND r.expires_at > now()
     AND auth.uid() IS NOT NULL
     AND (r.person_id = auth.uid() OR public.is_admin() OR public.can_see_qualification(e.orphan_id))
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_supervisor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor(UUID) TO authenticated;

/* والشهادة لا تحمل هويةً ولا رقماً — المستوى والاعتماد والاستقلالية وتاريخ
   الإسناد — وصُمّمت لتظهر على بطاقة الطفل قبل الكفالة
   (qualification-verification). فتبقى عامّةً بشرط الاعتماد، وما حُصر
   أعلاه هو معرّف المشرف وحده. */
CREATE OR REPLACE FUNCTION public.enrollment_supervisor_standing(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'assigned', true,
       'level', s.level,
       'certified', s.certified_at IS NOT NULL,
       'independent', s.independence_index >= public.supervisor_independence_threshold(),
       'since', r.assigned_at
     )
     FROM public.enrollment_roles r
     JOIN public.supervisor_profiles s ON s.user_id = r.person_id
     WHERE r.enrollment_id = _enrollment AND r.role = 'supervisor' AND r.ended_at IS NULL
       AND r.approval = 'approved' AND r.expires_at > now()
     LIMIT 1),
    jsonb_build_object('assigned', false)
  );
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_supervisor_standing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor_standing(UUID) TO anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116100000', 'reconcile_live_drizzle');

COMMIT;
