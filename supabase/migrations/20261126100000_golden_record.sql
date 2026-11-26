-- =====================================================================
-- السجلّ الذهبي — مصدران للحقيقة، وسلطةٌ لكل حقل
-- ---------------------------------------------------------------------
-- الندوة هي المصدر الرئيس، ومنصّة التشغيل التي يديرها مكتب الدولة مصدرٌ
-- مؤكِّد. لا يحكم مصدرٌ في كل شيء: لكل حقلٍ مالكٌ ومؤكِّد ودرجة خطر
-- (`field_authority`)، والقيمة المعتمدة تُبنى من ملاحظات المصدرين.
--
-- وضع المكتب لكل دولة (`country_data_sources.office_mode`):
--   none   لا منصّة تشغيل سليمة: الندوة تملك كل الحقول، والملف موثّقٌ
--          بمصدرها وحده (basis = primary_only).
--   shadow منصّة التشغيل موصولة للمقارنة فقط: تُسجَّل ملاحظاتها وتُكشف
--          الفروق، ولا تغيّر قيمةً معتمدة. فترة إثباتٍ قبل التسليم.
--   active المصفوفة كاملة: المكتب يملك حقول الوضع الحالي، والندوة تؤكّدها.
-- الانتقال بين الأوضاع يعيد تقييم كل حقلٍ ملاحَظ في الدولة، فلا تُعاد أي
-- بيانات ولا تُفقد.
--
-- القواعد:
--   1) الربط بالمعرّف لا بالاسم: (source, external_ref) ← يتيم. ما لا رابط
--      له يقف في طابور الربط مع مرشّحين، ولا يُنشأ يتيمٌ تلقائياً.
--   2) الغياب ليس حذفاً: حقلٌ فارغ في الدفعة لا يمسح قيمة.
--   3) الحقل الحرج لا يتغيّر إلا باعتماد بشري، وأوّل قيمةٍ له تُقبل.
--   4) ملفّ طفلٍ مكفول يمرّ بقفل الهوية القائم (guard_locked_orphan): ما
--      يمسكه القفل يُسجَّل تعارضاً «محجوزاً» لا يُتجاوز.
--   5) اعتمادٌ يدويّ يثبت حتى تصل ملاحظةٌ أحدث من المالك.
--   6) الحقول المالية تملكها المنصّة: لا تُستورد من أي مصدر.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) مصفوفة السلطة
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_authority (
  field          TEXT PRIMARY KEY CHECK (field ~ '^[a-z_]{2,40}$'),
  field_group    TEXT NOT NULL CHECK (field_group IN
                   ('identity', 'eligibility', 'current', 'reports', 'qualification', 'finance')),
  owner          TEXT NOT NULL CHECK (owner IN ('wamy', 'office', 'platform')),
  verifier       TEXT CHECK (verifier IN ('wamy', 'office', 'platform')),
  risk           TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'critical')),
  orphan_column  TEXT CHECK (orphan_column IN
                   ('display_name', 'birth_date', 'gender', 'country_code', 'region', 'city', 'education_stage')),
  sort_order     INTEGER NOT NULL DEFAULT 100,
  CHECK (verifier IS DISTINCT FROM owner)
);
ALTER TABLE public.field_authority ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fa_admin ON public.field_authority;
CREATE POLICY fa_admin ON public.field_authority FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.field_authority FROM anon, authenticated;
GRANT SELECT ON public.field_authority TO authenticated;

INSERT INTO public.field_authority (field, field_group, owner, verifier, risk, orphan_column, sort_order) VALUES
  ('display_name',         'identity',      'wamy',     'office', 'medium',   'display_name',    10),
  ('birth_date',           'identity',      'wamy',     'office', 'critical', 'birth_date',      20),
  ('gender',               'identity',      'wamy',     'office', 'critical', 'gender',          30),
  ('country',              'identity',      'wamy',     'office', 'critical', 'country_code',    40),
  ('program_status',       'eligibility',   'wamy',     'office', 'critical', NULL,              50),
  ('sponsorship_eligible', 'eligibility',   'wamy',     'office', 'critical', NULL,              60),
  ('region',               'current',       'office',   'wamy',   'medium',   'region',          70),
  ('city',                 'current',       'office',   'wamy',   'low',      'city',            80),
  ('education_stage',      'current',       'office',   'wamy',   'low',      'education_stage', 90),
  ('guardian',             'current',       'office',   'wamy',   'medium',   NULL,             100),
  ('living_situation',     'current',       'office',   'wamy',   'medium',   NULL,             110),
  ('health_status',        'current',       'office',   'wamy',   'medium',   NULL,             120),
  ('progress_report',      'reports',       'office',   NULL,     'low',      NULL,             130),
  ('qualification_track',  'qualification', 'office',   'platform','low',     NULL,             140),
  ('sponsorship',          'finance',       'platform', 'wamy',   'critical', NULL,             150)
ON CONFLICT (field) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2) وضع المصادر لكل دولة
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.country_data_sources (
  country_code      TEXT PRIMARY KEY REFERENCES public.countries(code) ON DELETE CASCADE,
  office_source     TEXT REFERENCES public.operating_platforms(key),
  office_mode       TEXT NOT NULL DEFAULT 'none' CHECK (office_mode IN ('none', 'shadow', 'active')),
  stale_after_days  INTEGER NOT NULL DEFAULT 180 CHECK (stale_after_days BETWEEN 30 AND 730),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by        UUID,
  CHECK (office_mode = 'none' OR office_source IS NOT NULL)
);
ALTER TABLE public.country_data_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cds_admin ON public.country_data_sources;
CREATE POLICY cds_admin ON public.country_data_sources FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.country_data_sources FROM anon, authenticated;
GRANT SELECT ON public.country_data_sources TO authenticated;


