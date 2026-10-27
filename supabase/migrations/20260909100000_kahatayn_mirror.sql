-- =====================================================================
-- كهاتين — الدول، مرآة منصّات التشغيل، نموذج السمات، وأهداف الدعم
-- ---------------------------------------------------------------------
-- «أنا وكافل اليتيم في الجنة كهاتين».
--
-- المبادئ:
--   1) الدولة صفٌّ لا هجرة: المنصّة ستخدم أربعين دولة تدريجياً، والمفعّلة
--      اليوم ألبانيا وحدها لأن الرواد ألبانيا هي منصّة التشغيل الوحيدة.
--   2) المرآة باتجاهٍ واحد: منصّة التشغيل تكتب، وكهاتين تقرأ. كل صفٍّ
--      مرآويّ مفتاحه (source, external_ref)، والحذف علامةٌ deleted_at
--      لا مسح، كي لا يضيع تاريخٌ رآه داعم.
--   3) نموذج السمات سجلٌّ لا تعداد: الأبعاد (المقاصد الخمسة في الرواد
--      مثال) والسمات وعناصرها تُستورد كما هي، فإن أضاف الرواد بُعداً
--      ظهر هنا دون تعديل كود.
--   4) المرآة تصل مغلقة: لا anon ولا authenticated يقرأ الجداول مباشرة؛
--      الأبواب دوالّ تفحص النطاق (traits / group) المصروف لكل طفل.
--   5) هدف الدعم متعدّد الأشكال: التأهيل = يتيم | مجموعة | منطقة | دولة،
--      والعيني يضيف المؤسسة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) الدول ومنصّات التشغيل
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.countries (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name_ar     TEXT NOT NULL,
  name_local  TEXT,
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'active', 'paused')),
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS countries_read ON public.countries;
CREATE POLICY countries_read ON public.countries FOR SELECT TO anon, authenticated
  USING (status <> 'planned' OR public.is_admin());
DROP POLICY IF EXISTS countries_admin ON public.countries;
CREATE POLICY countries_admin ON public.countries FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries TO authenticated;

INSERT INTO public.countries (code, name_ar, name_local, status, sort_order)
VALUES ('AL', 'ألبانيا', 'Shqipëri', 'active', 1)
ON CONFLICT (code) DO NOTHING;


CREATE TABLE IF NOT EXISTS public.operating_platforms (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9-]{2,40}$'),
  name         TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  base_url     TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operating_platforms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS op_admin ON public.operating_platforms;
CREATE POLICY op_admin ON public.operating_platforms FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.operating_platforms TO authenticated;

INSERT INTO public.operating_platforms (key, name, country_code, base_url)
VALUES ('rowad-albania', 'الرواد ألبانيا', 'AL', 'https://rowad-albania.manzoma.sa')
ON CONFLICT (key) DO NOTHING;


-- مؤشّر المزامنة لكل (منصّة، كيان): الدفع (webhook) يوقظ، والسحب يكمل
-- من (cursor_at, cursor_ref)، والمطابقة الدورية تكتب الانحراف.
CREATE TABLE IF NOT EXISTS public.mirror_sync_state (
  source       TEXT NOT NULL REFERENCES public.operating_platforms(key),
  entity       TEXT NOT NULL CHECK (entity ~ '^[a-z_]{2,40}$'),
  cursor_at    TIMESTAMPTZ,
  cursor_ref   TEXT,
  last_run_at  TIMESTAMPTZ,
  last_error   TEXT,
  drift        JSONB,
  PRIMARY KEY (source, entity)
);
ALTER TABLE public.mirror_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mss_admin ON public.mirror_sync_state;
CREATE POLICY mss_admin ON public.mirror_sync_state FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.mirror_sync_state TO authenticated;


-- ---------------------------------------------------------------------
-- 2) المجموعات: لكل يتيم في الرواد مجموعة ومشرف أساسي
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mirror_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source              TEXT NOT NULL REFERENCES public.operating_platforms(key),
  external_ref        TEXT NOT NULL,
  name                TEXT NOT NULL,
  country_code        TEXT NOT NULL REFERENCES public.countries(code),
  region              TEXT,
  institution_ref     TEXT,            -- المدرسة في الرواد
  institution_name    TEXT,
  supervisor_ref      TEXT,            -- المعلّم = المشرف الأساسي
  supervisor_name     TEXT,
  source_updated_at   TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (source, external_ref)
);
ALTER TABLE public.mirror_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mg_admin ON public.mirror_groups;
CREATE POLICY mg_admin ON public.mirror_groups FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.mirror_groups TO authenticated;

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.mirror_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orphans_group ON public.orphans(group_id);


-- ---------------------------------------------------------------------
-- 3) نموذج السمات — سجلٌّ مستورد
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trait_dimensions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL REFERENCES public.operating_platforms(key),
  key           TEXT NOT NULL,            -- DEEN | AQL | NAFS | NASL | MAL … كما يرد
  label_ar      TEXT NOT NULL,
  label_local   TEXT,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  UNIQUE (source, key)
);

