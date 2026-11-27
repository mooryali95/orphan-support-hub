-- =====================================================================
-- تحصين بعد مراجعة الأمن (الفريق الأحمر)
-- ---------------------------------------------------------------------
-- 1) حقول الهوية لملفٍّ تديره الندوة (مربوطٍ بها) لا تتغيّر بكتابةٍ مباشرة على
--    الجدول، ولو من مدير: تمرّ بـgolden_evaluate (golden_write_column) أو بطلب الفكّ
--    بموافقتين. وإلا تجاوزت قاعدة العينين والتنبيهات، وافترق الملف عن سجلّه الذهبي.
-- 2) رمز الدولة يُشتقّ من الدولة ولا يُكتب وحده: كان مالك الجهة ينقل ملفاً، ولو
--    مكفولاً، إلى دولةٍ أخرى فيخرج من نطاق فريقٍ ويدخل نطاق آخر بلا أثر.
-- 3) الدخول من الندوة لا يربط حساباً ببريدٍ غير موثَّق (استيلاء بالتسجيل المسبق).
-- 4) رمز الدخول لا يُسلَّم في الرابط: يُحفظ هنا ويُسلَّم للمتصفّح الذي يحمل كعكة
--    الربط وحده، مرّةً واحدة (sso_handoff).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guard_golden_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changed BOOLEAN;
BEGIN
  IF COALESCE(current_setting('golden.writing', true), '') = '1' THEN RETURN NEW; END IF;

  -- رمز الدولة لا يتغيّر إلا مع الدولة (يشتقّه trg_sync_orphan_country_code).
  IF NEW.country_code IS DISTINCT FROM OLD.country_code AND NEW.country IS NOT DISTINCT FROM OLD.country
     AND NOT public.request_is_service() THEN
    RAISE EXCEPTION 'country_code_derived' USING ERRCODE = '42501',
      HINT = 'رمز الدولة يُشتقّ من الدولة؛ غيّر الدولة أو مرّ بالسجلّ الذهبي.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = OLD.id AND l.role = 'wamy') THEN
    RETURN NEW;
  END IF;
  _changed := NEW.display_name IS DISTINCT FROM OLD.display_name OR NEW.birth_date IS DISTINCT FROM OLD.birth_date
           OR NEW.gender IS DISTINCT FROM OLD.gender OR NEW.country IS DISTINCT FROM OLD.country
           OR NEW.country_code IS DISTINCT FROM OLD.country_code OR NEW.region IS DISTINCT FROM OLD.region
           OR NEW.city IS DISTINCT FROM OLD.city OR NEW.education_stage IS DISTINCT FROM OLD.education_stage;
  IF NOT _changed OR public.unlock_context_allows(OLD.id, 'edit') THEN RETURN NEW; END IF;

  IF public.request_is_service() THEN
    -- مرآة منصّة التشغيل: يُمسَك التغيير ويُسجَّل اختلاف، كما يفعل قفل الكفالة.
    PERFORM public.log_integrity('golden_direct_write_held', OLD.id,
      jsonb_build_object('source', OLD.external_source), OLD.external_source);
    NEW.display_name := OLD.display_name; NEW.birth_date := OLD.birth_date; NEW.gender := OLD.gender;
    NEW.country := OLD.country; NEW.country_code := OLD.country_code; NEW.region := OLD.region;
    NEW.city := OLD.city; NEW.education_stage := OLD.education_stage;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'golden_managed' USING ERRCODE = '42501',
    HINT = 'هوية هذا الملف من سجلّ الندوة: تُعدَّل برفعٍ من المصدر وحسمٍ بقاعدة العينين، أو بطلب فكٍّ بموافقتين.';
END $fn$;
REVOKE ALL ON FUNCTION public.guard_golden_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_golden_columns ON public.orphans;
CREATE TRIGGER trg_guard_golden_columns BEFORE UPDATE ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.guard_golden_columns();

CREATE OR REPLACE FUNCTION public.golden_write_column(_orphan uuid, _col text, _v jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _now JSONB;
BEGIN
  IF _col IS NULL THEN RETURN true; END IF;
  -- يفتح باب الكتابة لهذا النداء وحده (guard_golden_columns)، ويُغلق بعده.
  PERFORM set_config('golden.writing', '1', true);
  IF _col = 'country_code' THEN
    UPDATE public.orphans o SET country_code = _v #>> '{}',
           country = COALESCE((SELECT c.name_ar FROM public.countries c WHERE c.code = _v #>> '{}'), o.country)
     WHERE o.id = _orphan;
  ELSE
    EXECUTE format('UPDATE public.orphans o SET %1$I = (jsonb_populate_record(o, $1)).%1$I WHERE o.id = $2', _col)
      USING jsonb_build_object(_col, _v #>> '{}'), _orphan;
  END IF;
  PERFORM set_config('golden.writing', '', true);
  EXECUTE format('SELECT to_jsonb(o.%I) FROM public.orphans o WHERE o.id = $1', _col) INTO _now USING _orphan;
  RETURN (_now #>> '{}') IS NOT DISTINCT FROM (_v #>> '{}');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM set_config('golden.writing', '', true);
  RETURN false;
END $function$;

CREATE OR REPLACE FUNCTION public.sso_resolve(_provider text, _subject text, _email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid UUID; _email_n TEXT := lower(btrim(COALESCE(_email, '')));
BEGIN
  SELECT user_id INTO _uid FROM public.sso_identities WHERE provider = _provider AND subject = _subject;
  IF _uid IS NOT NULL THEN
    UPDATE public.sso_identities SET last_login_at = now(), email = _email_n
     WHERE provider = _provider AND subject = _subject;
    RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'linked', 'existing');
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = _email_n;
  -- بريدٌ لم يُوثَّق لا يُربط: من سجّل بريد موظّفٍ قبله لا يستولي على هويته عند الندوة.
  IF _uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _uid AND u.email_confirmed_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_unconfirmed');
  END IF;
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', true, 'user_id', NULL); END IF;
  IF EXISTS (SELECT 1 FROM public.sso_identities WHERE provider = _provider AND user_id = _uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'subject_taken');
  END IF;
  INSERT INTO public.sso_identities (provider, subject, user_id, email) VALUES (_provider, _subject, _uid, _email_n);
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (_uid, 'sso_linked', 'sso_identities', _uid, jsonb_build_object('provider', _provider));
  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'linked', 'new');
END $function$;

CREATE TABLE IF NOT EXISTS public.sso_handoff (
  nonce       UUID PRIMARY KEY,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.sso_handoff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sso_handoff FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sso_handoff_put(_nonce UUID, _hash TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  DELETE FROM public.sso_handoff WHERE expires_at < now();
  INSERT INTO public.sso_handoff (nonce, token_hash, expires_at) VALUES (_nonce, _hash, now() + interval '2 minutes');
$f$;

-- يُسلَّم مرّةً واحدة ثم يُحذف؛ المنتهي لا يُسلَّم.
CREATE OR REPLACE FUNCTION public.sso_handoff_take(_nonce UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  DELETE FROM public.sso_handoff WHERE nonce = _nonce AND expires_at >= now() RETURNING token_hash;
$f$;

DO $g$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY['sso_handoff_put(UUID, TEXT)', 'sso_handoff_take(UUID)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', _f);
  END LOOP;
END $g$;
