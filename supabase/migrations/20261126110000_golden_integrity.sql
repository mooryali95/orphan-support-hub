-- =====================================================================
-- السجلّ الذهبي — محرّك التحقق: تطابقٌ آلي وتنبيهات بدل المراجعة اليدوية
-- ---------------------------------------------------------------------
-- المنصّة مصدر الثقة: أوّلاً للجهة (الإدارة ترى كل إشارةٍ بتفصيلها)، وثانياً
-- للكافل (شارةٌ موجزة بلا تفاصيل الطفل ولا أسباب التنبيه).
--
-- 1) التطبيع (`golden_canon`): يطوي ما لا يغيّر المعنى فلا يصير «فرقاً» يزعج
--    المشرف: صور الألف، والتاء المربوطة، والياء والألف المقصورة، والياء
--    والكاف الفارسيتان، والتشكيل، والتطويل، والأرقام الهندية، والحروف
--    اللاتينية والسيريلية المتشابهة، والمسافات، والمحارف الخفية.
-- 2) الكواشف (زناد على كل ملاحظة):
--      hidden_characters       محارف خفية أو عاكسة للاتجاه في القيمة  (تحذير)
--      mixed_script            كلمةٌ تخلط أبجديتين لتبدو كأخرى          (تحذير)
--      cosmetic_change         تغيّرٌ شكليّ يطويه التطبيع                (معلومة)
--      subtle_edit             تعديل حرفٍ أو حرفين في اسم                (تحذير)
--      age_shift               الميلاد تحرّك ستة أشهر فأكثر أو عبَر 18   (حرج)
--      flip_flop               قيمةٌ عادت لما كانت عليه خلال 60 يوماً    (تحذير)
--      change_after_sponsorship تغيير حقلٍ حرج لطفلٍ مكفول              (حرج)
--      possible_duplicate      ملفٌّ آخر بالاسم المطبَّع والميلاد والجنس (حرج)
--      bulk_change             مصدرٌ غيّر حقلاً في كتلةٍ من ملفّات الدولة (تحذير)
-- 3) التنبيه الحرج المفتوح أو المؤكَّد يجعل الملف «موسوماً»: لا كفالة جديدة.
--    والمشرف يحسمه: مراجَع، أو إنذارٌ كاذب (لا يعود للقيمة نفسها)، أو تلاعبٌ
--    مؤكَّد (يبقى الملف موسوماً).
-- 4) درجة ثقة 0..100 للإدارة، وشارةٌ للكافل من ثلاث درجات فقط.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) التطبيع والمسافة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_canon(_t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT NULLIF(btrim(regexp_replace(lower(translate(
    regexp_replace(COALESCE(_t, ''),
      -- التشكيل، والتطويل، والألف الخنجرية، والمحارف الخفية وعلامات الاتجاه
      '[ً-ٰٟـ­​-‏‪-‮⁠-⁩﻿]', '', 'g'),
    -- صور الحروف ← أصلها؛ والهندية ← لاتينية؛ والسيريلية المتشابهة ← لاتينية
    'أإآٱةىیکؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹аеорсухіјАЕОРСУХІЈ',
    'ااااهييكوي01234567890123456789aeopcyxijAEOPCYXIJ')),
    '\s+', ' ', 'g')), '');
$fn$;

-- مسافة التعديل بين نصّين قصيرين (حتى 120 حرفاً)؛ أطول من ذلك: -1.
CREATE OR REPLACE FUNCTION public.golden_distance(_a TEXT, _b TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE _la INT := length(_a); _lb INT := length(_b); _prev INT[]; _cur INT[]; i INT; j INT; _c INT;
BEGIN
  IF _a IS NULL OR _b IS NULL OR _la > 120 OR _lb > 120 THEN RETURN -1; END IF;
  IF _a = _b THEN RETURN 0; END IF;
  IF _la = 0 THEN RETURN _lb; END IF;
  IF _lb = 0 THEN RETURN _la; END IF;
  _prev := ARRAY(SELECT generate_series(0, _lb));
  FOR i IN 1.._la LOOP
    _cur := ARRAY[i];
    FOR j IN 1.._lb LOOP
      _c := CASE WHEN substr(_a, i, 1) = substr(_b, j, 1) THEN 0 ELSE 1 END;
      _cur := _cur || LEAST(_cur[j] + 1, _prev[j + 1] + 1, _prev[j] + _c);
    END LOOP;
    _prev := _cur;
  END LOOP;
  RETURN _prev[_lb + 1];
END $fn$;

-- قيمتان «متطابقتان» إن تساوتا، أو تساوى تطبيعهما وهما نصّان.
CREATE OR REPLACE FUNCTION public.golden_same(_a JSONB, _b JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT _a IS NOT DISTINCT FROM _b
      OR (jsonb_typeof(_a) = 'string' AND jsonb_typeof(_b) = 'string'
          AND public.golden_canon(_a #>> '{}') = public.golden_canon(_b #>> '{}'));
$fn$;


-- ---------------------------------------------------------------------
-- 2) السجلّ التاريخي للملاحظات والتنبيهات
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orphan_field_history (
  id           BIGSERIAL PRIMARY KEY,
  orphan_id    UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  field        TEXT NOT NULL,
  role         TEXT NOT NULL,
  source       TEXT NOT NULL,
  value        JSONB NOT NULL,
  was          JSONB,
  changed      BOOLEAN NOT NULL,
  observed_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ofh_orphan ON public.orphan_field_history(orphan_id, field, role, received_at);
CREATE INDEX IF NOT EXISTS idx_ofh_recent ON public.orphan_field_history(field, source, received_at) WHERE changed;
ALTER TABLE public.orphan_field_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofh_admin ON public.orphan_field_history;
CREATE POLICY ofh_admin ON public.orphan_field_history FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.orphan_field_history FROM anon, authenticated;
GRANT SELECT ON public.orphan_field_history TO authenticated;
REVOKE ALL ON SEQUENCE public.orphan_field_history_id_seq FROM anon, authenticated;
DROP TRIGGER IF EXISTS ofh_frozen ON public.orphan_field_history;
CREATE TRIGGER ofh_frozen BEFORE UPDATE OR DELETE ON public.orphan_field_history
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

CREATE TABLE IF NOT EXISTS public.data_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id     UUID REFERENCES public.orphans(id) ON DELETE CASCADE,
  country_code  TEXT REFERENCES public.countries(code),
  field         TEXT NOT NULL,
  code          TEXT NOT NULL CHECK (code IN ('hidden_characters', 'mixed_script', 'cosmetic_change', 'subtle_edit',
                  'age_shift', 'flip_flop', 'change_after_sponsorship', 'possible_duplicate', 'bulk_change')),
  severity      TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  role          TEXT,
  source        TEXT,
  -- ما يميّز هذه الإشارة (القيمة الجديدة، أو الملف المكرَّر): الإنذار الكاذب لا يعود له.
  subject       TEXT NOT NULL DEFAULT '',
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
  hits          INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'false_positive', 'confirmed')),
  note          TEXT CHECK (length(note) <= 500),
  resolved_by   UUID,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (orphan_id IS NOT NULL OR country_code IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_open ON public.data_alerts
  (COALESCE(orphan_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(country_code, ''), field, code)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_alert_country ON public.data_alerts(country_code, status, severity);
ALTER TABLE public.data_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS da_admin ON public.data_alerts;
CREATE POLICY da_admin ON public.data_alerts FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.data_alerts FROM anon, authenticated;
GRANT SELECT ON public.data_alerts TO authenticated;

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
  INSERT INTO public.data_alerts AS a (orphan_id, country_code, field, code, severity, role, source, subject, detail)
  VALUES (_orphan, _country, _field, _code, _severity, _role, _source, COALESCE(_subject, ''), COALESCE(_detail, '{}'))
  ON CONFLICT (COALESCE(orphan_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(country_code, ''), field, code)
    WHERE status = 'open'
  DO UPDATE SET severity = EXCLUDED.severity, role = EXCLUDED.role, source = EXCLUDED.source,
    subject = EXCLUDED.subject, detail = EXCLUDED.detail, hits = a.hits + 1, updated_at = now();
END $fn$;


-- ---------------------------------------------------------------------
-- 3) الكواشف
-- ---------------------------------------------------------------------
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

  INSERT INTO public.orphan_field_history (orphan_id, field, role, source, value, was, changed, observed_at)
  VALUES (NEW.orphan_id, NEW.field, NEW.role, NEW.source, NEW.value,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END, _changed, NEW.observed_at);

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

DROP TRIGGER IF EXISTS trg_golden_detect ON public.orphan_field_observations;
CREATE TRIGGER trg_golden_detect AFTER INSERT OR UPDATE ON public.orphan_field_observations
  FOR EACH ROW EXECUTE FUNCTION public.golden_detect();


-- ---------------------------------------------------------------------
-- 4) القواعد تطابق بالتطبيع (إعادة تعريف من الهجرة السابقة)
-- ---------------------------------------------------------------------
-- مرشّحو الربط: الاسم المطبَّع أو بفرق حرف، ويضيّقهما الميلاد والجنس.
CREATE OR REPLACE FUNCTION public.golden_link_candidates(_source TEXT, _country TEXT, _fields JSONB)
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(o.id ORDER BY o.created_at), '{}') FROM (
    SELECT o.id, o.created_at FROM public.orphans o
     WHERE o.country_code = _country
       AND public.golden_distance(public.golden_canon(o.display_name),
                                  public.golden_canon(_fields->>'display_name')) BETWEEN 0 AND 1
       AND (public.golden_try_date(_fields->>'birth_date') IS NULL
            OR o.birth_date IS NULL OR o.birth_date = public.golden_try_date(_fields->>'birth_date'))
       AND (NULLIF(lower(btrim(_fields->>'gender')), '') IS NULL OR o.gender = lower(btrim(_fields->>'gender')))
       AND NOT EXISTS (SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = o.id AND l.source = _source)
     ORDER BY o.created_at LIMIT 5) o;
$fn$;

-- الفرق الشكليّ ليس تعارضاً، والتغيير الحرج الشكليّ لا ينتظر اعتماداً.
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
    IF _fa.risk = 'critical' AND _st.value IS NOT NULL AND NOT public.golden_same(_st.value, _ow.value) THEN
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
  IF _vo.value IS NOT NULL AND _golden IS NOT NULL AND NOT public.golden_same(_vo.value, _golden) THEN
    PERFORM public.golden_open_conflict(_orphan, _field, 'disagreement', _fa.risk, _golden, NULL, _w, _o);
  ELSE
    PERFORM public.golden_close_conflict(_orphan, _field, 'auto_agreed', NULL);
  END IF;
END $fn$;

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
     WHERE c.status <> 'planned' OR s.country_code IS NOT NULL), '[]'::jsonb);
END $fn$;

-- حالة الثقة ودرجتها: الموسوم (تنبيهٌ حرج مفتوح أو تلاعبٌ مؤكَّد) يسبق كل شيء.
CREATE OR REPLACE FUNCTION public.golden_trust(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH o AS (
    SELECT o.id, public.golden_office_mode(o.country_code) AS mode,
           COALESCE((SELECT stale_after_days FROM public.country_data_sources WHERE country_code = o.country_code), 180) AS stale_days
      FROM public.orphans o WHERE o.id = _orphan),
  s AS (
    SELECT o.*,
      EXISTS (SELECT 1 FROM public.data_alerts a WHERE a.orphan_id = o.id AND a.severity = 'critical'
                AND a.status IN ('open', 'confirmed')) AS flagged,
      (SELECT count(*) FROM public.data_alerts a WHERE a.orphan_id = o.id AND a.severity = 'warning' AND a.status = 'open') AS warnings,
      (SELECT count(*) FROM public.data_conflicts d WHERE d.orphan_id = o.id AND d.status = 'open' AND d.risk = 'critical') AS crit,
      (SELECT count(*) FROM public.data_conflicts d WHERE d.orphan_id = o.id AND d.status = 'open' AND d.risk <> 'critical') AS other,
      NOT EXISTS (SELECT 1 FROM public.orphan_field_observations f WHERE f.orphan_id = o.id) AS legacy,
      COALESCE((SELECT max(f.observed_at) FROM public.orphan_field_observations f WHERE f.orphan_id = o.id)
               < now() - make_interval(days => o.stale_days), false) AS stale,
      o.mode IN ('shadow', 'active') AND NOT EXISTS (
        SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = o.id AND l.role = 'office') AS single
    FROM o)
  SELECT jsonb_build_object(
    'state', CASE WHEN flagged THEN 'flagged' WHEN crit + other > 0 THEN 'conflict' WHEN legacy THEN 'legacy'
                  WHEN stale THEN 'stale' WHEN single THEN 'single_source' ELSE 'verified' END,
    'basis', CASE WHEN mode = 'none' THEN 'primary_only' ELSE 'two_sources' END,
    'mode', mode,
    'score', CASE WHEN legacy AND NOT flagged THEN NULL ELSE GREATEST(0, 100
               - CASE WHEN flagged THEN 60 ELSE 0 END - 40 * crit - 15 * other - 10 * warnings
               - CASE WHEN stale THEN 20 ELSE 0 END - CASE WHEN single THEN 15 ELSE 0 END) END,
    'warnings', warnings)
  FROM s;
$fn$;

-- شارة الكافل: لملفٍّ منشور وحده، ثلاث درجات، وشهر آخر تحقّق. لا حقول ولا أسباب.
CREATE OR REPLACE FUNCTION public.public_verification(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'level', CASE WHEN t->>'state' = 'verified' AND t->>'basis' = 'two_sources' THEN 'two_sources'
                  WHEN t->>'state' = 'verified' THEN 'primary_source'
                  ELSE 'under_review' END,
    'verified_month', CASE WHEN t->>'state' = 'verified' THEN
      (SELECT to_char(max(f.observed_at), 'YYYY-MM') FROM public.orphan_field_observations f WHERE f.orphan_id = o.id) END)
  FROM public.orphans o, LATERAL (SELECT public.golden_trust(o.id) AS t) x
  WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
$fn$;

CREATE OR REPLACE FUNCTION public.admin_alerts(_country TEXT DEFAULT NULL, _limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
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

-- reviewed: رُوجع ولا إشكال · false_positive: إنذارٌ كاذب لا يعود للقيمة نفسها ·
-- confirmed: تلاعبٌ أو خطأٌ مؤكَّد، ويبقى الملف موسوماً إن كان التنبيه حرجاً.
CREATE OR REPLACE FUNCTION public.admin_alert_resolve(_id UUID, _status TEXT, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _a public.data_alerts;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('reviewed', 'false_positive', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'status_unknown');
  END IF;
  IF _status = 'confirmed' AND NULLIF(btrim(COALESCE(_note, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'note_required');
  END IF;
  SELECT * INTO _a FROM public.data_alerts WHERE id = _id FOR UPDATE;
  IF _a.id IS NULL OR _a.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'alert_closed'); END IF;
  UPDATE public.data_alerts SET status = _status, note = NULLIF(btrim(COALESCE(_note, '')), ''),
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'golden_alert_resolve', 'orphans', _a.orphan_id,
          jsonb_build_object('alert', _id, 'signal', _a.code, 'severity', _a.severity, 'status', _status, 'note', _note));
  RETURN jsonb_build_object('ok', true);
END $fn$;


-- ---------------------------------------------------------------------
-- 5) الصلاحيات
-- ---------------------------------------------------------------------
DO $grants$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'golden_canon(TEXT)', 'golden_distance(TEXT, TEXT)', 'golden_same(JSONB, JSONB)',
    'golden_alert(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)', 'golden_detect()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', _f);
  END LOOP;
  FOREACH _f IN ARRAY ARRAY['admin_alerts(TEXT, INTEGER)', 'admin_alert_resolve(UUID, TEXT, TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
  REVOKE ALL ON FUNCTION public.public_verification(UUID) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.public_verification(UUID) TO anon, authenticated;
END $grants$;
