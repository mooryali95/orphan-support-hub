-- =====================================================================
-- لغات الواجهة وترجماتها — مسودّة ← مراجَعة ← منشورة
-- ---------------------------------------------------------------------
-- العربية والإنجليزية في الكود. كل لغةٍ أخرى تُفعَّل لدولةٍ مرتبطة،
-- وتُترجم نصوصها (آلياً أو يدوياً) مسودّةً، ويراجعها مراجعو تلك اللغة،
-- وتنشرها الإدارة. الزائر لا يرى إلا المنشور في لغةٍ منشورة.
--
-- المفتاح ثابت من فهرس الكود (`src/i18n/catalog.json`)، ومعه بصمة الأصل:
-- إن تغيّر الأصل في الكود لا تُعرض ترجمته القديمة حتى تُراجَع من جديد
-- (التصفية في الخادم الذي يملك الفهرس).
--
-- كل تغييرٍ يُكتب في سجلّ مراجعاتٍ لا يُعدَّل ولا يُحذف.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ui_locales (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[a-z]{2,3}$' AND code NOT IN ('ar', 'en')),
  name        TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  dir         TEXT NOT NULL DEFAULT 'ltr' CHECK (dir IN ('ltr', 'rtl')),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live')),
  -- الدول التي فُعِّلت اللغة لأجلها (ISO 3166-1).
  countries   TEXT[] NOT NULL DEFAULT '{}',
  enabled_by  UUID,
  enabled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  live_at     TIMESTAMPTZ
);
ALTER TABLE public.ui_locales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uil_admin ON public.ui_locales;
CREATE POLICY uil_admin ON public.ui_locales FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.ui_locales FROM anon, authenticated;
GRANT SELECT ON public.ui_locales TO authenticated;

CREATE TABLE IF NOT EXISTS public.ui_locale_reviewers (
  locale   TEXT NOT NULL REFERENCES public.ui_locales(code) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (locale, user_id)
);
ALTER TABLE public.ui_locale_reviewers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ulr_read ON public.ui_locale_reviewers;
CREATE POLICY ulr_read ON public.ui_locale_reviewers FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
REVOKE ALL ON public.ui_locale_reviewers FROM anon, authenticated;
GRANT SELECT ON public.ui_locale_reviewers TO authenticated;

CREATE TABLE IF NOT EXISTS public.ui_translations (
  locale       TEXT NOT NULL REFERENCES public.ui_locales(code) ON DELETE CASCADE,
  key          TEXT NOT NULL CHECK (key ~ '^[A-Za-z0-9_/.$-]{3,200}$'),
  text         TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  source_hash  TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{12}$'),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published')),
  origin       TEXT NOT NULL DEFAULT 'human' CHECK (origin IN ('human', 'machine', 'import')),
  updated_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by  UUID,
  reviewed_at  TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  PRIMARY KEY (locale, key),
  -- المراجَع والمنشور بتوقيع من راجع ومن نشر — لا حالةٌ بلا صاحب.
  CONSTRAINT ck_reviewed_signed CHECK (status = 'draft' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT ck_published_signed CHECK (status <> 'published' OR (published_by IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_uit_status ON public.ui_translations(locale, status);
ALTER TABLE public.ui_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ui_translations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ui_translation_revisions (
  id      BIGSERIAL PRIMARY KEY,
  at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor   UUID,
  locale  TEXT NOT NULL,
  key     TEXT NOT NULL,
  action  TEXT NOT NULL CHECK (action IN ('save', 'review', 'publish', 'unpublish')),
  text    TEXT,
  status  TEXT NOT NULL,
  origin  TEXT
);
CREATE INDEX IF NOT EXISTS idx_uitr_key ON public.ui_translation_revisions(locale, key, id DESC);
ALTER TABLE public.ui_translation_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ui_translation_revisions FROM anon, authenticated;
DROP TRIGGER IF EXISTS uitr_frozen ON public.ui_translation_revisions;
CREATE TRIGGER uitr_frozen BEFORE UPDATE OR DELETE ON public.ui_translation_revisions
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

-- كل تغيّرٍ في الترجمة يُسجَّل — من الحارس لا من الدوالّ، فلا يُنسى مسار.
CREATE OR REPLACE FUNCTION public.ui_translation_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _action TEXT;
BEGIN
  _action := CASE
    WHEN TG_OP = 'INSERT' OR NEW.text IS DISTINCT FROM OLD.text OR NEW.source_hash IS DISTINCT FROM OLD.source_hash THEN 'save'
    WHEN NEW.status = 'published' AND OLD.status <> 'published' THEN 'publish'
    WHEN OLD.status = 'published' AND NEW.status <> 'published' THEN 'unpublish'
    WHEN NEW.status = 'reviewed' AND OLD.status = 'draft' THEN 'review'
    ELSE NULL END;
  IF _action IS NOT NULL THEN
    INSERT INTO public.ui_translation_revisions (actor, locale, key, action, text, status, origin)
    VALUES (auth.uid(), NEW.locale, NEW.key, _action, NEW.text, NEW.status, NEW.origin);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS ui_translation_log ON public.ui_translations;
CREATE TRIGGER ui_translation_log AFTER INSERT OR UPDATE ON public.ui_translations
  FOR EACH ROW EXECUTE FUNCTION public.ui_translation_log();

CREATE OR REPLACE FUNCTION public.is_locale_reviewer(_locale TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.ui_locale_reviewers WHERE locale = _locale AND user_id = auth.uid());
$fn$;
REVOKE ALL ON FUNCTION public.is_locale_reviewer(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_locale_reviewer(TEXT) TO authenticated;

-- ── للعموم ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_ui_locales()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'dir', dir) ORDER BY code), '[]'::jsonb)
    FROM public.ui_locales WHERE status = 'live';
$fn$;
REVOKE ALL ON FUNCTION public.public_ui_locales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_ui_locales() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.published_ui_messages(_locale TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', t.key, 'text', t.text, 'source_hash', t.source_hash)), '[]'::jsonb)
    FROM public.ui_translations t JOIN public.ui_locales l ON l.code = t.locale
   WHERE t.locale = _locale AND t.status = 'published' AND l.status = 'live';
$fn$;
REVOKE ALL ON FUNCTION public.published_ui_messages(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_ui_messages(TEXT) TO anon, authenticated;

-- ── للمراجعين ─────────────────────────────────────────────────────────

-- كل ترجمات اللغة بحالاتها — للوحة المراجعة ولمعاينة الموقع قبل النشر.
CREATE OR REPLACE FUNCTION public.ui_translations_for(_locale TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_locale_reviewer(_locale) THEN RAISE EXCEPTION 'reviewer_only' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'key', key, 'text', text, 'source_hash', source_hash, 'status', status, 'origin', origin,
            'updated_at', updated_at, 'reviewed_at', reviewed_at, 'published_at', published_at)), '[]'::jsonb)
            FROM public.ui_translations WHERE locale = _locale);
