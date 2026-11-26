-- =====================================================================
-- الدخول من منصّة الندوة بلا تسجيلٍ ثانٍ
-- ---------------------------------------------------------------------
-- منصّة الندوة توقّع «رمز إطلاق» قصير العمر لمستخدمها المسجّل، وكهاتين تتحقّق
-- منه وتفتح الجلسة (src/routes/api/sso/wamy.ts). هنا ما يحتاجه ذلك في القاعدة:
--
--   • `sso_identities`: الربط بمعرّف المستخدم عند الندوة (sub) لا بالبريد وحده.
--     أوّل دخولٍ يربط بالبريد الموثَّق، وبعده يُعرف المستخدم بمعرّفه حتى لو
--     تغيّر بريده هناك، ولا يستولي بريدٌ جديدٌ على حسابٍ قديم.
--   • `sso_replay`: كل رمزٍ يُستعمل مرّةً واحدة (jti)، فلا يُعاد رابطٌ مسروق.
--   • الدخول لا يمنح دوراً: الأدوار من فريق الدولة (`country_staff`) والإدارة
--     كما هي، والمدير الذي فعّل المصادقة الثنائية يُطلب منه رمزها كالعادة.
-- كل الأبواب لمفتاح الخدمة وحده.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sso_identities (
  provider       TEXT NOT NULL CHECK (provider ~ '^[a-z0-9-]{2,40}$'),
  subject        TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  linked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);
ALTER TABLE public.sso_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ssoi_read ON public.sso_identities;
CREATE POLICY ssoi_read ON public.sso_identities FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
REVOKE ALL ON public.sso_identities FROM anon, authenticated;
GRANT SELECT ON public.sso_identities TO authenticated;

CREATE TABLE IF NOT EXISTS public.sso_replay (
  jti         TEXT PRIMARY KEY CHECK (length(jti) BETWEEN 8 AND 200),
  expires_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.sso_replay ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sso_replay FROM anon, authenticated;

-- يحجز الرمز؛ false إن استُعمل من قبل. ويكنس المنتهي.
CREATE OR REPLACE FUNCTION public.sso_claim_jti(_jti TEXT, _expires TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  DELETE FROM public.sso_replay WHERE expires_at < now() - interval '1 day';
  INSERT INTO public.sso_replay (jti, expires_at) VALUES (_jti, _expires);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END $fn$;

-- من هو صاحب هذا الدخول: بمعرّفه إن رُبط، وإلا بالبريد الموثَّق (ويُربط الآن).
-- يعيد user_id أو NULL (لا حساب: يُنشئه الخادم ثم يعيد النداء).
-- code = 'subject_taken': بريدٌ لحسابٍ مربوطٍ بمعرّفٍ آخر من المزوّد نفسه.
CREATE OR REPLACE FUNCTION public.sso_resolve(_provider TEXT, _subject TEXT, _email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID; _email_n TEXT := lower(btrim(COALESCE(_email, '')));
BEGIN
  SELECT user_id INTO _uid FROM public.sso_identities WHERE provider = _provider AND subject = _subject;
  IF _uid IS NOT NULL THEN
    UPDATE public.sso_identities SET last_login_at = now(), email = _email_n
     WHERE provider = _provider AND subject = _subject;
    RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'linked', 'existing');
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = _email_n;
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', true, 'user_id', NULL); END IF;
  IF EXISTS (SELECT 1 FROM public.sso_identities WHERE provider = _provider AND user_id = _uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'subject_taken');
  END IF;
  INSERT INTO public.sso_identities (provider, subject, user_id, email) VALUES (_provider, _subject, _uid, _email_n);
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (_uid, 'sso_linked', 'sso_identities', _uid, jsonb_build_object('provider', _provider));
  RETURN jsonb_build_object('ok', true, 'user_id', _uid, 'linked', 'new');
END $fn$;

DO $grants$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY['sso_claim_jti(TEXT, TIMESTAMPTZ)', 'sso_resolve(TEXT, TEXT, TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', _f);
  END LOOP;
END $grants$;