CREATE TABLE IF NOT EXISTS public.trait_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL REFERENCES public.operating_platforms(key),
  external_ref      TEXT NOT NULL,
  dimension_id      UUID NOT NULL REFERENCES public.trait_dimensions(id) ON DELETE CASCADE,
  stage_label       TEXT,                 -- مرحلة خارطة الطريق إن وُجدت
  name_ar           TEXT NOT NULL,
  name_local        TEXT,
  definition_ar     TEXT,
  definition_local  TEXT,
  elements          JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(elements) = 'array'),
  sort_order        INTEGER NOT NULL DEFAULT 100,
  deleted_at        TIMESTAMPTZ,
  UNIQUE (source, external_ref)
);

-- القياس: كل تقييم من الرواد صفّ؛ الدرجة كما وردت مع سقفها، فلا نفترض
-- مقياساً واحداً لكل المنصّات.
CREATE TABLE IF NOT EXISTS public.orphan_trait_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL REFERENCES public.operating_platforms(key),
  external_ref   TEXT NOT NULL,
  orphan_id      UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  trait_id       UUID NOT NULL REFERENCES public.trait_definitions(id) ON DELETE CASCADE,
  score          NUMERIC NOT NULL,
  scale_max      NUMERIC NOT NULL DEFAULT 100 CHECK (scale_max > 0),
  observed_at    TIMESTAMPTZ NOT NULL,
  note           TEXT,                    -- ملاحظة المشرف: لا تظهر للداعم
  deleted_at     TIMESTAMPTZ,
  UNIQUE (source, external_ref),
  CHECK (score >= 0 AND score <= scale_max)
);
CREATE INDEX IF NOT EXISTS idx_ots_orphan ON public.orphan_trait_scores(orphan_id, observed_at);

ALTER TABLE public.trait_dimensions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trait_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orphan_trait_scores ENABLE ROW LEVEL SECURITY;
-- النموذج نفسه منهجٌ عامّ يُعرض للجميع؛ الدرجات بابها دالّة.
DROP POLICY IF EXISTS td_read ON public.trait_dimensions;
CREATE POLICY td_read ON public.trait_dimensions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tdef_read ON public.trait_definitions;
CREATE POLICY tdef_read ON public.trait_definitions FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);
DROP POLICY IF EXISTS ots_admin ON public.orphan_trait_scores;
CREATE POLICY ots_admin ON public.orphan_trait_scores FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.trait_dimensions, public.trait_definitions TO anon, authenticated;
GRANT SELECT ON public.orphan_trait_scores TO authenticated;


-- النموذج للعرض العامّ: أبعاد ← سمات ← عناصر.
CREATE OR REPLACE FUNCTION public.trait_model(_source TEXT DEFAULT 'rowad-albania')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'key', d.key, 'label', d.label_ar, 'label_local', d.label_local,
           'description', d.description,
           'traits', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', t.id, 'name', t.name_ar, 'name_local', t.name_local,
                      'definition', t.definition_ar, 'stage', t.stage_label,
                      'elements', t.elements)
                    ORDER BY t.sort_order, t.name_ar)
               FROM public.trait_definitions t
              WHERE t.dimension_id = d.id AND t.deleted_at IS NULL), '[]'::jsonb))
         ORDER BY d.sort_order, d.key), '[]'::jsonb)
    FROM public.trait_dimensions d
   WHERE d.source = _source;
$fn$;
GRANT EXECUTE ON FUNCTION public.trait_model(TEXT) TO anon, authenticated;


