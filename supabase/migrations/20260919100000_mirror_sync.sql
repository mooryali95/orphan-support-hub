-- =====================================================================
-- كهاتين — مزامنة المرآة مع منصّة التشغيل (الرواد)
-- ---------------------------------------------------------------------
-- اتجاهٌ واحد: الرواد تكتب، وكهاتين تقرأ. تدفع الرواد دفعاتٍ لكل كيان
-- (مجموعات، طلاب، أبعاد، سمات، درجات) بمؤشّر (cursor_at, cursor_ref)
-- يُحفظ هنا لتعرف من أين تستأنف. المحذوف هناك علامةٌ هنا لا مسح.
-- والمطابقة الدورية تُرسل كل المعرّفات فيُكتب الانحراف للإدارة.
--
-- الحماية:
--   • الباب mirror_apply لـ service_role وحده (البوّابة بعد فحص المفتاح).
--   • المفتاح يحمل نطاق mirror:write ومرتبطٌ بمنصّةٍ واحدة لا يكتب لغيرها.
--   • الطالب المستورَد يقف «قيد المراجعة» (الحارس القائم)، فلا يُنشر طفلٌ
--     بمفتاحٍ مسرَّب.
-- =====================================================================

ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_api_scopes_known;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_api_scopes_known CHECK (
  scopes <@ ARRAY['orphans:read', 'orphans:import', 'mirror:write'] AND cardinality(scopes) > 0);
ALTER TABLE public.api_clients
  ADD COLUMN IF NOT EXISTS source TEXT REFERENCES public.operating_platforms(key);
ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_mirror_needs_source;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_mirror_needs_source
  CHECK (NOT ('mirror:write' = ANY(scopes)) OR source IS NOT NULL);

-- الجهة المسؤولة عن أطفال منصّة التشغيل في كهاتين.
ALTER TABLE public.operating_platforms
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.care_organizations(id);

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS external_deleted_at TIMESTAMPTZ;