END $fn$;
REVOKE ALL ON FUNCTION public.ui_translations_for(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ui_translations_for(TEXT) TO authenticated;

-- اللغات التي يراجعها المستخدم (والإدارة: كلّها).
CREATE OR REPLACE FUNCTION public.my_review_locales()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', l.code, 'name', l.name, 'dir', l.dir, 'status', l.status, 'countries', l.countries,
           'counts', (SELECT jsonb_object_agg(status, n) FROM (
                        SELECT status, count(*) AS n FROM public.ui_translations
                         WHERE locale = l.code GROUP BY status) c)) ORDER BY l.code), '[]'::jsonb)
    FROM public.ui_locales l
   WHERE public.is_admin() OR EXISTS (
     SELECT 1 FROM public.ui_locale_reviewers r WHERE r.locale = l.code AND r.user_id = auth.uid());
$fn$;
REVOKE ALL ON FUNCTION public.my_review_locales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_review_locales() TO authenticated;

/*
 * حفظ ترجمات: [{key, text, source_hash, origin?}].
 * - نصٌّ لم يتغيّر وبصمةٌ لم تتغيّر: لا شيء (لا يُسقط المنشور إلى مسودّة).
 * - أي تغيير: مسودّة — والمراجعة خطوةٌ منفصلة، إلا إن طلب المراجع
 *   `_review` فتُحفظ مراجَعةً باسمه (تصحيحٌ يدويّ يراه بعينه).
 * - الآلية لا تطغى على عمل إنسان: مسودّة آلية لا تحلّ محلّ نصٍّ بشريّ.
 */