-- ---------------------------------------------------------------------
-- 3) ربط الهوية وطابوره
-- ---------------------------------------------------------------------
-- المصدر `wamy` للندوة؛ وغيره مفتاح منصّة تشغيل.
CREATE TABLE IF NOT EXISTS public.orphan_source_links (
  source        TEXT NOT NULL CHECK (source ~ '^[a-z0-9-]{2,40}$'),
  external_ref  TEXT NOT NULL CHECK (length(external_ref) BETWEEN 1 AND 120),
  orphan_id     UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('wamy', 'office')),
  method        TEXT NOT NULL CHECK (method IN ('legacy', 'manual', 'created')),
  linked_by     UUID,
  linked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, external_ref),
  UNIQUE (orphan_id, source),
  CHECK ((role = 'wamy') = (source = 'wamy'))
);
CREATE INDEX IF NOT EXISTS idx_osl_orphan ON public.orphan_source_links(orphan_id);
ALTER TABLE public.orphan_source_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osl_admin ON public.orphan_source_links;
CREATE POLICY osl_admin ON public.orphan_source_links FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.orphan_source_links FROM anon, authenticated;
GRANT SELECT ON public.orphan_source_links TO authenticated;

-- ما وصل من منصّات التشغيل قبل هذه الطبقة مربوطٌ أصلاً بمعرّفه.
INSERT INTO public.orphan_source_links (source, external_ref, orphan_id, role, method)
SELECT o.external_source, o.external_ref, o.id, 'office', 'legacy'
  FROM public.orphans o
  JOIN public.operating_platforms p ON p.key = o.external_source
 WHERE o.external_ref IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.source_link_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role          TEXT NOT NULL CHECK (role IN ('wamy', 'office')),
  source        TEXT NOT NULL,
  external_ref  TEXT NOT NULL,
  country_code  TEXT NOT NULL REFERENCES public.countries(code),
  record        JSONB NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  candidates    UUID[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'created', 'ignored')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by   UUID,
  resolved_at   TIMESTAMPTZ,
  UNIQUE (source, external_ref)
);
CREATE INDEX IF NOT EXISTS idx_slq_pending ON public.source_link_queue(country_code) WHERE status = 'pending';
ALTER TABLE public.source_link_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS slq_admin ON public.source_link_queue;
CREATE POLICY slq_admin ON public.source_link_queue FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.source_link_queue FROM anon, authenticated;
GRANT SELECT ON public.source_link_queue TO authenticated;


-- ---------------------------------------------------------------------
-- 4) الملاحظات، والقيمة المعتمدة، والتعارضات
-- ---------------------------------------------------------------------
-- آخر ما قاله كل مصدرٍ عن كل حقل.
CREATE TABLE IF NOT EXISTS public.orphan_field_observations (
  orphan_id    UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  field        TEXT NOT NULL REFERENCES public.field_authority(field),
  role         TEXT NOT NULL CHECK (role IN ('wamy', 'office')),
  source       TEXT NOT NULL,
  value        JSONB NOT NULL,
  observed_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (orphan_id, field, role)
);
-- القيمة المعتمدة ومصدرها: لماذا يظهر ما يظهر.
CREATE TABLE IF NOT EXISTS public.orphan_field_state (
  orphan_id    UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  field        TEXT NOT NULL REFERENCES public.field_authority(field),
  value        JSONB NOT NULL,
  from_role    TEXT NOT NULL CHECK (from_role IN ('wamy', 'office', 'manual')),
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by   UUID,
  -- اعتمادٌ يدوي يثبت حتى تصل ملاحظةٌ من المالك أحدث من هذا الوقت.
  pinned_until_after TIMESTAMPTZ,
  PRIMARY KEY (orphan_id, field)
);
CREATE TABLE IF NOT EXISTS public.data_conflicts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id    UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  field        TEXT NOT NULL REFERENCES public.field_authority(field),
  kind         TEXT NOT NULL CHECK (kind IN ('disagreement', 'critical_change', 'held_locked')),
  risk         TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'critical')),
  current_value  JSONB,
  proposed_value JSONB,
  wamy_value     JSONB,
  office_value   JSONB,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution   TEXT CHECK (resolution IN ('accepted', 'kept', 'use_wamy', 'use_office', 'manual', 'auto_agreed', 'superseded')),
  resolved_by  UUID,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conflict_open ON public.data_conflicts(orphan_id, field) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_conflict_open ON public.data_conflicts(status, risk);

ALTER TABLE public.orphan_field_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orphan_field_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_conflicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofo_admin ON public.orphan_field_observations;
CREATE POLICY ofo_admin ON public.orphan_field_observations FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS ofs_admin ON public.orphan_field_state;
CREATE POLICY ofs_admin ON public.orphan_field_state FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS dc_admin ON public.data_conflicts;
CREATE POLICY dc_admin ON public.data_conflicts FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.orphan_field_observations, public.orphan_field_state, public.data_conflicts FROM anon, authenticated;
GRANT SELECT ON public.orphan_field_observations, public.orphan_field_state, public.data_conflicts TO authenticated;


-- ---------------------------------------------------------------------
-- 5) مفاتيح الواجهة البرمجية: الندوة (رئيس) والمكتب (مؤكِّد)
-- ---------------------------------------------------------------------
ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_api_scopes_known;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_api_scopes_known CHECK (
  scopes <@ ARRAY['orphans:read', 'orphans:import', 'mirror:write', 'records:primary', 'records:verify']
  AND cardinality(scopes) > 0);
ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_api_records_source;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_api_records_source CHECK (
  NOT ('records:verify' = ANY(scopes) AND source IS NULL)
  AND NOT ('records:primary' = ANY(scopes) AND source IS NOT NULL));


-- ---------------------------------------------------------------------
-- 6) القواعد
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_office_mode(_country TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT office_mode FROM public.country_data_sources WHERE country_code = _country), 'none');
$fn$;