CREATE OR REPLACE FUNCTION public.mirror_apply(
  _client UUID, _entity TEXT, _records JSONB, _deleted TEXT[] DEFAULT '{}',
  _cursor_at TIMESTAMPTZ DEFAULT NULL, _cursor_ref TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _src TEXT; _p public.operating_platforms; _r JSONB; _n INTEGER := 0; _skipped JSONB := '[]'::jsonb;
  _dim UUID; _trait UUID; _orphan UUID; _group UUID; _cname TEXT;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted'); END IF;
  SELECT * INTO _p FROM public.operating_platforms WHERE key = _src AND active;
  IF _p.key IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'platform_inactive'); END IF;
  IF jsonb_typeof(COALESCE(_records, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(_records, '[]')) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_batch');
  END IF;
  SELECT name_ar INTO _cname FROM public.countries WHERE code = _p.country_code;

  FOR _r IN SELECT * FROM jsonb_array_elements(COALESCE(_records, '[]'::jsonb)) LOOP
    IF NULLIF(btrim(COALESCE(_r->>'external_ref', _r->>'key', '')), '') IS NULL THEN
      _skipped := _skipped || jsonb_build_object('reason', 'external_ref_required');
      CONTINUE;
    END IF;

    IF _entity = 'groups' THEN
      INSERT INTO public.mirror_groups AS g (source, external_ref, name, country_code, region,
             institution_ref, institution_name, supervisor_ref, supervisor_name, source_updated_at, synced_at, deleted_at)
      VALUES (_src, _r->>'external_ref', COALESCE(NULLIF(_r->>'name', ''), 'مجموعة'), _p.country_code,
              NULLIF(_r->>'region', ''), NULLIF(_r->>'institution_ref', ''), NULLIF(_r->>'institution_name', ''),
              NULLIF(_r->>'supervisor_ref', ''), NULLIF(_r->>'supervisor_name', ''),
              NULLIF(_r->>'updated_at', '')::timestamptz, now(), NULL)
      ON CONFLICT (source, external_ref) DO UPDATE SET
        name = EXCLUDED.name, region = EXCLUDED.region, institution_ref = EXCLUDED.institution_ref,
        institution_name = EXCLUDED.institution_name, supervisor_ref = EXCLUDED.supervisor_ref,
        supervisor_name = EXCLUDED.supervisor_name, source_updated_at = EXCLUDED.source_updated_at,
        synced_at = now(), deleted_at = NULL;

    ELSIF _entity = 'students' THEN
      IF _p.org_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'platform_org_missing'); END IF;
      SELECT id INTO _group FROM public.mirror_groups
       WHERE source = _src AND external_ref = NULLIF(_r->>'group_ref', '');
      SELECT id INTO _orphan FROM public.orphans
       WHERE external_source = _src AND external_ref = _r->>'external_ref';
      IF _orphan IS NULL THEN
        IF NULLIF(btrim(COALESCE(_r->>'display_name', '')), '') IS NULL THEN
          _skipped := _skipped || jsonb_build_object('ref', _r->>'external_ref', 'reason', 'display_name_required');
          CONTINUE;
        END IF;
        -- العمر عددٌ في الرواد؛ يُحوَّل لتاريخٍ تقريبيّ (أول السنة) تكفي منه الفئة العمرية.
        INSERT INTO public.orphans (code, org_id, external_source, external_ref, display_name, gender,
               birth_date, country, region, education_stage, monthly_need, currency, status, group_id)
        VALUES (public.next_orphan_code(), _p.org_id, _src, _r->>'external_ref', btrim(_r->>'display_name'),
                CASE WHEN _r->>'gender' = 'female' THEN 'female' ELSE 'male' END,
                CASE WHEN NULLIF(_r->>'age', '') IS NOT NULL
                     THEN make_date(extract(year FROM now())::int - (_r->>'age')::int, 1, 1) END,
                COALESCE(_cname, _p.country_code), NULLIF(_r->>'region', ''),
                NULLIF(_r->>'education_stage', ''), 0, 'EUR', 'under_review', _group);
      ELSE
        UPDATE public.orphans o SET
          display_name = COALESCE(NULLIF(btrim(_r->>'display_name'), ''), o.display_name),
          region = COALESCE(NULLIF(_r->>'region', ''), o.region),
          education_stage = COALESCE(NULLIF(_r->>'education_stage', ''), o.education_stage),
          group_id = COALESCE(_group, o.group_id),
          external_deleted_at = NULL
         WHERE o.id = _orphan;
      END IF;

    ELSIF _entity = 'trait_dimensions' THEN
      INSERT INTO public.trait_dimensions AS d (source, key, label_ar, label_local, description, sort_order)
      VALUES (_src, COALESCE(_r->>'key', _r->>'external_ref'), COALESCE(NULLIF(_r->>'label_ar', ''), _r->>'key'),
              NULLIF(_r->>'label_local', ''), NULLIF(_r->>'description', ''),
              COALESCE(NULLIF(_r->>'sort_order', '')::int, 100))
      ON CONFLICT (source, key) DO UPDATE SET label_ar = EXCLUDED.label_ar,
        label_local = EXCLUDED.label_local, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

    ELSIF _entity = 'traits' THEN
      SELECT id INTO _dim FROM public.trait_dimensions WHERE source = _src AND key = _r->>'dimension_key';
      IF _dim IS NULL THEN
        _skipped := _skipped || jsonb_build_object('ref', _r->>'external_ref', 'reason', 'unknown_dimension');
        CONTINUE;
      END IF;
      INSERT INTO public.trait_definitions AS t (source, external_ref, dimension_id, stage_label, name_ar,
             name_local, definition_ar, definition_local, elements, sort_order, deleted_at)
      VALUES (_src, _r->>'external_ref', _dim, NULLIF(_r->>'stage_label', ''),
              COALESCE(NULLIF(_r->>'name_ar', ''), _r->>'external_ref'), NULLIF(_r->>'name_local', ''),
              NULLIF(_r->>'definition_ar', ''), NULLIF(_r->>'definition_local', ''),
              CASE WHEN jsonb_typeof(_r->'elements') = 'array' THEN _r->'elements' ELSE '[]'::jsonb END,
              COALESCE(NULLIF(_r->>'sort_order', '')::int, 100), NULL)
      ON CONFLICT (source, external_ref) DO UPDATE SET dimension_id = EXCLUDED.dimension_id,
        stage_label = EXCLUDED.stage_label, name_ar = EXCLUDED.name_ar, name_local = EXCLUDED.name_local,
        definition_ar = EXCLUDED.definition_ar, definition_local = EXCLUDED.definition_local,
        elements = EXCLUDED.elements, sort_order = EXCLUDED.sort_order, deleted_at = NULL;

    ELSIF _entity = 'trait_scores' THEN
      SELECT id INTO _orphan FROM public.orphans WHERE external_source = _src AND external_ref = _r->>'student_ref';
      SELECT id INTO _trait FROM public.trait_definitions WHERE source = _src AND external_ref = _r->>'trait_ref';
      IF _orphan IS NULL OR _trait IS NULL
         OR NULLIF(_r->>'score', '') IS NULL OR NULLIF(_r->>'observed_at', '') IS NULL THEN
        _skipped := _skipped || jsonb_build_object('ref', _r->>'external_ref', 'reason', 'unresolved_reference');
        CONTINUE;
      END IF;
      INSERT INTO public.orphan_trait_scores AS s (source, external_ref, orphan_id, trait_id, score, scale_max, observed_at, note, deleted_at)
      VALUES (_src, _r->>'external_ref', _orphan, _trait, (_r->>'score')::numeric,
              COALESCE(NULLIF(_r->>'scale_max', '')::numeric, 100), (_r->>'observed_at')::timestamptz,
              NULLIF(_r->>'note', ''), NULL)
      ON CONFLICT (source, external_ref) DO UPDATE SET score = EXCLUDED.score, scale_max = EXCLUDED.scale_max,
        observed_at = EXCLUDED.observed_at, note = EXCLUDED.note, deleted_at = NULL;
    ELSE
      RETURN jsonb_build_object('ok', false, 'code', 'unknown_entity');
    END IF;
    _n := _n + 1;
  END LOOP;

  -- علامات الحذف
  IF cardinality(COALESCE(_deleted, '{}')) > 0 THEN
    CASE _entity
      WHEN 'groups' THEN UPDATE public.mirror_groups SET deleted_at = now()
                          WHERE source = _src AND external_ref = ANY(_deleted);
      WHEN 'students' THEN UPDATE public.orphans SET external_deleted_at = now()
                            WHERE external_source = _src AND external_ref = ANY(_deleted);
      WHEN 'traits' THEN UPDATE public.trait_definitions SET deleted_at = now()
                          WHERE source = _src AND external_ref = ANY(_deleted);
      WHEN 'trait_scores' THEN UPDATE public.orphan_trait_scores SET deleted_at = now()
                                WHERE source = _src AND external_ref = ANY(_deleted);
      ELSE NULL;
    END CASE;
  END IF;

  INSERT INTO public.mirror_sync_state AS m (source, entity, cursor_at, cursor_ref, last_run_at, last_error)
  VALUES (_src, _entity, _cursor_at, _cursor_ref, now(), NULL)
  ON CONFLICT (source, entity) DO UPDATE SET
    cursor_at = COALESCE(EXCLUDED.cursor_at, m.cursor_at),
    cursor_ref = COALESCE(EXCLUDED.cursor_ref, m.cursor_ref),
    last_run_at = now(), last_error = NULL;

  RETURN jsonb_build_object('ok', true, 'applied', _n, 'deleted', cardinality(COALESCE(_deleted, '{}')),
                            'skipped', _skipped);
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_apply(UUID, TEXT, JSONB, TEXT[], TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_apply(UUID, TEXT, JSONB, TEXT[], TIMESTAMPTZ, TEXT) TO service_role;


-- المطابقة: الرواد ترسل كل معرّفات الكيان؛ يُكتب ما ينقص هنا وما زاد.
CREATE OR REPLACE FUNCTION public.mirror_reconcile(_client UUID, _entity TEXT, _refs TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _src TEXT; _ours TEXT[]; _drift JSONB;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted'); END IF;
  _ours := CASE _entity
    WHEN 'groups' THEN ARRAY(SELECT external_ref FROM public.mirror_groups WHERE source = _src AND deleted_at IS NULL)
    WHEN 'students' THEN ARRAY(SELECT external_ref FROM public.orphans
                                WHERE external_source = _src AND external_deleted_at IS NULL)
    WHEN 'traits' THEN ARRAY(SELECT external_ref FROM public.trait_definitions WHERE source = _src AND deleted_at IS NULL)
    WHEN 'trait_scores' THEN ARRAY(SELECT external_ref FROM public.orphan_trait_scores WHERE source = _src AND deleted_at IS NULL)
    ELSE NULL END;
  IF _ours IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'unknown_entity'); END IF;
  _drift := jsonb_build_object(
    'checked_at', now(),
    'upstream', cardinality(COALESCE(_refs, '{}')),
    'here', cardinality(_ours),
    'missing_here', to_jsonb(ARRAY(SELECT unnest(COALESCE(_refs, '{}')) EXCEPT SELECT unnest(_ours) LIMIT 200)),
    'missing_upstream', to_jsonb(ARRAY(SELECT unnest(_ours) EXCEPT SELECT unnest(COALESCE(_refs, '{}')) LIMIT 200)));
  INSERT INTO public.mirror_sync_state AS m (source, entity, last_run_at, drift)
  VALUES (_src, _entity, now(), _drift)
  ON CONFLICT (source, entity) DO UPDATE SET drift = EXCLUDED.drift, last_run_at = now();
  RETURN jsonb_build_object('ok', true, 'drift', _drift);
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_reconcile(UUID, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_reconcile(UUID, TEXT, TEXT[]) TO service_role;


CREATE OR REPLACE FUNCTION public.admin_mirror_status()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'platforms', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name,
                     'country', p.country_code, 'active', p.active, 'org_id', p.org_id)) FROM public.operating_platforms p), '[]'::jsonb),
    'state', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', m.source, 'entity', m.entity,
                 'cursor_at', m.cursor_at, 'last_run_at', m.last_run_at, 'last_error', m.last_error,
                 'drift', m.drift) ORDER BY m.source, m.entity) FROM public.mirror_sync_state m), '[]'::jsonb),
    'counts', jsonb_build_object(
      'groups', (SELECT count(*) FROM public.mirror_groups WHERE deleted_at IS NULL),
      'students', (SELECT count(*) FROM public.orphans WHERE external_source IS NOT NULL AND external_deleted_at IS NULL),
      'students_deleted_upstream', (SELECT count(*) FROM public.orphans WHERE external_deleted_at IS NOT NULL),
      'traits', (SELECT count(*) FROM public.trait_definitions WHERE deleted_at IS NULL),
      'scores', (SELECT count(*) FROM public.orphan_trait_scores WHERE deleted_at IS NULL)));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_mirror_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mirror_status() TO authenticated;

