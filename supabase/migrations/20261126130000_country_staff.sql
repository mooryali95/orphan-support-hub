-- =====================================================================
-- صلاحيات الدول: ٥٠٠ عاملٍ لا يمرّون كلّهم بالإدارة المركزية
-- ---------------------------------------------------------------------
-- لكل دولةٍ فريقها (`country_staff`) بثلاثة أدوار:
--   supervisor  مشرف الدولة: يرى ويرفع ويحسم التعارضات والتنبيهات ويربط
--               السجلّات، ويضيف مدخلي البيانات والمطّلعين في دولته.
--   data_entry  مدخل بيانات: يرى ويرفع ملفّات المصادر، ولا يحسم شيئاً.
--   viewer      مطّلع: يرى صحة دولته وتنبيهاتها فقط.
-- الإدارة ترى كل الدول، وتعيّن المشرفين، وحدها تغيّر وضع منصّة المكتب.
--
-- العينان: ما رفعه عضوٌ لا يعتمد هو تغييره الحرج، ولا يحسم تنبيهاً حرجاً أثاره
-- رفعُه؛ يحسمه مشرفٌ آخر أو الإدارة. الرفع يُسجَّل باسم صاحبه في الملاحظة
-- والسجلّ التاريخي والتنبيه (`golden.actor`).
-- والمشرف كالمدير: إن فعّل المصادقة الثنائية لا يُقبل حسمه إلا بجلسة aal2.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.country_staff (
  country_code  TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('supervisor', 'data_entry', 'viewer')),
  added_by      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, user_id)
);
CREATE INDEX IF NOT EXISTS idx_country_staff_user ON public.country_staff(user_id);
ALTER TABLE public.country_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cs_read ON public.country_staff;
CREATE POLICY cs_read ON public.country_staff FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
REVOKE ALL ON public.country_staff FROM anon, authenticated;
GRANT SELECT ON public.country_staff TO authenticated;

ALTER TABLE public.orphan_field_observations ADD COLUMN IF NOT EXISTS received_by UUID;
ALTER TABLE public.orphan_field_history ADD COLUMN IF NOT EXISTS received_by UUID;
ALTER TABLE public.data_alerts ADD COLUMN IF NOT EXISTS raised_by UUID;

-- جلسةٌ بقوّة الإدارة: aal2، أو لا عامل ثنائيّاً موثّقاً بعد.
CREATE OR REPLACE FUNCTION public.session_strong()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified');
$fn$;

-- read · import · approve · manage
CREATE OR REPLACE FUNCTION public.country_can(_country TEXT, _need TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.country_staff s
     WHERE s.user_id = auth.uid() AND s.country_code = _country
       AND CASE _need
             WHEN 'read' THEN true
             WHEN 'import' THEN s.role IN ('supervisor', 'data_entry')
             WHEN 'approve' THEN s.role = 'supervisor' AND public.session_strong()
             WHEN 'manage' THEN s.role = 'supervisor' AND public.session_strong()
             ELSE false END);
$fn$;

CREATE OR REPLACE FUNCTION public.my_country_access()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'admin', public.is_admin(),
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', c.code, 'name_ar', c.name_ar, 'role', s.role)
                                             ORDER BY c.sort_order, c.name_ar)
                             FROM public.country_staff s JOIN public.countries c ON c.code = s.country_code
                            WHERE s.user_id = auth.uid()), '[]'::jsonb));
$fn$;

CREATE OR REPLACE FUNCTION public.country_staff_list(_country TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.country_can(_country, 'manage') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', s.user_id, 'email', u.email, 'role', s.role,
                                                        'created_at', s.created_at)
                                     ORDER BY CASE s.role WHEN 'supervisor' THEN 0 WHEN 'data_entry' THEN 1 ELSE 2 END, u.email)
                     FROM public.country_staff s JOIN auth.users u ON u.id = s.user_id
                    WHERE s.country_code = _country), '[]'::jsonb);
END $fn$;