-- المالك الفعلي: حقل المكتب يعود للندوة ما لم يكن المكتب «فعّالاً».
CREATE OR REPLACE FUNCTION public.golden_effective_owner(_owner TEXT, _mode TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE WHEN _owner = 'office' AND _mode <> 'active' THEN 'wamy' ELSE _owner END;
$fn$;

CREATE OR REPLACE FUNCTION public.golden_try_date(_v TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
BEGIN
  IF _v IS NULL OR _v !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN _v::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;

-- القيمة كما تُخزَّن: نصٌّ مشذَّب أو null للفارغ؛ وغير النصّ كما هو.
CREATE OR REPLACE FUNCTION public.golden_normalize(_field TEXT, _v JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE _t TEXT;
BEGIN
  IF _v IS NULL OR jsonb_typeof(_v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(_v) IN ('number', 'boolean') AND _field NOT IN ('sponsorship_eligible') THEN
    _v := to_jsonb(_v #>> '{}');
  END IF;
  IF jsonb_typeof(_v) = 'string' THEN
    _t := btrim(_v #>> '{}');
    IF _t = '' THEN RETURN NULL; END IF;
    IF _field IN ('gender', 'program_status') THEN _t := lower(_t); END IF;
    IF _field = 'country' THEN _t := upper(_t); END IF;
    IF _field = 'sponsorship_eligible' THEN
      RETURN CASE WHEN lower(_t) IN ('true', 'yes', '1', 'نعم') THEN 'true'::jsonb
                  WHEN lower(_t) IN ('false', 'no', '0', 'لا') THEN 'false'::jsonb END;
    END IF;
    RETURN to_jsonb(_t);
  END IF;
  RETURN _v;
END $fn$;

CREATE OR REPLACE FUNCTION public.golden_valid(_field TEXT, _v JSONB)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    WHEN _v IS NULL THEN false
    WHEN _field = 'birth_date' THEN public.golden_try_date(_v #>> '{}') BETWEEN DATE '1990-01-01' AND current_date
    WHEN _field = 'gender' THEN _v #>> '{}' IN ('male', 'female')
    WHEN _field = 'country' THEN EXISTS (SELECT 1 FROM public.countries c WHERE c.code = _v #>> '{}')
    WHEN _field = 'program_status' THEN _v #>> '{}' IN ('active', 'suspended', 'exited')
    WHEN _field = 'sponsorship_eligible' THEN jsonb_typeof(_v) = 'boolean'
    WHEN jsonb_typeof(_v) = 'string' THEN length(_v #>> '{}') <= CASE WHEN _field = 'progress_report' THEN 4000 ELSE 200 END
    ELSE jsonb_typeof(_v) = 'object' AND length(_v::text) <= 4000
  END;
$fn$;

-- يكتب القيمة على عمود الملف؛ يعيد false إن أمسكها قفل الهوية.
CREATE OR REPLACE FUNCTION public.golden_write_column(_orphan UUID, _col TEXT, _v JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _now JSONB;
BEGIN
  IF _col IS NULL THEN RETURN true; END IF;
  IF _col = 'country_code' THEN
    UPDATE public.orphans o SET country_code = _v #>> '{}',
           country = COALESCE((SELECT c.name_ar FROM public.countries c WHERE c.code = _v #>> '{}'), o.country)
     WHERE o.id = _orphan;
  ELSE
    EXECUTE format('UPDATE public.orphans o SET %1$I = (jsonb_populate_record(o, $1)).%1$I WHERE o.id = $2', _col)
      USING jsonb_build_object(_col, _v #>> '{}'), _orphan;
  END IF;
  EXECUTE format('SELECT to_jsonb(o.%I) FROM public.orphans o WHERE o.id = $1', _col) INTO _now USING _orphan;
  RETURN (_now #>> '{}') IS NOT DISTINCT FROM (_v #>> '{}');
EXCEPTION WHEN insufficient_privilege THEN
  RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION public.golden_open_conflict(
  _orphan UUID, _field TEXT, _kind TEXT, _risk TEXT,
  _current JSONB, _proposed JSONB, _wamy JSONB, _office JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.data_conflicts AS d (orphan_id, field, kind, risk, current_value, proposed_value, wamy_value, office_value)
  VALUES (_orphan, _field, _kind, _risk, _current, _proposed, _wamy, _office)
  ON CONFLICT (orphan_id, field) WHERE status = 'open' DO UPDATE SET
    kind = EXCLUDED.kind, risk = EXCLUDED.risk, current_value = EXCLUDED.current_value,
    proposed_value = EXCLUDED.proposed_value, wamy_value = EXCLUDED.wamy_value,
    office_value = EXCLUDED.office_value, updated_at = now();
END $fn$;

CREATE OR REPLACE FUNCTION public.golden_close_conflict(_orphan UUID, _field TEXT, _resolution TEXT, _actor UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.data_conflicts SET status = 'resolved', resolution = _resolution,
         resolved_by = _actor, resolved_at = now(), updated_at = now()
   WHERE orphan_id = _orphan AND field = _field AND status = 'open';
$fn$;

-- قلب الطبقة: يبني قرار الحقل من الملاحظات. لا يعتمد على ترتيب الوصول، فيُعاد
-- تشغيله بأمان بعد أي دفعة أو تغيير وضع.
CREATE OR REPLACE FUNCTION public.golden_evaluate(_orphan UUID, _field TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _fa public.field_authority; _mode TEXT; _own TEXT; _ver TEXT;
  _ow public.orphan_field_observations; _vo public.orphan_field_observations;
  _w JSONB; _o JSONB; _st public.orphan_field_state; _golden JSONB; _has_state BOOLEAN; _cur TEXT;
BEGIN
  SELECT * INTO _fa FROM public.field_authority WHERE field = _field;
  IF _fa.owner = 'platform' THEN RETURN; END IF;
  _mode := public.golden_office_mode((SELECT country_code FROM public.orphans WHERE id = _orphan));
  _own := public.golden_effective_owner(_fa.owner, _mode);
  _ver := CASE WHEN _own = 'wamy' THEN (CASE WHEN _mode IN ('shadow', 'active') THEN 'office' END)
               ELSE 'wamy' END;

  SELECT * INTO _ow FROM public.orphan_field_observations WHERE orphan_id = _orphan AND field = _field AND role = _own;
  IF _ver IS NOT NULL THEN
    SELECT * INTO _vo FROM public.orphan_field_observations WHERE orphan_id = _orphan AND field = _field AND role = _ver;
  END IF;
  _w := CASE WHEN _own = 'wamy' THEN _ow.value ELSE _vo.value END;
  _o := CASE WHEN _own = 'office' THEN _ow.value ELSE _vo.value END;
  SELECT * INTO _st FROM public.orphan_field_state WHERE orphan_id = _orphan AND field = _field;
  _has_state := _st.orphan_id IS NOT NULL;
  -- ملفٌّ سبق هذه الطبقة: قيمته على العمود هي «الحالية»، فلا يُكتب فوقها حرجٌ بصمت.
  IF NOT _has_state AND _fa.orphan_column IS NOT NULL THEN
    EXECUTE format('SELECT o.%I::text FROM public.orphans o WHERE o.id = $1', _fa.orphan_column) INTO _cur USING _orphan;
    _st.value := public.golden_normalize(_field, to_jsonb(_cur));
  END IF;

  IF _ow.value IS NOT NULL AND _ow.value IS DISTINCT FROM _st.value
     AND NOT (_st.pinned_until_after IS NOT NULL AND _ow.observed_at <= _st.pinned_until_after) THEN
    IF _fa.risk = 'critical' AND _st.value IS NOT NULL THEN
      -- قيمةٌ رفضها مشرفٌ من قبل لا تعيد فتح البند.
      IF NOT EXISTS (SELECT 1 FROM public.data_conflicts d WHERE d.orphan_id = _orphan AND d.field = _field
                        AND d.status = 'dismissed' AND d.proposed_value = _ow.value) THEN
        PERFORM public.golden_open_conflict(_orphan, _field, 'critical_change', _fa.risk, _st.value, _ow.value, _w, _o);
      END IF;
      RETURN;
    END IF;
    IF public.golden_write_column(_orphan, _fa.orphan_column, _ow.value) THEN
      INSERT INTO public.orphan_field_state AS s (orphan_id, field, value, from_role, applied_at)
      VALUES (_orphan, _field, _ow.value, _own, now())
      ON CONFLICT (orphan_id, field) DO UPDATE SET value = EXCLUDED.value, from_role = EXCLUDED.from_role,
        applied_at = now(), applied_by = NULL, pinned_until_after = NULL;
      _st.value := _ow.value;
      UPDATE public.data_conflicts SET status = 'resolved', resolution = 'superseded', resolved_at = now(), updated_at = now()
       WHERE orphan_id = _orphan AND field = _field AND status = 'open' AND kind IN ('critical_change', 'held_locked');
    ELSE
      PERFORM public.golden_open_conflict(_orphan, _field, 'held_locked', _fa.risk, _st.value, _ow.value, _w, _o);
      RETURN;
    END IF;
  ELSIF _ow.value IS NOT NULL AND _ow.value IS NOT DISTINCT FROM _st.value THEN
    IF NOT _has_state THEN
      INSERT INTO public.orphan_field_state (orphan_id, field, value, from_role) VALUES (_orphan, _field, _ow.value, _own);
    END IF;
    UPDATE public.data_conflicts SET status = 'resolved', resolution = 'superseded', resolved_at = now(), updated_at = now()
     WHERE orphan_id = _orphan AND field = _field AND status = 'open' AND kind IN ('critical_change', 'held_locked');
  END IF;

  IF EXISTS (SELECT 1 FROM public.data_conflicts WHERE orphan_id = _orphan AND field = _field
                AND status = 'open' AND kind <> 'disagreement') THEN
    RETURN;
  END IF;
  _golden := _st.value;
  IF _vo.value IS NOT NULL AND _golden IS NOT NULL AND _vo.value IS DISTINCT FROM _golden THEN
    PERFORM public.golden_open_conflict(_orphan, _field, 'disagreement', _fa.risk, _golden, NULL, _w, _o);
  ELSE
    PERFORM public.golden_close_conflict(_orphan, _field, 'auto_agreed', NULL);
  END IF;
END $fn$;

-- مرشّحو الربط: الاسم والدولة، ويضيّقهما الميلاد والجنس إن وردا.
CREATE OR REPLACE FUNCTION public.golden_link_candidates(_source TEXT, _country TEXT, _fields JSONB)
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(o.id ORDER BY o.created_at), '{}') FROM (
    SELECT o.id, o.created_at FROM public.orphans o
     WHERE o.country_code = _country
       AND lower(btrim(o.display_name)) = lower(btrim(_fields->>'display_name'))
       AND (public.golden_try_date(_fields->>'birth_date') IS NULL
            OR o.birth_date IS NULL OR o.birth_date = public.golden_try_date(_fields->>'birth_date'))
       AND (NULLIF(lower(btrim(_fields->>'gender')), '') IS NULL OR o.gender = lower(btrim(_fields->>'gender')))
       AND NOT EXISTS (SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = o.id AND l.source = _source)
     ORDER BY o.created_at LIMIT 5) o;
$fn$;

-- الاستيراد: نواةٌ واحدة لرفع الملف من الإدارة ولمفاتيح الواجهة البرمجية.
-- السجلّ: { external_ref, observed_at?, fields: { field: value } }
CREATE OR REPLACE FUNCTION public.golden_ingest_core(
  _role TEXT, _source TEXT, _country TEXT, _records JSONB, _actor UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _cfg public.country_data_sources; _r JSONB; _ref TEXT; _at TIMESTAMPTZ; _fields JSONB;
  _orphan UUID; _k TEXT; _v JSONB; _fa public.field_authority; _prev TIMESTAMPTZ;
  _observed INTEGER := 0; _unlinked INTEGER := 0; _skipped JSONB := '[]'::jsonb; _i INTEGER := -1;
  _touched TEXT[];
BEGIN
  IF _role NOT IN ('wamy', 'office') THEN RETURN jsonb_build_object('ok', false, 'code', 'role_unknown'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _country) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'country_unknown');
  END IF;
  IF jsonb_typeof(_records) <> 'array' OR jsonb_array_length(_records) = 0 OR jsonb_array_length(_records) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rows_invalid');
  END IF;
  IF _role = 'wamy' THEN
    _source := 'wamy';
  ELSE
    SELECT * INTO _cfg FROM public.country_data_sources WHERE country_code = _country;
    IF _cfg.office_mode IS NULL OR _cfg.office_mode = 'none' OR _cfg.office_source IS DISTINCT FROM _source THEN
      RETURN jsonb_build_object('ok', false, 'code', 'office_source_inactive');
    END IF;
  END IF;

  FOR _r IN SELECT * FROM jsonb_array_elements(_records) LOOP
    _i := _i + 1;
    _ref := NULLIF(btrim(COALESCE(_r->>'external_ref', '')), '');
    _fields := _r->'fields';
    IF jsonb_typeof(_r) <> 'object' OR _ref IS NULL OR length(_ref) > 120 OR jsonb_typeof(_fields) IS DISTINCT FROM 'object' THEN
      _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'reason', 'record_invalid');
      CONTINUE;
    END IF;
    BEGIN
      _at := COALESCE(NULLIF(_r->>'observed_at', '')::timestamptz, now());
    EXCEPTION WHEN others THEN
      _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'reason', 'observed_at_invalid');
      CONTINUE;
    END;
    IF _at > now() + interval '1 day' THEN
      _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'reason', 'observed_at_future');
      CONTINUE;
    END IF;

    SELECT orphan_id INTO _orphan FROM public.orphan_source_links WHERE source = _source AND external_ref = _ref;
    IF _orphan IS NULL THEN
      INSERT INTO public.source_link_queue AS q (role, source, external_ref, country_code, record, candidates)
      VALUES (_role, _source, _ref, _country, _r, public.golden_link_candidates(_source, _country, _fields))
      ON CONFLICT (source, external_ref) DO UPDATE SET record = EXCLUDED.record,
        candidates = EXCLUDED.candidates, country_code = EXCLUDED.country_code, updated_at = now()
        WHERE q.status = 'pending';
      _unlinked := _unlinked + 1;
      CONTINUE;
    END IF;
    IF (SELECT country_code FROM public.orphans WHERE id = _orphan) IS DISTINCT FROM _country
       AND NOT (_fields ? 'country') THEN
      _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'reason', 'country_mismatch');
      CONTINUE;
    END IF;

    _touched := '{}';
    FOR _k, _v IN SELECT * FROM jsonb_each(_fields) LOOP
      SELECT * INTO _fa FROM public.field_authority WHERE field = _k;
      IF _fa.field IS NULL THEN
        _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'field', _k, 'reason', 'field_unknown');
        CONTINUE;
      END IF;
      IF _fa.owner = 'platform' OR (_fa.owner <> _role AND _fa.verifier IS DISTINCT FROM _role) THEN
        _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'field', _k, 'reason', 'field_not_from_source');
        CONTINUE;
      END IF;
      _v := public.golden_normalize(_k, _v);
      IF _v IS NULL THEN CONTINUE; END IF;  -- الغياب ليس حذفاً
      IF NOT public.golden_valid(_k, _v) THEN
        _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'field', _k, 'reason', 'value_invalid');
        CONTINUE;
      END IF;
      SELECT observed_at INTO _prev FROM public.orphan_field_observations
       WHERE orphan_id = _orphan AND field = _k AND role = _role;
      IF _prev IS NOT NULL AND _at < _prev THEN
        _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'field', _k, 'reason', 'older_than_known');
        CONTINUE;
      END IF;
      INSERT INTO public.orphan_field_observations AS f (orphan_id, field, role, source, value, observed_at, received_at)
      VALUES (_orphan, _k, _role, _source, _v, _at, now())
      ON CONFLICT (orphan_id, field, role) DO UPDATE SET source = EXCLUDED.source, value = EXCLUDED.value,
        observed_at = EXCLUDED.observed_at, received_at = now();
      _observed := _observed + 1;
      _touched := _touched || _k;
    END LOOP;
    -- الدولة أوّلاً: تحدّد وضع المكتب الذي تُقيَّم به بقية الحقول.
    IF 'country' = ANY(_touched) THEN PERFORM public.golden_evaluate(_orphan, 'country'); END IF;
    FOREACH _k IN ARRAY _touched LOOP
      IF _k <> 'country' THEN PERFORM public.golden_evaluate(_orphan, _k); END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (_actor, 'golden_ingest', 'countries', NULL,
          jsonb_build_object('country', _country, 'role', _role, 'source', _source,
                             'records', jsonb_array_length(_records), 'observed', _observed, 'unlinked', _unlinked));

  RETURN jsonb_build_object('ok', true, 'observed', _observed, 'unlinked', _unlinked,
    'skipped_count', jsonb_array_length(_skipped),
    'skipped', COALESCE((SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(_skipped) x LIMIT 50) s), '[]'::jsonb),
    'open_conflicts', (SELECT count(*) FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
                        WHERE d.status = 'open' AND o.country_code = _country));
END $fn$;

-- مفتاح الواجهة البرمجية: `records:primary` للندوة، `records:verify` لمنصّة المكتب.
CREATE OR REPLACE FUNCTION public.golden_ingest(_client UUID, _country TEXT, _records JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _c public.api_clients;
BEGIN
  SELECT * INTO _c FROM public.api_clients c WHERE c.id = _client AND c.active AND c.revoked_at IS NULL;
  IF _c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted'); END IF;
  IF 'records:primary' = ANY(_c.scopes) THEN
    RETURN public.golden_ingest_core('wamy', 'wamy', _country, _records, NULL);
  ELSIF 'records:verify' = ANY(_c.scopes) THEN
    RETURN public.golden_ingest_core('office', _c.source, _country, _records, NULL);
  END IF;
  RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted');
END $fn$;

-- حالة الثقة لملفٍّ واحد.
CREATE OR REPLACE FUNCTION public.golden_trust(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH o AS (
    SELECT o.id, o.country_code, public.golden_office_mode(o.country_code) AS mode,
           COALESCE((SELECT stale_after_days FROM public.country_data_sources WHERE country_code = o.country_code), 180) AS stale_days
      FROM public.orphans o WHERE o.id = _orphan)
  SELECT jsonb_build_object(
    'state', CASE
      WHEN EXISTS (SELECT 1 FROM public.data_conflicts d WHERE d.orphan_id = o.id AND d.status = 'open') THEN 'conflict'
      WHEN NOT EXISTS (SELECT 1 FROM public.orphan_field_observations f WHERE f.orphan_id = o.id) THEN 'legacy'
      WHEN (SELECT max(f.observed_at) FROM public.orphan_field_observations f WHERE f.orphan_id = o.id)
           < now() - make_interval(days => o.stale_days) THEN 'stale'
      WHEN o.mode IN ('shadow', 'active') AND NOT EXISTS (
           SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = o.id AND l.role = 'office') THEN 'single_source'
      ELSE 'verified' END,
    'basis', CASE WHEN o.mode = 'none' THEN 'primary_only' ELSE 'two_sources' END,
    'mode', o.mode)
  FROM o;
$fn$;

-- بوابة الكفالة الجديدة: لا كفالة لملفٍّ متعارض أو بمصدرٍ واحد حين يوجد مؤكِّد.
CREATE OR REPLACE FUNCTION public.golden_accepts_new_support(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(public.golden_trust(_orphan)->>'state', 'legacy') IN ('verified', 'legacy', 'stale');
$fn$;


-- ---------------------------------------------------------------------
-- 7) أبواب الإدارة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_data_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', c.code, 'name_ar', c.name_ar, 'status', c.status,
      'office_source', s.office_source, 'office_mode', COALESCE(s.office_mode, 'none'),
      'stale_after_days', COALESCE(s.stale_after_days, 180),
      'platforms', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name) ORDER BY p.name)
                               FROM public.operating_platforms p WHERE p.country_code = c.code), '[]'::jsonb),
      'trust', (SELECT jsonb_build_object(
                  'verified', count(*) FILTER (WHERE t->>'state' = 'verified'),
                  'single_source', count(*) FILTER (WHERE t->>'state' = 'single_source'),
                  'conflict', count(*) FILTER (WHERE t->>'state' = 'conflict'),
                  'stale', count(*) FILTER (WHERE t->>'state' = 'stale'),
                  'legacy', count(*) FILTER (WHERE t->>'state' = 'legacy'))
                  FROM (SELECT public.golden_trust(o.id) AS t FROM public.orphans o
                         WHERE o.country_code = c.code AND o.exited_at IS NULL) x),
      'conflicts', (SELECT jsonb_build_object(
                      'critical', count(*) FILTER (WHERE d.risk = 'critical'),
                      'other', count(*) FILTER (WHERE d.risk <> 'critical'))
                      FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
                     WHERE d.status = 'open' AND o.country_code = c.code),
      'link_pending', (SELECT count(*) FROM public.source_link_queue q WHERE q.country_code = c.code AND q.status = 'pending'),
      'last_wamy', (SELECT max(f.received_at) FROM public.orphan_field_observations f
                      JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = c.code AND f.role = 'wamy'),
      'last_office', (SELECT max(f.received_at) FROM public.orphan_field_observations f
                        JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = c.code AND f.role = 'office'))
      ORDER BY c.sort_order, c.name_ar)
      FROM public.countries c LEFT JOIN public.country_data_sources s ON s.country_code = c.code
     WHERE c.status <> 'planned' OR s.country_code IS NOT NULL), '[]'::jsonb);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_country_source_set(
  _country TEXT, _source TEXT, _mode TEXT, _stale_days INTEGER DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _was TEXT; _n INTEGER := 0; _r RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _country) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'country_unknown');
  END IF;
  IF _mode NOT IN ('none', 'shadow', 'active') THEN RETURN jsonb_build_object('ok', false, 'code', 'mode_unknown'); END IF;
  _source := NULLIF(_source, '');
  IF _mode <> 'none' AND NOT EXISTS (SELECT 1 FROM public.operating_platforms p
                                      WHERE p.key = _source AND p.country_code = _country) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'source_unknown');
  END IF;
  IF _stale_days IS NOT NULL AND _stale_days NOT BETWEEN 30 AND 730 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_days_invalid');
  END IF;
  _was := public.golden_office_mode(_country);

  INSERT INTO public.country_data_sources AS s (country_code, office_source, office_mode, stale_after_days, changed_at, changed_by)
  VALUES (_country, _source, _mode, COALESCE(_stale_days, 180), now(), auth.uid())
  ON CONFLICT (country_code) DO UPDATE SET office_source = EXCLUDED.office_source, office_mode = EXCLUDED.office_mode,
    stale_after_days = COALESCE(_stale_days, s.stale_after_days), changed_at = now(), changed_by = auth.uid();

  IF _was IS DISTINCT FROM _mode THEN
    FOR _r IN SELECT DISTINCT f.orphan_id, f.field FROM public.orphan_field_observations f
                JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = _country LOOP
      PERFORM public.golden_evaluate(_r.orphan_id, _r.field);
      _n := _n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'country_source_mode', 'countries', NULL,
          jsonb_build_object('country', _country, 'from', _was, 'to', _mode, 'source', _source, 'reevaluated', _n));
  RETURN jsonb_build_object('ok', true, 'from', _was, 'to', _mode, 'reevaluated', _n);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_golden_import(_role TEXT, _country TEXT, _source TEXT, _records JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN public.golden_ingest_core(_role, COALESCE(_source, 'wamy'), _country, _records, auth.uid());
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_conflicts(_country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'rank', x->>'created_at') FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'orphan_id', o.id, 'code', o.code, 'name', o.display_name, 'country', o.country_code,
      'field', d.field, 'field_group', fa.field_group, 'kind', d.kind, 'risk', d.risk,
      'current', d.current_value, 'proposed', d.proposed_value, 'wamy', d.wamy_value, 'office', d.office_value,
      'created_at', d.created_at, 'updated_at', d.updated_at,
      'rank', CASE d.risk WHEN 'critical' THEN '0' WHEN 'medium' THEN '1' ELSE '2' END) AS x
      FROM public.data_conflicts d
      JOIN public.orphans o ON o.id = d.orphan_id
      JOIN public.field_authority fa ON fa.field = d.field
     WHERE d.status = 'open' AND (_country IS NULL OR o.country_code = _country)
     ORDER BY CASE d.risk WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, d.created_at
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $fn$;

