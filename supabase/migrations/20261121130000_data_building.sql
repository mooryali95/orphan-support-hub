-- =====================================================================
-- بناء البيانات من لوحة الإدارة — الدول، والمناطق، والأشخاص، والمجموعات
-- ---------------------------------------------------------------------
-- ما كان ناقصاً:
--   • المنطقة نصٌّ حرّ على الطفل، ولا سجلّ لمناطق الدولة يُختار منه.
--   • الإدارة لا تملك طريقاً لإدخال طفل: الإدخال للجهة المعتمدة وحدها
--     (`create_orphan_intake`) أو لمفتاح شريك (`import_orphan_record`)، وكلاهما
--     يقبل البلد نصّاً فيبقى الرمز رهن ما يُكتب.
--   • المجموعات تأتي من منصّة التشغيل وحدها (`mirror_groups.source` إلزامي)،
--     فدولةٌ بلا منصّة تشغيل لا مجموعات فيها.
--   • لا كشف للتكرار: الطفل نفسه يدخل من المرآة والاستيراد والإدخال اليدوي.
--
-- ما تضيفه هذه الهجرة:
--   1) `country_regions` — سجلّ مناطق الدولة. مغلقٌ على العموم؛ تقرؤه وتكتبه
--      دوالّ الإدارة وحدها.
--   2) مجموعةٌ محلّية: `mirror_groups.source` يقبل الفراغ. الفارغ = أنشأته
--      الإدارة هنا؛ وما له مصدر يبقى ملك منصّة تشغيله ولا يُعدَّل من هنا.
--   3) دوالّ الإدارة (كلّها SECURITY DEFINER، `search_path` مثبَّت، تفحص
--      `is_admin()`، ومسحوبة من PUBLIC و anon):
--        admin_data_overview, admin_regions, admin_save_region,
--        admin_seed_regions, admin_find_persons, admin_add_person,
--        admin_import_persons, admin_groups, admin_save_group,
--        admin_group_members, admin_set_group_member, admin_remove_group_member
--   4) قواعدها:
--        • البلد رمزٌ من سجلّ الدول، واسمه ورمزه يُكتبان معاً — لا نصّ حرّ.
--        • المنطقة من سجلّ مناطق تلك الدولة، بالاسم المعتمد فيه.
--        • العملة عملة الدولة، وإلا عملة المنصّة.
--        • المُدخَل لا يُنشر: يقف عند «مسودّة» (إن أُسند إلى جهة تكمله) أو
--          «قيد المراجعة»، والنشر بمسار المراجعة ووثائقه كما هو.
--        • التكرار المحتمل يُعاد للمستدعي قبل الكتابة، ولا يُكتب إلا بتأكيد.
--        • ما تملكه منصّة التشغيل (المجموعة والمنطقة لطفلٍ مرآوي) لا يُمسّ،
--          والملفّ المقفول لا يُمسّ (حارس `guard_locked_orphan` قائم).
--        • مراجع العرض التجريبي (try-/DEMO-) لا تدخل بياناتٍ حقيقية.
--
-- لا تغيّر صفاً قائماً، ولا تبذر دولةً ولا منطقة: البيانات تبنيها الإدارة من
-- اللوحة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) سجلّ المناطق
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.country_regions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  TEXT NOT NULL REFERENCES public.countries(code),
  name_ar       TEXT NOT NULL CHECK (btrim(name_ar) <> '' AND length(name_ar) <= 120),
  name_local    TEXT CHECK (name_local IS NULL OR length(name_local) <= 120),
  -- معرّف المنطقة في ملفّ الخارطة (`/geo/admin1/<الدولة>.json`) إن أتت منه.
  geo_id        TEXT CHECK (geo_id IS NULL OR length(geo_id) <= 40),
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, name_ar)
);
CREATE INDEX IF NOT EXISTS idx_country_regions_country ON public.country_regions(country_code, active);
ALTER TABLE public.country_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS country_regions_admin_read ON public.country_regions;
CREATE POLICY country_regions_admin_read ON public.country_regions FOR SELECT TO authenticated
  USING (public.is_admin());
-- لا منح للعموم: القراءة والكتابة عبر دوالّ الإدارة أدناه.
REVOKE ALL ON public.country_regions FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2) المجموعة المحلّية
-- ---------------------------------------------------------------------
ALTER TABLE public.mirror_groups ALTER COLUMN source DROP NOT NULL;
ALTER TABLE public.mirror_groups ADD COLUMN IF NOT EXISTS created_by UUID;


-- ---------------------------------------------------------------------
-- 3) أدوات داخلية (بلا منح)
-- ---------------------------------------------------------------------
/* تطبيع الاسم للمقارنة: بلا تشكيل ولا تطويل، والألف والياء والتاء المربوطة
   موحّدة، والمسافات مطويّة. يطابق `normalize` في src/lib/countries.ts بما يكفي
   لكشف التكرار. */