-- سمات طفلٍ بعينه: آخر قياس لكل سمة وأوّله، بلا ملاحظة المشرف.
-- الباب نطاق «traits» — دائرة الطفل تملكه ضمناً.
CREATE OR REPLACE FUNCTION public.orphan_traits(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.has_orphan_scope(_orphan, 'traits') THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'traits', COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.dimension_order, x.dimension, x.name)
      FROM (
        SELECT d.key AS dimension, d.label_ar AS dimension_label, d.sort_order AS dimension_order,
               t.id AS trait_id, t.name_ar AS name,
               (SELECT round(100 * s.score / s.scale_max, 1) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                 ORDER BY s.observed_at ASC LIMIT 1) AS first_percent,
               (SELECT round(100 * s.score / s.scale_max, 1) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                 ORDER BY s.observed_at DESC LIMIT 1) AS latest_percent,
               (SELECT count(*) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL) AS observations
          FROM public.trait_definitions t
          JOIN public.trait_dimensions d ON d.id = t.dimension_id
         WHERE t.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM public.orphan_trait_scores s
                        WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL)
      ) x), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_traits(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_traits(UUID) TO authenticated;


-- مجموعة الطفل: الاسم والمشرف دائماً لمن يملك «group»، وأسماء الزملاء
-- المستعارة فقط (display_name)، ولا يُعدّ في القائمة إلا المعتمَد.
CREATE OR REPLACE FUNCTION public.orphan_group(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _g public.mirror_groups;
BEGIN
  IF NOT public.has_orphan_scope(_orphan, 'group') THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  SELECT g.* INTO _g FROM public.mirror_groups g
    JOIN public.orphans o ON o.group_id = g.id
   WHERE o.id = _orphan AND g.deleted_at IS NULL;
  IF _g.id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'group', NULL);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'group', jsonb_build_object(
    'name', _g.name, 'country', _g.country_code, 'region', _g.region,
    'institution', _g.institution_name, 'supervisor', _g.supervisor_name,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', o.code, 'name', o.display_name)
                                          ORDER BY o.display_name)
                           FROM public.orphans o
                          WHERE o.group_id = _g.id AND o.status = 'approved'), '[]'::jsonb)));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_group(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 4) أهداف الدعم
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_pledges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('qualification', 'in_kind')),
  target_type    TEXT NOT NULL CHECK (target_type IN ('orphan', 'group', 'region', 'country', 'institution')),
  orphan_id      UUID REFERENCES public.orphans(id) ON DELETE RESTRICT,
  group_id       UUID REFERENCES public.mirror_groups(id) ON DELETE RESTRICT,
  org_id         UUID REFERENCES public.care_organizations(id) ON DELETE RESTRICT,
  country_code   TEXT NOT NULL REFERENCES public.countries(code),
  region         TEXT,
  amount         NUMERIC NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  note           TEXT CHECK (note IS NULL OR length(note) <= 1000),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'fulfilled', 'cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- التأهيل لا يذهب لمؤسسة: هو بناء أهلية طفلٍ أو جماعة أطفال.
  CONSTRAINT ck_pledge_kind_target CHECK (kind = 'in_kind' OR target_type <> 'institution'),
  -- مرجعٌ واحد يطابق النوع، لا أكثر ولا أقل.
  CONSTRAINT ck_pledge_target_shape CHECK (
    (target_type = 'orphan'      AND orphan_id IS NOT NULL AND group_id IS NULL AND org_id IS NULL) OR
    (target_type = 'group'       AND group_id IS NOT NULL AND orphan_id IS NULL AND org_id IS NULL) OR
    (target_type = 'institution' AND org_id IS NOT NULL AND orphan_id IS NULL AND group_id IS NULL) OR
    (target_type = 'region'      AND region IS NOT NULL AND orphan_id IS NULL AND group_id IS NULL AND org_id IS NULL) OR
    (target_type = 'country'     AND region IS NULL AND orphan_id IS NULL AND group_id IS NULL AND org_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_pledges_supporter ON public.support_pledges(supporter_id, created_at DESC);
ALTER TABLE public.support_pledges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_read ON public.support_pledges;
CREATE POLICY sp_read ON public.support_pledges FOR SELECT TO authenticated
  USING (supporter_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.support_pledges TO authenticated;
-- لا INSERT مباشر: الباب create_support_pledge.


CREATE OR REPLACE FUNCTION public.create_support_pledge(
  _kind TEXT, _target_type TEXT, _target TEXT, _amount NUMERIC,
  _country TEXT DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid UUID := auth.uid();
  _id UUID;
  _orphan UUID; _group UUID; _org UUID; _region TEXT; _cc TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;

  IF _target_type = 'orphan' THEN
    -- يتيمٌ معتمدٌ فقط؛ ودولته من مجموعته إن كانت مرآة، وإلا ما مُرّر.
    SELECT o.id, g.country_code INTO _orphan, _cc
      FROM public.orphans o LEFT JOIN public.mirror_groups g ON g.id = o.group_id
     WHERE o.id = _target::UUID AND o.status = 'approved';
    IF _orphan IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := COALESCE(_cc, _country);
  ELSIF _target_type = 'group' THEN
    SELECT g.id, g.country_code INTO _group, _cc FROM public.mirror_groups g
     WHERE g.id = _target::UUID AND g.deleted_at IS NULL;
    IF _group IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  ELSIF _target_type = 'institution' THEN
    SELECT c.id INTO _org FROM public.care_organizations c
     WHERE c.id = _target::UUID AND c.status = 'approved';
    IF _org IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'region' THEN
    _region := NULLIF(btrim(_target), '');
    IF _region IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'country' THEN
    _cc := COALESCE(NULLIF(btrim(_target), ''), _country);
  ELSE
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  -- الدعم لا يُفتح إلا في دولةٍ مفعّلة.
  IF _cc IS NULL OR NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc AND status = 'active') THEN
    RAISE EXCEPTION 'country_not_active';
  END IF;

  INSERT INTO public.support_pledges
    (supporter_id, kind, target_type, orphan_id, group_id, org_id, country_code, region, amount, note)
  VALUES (_uid, _kind, _target_type, _orphan, _group, _org, _cc, _region, _amount, NULLIF(btrim(_note), ''))
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