-- accept: يطبّق المقترح · keep: يبقي الحالي ويرفض المقترح · use_wamy / use_office:
-- يعتمد قيمة مصدر · manual: قيمةٌ يكتبها المشرف. وما يُعتمد يدوياً يثبت حتى
-- تصل ملاحظةٌ أحدث من المالك.
CREATE OR REPLACE FUNCTION public.admin_conflict_resolve(_id UUID, _choice TEXT, _value JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.data_conflicts; _fa public.field_authority; _v JSONB; _pin TIMESTAMPTZ; _from TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _d FROM public.data_conflicts WHERE id = _id FOR UPDATE;
  IF _d.id IS NULL OR _d.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'conflict_closed'); END IF;
  SELECT * INTO _fa FROM public.field_authority WHERE field = _d.field;

  IF _choice = 'keep' THEN
    UPDATE public.data_conflicts SET status = 'dismissed', resolution = 'kept', resolved_by = auth.uid(),
           resolved_at = now(), updated_at = now() WHERE id = _id;
    IF _d.kind = 'disagreement' THEN
      UPDATE public.orphan_field_state SET pinned_until_after = now(), applied_by = auth.uid()
       WHERE orphan_id = _d.orphan_id AND field = _d.field;
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;

  _v := CASE _choice WHEN 'accept' THEN _d.proposed_value WHEN 'use_wamy' THEN _d.wamy_value
                     WHEN 'use_office' THEN _d.office_value WHEN 'manual' THEN public.golden_normalize(_d.field, _value) END;
  IF _choice NOT IN ('accept', 'use_wamy', 'use_office', 'manual') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'choice_unknown');
  END IF;
  IF _v IS NULL OR NOT public.golden_valid(_d.field, _v) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'value_invalid');
  END IF;
  -- قفل الهوية القائم يرفع orphan_locked هنا: الفكّ بطلبٍ وموافقتين، لا من هذا الباب.
  IF NOT public.golden_write_column(_d.orphan_id, _fa.orphan_column, _v) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'orphan_locked');
  END IF;
  _pin := CASE WHEN _choice = 'accept' THEN NULL ELSE now() END;
  _from := CASE _choice WHEN 'use_wamy' THEN 'wamy' WHEN 'use_office' THEN 'office' WHEN 'manual' THEN 'manual'
                ELSE public.golden_effective_owner(_fa.owner,
                       public.golden_office_mode((SELECT country_code FROM public.orphans WHERE id = _d.orphan_id))) END;
  INSERT INTO public.orphan_field_state AS s (orphan_id, field, value, from_role, applied_at, applied_by, pinned_until_after)
  VALUES (_d.orphan_id, _d.field, _v, _from, now(), auth.uid(), _pin)
  ON CONFLICT (orphan_id, field) DO UPDATE SET value = EXCLUDED.value, from_role = EXCLUDED.from_role,
    applied_at = now(), applied_by = auth.uid(), pinned_until_after = EXCLUDED.pinned_until_after;
  UPDATE public.data_conflicts SET status = 'resolved', resolution = CASE _choice WHEN 'accept' THEN 'accepted' ELSE _choice END,
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'golden_conflict_resolve', 'orphans', _d.orphan_id,
          jsonb_build_object('field', _d.field, 'choice', _choice, 'value', _v, 'was', _d.current_value));
  RETURN jsonb_build_object('ok', true);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_link_queue(_country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object(
      'id', q.id, 'role', q.role, 'source', q.source, 'external_ref', q.external_ref, 'country', q.country_code,
      'name', q.record->'fields'->>'display_name', 'birth_date', q.record->'fields'->>'birth_date',
      'gender', q.record->'fields'->>'gender', 'created_at', q.created_at,
      'candidates', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                                'birth_date', o.birth_date, 'region', o.region))
                                FROM public.orphans o WHERE o.id = ANY(q.candidates)), '[]'::jsonb)) AS x
      FROM public.source_link_queue q
     WHERE q.status = 'pending' AND (_country IS NULL OR q.country_code = _country)
     ORDER BY cardinality(q.candidates) DESC, q.created_at
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $fn$;