CREATE OR REPLACE FUNCTION public.data_entry_norm(_t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT btrim(regexp_replace(
    translate(
      regexp_replace(lower(COALESCE(_t, '')), '[\u064B-\u065F\u0670\u0640]', '', 'g'),
      'أإآٱىة', 'اااايه'),
    '\s+', ' ', 'g'));
$fn$;
REVOKE ALL ON FUNCTION public.data_entry_norm(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.data_entry_require_admin()
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.data_entry_require_admin() FROM PUBLIC, anon, authenticated;

/* اسم المنطقة المعتمد في سجلّ الدولة، أو NULL إن لم تُعرف. */
CREATE OR REPLACE FUNCTION public.data_entry_region(_country TEXT, _region TEXT)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT r.name_ar FROM public.country_regions r
   WHERE r.country_code = _country AND r.active
     AND (public.data_entry_norm(r.name_ar) = public.data_entry_norm(_region)
          OR public.data_entry_norm(r.name_local) = public.data_entry_norm(_region))
   ORDER BY (r.name_ar = btrim(_region)) DESC
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public.data_entry_region(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

/* هل الطفل ملك منصّة تشغيل (يُزامَن)؟ */
CREATE OR REPLACE FUNCTION public.data_entry_synced_source(_orphan UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT p.key FROM public.orphans o JOIN public.operating_platforms p ON p.key = o.external_source
   WHERE o.id = _orphan;
$fn$;
REVOKE ALL ON FUNCTION public.data_entry_synced_source(UUID) FROM PUBLIC, anon, authenticated;

/*
 * فحص صفّ شخص قبل الكتابة: أخطاؤه، وما يُشتقّ له (الدولة ورمزها وعملتها
 * والمنطقة المعتمدة)، والتنبيهات، والتكرارات المحتملة. لا يكتب شيئاً.
 */
CREATE OR REPLACE FUNCTION public.data_entry_check_person(_row JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  _errors TEXT[] := '{}'; _warnings TEXT[] := '{}';
  _name TEXT := btrim(COALESCE(_row->>'display_name', ''));
  _gender TEXT := lower(btrim(COALESCE(_row->>'gender', '')));
  _cc TEXT := upper(btrim(COALESCE(_row->>'country', '')));
  _region_in TEXT := NULLIF(btrim(COALESCE(_row->>'region', '')), '');
  _birth_in TEXT := NULLIF(btrim(COALESCE(_row->>'birth_date', '')), '');
  _need_in TEXT := NULLIF(btrim(COALESCE(_row->>'monthly_need', '')), '');
  _ref TEXT := NULLIF(btrim(COALESCE(_row->>'external_ref', '')), '');
  _full TEXT := NULLIF(btrim(COALESCE(_row->>'full_name', '')), '');
  _group_in TEXT := NULLIF(btrim(COALESCE(_row->>'group_id', '')), '');
  _org_in TEXT := NULLIF(btrim(COALESCE(_row->>'org_id', '')), '');
  _c_code TEXT; _c_name TEXT; _c_cur TEXT; _g_id UUID; _g_cc TEXT; _g_region TEXT; _g_source TEXT;
  _region TEXT; _birth DATE; _need NUMERIC(12,2) := 0;
  _group_id UUID; _org_id UUID; _dups JSONB;
BEGIN
  IF length(_name) < 2 OR length(_name) > 80 THEN _errors := array_append(_errors, 'name_required'); END IF;
  IF _gender NOT IN ('male', 'female') THEN _errors := array_append(_errors, 'gender_invalid'); END IF;

  IF _cc = '' THEN
    _errors := array_append(_errors, 'country_required');
  ELSE
    SELECT c.code, c.name_ar,
           COALESCE(c.currency, (SELECT upper(btrim(s.currency)) FROM public.platform_settings s WHERE s.id)) AS currency
      INTO _c_code, _c_name, _c_cur FROM public.countries c WHERE c.code = _cc;
    IF _c_code IS NULL THEN _errors := array_append(_errors, 'country_unknown'); END IF;
  END IF;

  IF _birth_in IS NOT NULL THEN
    IF _birth_in !~ '^\d{4}-\d{2}-\d{2}$' THEN
      _errors := array_append(_errors, 'birth_date_invalid');
    ELSE
      BEGIN
        _birth := _birth_in::date;
        IF _birth > current_date OR _birth < current_date - interval '30 years' THEN
          _errors := array_append(_errors, 'birth_date_invalid');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        _errors := array_append(_errors, 'birth_date_invalid');
      END;
    END IF;
  END IF;

  IF _need_in IS NOT NULL THEN
    IF _need_in !~ '^\d{1,6}(\.\d{1,2})?$' THEN
      _errors := array_append(_errors, 'need_invalid');
    ELSE
      _need := _need_in::numeric;
    END IF;
  END IF;

  -- مراجع العرض التجريبي لا تدخل بياناتٍ حقيقية.
  IF _ref ~* '^(try-|demo-)' OR _name ~* '^(try-\d+|demo-)' THEN
    _errors := array_append(_errors, 'demo_reference');
  END IF;
  IF _ref IS NOT NULL AND length(_ref) > 80 THEN _errors := array_append(_errors, 'reference_invalid'); END IF;

  IF _group_in IS NOT NULL THEN
    IF _group_in !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      _errors := array_append(_errors, 'group_unknown');
    ELSE
      SELECT g.id, g.country_code, g.region, g.source INTO _g_id, _g_cc, _g_region, _g_source
        FROM public.mirror_groups g WHERE g.id = _group_in::uuid AND g.deleted_at IS NULL;
      IF _g_id IS NULL THEN
        _errors := array_append(_errors, 'group_unknown');
      ELSIF _g_source IS NOT NULL THEN
        -- عضوية مجموعةٍ مرآوية تكتبها منصّة تشغيلها وحدها.
        _errors := array_append(_errors, 'group_synced');
      ELSIF _c_code IS NOT NULL AND _g_cc <> _c_code THEN
        _errors := array_append(_errors, 'group_country_mismatch');
      ELSE
        _group_id := _g_id;
      END IF;
    END IF;
  END IF;

  IF _org_in IS NOT NULL THEN
    IF _org_in !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM public.care_organizations o
                       WHERE o.id = _org_in::uuid AND o.status = 'approved') THEN
      _errors := array_append(_errors, 'org_unknown');
    ELSE
      _org_id := _org_in::uuid;
    END IF;
  END IF;

  IF _c_code IS NOT NULL THEN
    IF _region_in IS NOT NULL THEN
      _region := public.data_entry_region(_c_code, _region_in);
      IF _region IS NULL THEN _errors := array_append(_errors, 'region_unknown'); END IF;
    END IF;
    -- المنطقة تتبع المجموعة ما لم تُكتب؛ وإن كُتبت مخالفةً فتنبيهٌ ظاهر لا استبدال.
    IF _group_id IS NOT NULL AND _g_region IS NOT NULL THEN
      IF _region_in IS NULL THEN
        _region := _g_region;
        _warnings := array_append(_warnings, 'region_from_group');
      ELSIF _region IS NOT NULL AND _region <> _g_region THEN
        _warnings := array_append(_warnings, 'group_region_differs');
      END IF;
    END IF;
  END IF;

  -- التكرار المحتمل: المرجع نفسه، أو الاسم نفسه في الدولة، أو الاسم الكامل نفسه.
  IF _c_code IS NOT NULL AND length(_name) >= 2 THEN
    SELECT COALESCE(jsonb_agg(d ORDER BY (d->>'score')::int DESC), '[]'::jsonb) INTO _dups FROM (
      SELECT jsonb_build_object(
               'id', o.id, 'code', o.code, 'name', o.display_name, 'status', o.status,
               'region', o.region, 'source', o.external_source,
               'reasons', to_jsonb(array_remove(ARRAY[
                 CASE WHEN _ref IS NOT NULL AND o.external_ref = _ref THEN 'same_reference' END,
                 CASE WHEN public.data_entry_norm(o.display_name) = public.data_entry_norm(_name) THEN 'same_name' END,
                 CASE WHEN _full IS NOT NULL AND public.data_entry_norm(p.full_name) = public.data_entry_norm(_full)
                      THEN 'same_full_name' END,
                 CASE WHEN _birth IS NOT NULL AND o.birth_date = _birth THEN 'same_birth_date' END,
                 CASE WHEN _region IS NOT NULL AND o.region = _region THEN 'same_region' END], NULL)),
               'score',
                 (CASE WHEN _ref IS NOT NULL AND o.external_ref = _ref THEN 8 ELSE 0 END)
                 + (CASE WHEN public.data_entry_norm(o.display_name) = public.data_entry_norm(_name) THEN 2 ELSE 0 END)
                 + (CASE WHEN _full IS NOT NULL AND public.data_entry_norm(p.full_name) = public.data_entry_norm(_full) THEN 4 ELSE 0 END)
                 + (CASE WHEN _birth IS NOT NULL AND o.birth_date = _birth THEN 1 ELSE 0 END)
                 + (CASE WHEN _region IS NOT NULL AND o.region = _region THEN 1 ELSE 0 END)) AS d
        FROM public.orphans o
        LEFT JOIN public.orphan_private p ON p.orphan_id = o.id
       WHERE o.status <> 'archived'
         AND COALESCE(o.country_code, public.resolve_country_code(o.country)) = _c_code
         AND ((_ref IS NOT NULL AND o.external_ref = _ref)
              OR public.data_entry_norm(o.display_name) = public.data_entry_norm(_name)
              OR (_full IS NOT NULL AND public.data_entry_norm(p.full_name) = public.data_entry_norm(_full)))
       ORDER BY o.created_at DESC
       LIMIT 5) s;
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(_errors),
    'warnings', to_jsonb(_warnings),
    'duplicates', COALESCE(_dups, '[]'::jsonb),
    'country_code', _c_code,
    'country_name', _c_name,
    'currency', _c_cur,
    'region', _region,
    'birth_date', _birth,
    'monthly_need', _need,
    'group_id', _group_id,
    'org_id', _org_id);
END $fn$;
REVOKE ALL ON FUNCTION public.data_entry_check_person(JSONB) FROM PUBLIC, anon, authenticated;

/* الكتابة بعد الفحص. المُدخَل لا يُنشر أبداً من هنا. */
CREATE OR REPLACE FUNCTION public.data_entry_insert_person(_row JSONB, _check JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _id UUID; _code TEXT := public.next_orphan_code();
  _org UUID := NULLIF(_check->>'org_id', '')::uuid;
  _ref TEXT := NULLIF(btrim(COALESCE(_row->>'external_ref', '')), '');
  _status public.orphan_status;
BEGIN
  -- مع جهةٍ معتمدة: مسودّةٌ تكملها الجهة بوثائقها ثم تقدّمها. بلا جهة: قيد المراجعة.
  _status := CASE WHEN _org IS NOT NULL AND _ref IS NULL THEN 'draft' ELSE 'under_review' END;

  INSERT INTO public.orphans (
    code, org_id, created_by, display_name, gender, birth_date, city, region,
    country, country_code, education_stage, monthly_need, currency, status,
    group_id, external_source, external_ref
  ) VALUES (
    _code, _org, auth.uid(),
    btrim(_row->>'display_name'),
    lower(btrim(_row->>'gender')),
    NULLIF(_check->>'birth_date', '')::date,
    NULLIF(btrim(COALESCE(_row->>'city', '')), ''),
    NULLIF(_check->>'region', ''),
    _check->>'country_name',
    _check->>'country_code',
    NULLIF(btrim(COALESCE(_row->>'education_stage', '')), ''),
    COALESCE(NULLIF(_check->>'monthly_need', '')::numeric, 0),
    _check->>'currency',
    _status,
    NULLIF(_check->>'group_id', '')::uuid,
    CASE WHEN _ref IS NOT NULL THEN 'admin-entry' END,
    _ref
  ) RETURNING id INTO _id;

  IF COALESCE(NULLIF(btrim(COALESCE(_row->>'full_name', '')), ''),
              NULLIF(btrim(COALESCE(_row->>'guardian_name', '')), ''),
              NULLIF(btrim(COALESCE(_row->>'guardian_phone', '')), ''),
              NULLIF(btrim(COALESCE(_row->>'private_notes', '')), '')) IS NOT NULL THEN
    INSERT INTO public.orphan_private (orphan_id, full_name, guardian_name, guardian_phone, notes)
    VALUES (_id,
            NULLIF(btrim(COALESCE(_row->>'full_name', '')), ''),
            NULLIF(btrim(COALESCE(_row->>'guardian_name', '')), ''),
            NULLIF(btrim(COALESCE(_row->>'guardian_phone', '')), ''),
            NULLIF(btrim(COALESCE(_row->>'private_notes', '')), ''))
    ON CONFLICT (orphan_id) DO NOTHING;
  END IF;

  PERFORM public.write_audit('orphan.admin_entered', 'orphan', _id,
    jsonb_build_object('code', _code, 'country', _check->>'country_code', 'region', _check->>'region',
                       'group_id', _check->>'group_id', 'org_id', _org, 'reference', _ref));

  RETURN jsonb_build_object('id', _id, 'code', _code,
                            'status', (SELECT status FROM public.orphans WHERE id = _id));
END $fn$;
REVOKE ALL ON FUNCTION public.data_entry_insert_person(JSONB, JSONB) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4) الدول: نظرةٌ واحدة بحال كلّ دولة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_data_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.data_entry_require_admin();
  RETURN jsonb_build_object(
    'platform_currency', (SELECT upper(btrim(s.currency)) FROM public.platform_settings s WHERE s.id),
    'countries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'code', c.code, 'name_ar', c.name_ar, 'name_local', c.name_local,
          'status', c.status, 'in_network', c.in_network, 'currency', c.currency,
          'sort_order', c.sort_order,
          'regions', (SELECT count(*) FROM public.country_regions r WHERE r.country_code = c.code AND r.active),
          'children', (SELECT count(*) FROM public.orphans o
                        WHERE o.country_code = c.code AND o.status <> 'archived'),
          'published', (SELECT count(*) FROM public.orphans o
                         WHERE o.country_code = c.code AND o.status IN ('approved', 'fully_sponsored')),
          'groups', (SELECT count(*) FROM public.mirror_groups g
                      WHERE g.country_code = c.code AND g.deleted_at IS NULL),
          'offices', (SELECT count(*) FROM public.offices f WHERE f.country_code = c.code),
          'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'status', p.status)
                                                ORDER BY p.key)
                                 FROM public.operating_platforms p WHERE p.country_code = c.code), '[]'::jsonb))
        ORDER BY c.sort_order, c.name_ar)
      FROM public.countries c), '[]'::jsonb),
    -- أطفالٌ لم يُعرف رمز دولتهم من نصّها: يُرون هنا كي يُصحَّحوا.
    'unlinked_children', (SELECT count(*) FROM public.orphans o
                           WHERE o.country_code IS NULL AND o.status <> 'archived'));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_data_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_data_overview() TO authenticated;


