-- =====================================================================
-- مركز عمل فريق الدولة: الحسم الجماعي، وملف الطفل الموحّد
-- ---------------------------------------------------------------------
-- 1) `admin_conflicts_resolve_bulk`: يحسم فروقاً كثيرة دفعةً واحدة بالباب نفسه
--    (`admin_conflict_resolve`) لكل بند، فلا تُكرَّر القواعد ولا تنجرف. قبل الباب:
--    النطاق أولاً (`country_can … 'approve'`) فلا يعرف عضو دولةٍ أخرى شيئاً عن البند،
--    ثم الرفض المطلق للبند الحرج: الحرج يُحسم واحداً واحداً بعينين، لا جماعياً أبداً.
-- 2) `country_child_file`: ملف الطفل كما يراه الفريق: القيمة المعتمدة لكل حقلٍ
--    ومصدرها، وملاحظة كل مصدر، وتاريخ الحقل. النطاق قبل أي قراءة، ولا صور ولا مواقع.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_conflicts_resolve_bulk(_ids UUID[], _choice TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _id UUID; _d public.data_conflicts; _country TEXT; _r JSONB;
  _out JSONB := '[]'::jsonb; _done INTEGER := 0; _failed INTEGER := 0;
BEGIN
  IF _choice IS NULL OR _choice NOT IN ('use_wamy', 'use_office', 'keep') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'choice_unknown');
  END IF;
  IF _ids IS NULL OR cardinality(_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'nothing_selected');
  END IF;
  IF cardinality(_ids) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many');
  END IF;

  FOR _id IN SELECT DISTINCT u FROM unnest(_ids) u WHERE u IS NOT NULL LOOP
    _d := NULL;
    SELECT * INTO _d FROM public.data_conflicts WHERE id = _id;
    _country := (SELECT country_code FROM public.orphans WHERE id = _d.orphan_id);
    -- النطاق قبل كل شيء: بندٌ مجهول وبندٌ في دولةٍ أخرى يعودان بالرمز نفسه.
    IF NOT public.country_can(_country, 'approve') THEN
      _r := jsonb_build_object('ok', false, 'code', 'country_forbidden');
    ELSIF _d.risk = 'critical' THEN
      _r := jsonb_build_object('ok', false, 'code', 'critical_not_bulk');
    ELSIF _d.kind <> 'disagreement' THEN
      _r := jsonb_build_object('ok', false, 'code', 'not_disagreement');
    ELSE
      BEGIN
        _r := public.admin_conflict_resolve(_id, _choice, NULL);
      EXCEPTION
        WHEN insufficient_privilege THEN _r := jsonb_build_object('ok', false, 'code', 'country_forbidden');
        WHEN others THEN _r := jsonb_build_object('ok', false, 'code', 'failed');
      END;
    END IF;
    IF COALESCE((_r->>'ok')::boolean, false) THEN _done := _done + 1; ELSE _failed := _failed + 1; END IF;
    _out := _out || jsonb_build_array(jsonb_build_object('id', _id, 'ok', COALESCE((_r->>'ok')::boolean, false),
                                                         'code', _r->>'code'));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'done', _done, 'failed', _failed, 'results', _out);
END $fn$;

CREATE OR REPLACE FUNCTION public.country_child_file(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _country TEXT; _o public.orphans;
BEGIN
  _country := (SELECT country_code FROM public.orphans WHERE id = _orphan);
  -- النطاق قبل أي قراءة: ملفٌّ مجهول وملفٌّ في دولةٍ أخرى سواء.
  IF NOT public.country_can(_country, 'read') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _orphan;
  IF _o.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'orphan_unknown'); END IF;

  RETURN jsonb_build_object(
    'id', _o.id, 'code', _o.code, 'name', _o.display_name, 'country', _o.country_code,
    'status', _o.status, 'trust', public.golden_trust(_o.id)->>'state',
    'office_mode', public.golden_office_mode(_o.country_code),
    'fields', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'field', fa.field, 'field_group', fa.field_group, 'risk', fa.risk,
        'owner', public.golden_effective_owner(fa.owner, public.golden_office_mode(_o.country_code)),
        'value', s.value, 'from_role', s.from_role, 'applied_at', s.applied_at,
        'pinned', s.pinned_until_after IS NOT NULL,
        'wamy', (SELECT jsonb_build_object('value', w.value, 'observed_at', w.observed_at, 'source', w.source)
                   FROM public.orphan_field_observations w
                  WHERE w.orphan_id = _o.id AND w.field = fa.field AND w.role = 'wamy'),
        'office', (SELECT jsonb_build_object('value', f.value, 'observed_at', f.observed_at, 'source', f.source)
                     FROM public.orphan_field_observations f
                    WHERE f.orphan_id = _o.id AND f.field = fa.field AND f.role = 'office'),
        'open_conflict', EXISTS (SELECT 1 FROM public.data_conflicts d
                                  WHERE d.orphan_id = _o.id AND d.field = fa.field AND d.status = 'open'))
        ORDER BY fa.sort_order)
      FROM public.field_authority fa
      LEFT JOIN public.orphan_field_state s ON s.orphan_id = _o.id AND s.field = fa.field
     WHERE s.orphan_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.orphan_field_observations x WHERE x.orphan_id = _o.id AND x.field = fa.field)),
      '[]'::jsonb),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'field', h.field, 'role', h.role, 'source', h.source, 'value', h.value, 'was', h.was,
        'changed', h.changed, 'observed_at', h.observed_at, 'received_at', h.received_at) ORDER BY h.id DESC)
      FROM (SELECT * FROM public.orphan_field_history WHERE orphan_id = _o.id ORDER BY id DESC LIMIT 200) h),
      '[]'::jsonb));
END $fn$;

DO $grants$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY['admin_conflicts_resolve_bulk(UUID[], TEXT)', 'country_child_file(UUID)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
END $grants$;