-- إنشاء ملفٍّ من سجلٍّ في الطابور: «قيد المراجعة» دائماً، كالمرآة.
CREATE OR REPLACE FUNCTION public.golden_create_from_queue(_q public.source_link_queue, _actor UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _f JSONB := _q.record->'fields'; _id UUID; _gender TEXT;
BEGIN
  _gender := lower(btrim(COALESCE(_f->>'gender', '')));
  IF NULLIF(btrim(COALESCE(_f->>'display_name', '')), '') IS NULL THEN RAISE EXCEPTION 'name_required'; END IF;
  IF _gender NOT IN ('male', 'female') THEN RAISE EXCEPTION 'gender_required'; END IF;
  INSERT INTO public.orphans (code, created_by, display_name, gender, birth_date, country, country_code,
                              monthly_need, currency, status)
  SELECT public.next_orphan_code(), _actor, btrim(_f->>'display_name'), _gender,
         public.golden_try_date(_f->>'birth_date'), c.name_ar, c.code, 0,
         COALESCE(c.currency, public.default_operating_currency(c.code)), 'under_review'
    FROM public.countries c WHERE c.code = _q.country_code
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;

CREATE OR REPLACE FUNCTION public.golden_link_from_queue(_q public.source_link_queue, _orphan UUID, _method TEXT, _actor UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.orphan_source_links (source, external_ref, orphan_id, role, method, linked_by)
  VALUES (_q.source, _q.external_ref, _orphan, _q.role, _method, _actor);
  UPDATE public.source_link_queue SET status = CASE WHEN _method = 'created' THEN 'created' ELSE 'linked' END,
         resolved_by = _actor, resolved_at = now(), updated_at = now() WHERE id = _q.id;
  -- السجلّ الذي انتظر يُطبَّق الآن بالمسار نفسه.
  RETURN public.golden_ingest_core(_q.role, _q.source, _q.country_code, jsonb_build_array(_q.record), _actor);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_link_resolve(_id UUID, _action TEXT, _orphan UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _q public.source_link_queue; _new UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.source_link_queue WHERE id = _id FOR UPDATE;
  IF _q.id IS NULL OR _q.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'code', 'link_closed'); END IF;

  IF _action = 'ignore' THEN
    UPDATE public.source_link_queue SET status = 'ignored', resolved_by = auth.uid(), resolved_at = now(),
           updated_at = now() WHERE id = _id;
    RETURN jsonb_build_object('ok', true);
  ELSIF _action = 'link' THEN
    IF NOT EXISTS (SELECT 1 FROM public.orphans o WHERE o.id = _orphan AND o.country_code = _q.country_code) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'orphan_unknown');
    END IF;
    IF EXISTS (SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = _orphan AND l.source = _q.source) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'already_linked');
    END IF;
    RETURN public.golden_link_from_queue(_q, _orphan, 'manual', auth.uid());
  ELSIF _action = 'create' THEN
    IF _q.role <> 'wamy' THEN RETURN jsonb_build_object('ok', false, 'code', 'create_primary_only'); END IF;
    BEGIN
      _new := public.golden_create_from_queue(_q, auth.uid());
    EXCEPTION WHEN raise_exception THEN
      RETURN jsonb_build_object('ok', false, 'code', SQLERRM);
    END;
    RETURN public.golden_link_from_queue(_q, _new, 'created', auth.uid()) || jsonb_build_object('orphan_id', _new);
  END IF;
  RETURN jsonb_build_object('ok', false, 'code', 'action_unknown');