CREATE OR REPLACE FUNCTION public.ui_translation_save(_locale TEXT, _items JSONB, _review BOOLEAN DEFAULT false)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _i JSONB; _n INTEGER := 0; _origin TEXT; _old public.ui_translations; _me UUID := auth.uid();
BEGIN
  IF NOT public.is_locale_reviewer(_locale) THEN RAISE EXCEPTION 'reviewer_only' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) > 1000 THEN RAISE EXCEPTION 'bad_items'; END IF;
  FOR _i IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _origin := COALESCE(_i->>'origin', 'human');
    IF _origin NOT IN ('human', 'machine', 'import') THEN RAISE EXCEPTION 'bad_origin'; END IF;
    SELECT * INTO _old FROM public.ui_translations WHERE locale = _locale AND key = _i->>'key' FOR UPDATE;
    IF _old.key IS NOT NULL AND _old.text = _i->>'text' AND _old.source_hash = _i->>'source_hash' AND NOT _review THEN
      CONTINUE;
    END IF;
    IF _old.key IS NOT NULL AND _origin <> 'human' AND _old.origin = 'human' THEN CONTINUE; END IF;
    INSERT INTO public.ui_translations AS t (locale, key, text, source_hash, status, origin, updated_by, updated_at,
                                             reviewed_by, reviewed_at)
    VALUES (_locale, _i->>'key', _i->>'text', _i->>'source_hash',
            CASE WHEN _review THEN 'reviewed' ELSE 'draft' END, _origin, _me, now(),
            CASE WHEN _review THEN _me END, CASE WHEN _review THEN now() END)
    ON CONFLICT (locale, key) DO UPDATE SET
      text = EXCLUDED.text, source_hash = EXCLUDED.source_hash, status = EXCLUDED.status,
      origin = EXCLUDED.origin, updated_by = _me, updated_at = now(),
      reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at,
      published_by = NULL, published_at = NULL;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.ui_translation_save(TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ui_translation_save(TEXT, JSONB, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.ui_translation_review(_locale TEXT, _keys TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.is_locale_reviewer(_locale) THEN RAISE EXCEPTION 'reviewer_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.ui_translations SET status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE locale = _locale AND key = ANY (_keys) AND status = 'draft';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.ui_translation_review(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ui_translation_review(TEXT, TEXT[]) TO authenticated;

-- ── للإدارة ───────────────────────────────────────────────────────────

-- النشر للإدارة وحدها، وللمراجَع وحده: لا يُنشر ما لم تقرأه عينٌ تعرف اللغة.
CREATE OR REPLACE FUNCTION public.ui_translation_publish(_locale TEXT, _keys TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.ui_translations SET status = 'published', published_by = auth.uid(), published_at = now()
   WHERE locale = _locale AND key = ANY (_keys) AND status = 'reviewed';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.ui_translation_publish(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ui_translation_publish(TEXT, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.ui_translation_unpublish(_locale TEXT, _keys TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.ui_translations SET status = 'reviewed', published_by = NULL, published_at = NULL
   WHERE locale = _locale AND key = ANY (_keys) AND status = 'published';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.ui_translation_unpublish(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ui_translation_unpublish(TEXT, TEXT[]) TO authenticated;

-- تفعيل لغةٍ لدولة (مسودّة)؛ وإن كانت مفعّلةً تُضاف الدولة إلى دولها.
CREATE OR REPLACE FUNCTION public.admin_enable_locale(_code TEXT, _name TEXT, _dir TEXT, _country TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _country IS NOT NULL AND _country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'bad_country'; END IF;
  INSERT INTO public.ui_locales (code, name, dir, countries, enabled_by)
  VALUES (_code, _name, COALESCE(_dir, 'ltr'), CASE WHEN _country IS NULL THEN '{}' ELSE ARRAY[_country] END, auth.uid())
  ON CONFLICT (code) DO UPDATE SET
    countries = CASE WHEN _country IS NULL OR _country = ANY (public.ui_locales.countries)
                     THEN public.ui_locales.countries ELSE public.ui_locales.countries || _country END;
  PERFORM public.log_integrity('locale_enabled', NULL, jsonb_build_object('code', _code, 'country', _country));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_enable_locale(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_enable_locale(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- إطلاق اللغة للعموم أو إيقافها. لا تُطلق لغةٌ بلا نصٍّ منشور.
CREATE OR REPLACE FUNCTION public.admin_set_locale_status(_code TEXT, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('draft', 'live') THEN RAISE EXCEPTION 'bad_status'; END IF;
  IF _status = 'live' AND NOT EXISTS (SELECT 1 FROM public.ui_translations WHERE locale = _code AND status = 'published') THEN
    RAISE EXCEPTION 'nothing_published';
  END IF;
  UPDATE public.ui_locales SET status = _status, live_at = CASE WHEN _status = 'live' THEN now() END WHERE code = _code;
  IF NOT FOUND THEN RAISE EXCEPTION 'locale_not_enabled'; END IF;
  PERFORM public.log_integrity('locale_status', NULL, jsonb_build_object('code', _code, 'status', _status));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_locale_status(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_locale_status(TEXT, TEXT) TO authenticated;

-- مراجعو اللغة: بالبريد، لحسابٍ قائم.
CREATE OR REPLACE FUNCTION public.admin_set_locale_reviewer(_code TEXT, _email TEXT, _add BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $fn$
DECLARE _uid UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(btrim(_email));
  IF _uid IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF _add THEN
    INSERT INTO public.ui_locale_reviewers (locale, user_id, added_by) VALUES (_code, _uid, auth.uid())
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.ui_locale_reviewers WHERE locale = _code AND user_id = _uid;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_locale_reviewer(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_locale_reviewer(TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_locale_reviewers(_code TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('email', u.email, 'added_at', r.added_at) ORDER BY u.email), '[]'::jsonb)
            FROM public.ui_locale_reviewers r JOIN auth.users u ON u.id = r.user_id WHERE r.locale = _code);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_locale_reviewers(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_locale_reviewers(TEXT) TO authenticated;