-- الإدارة تعيّن أيّ دور؛ المشرف يضيف ويزيل مدخلي البيانات والمطّلعين في دولته فقط.
-- _role = NULL يزيل العضو.
CREATE OR REPLACE FUNCTION public.country_staff_set(_country TEXT, _email TEXT, _role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID; _was TEXT; _admin BOOLEAN := public.is_admin();
BEGIN
  IF NOT public.country_can(_country, 'manage') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  IF _role IS NOT NULL AND _role NOT IN ('supervisor', 'data_entry', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'role_unknown');
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(btrim(COALESCE(_email, '')));
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'user_not_found'); END IF;
  SELECT role INTO _was FROM public.country_staff WHERE country_code = _country AND user_id = _uid;
  IF NOT _admin AND (_uid = auth.uid() OR _role = 'supervisor' OR _was = 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'role_forbidden');
  END IF;
  IF _role IS NULL THEN
    DELETE FROM public.country_staff WHERE country_code = _country AND user_id = _uid;
  ELSE
    INSERT INTO public.country_staff AS s (country_code, user_id, role, added_by)
    VALUES (_country, _uid, _role, auth.uid())
    ON CONFLICT (country_code, user_id) DO UPDATE SET role = EXCLUDED.role, added_by = EXCLUDED.added_by;
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'country_staff_set', 'country_staff', _uid,
          jsonb_build_object('country', _country, 'from', _was, 'to', _role));
  RETURN jsonb_build_object('ok', true, 'from', _was, 'to', _role);
END $fn$;