-- ربط منصّة التشغيل بجهتها — للإدارة.
CREATE OR REPLACE FUNCTION public.admin_set_platform_org(_platform TEXT, _org UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.operating_platforms SET org_id = _org WHERE key = _platform;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_platform_org(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_org(TEXT, UUID) TO authenticated;


-- إصدار مفتاح مزامنةٍ مرتبطٍ بمنصّة تشغيل.
CREATE OR REPLACE FUNCTION public.create_api_client(
  _name TEXT, _org UUID, _scopes TEXT[], _key TEXT,
  _salt TEXT, _hash TEXT, _prefix TEXT, _source TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إصدار المفاتيح للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(_name), '') = '' THEN
    RAISE EXCEPTION 'اسم العميل مطلوب' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.api_clients
    (name, client_key, secret_hash, secret_salt, secret_prefix, org_id, scopes, created_by, source)
  VALUES (btrim(_name), _key, _hash, _salt, _prefix, _org, _scopes, auth.uid(), NULLIF(_source, ''))
  RETURNING id INTO _id;
  PERFORM public.write_audit('api_client.created', 'api_client', _id,
    jsonb_build_object('scopes', to_jsonb(_scopes), 'org', _org, 'source', _source));
  RETURN jsonb_build_object('id', _id, 'client_key', _key);
END $fn$;
REVOKE ALL ON FUNCTION public.create_api_client(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_client(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
