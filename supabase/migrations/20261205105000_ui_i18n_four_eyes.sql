-- =====================================================================
-- نصوص الواجهة: عينان قبل النشر (والإدارة غير مستثناة)
-- الخطر: من يكتب النصّ يراجعه بنفسه ثم ينشره، فيصل الزائرَ نصٌّ لم يقرأه غيره.
-- القاعدة: المراجِع غير المحرِّر، والناشر غير المحرِّر. يفرضها قيدٌ على الجدول
-- فلا يتجاوزها مسارٌ آخر، وتتخطّى الدوال الجماعية ما لا يحقّ للمنادي فلا تفشل الدفعة كلّها.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ui_translation_four_eyes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.status IN ('reviewed', 'published') AND NEW.reviewed_by IS NOT DISTINCT FROM NEW.updated_by
     AND (TG_OP = 'INSERT' OR OLD.status = 'draft' OR OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by) THEN
    RAISE EXCEPTION 'four_eyes_review' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published')
     AND NEW.published_by IS NOT DISTINCT FROM NEW.updated_by THEN
    RAISE EXCEPTION 'four_eyes_publish' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_ui_translation_four_eyes ON public.ui_translations;
CREATE TRIGGER trg_ui_translation_four_eyes BEFORE INSERT OR UPDATE ON public.ui_translations
  FOR EACH ROW EXECUTE FUNCTION public.ui_translation_four_eyes();

-- الحفظ لا يراجع: «احفظ وراجِع» كان يجعل المحرِّر مراجعاً لنفسه.
CREATE OR REPLACE FUNCTION public.ui_translation_save(_locale TEXT, _items JSONB, _review BOOLEAN DEFAULT false)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _i JSONB; _n INTEGER := 0; _origin TEXT; _old public.ui_translations; _me UUID := auth.uid();
BEGIN
  IF NOT public.is_locale_reviewer(_locale) THEN RAISE EXCEPTION 'reviewer_only' USING ERRCODE = '42501'; END IF;
  IF _review THEN RAISE EXCEPTION 'four_eyes_review' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) > 1000 THEN RAISE EXCEPTION 'bad_items'; END IF;
  FOR _i IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _origin := COALESCE(_i->>'origin', 'human');
    IF _origin NOT IN ('human', 'machine', 'import') THEN RAISE EXCEPTION 'bad_origin'; END IF;
    SELECT * INTO _old FROM public.ui_translations WHERE locale = _locale AND key = _i->>'key' FOR UPDATE;
    IF _old.key IS NOT NULL AND _old.text = _i->>'text' AND _old.source_hash = _i->>'source_hash' THEN
      CONTINUE;
    END IF;
    IF _old.key IS NOT NULL AND _origin <> 'human' AND _old.origin = 'human' THEN CONTINUE; END IF;
    INSERT INTO public.ui_translations AS t (locale, key, text, source_hash, status, origin, updated_by, updated_at)
    VALUES (_locale, _i->>'key', _i->>'text', _i->>'source_hash', 'draft', _origin, _me, now())
    ON CONFLICT (locale, key) DO UPDATE SET
      text = EXCLUDED.text, source_hash = EXCLUDED.source_hash, status = 'draft',
      origin = EXCLUDED.origin, updated_by = _me, updated_at = now(),
      reviewed_by = NULL, reviewed_at = NULL, published_by = NULL, published_at = NULL;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $fn$;

-- المراجعة تتخطّى ما حرّره المنادي نفسه.
CREATE OR REPLACE FUNCTION public.ui_translation_review(_locale TEXT, _keys TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.is_locale_reviewer(_locale) THEN RAISE EXCEPTION 'reviewer_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.ui_translations SET status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE locale = _locale AND key = ANY (_keys) AND status = 'draft'
     AND updated_by IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;

-- النشر للإدارة، ويتخطّى ما حرّره الناشر نفسه.
CREATE OR REPLACE FUNCTION public.ui_translation_publish(_locale TEXT, _keys TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.ui_translations SET status = 'published', published_by = auth.uid(), published_at = now()
   WHERE locale = _locale AND key = ANY (_keys) AND status = 'reviewed'
     AND updated_by IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;

-- اللوحة تعرف ما حرّره القارئ نفسه، فتعطّل مراجعته قبل النداء.
CREATE OR REPLACE FUNCTION public.ui_translations_for(_locale TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_locale_reviewer(_locale) THEN RAISE EXCEPTION 'reviewer_only' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'key', key, 'text', text, 'source_hash', source_hash, 'status', status, 'origin', origin,
            'mine', updated_by IS NOT DISTINCT FROM auth.uid(),
            'updated_at', updated_at, 'reviewed_at', reviewed_at, 'published_at', published_at)), '[]'::jsonb)
            FROM public.ui_translations WHERE locale = _locale);
END $fn$;