-- ---------------------------------------------------------------------
-- أبواب الطبقة بنطاق الدولة (إعادة تعريف من الهجرتين السابقتين)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_ingest_core(
  _role TEXT, _source TEXT, _country TEXT, _records JSONB, _actor UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _cfg public.country_data_sources; _r JSONB; _ref TEXT; _at TIMESTAMPTZ; _fields JSONB;
  _orphan UUID; _k TEXT; _v JSONB; _fa public.field_authority; _prev TIMESTAMPTZ;
  _observed INTEGER := 0; _unlinked INTEGER := 0; _skipped JSONB := '[]'::jsonb; _i INTEGER := -1;
  _touched TEXT[];
BEGIN
  -- من رفع الدفعة: يُقرأ في الملاحظة والتنبيه، فيُمنع أن يعتمد الشخص نفسه ما رفعه.
  PERFORM set_config('golden.actor', COALESCE(_actor::text, ''), true);
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
      INSERT INTO public.orphan_field_observations AS f (orphan_id, field, role, source, value, observed_at, received_at, received_by)
      VALUES (_orphan, _k, _role, _source, _v, _at, now(), _actor)
      ON CONFLICT (orphan_id, field, role) DO UPDATE SET source = EXCLUDED.source, value = EXCLUDED.value,
        observed_at = EXCLUDED.observed_at, received_at = now(), received_by = EXCLUDED.received_by;
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

CREATE OR REPLACE FUNCTION public.golden_alert(
  _orphan UUID, _country TEXT, _field TEXT, _code TEXT, _severity TEXT,
  _role TEXT, _source TEXT, _subject TEXT, _detail JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.data_alerts a
              WHERE a.orphan_id IS NOT DISTINCT FROM _orphan AND a.field = _field AND a.code = _code
                AND a.status IN ('false_positive', 'reviewed') AND a.subject = COALESCE(_subject, '')) THEN
    RETURN;
  END IF;
  INSERT INTO public.data_alerts AS a (orphan_id, country_code, field, code, severity, role, source, subject, detail, raised_by)
  VALUES (_orphan, _country, _field, _code, _severity, _role, _source, COALESCE(_subject, ''), COALESCE(_detail, '{}'),
          NULLIF(current_setting('golden.actor', true), '')::uuid)
  ON CONFLICT (COALESCE(orphan_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(country_code, ''), field, code)
    WHERE status = 'open'
  DO UPDATE SET severity = EXCLUDED.severity, role = EXCLUDED.role, source = EXCLUDED.source,
    subject = EXCLUDED.subject, detail = EXCLUDED.detail, raised_by = EXCLUDED.raised_by, hits = a.hits + 1, updated_at = now();
END $fn$;

CREATE OR REPLACE FUNCTION public.golden_detect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _o public.orphans; _fa public.field_authority; _v TEXT := NEW.value #>> '{}'; _was TEXT;
  _changed BOOLEAN; _d INTEGER; _old DATE; _new DATE; _n INTEGER; _pop INTEGER; _dup public.orphans;
  _name TEXT; _birth DATE;
BEGIN
  SELECT * INTO _o FROM public.orphans WHERE id = NEW.orphan_id;
  SELECT * INTO _fa FROM public.field_authority WHERE field = NEW.field;
  _was := CASE WHEN TG_OP = 'UPDATE' THEN OLD.value #>> '{}' END;
  _changed := TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value;

  -- محارف خفية أو عاكسة للاتجاه: حيلة إدخالٍ معروفة.
  IF jsonb_typeof(NEW.value) = 'string' AND _v ~ '[­​-‏‪-‮⁠-⁩﻿]' THEN
    PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'hidden_characters', 'warning',
      NEW.role, NEW.source, _v, jsonb_build_object('value', public.golden_canon(_v)));
  END IF;
  -- كلمةٌ تخلط الأبجديات (لاتيني وسيريلي، أو عربي ولاتيني ملتصقان).
  IF jsonb_typeof(NEW.value) = 'string'
     AND ((_v ~ '[A-Za-z]' AND _v ~ '[Ѐ-ӿ]')
          OR _v ~ '[؀-ۿ][A-Za-z]' OR _v ~ '[A-Za-z][؀-ۿ]') THEN
    PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'mixed_script', 'warning',
      NEW.role, NEW.source, _v, jsonb_build_object('value', _v));
  END IF;

  IF _changed THEN
    IF jsonb_typeof(NEW.value) = 'string' AND public.golden_same(OLD.value, NEW.value) THEN
      PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'cosmetic_change', 'info',
        NEW.role, NEW.source, _v, jsonb_build_object('from', _was, 'to', _v));
    ELSIF NEW.field IN ('display_name', 'guardian') THEN
      _d := public.golden_distance(public.golden_canon(_was), public.golden_canon(_v));
      IF _d BETWEEN 1 AND 2 THEN
        PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'subtle_edit', 'warning',
          NEW.role, NEW.source, _v, jsonb_build_object('from', _was, 'to', _v, 'distance', _d));
      END IF;
    END IF;

    IF NEW.field = 'birth_date' THEN
      _old := public.golden_try_date(_was); _new := public.golden_try_date(_v);
      IF _old IS NOT NULL AND _new IS NOT NULL
         AND (abs(_new - _old) >= 180
              OR ((_old + interval '18 years') <= current_date) <> ((_new + interval '18 years') <= current_date)) THEN
        PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'age_shift', 'critical',
          NEW.role, NEW.source, _v, jsonb_build_object('from', _was, 'to', _v, 'days', _new - _old,
            'crosses_adulthood', ((_old + interval '18 years') <= current_date) <> ((_new + interval '18 years') <= current_date)));
      END IF;
    END IF;

    -- عودةٌ إلى قيمةٍ سابقة من المصدر نفسه خلال 60 يوماً.
    IF EXISTS (SELECT 1 FROM public.orphan_field_history h
                WHERE h.orphan_id = NEW.orphan_id AND h.field = NEW.field AND h.role = NEW.role
                  AND h.value = NEW.value AND h.received_at > now() - interval '60 days') THEN
      PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'flip_flop', 'warning',
        NEW.role, NEW.source, _v, jsonb_build_object('from', _was, 'back_to', _v));
    END IF;

    IF _fa.risk = 'critical' AND public.orphan_is_locked(NEW.orphan_id) THEN
      PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, NEW.field, 'change_after_sponsorship', 'critical',
        NEW.role, NEW.source, _v, jsonb_build_object('from', _was, 'to', _v));
    END IF;
  END IF;

  -- ملفٌّ مكرَّر: الاسم المطبَّع (أو بفرق حرف) والميلاد والجنس في الدولة نفسها.
  IF NEW.field IN ('display_name', 'birth_date') THEN
    _name := public.golden_canon(COALESCE(
      (SELECT f.value #>> '{}' FROM public.orphan_field_observations f
        WHERE f.orphan_id = NEW.orphan_id AND f.field = 'display_name' AND f.role = NEW.role),
      _o.display_name));
    _birth := COALESCE(public.golden_try_date(
      (SELECT f.value #>> '{}' FROM public.orphan_field_observations f
        WHERE f.orphan_id = NEW.orphan_id AND f.field = 'birth_date' AND f.role = NEW.role)), _o.birth_date);
    IF _name IS NOT NULL AND _birth IS NOT NULL THEN
      SELECT * INTO _dup FROM public.orphans x
       WHERE x.id <> _o.id AND x.country_code = _o.country_code AND x.birth_date = _birth
         AND x.gender = _o.gender AND x.exited_at IS NULL
         AND public.golden_distance(public.golden_canon(x.display_name), _name) BETWEEN 0 AND 1
       ORDER BY x.created_at LIMIT 1;
      IF _dup.id IS NOT NULL THEN
        PERFORM public.golden_alert(NEW.orphan_id, _o.country_code, 'identity', 'possible_duplicate', 'critical',
          NEW.role, NEW.source, _dup.id::text,
          jsonb_build_object('other_id', _dup.id, 'other_code', _dup.code, 'other_name', _dup.display_name));
      END IF;
    END IF;
  END IF;

  INSERT INTO public.orphan_field_history (orphan_id, field, role, source, value, was, changed, observed_at, received_by)
  VALUES (NEW.orphan_id, NEW.field, NEW.role, NEW.source, NEW.value,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END, _changed, NEW.observed_at, NEW.received_by);

  -- تغييرٌ بالجملة: مصدرٌ غيّر الحقل نفسه في 25 ملفاً فأكثر وخُمس الدولة خلال ساعة.
  IF _changed THEN
    SELECT count(DISTINCT h.orphan_id) INTO _n FROM public.orphan_field_history h
      JOIN public.orphans x ON x.id = h.orphan_id
     WHERE h.changed AND h.field = NEW.field AND h.source = NEW.source
       AND h.received_at > now() - interval '1 hour' AND x.country_code = _o.country_code;
    SELECT count(*) INTO _pop FROM public.orphans x WHERE x.country_code = _o.country_code AND x.exited_at IS NULL;
    IF _n >= 25 AND _n * 5 >= _pop THEN
      PERFORM public.golden_alert(NULL, _o.country_code, NEW.field, 'bulk_change', 'warning',
        NEW.role, NEW.source, to_char(now(), 'YYYY-MM-DD"T"HH24'),
        jsonb_build_object('files', _n, 'population', _pop));
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_data_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.country_staff WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', c.code, 'name_ar', c.name_ar, 'status', c.status,
      'office_source', s.office_source, 'office_mode', COALESCE(s.office_mode, 'none'),
      'stale_after_days', COALESCE(s.stale_after_days, 180),
      'platforms', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name) ORDER BY p.name)
                               FROM public.operating_platforms p WHERE p.country_code = c.code), '[]'::jsonb),
      'trust', (SELECT jsonb_build_object(
                  'flagged', count(*) FILTER (WHERE t->>'state' = 'flagged'),
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
      'alerts', (SELECT jsonb_build_object(
                   'critical', count(*) FILTER (WHERE a.severity = 'critical'),
                   'warning', count(*) FILTER (WHERE a.severity = 'warning'),
                   'info', count(*) FILTER (WHERE a.severity = 'info'))
                   FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
                  WHERE a.status = 'open' AND COALESCE(o.country_code, a.country_code) = c.code),
      'link_pending', (SELECT count(*) FROM public.source_link_queue q WHERE q.country_code = c.code AND q.status = 'pending'),
      'last_wamy', (SELECT max(f.received_at) FROM public.orphan_field_observations f
                      JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = c.code AND f.role = 'wamy'),
      'last_office', (SELECT max(f.received_at) FROM public.orphan_field_observations f
                        JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = c.code AND f.role = 'office'))
      ORDER BY c.sort_order, c.name_ar)
      FROM public.countries c LEFT JOIN public.country_data_sources s ON s.country_code = c.code
     WHERE (c.status <> 'planned' OR s.country_code IS NOT NULL) AND public.country_can(c.code, 'read')), '[]'::jsonb);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_golden_import(_role TEXT, _country TEXT, _source TEXT, _records JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.country_can(_country, 'import') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  RETURN public.golden_ingest_core(_role, COALESCE(_source, 'wamy'), _country, _records, auth.uid());
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_conflicts(_country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.admin_link_queue(_country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.admin_alerts(_country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'orphan_id', a.orphan_id, 'code', o.code, 'name', o.display_name,
      'country', COALESCE(o.country_code, a.country_code), 'field', a.field, 'signal', a.code,
      'severity', a.severity, 'role', a.role, 'source', a.source, 'detail', a.detail,
      'hits', a.hits, 'created_at', a.created_at, 'updated_at', a.updated_at) AS x
      FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
     WHERE a.status = 'open' AND (_country IS NULL OR COALESCE(o.country_code, a.country_code) = _country)
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.updated_at DESC
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_conflict_resolve(_id UUID, _choice TEXT, _value JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _by UUID; _d public.data_conflicts; _fa public.field_authority; _v JSONB; _pin TIMESTAMPTZ; _from TEXT;
BEGIN
  SELECT * INTO _d FROM public.data_conflicts WHERE id = _id FOR UPDATE;
  -- النطاق قبل الحالة: لا يعرف عضو دولةٍ أخرى حتى أن البند أُغلق.
  IF NOT public.country_can((SELECT country_code FROM public.orphans WHERE id = _d.orphan_id), 'approve') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _d.id IS NULL OR _d.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'conflict_closed'); END IF;
  SELECT * INTO _fa FROM public.field_authority WHERE field = _d.field;
  -- عينان: من رفع القيمة المقترحة لا يعتمد تغييرها الحرج بنفسه (الإدارة مستثناة وتُسجَّل).
  IF _d.risk = 'critical' AND _choice <> 'keep' AND NOT public.is_admin() THEN
    SELECT f.received_by INTO _by FROM public.orphan_field_observations f
     WHERE f.orphan_id = _d.orphan_id AND f.field = _d.field
       AND f.value IN (_d.proposed_value, _d.wamy_value, _d.office_value)
       AND f.received_by = auth.uid() LIMIT 1;
    IF _by IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'four_eyes_required'); END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION public.admin_link_resolve(_id UUID, _action TEXT, _orphan UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _q public.source_link_queue; _new UUID;
BEGIN
  SELECT * INTO _q FROM public.source_link_queue WHERE id = _id FOR UPDATE;
  IF NOT public.country_can(_q.country_code, 'approve') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.admin_link_create_unmatched(_country TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _q public.source_link_queue; _new UUID; _created INTEGER := 0; _failed INTEGER := 0;
BEGIN
  IF NOT public.country_can(_country, 'approve') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.admin_alert_resolve(_id UUID, _status TEXT, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _a public.data_alerts;
BEGIN
  IF _status NOT IN ('reviewed', 'false_positive', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'status_unknown');
  END IF;
  IF _status = 'confirmed' AND NULLIF(btrim(COALESCE(_note, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'note_required');
  END IF;
  SELECT * INTO _a FROM public.data_alerts WHERE id = _id FOR UPDATE;
  IF NOT public.country_can(COALESCE((SELECT country_code FROM public.orphans WHERE id = _a.orphan_id), _a.country_code), 'approve') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _a.id IS NULL OR _a.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'alert_closed'); END IF;
  IF _a.severity = 'critical' AND _a.raised_by = auth.uid() AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'four_eyes_required');
  END IF;
  UPDATE public.data_alerts SET status = _status, note = NULLIF(btrim(COALESCE(_note, '')), ''),
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'golden_alert_resolve', 'orphans', _a.orphan_id,
          jsonb_build_object('alert', _id, 'signal', _a.code, 'severity', _a.severity, 'status', _status, 'note', _note));
  RETURN jsonb_build_object('ok', true);
END $fn$;

DO $grants$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY['session_strong()', 'country_can(TEXT, TEXT)', 'my_country_access()',
                            'country_staff_list(TEXT)', 'country_staff_set(TEXT, TEXT, TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
END $grants$;