END $fn$;

-- الإنشاء الجماعي لسجلّات الندوة التي لا مرشّح لها: الاستيراد الأوّل لدولة.
CREATE OR REPLACE FUNCTION public.admin_link_create_unmatched(_country TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _q public.source_link_queue; _new UUID; _created INTEGER := 0; _failed INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  FOR _q IN SELECT * FROM public.source_link_queue
             WHERE country_code = _country AND status = 'pending' AND role = 'wamy' AND cardinality(candidates) = 0
             ORDER BY created_at LIMIT 500 FOR UPDATE LOOP
    BEGIN
      _new := public.golden_create_from_queue(_q, auth.uid());
      PERFORM public.golden_link_from_queue(_q, _new, 'created', auth.uid());
      _created := _created + 1;
    EXCEPTION WHEN raise_exception THEN
      _failed := _failed + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'created', _created, 'failed', _failed);
END $fn$;


-- ---------------------------------------------------------------------
-- 8) الصلاحيات
-- ---------------------------------------------------------------------
DO $grants$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'golden_office_mode(TEXT)', 'golden_effective_owner(TEXT, TEXT)', 'golden_try_date(TEXT)',
    'golden_normalize(TEXT, JSONB)', 'golden_valid(TEXT, JSONB)', 'golden_write_column(UUID, TEXT, JSONB)',
    'golden_open_conflict(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB)',
    'golden_close_conflict(UUID, TEXT, TEXT, UUID)', 'golden_evaluate(UUID, TEXT)',
    'golden_link_candidates(TEXT, TEXT, JSONB)', 'golden_ingest_core(TEXT, TEXT, TEXT, JSONB, UUID)',
    'golden_ingest(UUID, TEXT, JSONB)', 'golden_trust(UUID)', 'golden_accepts_new_support(UUID)',
    'golden_create_from_queue(public.source_link_queue, UUID)',
    'golden_link_from_queue(public.source_link_queue, UUID, TEXT, UUID)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', _f);
  END LOOP;
  FOREACH _f IN ARRAY ARRAY[
    'admin_data_health()', 'admin_country_source_set(TEXT, TEXT, TEXT, INTEGER)',
    'admin_golden_import(TEXT, TEXT, TEXT, JSONB)', 'admin_conflicts(TEXT, INTEGER)',
    'admin_conflict_resolve(UUID, TEXT, JSONB)', 'admin_link_queue(TEXT, INTEGER)',
    'admin_link_resolve(UUID, TEXT, UUID)', 'admin_link_create_unmatched(TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
END $grants$;