-- ---------------------------------------------------------------------
-- 5) المناطق
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_regions(_country TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _cc TEXT := upper(btrim(COALESCE(_country, '')));
BEGIN
  PERFORM public.data_entry_require_admin();
  RETURN jsonb_build_object(
    'country', _cc,
    'regions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'name_ar', r.name_ar, 'name_local', r.name_local, 'geo_id', r.geo_id,
          'active', r.active, 'sort_order', r.sort_order,
          'children', (SELECT count(*) FROM public.orphans o
                        WHERE o.country_code = _cc AND o.region = r.name_ar AND o.status <> 'archived'),
          'groups', (SELECT count(*) FROM public.mirror_groups g
                      WHERE g.country_code = _cc AND g.region = r.name_ar AND g.deleted_at IS NULL))
        ORDER BY r.active DESC, r.sort_order, r.name_ar)
      FROM public.country_regions r WHERE r.country_code = _cc), '[]'::jsonb),
    -- مناطق مكتوبة على ملفّاتٍ ولا يعرفها السجلّ: تُضاف أو يُصحَّح اسمها.
    'unmatched', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', u.region, 'children', u.n) ORDER BY u.n DESC, u.region)
        FROM (SELECT o.region, count(*) AS n FROM public.orphans o
               WHERE o.country_code = _cc AND o.status <> 'archived' AND NULLIF(btrim(o.region), '') IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.country_regions r
                                  WHERE r.country_code = _cc AND r.name_ar = o.region)
               GROUP BY o.region) u), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_regions(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_regions(TEXT) TO authenticated;

/*
 * إضافة منطقة (`_id` فارغ) أو تعديلها. عند تغيير الاسم لا يُعاد تسمية ما على
 * الملفّات إلا بطلبٍ صريح (`_cascade`)، ويُستثنى منه ما تملكه منصّة تشغيل وما
 * هو مقفول؛ والناتج يقول كم نُقل وكم بقي.
 */
CREATE OR REPLACE FUNCTION public.admin_save_region(
  _id UUID, _country TEXT, _name_ar TEXT, _name_local TEXT DEFAULT NULL, _geo_id TEXT DEFAULT NULL,
  _active BOOLEAN DEFAULT true, _sort INTEGER DEFAULT NULL, _cascade BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _cc TEXT := upper(btrim(COALESCE(_country, '')));
  _name TEXT := btrim(COALESCE(_name_ar, ''));
  _old public.country_regions%ROWTYPE; _row_id UUID;
  _moved INTEGER := 0; _groups INTEGER := 0; _left INTEGER := 0;
BEGIN
  PERFORM public.data_entry_require_admin();
  IF _name = '' OR length(_name) > 120 THEN
    RAISE EXCEPTION 'region_name_required' USING ERRCODE = '22023';
  END IF;

  IF _id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc) THEN
      RAISE EXCEPTION 'country_unknown' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.country_regions r
                WHERE r.country_code = _cc AND public.data_entry_norm(r.name_ar) = public.data_entry_norm(_name)) THEN
      RAISE EXCEPTION 'region_exists' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.country_regions (country_code, name_ar, name_local, geo_id, active, sort_order, created_by)
    VALUES (_cc, _name, NULLIF(btrim(COALESCE(_name_local, '')), ''), NULLIF(btrim(COALESCE(_geo_id, '')), ''),
            COALESCE(_active, true), COALESCE(_sort, 100), auth.uid())
    RETURNING id INTO _row_id;
    PERFORM public.write_audit('region.created', 'country_region', _row_id,
      jsonb_build_object('country', _cc, 'name', _name));
    RETURN jsonb_build_object('id', _row_id, 'created', true);
  END IF;

  SELECT * INTO _old FROM public.country_regions WHERE id = _id FOR UPDATE;
  IF _old.id IS NULL THEN
    RAISE EXCEPTION 'region_unknown' USING ERRCODE = 'P0002';
  END IF;
  IF _name <> _old.name_ar AND EXISTS (
       SELECT 1 FROM public.country_regions r
        WHERE r.country_code = _old.country_code AND r.id <> _id
          AND public.data_entry_norm(r.name_ar) = public.data_entry_norm(_name)) THEN
    RAISE EXCEPTION 'region_exists' USING ERRCODE = '23505';
  END IF;

  UPDATE public.country_regions SET
    name_ar = _name,
    name_local = NULLIF(btrim(COALESCE(_name_local, '')), ''),
    geo_id = COALESCE(NULLIF(btrim(COALESCE(_geo_id, '')), ''), geo_id),
    active = COALESCE(_active, active),
    sort_order = COALESCE(_sort, sort_order),
    updated_at = now()
  WHERE id = _id;

  IF _name <> _old.name_ar THEN
    IF _cascade THEN
      UPDATE public.orphans o SET region = _name
       WHERE o.country_code = _old.country_code AND o.region = _old.name_ar
         AND NOT EXISTS (SELECT 1 FROM public.operating_platforms p WHERE p.key = o.external_source)
         AND NOT public.orphan_is_locked(o.id);
      GET DIAGNOSTICS _moved = ROW_COUNT;
      UPDATE public.mirror_groups g SET region = _name
       WHERE g.country_code = _old.country_code AND g.region = _old.name_ar AND g.source IS NULL;
      GET DIAGNOSTICS _groups = ROW_COUNT;
    END IF;
    SELECT count(*) INTO _left FROM public.orphans o
     WHERE o.country_code = _old.country_code AND o.region = _old.name_ar AND o.status <> 'archived';
  END IF;

  PERFORM public.write_audit('region.updated', 'country_region', _id,
    jsonb_build_object('country', _old.country_code, 'from', _old.name_ar, 'to', _name,
                       'active', COALESCE(_active, _old.active), 'cascade', _cascade,
                       'children_renamed', _moved, 'groups_renamed', _groups, 'children_left', _left));
  RETURN jsonb_build_object('id', _id, 'created', false, 'children_renamed', _moved,
                            'groups_renamed', _groups, 'children_left', _left);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_save_region(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_region(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, BOOLEAN) TO authenticated;

/* قبول قائمةٍ مبدئية دفعةً واحدة: ما وُجد اسمه يُترك كما هو. */
CREATE OR REPLACE FUNCTION public.admin_seed_regions(_country TEXT, _rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _cc TEXT := upper(btrim(COALESCE(_country, ''))); _r JSONB; _n INTEGER := 0; _skipped INTEGER := 0;
        _name TEXT; _i INTEGER := 0;
BEGIN
  PERFORM public.data_entry_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc) THEN
    RAISE EXCEPTION 'country_unknown' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 400 THEN
    RAISE EXCEPTION 'rows_invalid' USING ERRCODE = '22023';
  END IF;
  FOR _r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    _i := _i + 1;
    _name := btrim(COALESCE(_r->>'name_ar', ''));
    IF _name = '' OR length(_name) > 120
       OR EXISTS (SELECT 1 FROM public.country_regions x
                   WHERE x.country_code = _cc
                     AND public.data_entry_norm(x.name_ar) = public.data_entry_norm(_name)) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.country_regions (country_code, name_ar, name_local, geo_id, sort_order, created_by)
    VALUES (_cc, _name, NULLIF(left(btrim(COALESCE(_r->>'name_local', '')), 120), ''),
            NULLIF(left(btrim(COALESCE(_r->>'geo_id', '')), 40), ''), _i, auth.uid());
    _n := _n + 1;
  END LOOP;
  PERFORM public.write_audit('region.seeded', 'country', NULL,
    jsonb_build_object('country', _cc, 'added', _n, 'skipped', _skipped));
  RETURN jsonb_build_object('added', _n, 'skipped', _skipped);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_seed_regions(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_seed_regions(TEXT, JSONB) TO authenticated;


-- ---------------------------------------------------------------------
-- 6) الأشخاص
-- ---------------------------------------------------------------------
/* بحثٌ في كلّ الملفّات غير المؤرشفة (لا المنشور وحده) — لإضافة الأعضاء ولعرض آخر ما أُدخل. */
CREATE OR REPLACE FUNCTION public.admin_find_persons(
  _q TEXT DEFAULT NULL, _country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _pat TEXT := CASE WHEN NULLIF(btrim(COALESCE(_q, '')), '') IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(btrim(_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  _cc TEXT := NULLIF(upper(btrim(COALESCE(_country, ''))), '');
  _lim INTEGER := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
BEGIN
  PERFORM public.data_entry_require_admin();
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC) FROM (
      SELECT o.id, o.code, o.display_name AS name, o.gender, o.status, o.country_code, o.country,
             o.region, o.currency, o.created_at, o.group_id,
             (SELECT g.name FROM public.mirror_groups g WHERE g.id = o.group_id) AS group_name,
             (SELECT p.key FROM public.operating_platforms p WHERE p.key = o.external_source) AS synced_source,
             public.orphan_is_locked(o.id) AS locked
        FROM public.orphans o
       WHERE o.status <> 'archived'
         AND (_cc IS NULL OR o.country_code = _cc)
         AND (_pat IS NULL OR o.display_name ILIKE _pat OR o.code ILIKE _pat)
       ORDER BY o.created_at DESC
       LIMIT _lim) s), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_find_persons(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_persons(TEXT, TEXT, INTEGER) TO authenticated;

/*
 * إضافة شخص. `_dry_run`: فحصٌ بلا كتابة. `_confirm_duplicates`: اكتب مع وجود
 * تكرارٍ محتمل (القرار للمدير بعد أن رآه).
 */
CREATE OR REPLACE FUNCTION public.admin_add_person(
  _row JSONB, _confirm_duplicates BOOLEAN DEFAULT false, _dry_run BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _check JSONB; _out JSONB;
BEGIN
  PERFORM public.data_entry_require_admin();
  _check := public.data_entry_check_person(_row);
  IF jsonb_array_length(_check->'errors') > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid') || _check;
  END IF;
  IF jsonb_array_length(_check->'duplicates') > 0 AND NOT COALESCE(_confirm_duplicates, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'possible_duplicate') || _check;
  END IF;
  IF COALESCE(_dry_run, false) THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true) || _check;
  END IF;
  _out := public.data_entry_insert_person(_row, _check);
  RETURN jsonb_build_object('ok', true, 'dry_run', false) || _check || _out;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_add_person(JSONB, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_person(JSONB, BOOLEAN, BOOLEAN) TO authenticated;

/*
 * دفعةٌ من الأشخاص (حتى 500). كلّ صفٍّ بنتيجته، وصفٌّ فاشل لا يُسقط غيره.
 * الصفّ الذي يحمل `"confirm_duplicate": true` يُكتب مع تكراره المحتمل.
 */
CREATE OR REPLACE FUNCTION public.admin_import_persons(_rows JSONB, _dry_run BOOLEAN DEFAULT true)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _r JSONB; _check JSONB; _out JSONB; _results JSONB := '[]'::jsonb;
  _i INTEGER := 0; _ok INTEGER := 0; _bad INTEGER := 0; _dup INTEGER := 0;
BEGIN
  PERFORM public.data_entry_require_admin();
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 OR jsonb_array_length(_rows) > 500 THEN
    RAISE EXCEPTION 'rows_invalid' USING ERRCODE = '22023';
  END IF;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    _i := _i + 1;
    BEGIN
      _check := public.data_entry_check_person(_r);
      IF jsonb_array_length(_check->'errors') > 0 THEN
        _bad := _bad + 1;
        _results := _results || (jsonb_build_object('row', _i, 'ok', false, 'code', 'invalid') || _check);
      ELSIF jsonb_array_length(_check->'duplicates') > 0
            AND NOT COALESCE((_r->>'confirm_duplicate')::boolean, false) THEN
        _dup := _dup + 1;
        _results := _results || (jsonb_build_object('row', _i, 'ok', false, 'code', 'possible_duplicate') || _check);
      ELSIF COALESCE(_dry_run, true) THEN
        _ok := _ok + 1;
        _results := _results || (jsonb_build_object('row', _i, 'ok', true) || _check);
      ELSE
        _out := public.data_entry_insert_person(_r, _check);
        _ok := _ok + 1;
        _results := _results || (jsonb_build_object('row', _i, 'ok', true) || _check || _out);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _bad := _bad + 1;
      _results := _results || jsonb_build_object('row', _i, 'ok', false, 'code', 'invalid',
        'errors', jsonb_build_array('write_failed'), 'warnings', '[]'::jsonb, 'duplicates', '[]'::jsonb,
        'sqlstate', SQLSTATE);
    END;
  END LOOP;

  IF NOT COALESCE(_dry_run, true) THEN
    PERFORM public.write_audit('orphan.admin_import', 'orphan', NULL,
      jsonb_build_object('received', _i, 'written', _ok, 'invalid', _bad, 'duplicates', _dup));
  END IF;
  RETURN jsonb_build_object('dry_run', COALESCE(_dry_run, true), 'received', _i, 'ready', _ok,
                            'invalid', _bad, 'duplicates', _dup, 'results', _results);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_import_persons(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_persons(JSONB, BOOLEAN) TO authenticated;


-- ---------------------------------------------------------------------
-- 7) المجموعات
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_groups(_country TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _cc TEXT := NULLIF(upper(btrim(COALESCE(_country, ''))), '');
BEGIN
  PERFORM public.data_entry_require_admin();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'country_code', g.country_code, 'region', g.region,
        'source', g.source, 'institution', g.institution_name, 'supervisor', g.supervisor_name,
        'members', (SELECT count(*) FROM public.orphans o WHERE o.group_id = g.id AND o.status <> 'archived'))
      ORDER BY g.country_code, g.name)
    FROM public.mirror_groups g
   WHERE g.deleted_at IS NULL AND (_cc IS NULL OR g.country_code = _cc)), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_groups(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_groups(TEXT) TO authenticated;

/* إنشاء مجموعةٍ محلّية أو تعديلها. المرآوية لا تُعدَّل من هنا. */
CREATE OR REPLACE FUNCTION public.admin_save_group(
  _id UUID, _name TEXT, _country TEXT, _region TEXT DEFAULT NULL,
  _institution TEXT DEFAULT NULL, _supervisor TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _cc TEXT := upper(btrim(COALESCE(_country, '')));
  _n TEXT := btrim(COALESCE(_name, ''));
  _region_in TEXT := NULLIF(btrim(COALESCE(_region, '')), '');
  _reg TEXT; _old public.mirror_groups%ROWTYPE; _row_id UUID;
BEGIN
  PERFORM public.data_entry_require_admin();
  IF length(_n) < 2 OR length(_n) > 120 THEN
    RAISE EXCEPTION 'group_name_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc) THEN
    RAISE EXCEPTION 'country_unknown' USING ERRCODE = '22023';
  END IF;
  IF _region_in IS NOT NULL THEN
    _reg := public.data_entry_region(_cc, _region_in);
    IF _reg IS NULL THEN
      RAISE EXCEPTION 'region_unknown' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.mirror_groups (source, external_ref, name, country_code, region,
                                      institution_name, supervisor_name, created_by)
    VALUES (NULL, 'local-' || gen_random_uuid()::text, _n, _cc, _reg,
            NULLIF(btrim(COALESCE(_institution, '')), ''), NULLIF(btrim(COALESCE(_supervisor, '')), ''),
            auth.uid())
    RETURNING id INTO _row_id;
    PERFORM public.write_audit('group.created', 'group', _row_id,
      jsonb_build_object('name', _n, 'country', _cc, 'region', _reg));
    RETURN jsonb_build_object('id', _row_id, 'created', true);
  END IF;

  SELECT * INTO _old FROM public.mirror_groups WHERE id = _id AND deleted_at IS NULL FOR UPDATE;
  IF _old.id IS NULL THEN
    RAISE EXCEPTION 'group_unknown' USING ERRCODE = 'P0002';
  END IF;
  IF _old.source IS NOT NULL THEN
    RAISE EXCEPTION 'group_synced' USING ERRCODE = '42501';
  END IF;
  -- دولة المجموعة هي دولة أعضائها: لا تُنقل وفيها أعضاء.
  IF _old.country_code <> _cc AND EXISTS (SELECT 1 FROM public.orphans o WHERE o.group_id = _id) THEN
    RAISE EXCEPTION 'group_has_members' USING ERRCODE = '23503';
  END IF;

  UPDATE public.mirror_groups SET
    name = _n, country_code = _cc, region = _reg,
    institution_name = NULLIF(btrim(COALESCE(_institution, '')), ''),
    supervisor_name = NULLIF(btrim(COALESCE(_supervisor, '')), ''),
    synced_at = now()
  WHERE id = _id;
  PERFORM public.write_audit('group.updated', 'group', _id,
    jsonb_build_object('name', _n, 'country', _cc, 'region', _reg,
                       'was', jsonb_build_object('name', _old.name, 'country', _old.country_code,
                                                 'region', _old.region)));
  RETURN jsonb_build_object('id', _id, 'created', false);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_save_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_group_members(_group UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.data_entry_require_admin();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'code', o.code, 'name', o.display_name, 'status', o.status,
        'country_code', o.country_code, 'region', o.region,
        'synced_source', (SELECT p.key FROM public.operating_platforms p WHERE p.key = o.external_source),
        'locked', public.orphan_is_locked(o.id))
      ORDER BY o.display_name)
    FROM public.orphans o WHERE o.group_id = _group AND o.status <> 'archived'), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_group_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_group_members(UUID) TO authenticated;

/*
 * ضمّ طفلٍ إلى مجموعةٍ محلّية.
 *
 * دولة العضو ومنطقته تتبعان المجموعة، لكن لا استبدال صامت: إن خالف ما على
 * الملفّ ما على المجموعة عاد الناتج بـ`conflict` وفيه القيمتان، ولا يُكتب
 * شيء حتى يختار المدير:
 *   • `_adopt_country`: دولة الطفل تصير دولة المجموعة (ومعها عملتها). مرفوضٌ
 *     لملفٍّ منشور أو له كفالة قائمة — عملته ثبتت.
 *   • `_region_choice`: 'group' تأخذ منطقة المجموعة، 'keep' تُبقي منطقته.
 *   • `_move`: انقله من مجموعته الحالية.
 */
CREATE OR REPLACE FUNCTION public.admin_set_group_member(
  _group UUID, _orphan UUID, _adopt_country BOOLEAN DEFAULT false,
  _region_choice TEXT DEFAULT NULL, _move BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _g public.mirror_groups%ROWTYPE; _o public.orphans%ROWTYPE; _src TEXT;
  _conflict JSONB := '{}'::jsonb; _country RECORD; _new_region TEXT; _country_changes BOOLEAN;
BEGIN
  PERFORM public.data_entry_require_admin();
  SELECT * INTO _g FROM public.mirror_groups WHERE id = _group AND deleted_at IS NULL;
  IF _g.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'group_unknown'); END IF;
  IF _g.source IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'group_synced', 'source', _g.source);
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _orphan AND status <> 'archived' FOR UPDATE;
  IF _o.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'person_unknown'); END IF;

  _src := public.data_entry_synced_source(_orphan);
  IF _src IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'synced', 'source', _src);
  END IF;
  IF public.orphan_is_locked(_orphan) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'locked');
  END IF;
  IF _o.group_id = _group THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  IF _o.group_id IS NOT NULL AND NOT COALESCE(_move, false) THEN
    _conflict := _conflict || jsonb_build_object('group', jsonb_build_object(
      'child', (SELECT name FROM public.mirror_groups WHERE id = _o.group_id), 'group', _g.name));
  END IF;

  _country_changes := _o.country_code IS DISTINCT FROM _g.country_code;
  IF _country_changes THEN
    IF _o.status IN ('approved', 'fully_sponsored')
       OR EXISTS (SELECT 1 FROM public.sponsorships s WHERE s.orphan_id = _orphan
                   AND s.status IN ('pending_payment', 'active', 'paused')) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'country_fixed',
        'conflict', jsonb_build_object('country', jsonb_build_object('child', _o.country_code, 'group', _g.country_code)));
    END IF;
    IF _o.country_code IS NOT NULL AND NOT COALESCE(_adopt_country, false) THEN
      _conflict := _conflict || jsonb_build_object('country',
        jsonb_build_object('child', _o.country_code, 'group', _g.country_code));
    END IF;
  END IF;

  _new_region := _o.region;
  IF _g.region IS NOT NULL THEN
    IF NULLIF(btrim(COALESCE(_o.region, '')), '') IS NULL OR _country_changes THEN
      -- بلا منطقة، أو تغيّرت الدولة فلم تعد منطقته من مناطقها: يأخذ منطقة المجموعة.
      _new_region := _g.region;
    ELSIF _o.region <> _g.region THEN
      IF _region_choice = 'group' THEN
        _new_region := _g.region;
      ELSIF _region_choice IS DISTINCT FROM 'keep' THEN
        _conflict := _conflict || jsonb_build_object('region',
          jsonb_build_object('child', _o.region, 'group', _g.region));
      END IF;
    END IF;
  ELSIF _country_changes THEN
    _new_region := NULL;
  END IF;

  IF _conflict <> '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'conflict', _conflict);
  END IF;

  IF _country_changes THEN
    SELECT c.name_ar,
           COALESCE(c.currency, (SELECT upper(btrim(s.currency)) FROM public.platform_settings s WHERE s.id)) AS currency
      INTO _country FROM public.countries c WHERE c.code = _g.country_code;
    UPDATE public.orphans SET group_id = _group, country = _country.name_ar,
           currency = _country.currency, region = _new_region
     WHERE id = _orphan;
  ELSE
    UPDATE public.orphans SET group_id = _group, region = _new_region WHERE id = _orphan;
  END IF;

  PERFORM public.write_audit('group.member_added', 'orphan', _orphan,
    jsonb_build_object('group', _group, 'from_group', _o.group_id,
                       'country', jsonb_build_object('was', _o.country_code, 'now', _g.country_code),
                       'region', jsonb_build_object('was', _o.region, 'now', _new_region)));
  RETURN jsonb_build_object('ok', true, 'unchanged', false, 'region', _new_region,
                            'country_code', _g.country_code,
                            'country_changed', _country_changes,
                            'region_changed', _new_region IS DISTINCT FROM _o.region);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_group_member(UUID, UUID, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_group_member(UUID, UUID, BOOLEAN, TEXT, BOOLEAN) TO authenticated;

/* إخراج عضوٍ من مجموعته المحلّية. دولته ومنطقته تبقيان كما هما. */
CREATE OR REPLACE FUNCTION public.admin_remove_group_member(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o public.orphans%ROWTYPE; _src TEXT;
BEGIN
  PERFORM public.data_entry_require_admin();
  SELECT * INTO _o FROM public.orphans WHERE id = _orphan FOR UPDATE;
  IF _o.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'person_unknown'); END IF;
  IF _o.group_id IS NULL THEN RETURN jsonb_build_object('ok', true, 'unchanged', true); END IF;
  _src := public.data_entry_synced_source(_orphan);
  IF _src IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.mirror_groups g WHERE g.id = _o.group_id AND g.source IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'synced', 'source', _src);
  END IF;
  IF public.orphan_is_locked(_orphan) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'locked');
  END IF;
  UPDATE public.orphans SET group_id = NULL WHERE id = _orphan;
  PERFORM public.write_audit('group.member_removed', 'orphan', _orphan,
    jsonb_build_object('group', _o.group_id));
  RETURN jsonb_build_object('ok', true, 'unchanged', false);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_remove_group_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_group_member(UUID) TO authenticated;
