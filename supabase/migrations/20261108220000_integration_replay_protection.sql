-- =====================================================================
-- الدفعة 3B — APP-12: حماية بوّابة التكامل من الإعادة
-- ---------------------------------------------------------------------
-- (١) ختم الوقت وحده لا يمنع إعادة طلبٍ ملتقَط داخل نافذة الخمس دقائق.
--     مخزن آحاد: كلّ (شريك، أحادية) يُقبل مرّةً واحدة في النافذة. الأحادية
--     ترويسة X-Api-Nonce إن أرسلها الشريك، وإلا بصمة الطلب نفسه (الختم
--     والطريقة والمسار وبصمة الجسم) — فالطلب نفسه حرفاً بحرف لا يمرّ مرّتين.
-- (٢) مفتاح التكرار كان «اقرأ ثم أدرج بعد المعالجة»: إعادتان متزامنتان
--     تستوردان معاً، وخطأ الإدراج الثاني يُهمَل. صار يُحجز أوّلاً بإدراجٍ
--     ذرّي (ON CONFLICT DO NOTHING)، ومن يجده محجوزاً يأخذ النتيجة أو
--     «قيد المعالجة»، ولا يعالج أحدٌ الدفعة مرّتين.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.api_request_nonces (
  client_id UUID NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  nonce     TEXT NOT NULL CHECK (length(nonce) BETWEEN 1 AND 200),
  seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_api_nonces_seen ON public.api_request_nonces(seen_at);
ALTER TABLE public.api_request_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_request_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_request_nonces TO service_role;

/* true = أوّل مرّة (يُقبل)، false = إعادة. يكنس ما خرج من النافذة. */
CREATE OR REPLACE FUNCTION public.api_claim_nonce(_client UUID, _nonce TEXT, _window_seconds INTEGER DEFAULT 300)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _ok BOOLEAN;
BEGIN
  -- النافذة مضاعفة: ختمٌ مقبولٌ في أوّل نافذته وطلبٌ في آخرها يبقيان داخلها.
  DELETE FROM public.api_request_nonces
   WHERE seen_at < now() - make_interval(secs => GREATEST(_window_seconds, 1) * 2);
  INSERT INTO public.api_request_nonces (client_id, nonce) VALUES (_client, _nonce)
  ON CONFLICT (client_id, nonce) DO NOTHING
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END $fn$;
REVOKE ALL ON FUNCTION public.api_claim_nonce(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_claim_nonce(UUID, TEXT, INTEGER) TO service_role;


ALTER TABLE public.api_import_jobs
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'done'
    CHECK (state IN ('processing', 'done')),
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

/*
 * الحجز. يُعيد واحداً من:
 *   {reserved:true, id}                       — المعالجة لك
 *   {reserved:false, state:'done', result}    — عولجت؛ هذه نتيجتها
 *   {reserved:false, state:'processing'}      — يعالجها طلبٌ آخر الآن
 *   {reserved:false, state:'digest_mismatch'} — المفتاح نفسه بحمولةٍ أخرى
 * وحجزٌ عالقٌ أقدم من _stale_minutes (عاملٌ مات) يُستعاد، فالاستيراد
 * بالمرجع الخارجي يُحدّث ولا يُكرّر.
 */
CREATE OR REPLACE FUNCTION public.api_reserve_import(
  _client UUID, _source TEXT, _key TEXT, _digest TEXT, _received INTEGER,
  _stale_minutes INTEGER DEFAULT 10
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _row public.api_import_jobs%ROWTYPE;
BEGIN
  INSERT INTO public.api_import_jobs (client_id, source, idempotency_key, request_digest,
                                      received_count, state)
  VALUES (_client, _source, _key, _digest, COALESCE(_received, 0), 'processing')
  ON CONFLICT (client_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NOT NULL THEN
    RETURN jsonb_build_object('reserved', true, 'id', _id);
  END IF;

  SELECT * INTO _row FROM public.api_import_jobs
   WHERE client_id = _client AND idempotency_key = _key FOR UPDATE;
  IF _row.request_digest IS DISTINCT FROM _digest THEN
    RETURN jsonb_build_object('reserved', false, 'state', 'digest_mismatch');
  END IF;
  IF _row.state = 'done' THEN
    RETURN jsonb_build_object('reserved', false, 'state', 'done', 'result', _row.result);
  END IF;
  IF _row.created_at < now() - make_interval(mins => GREATEST(_stale_minutes, 1)) THEN
    UPDATE public.api_import_jobs SET created_at = now() WHERE id = _row.id;
    RETURN jsonb_build_object('reserved', true, 'id', _row.id, 'resumed', true);
  END IF;
  RETURN jsonb_build_object('reserved', false, 'state', 'processing');
END $fn$;
REVOKE ALL ON FUNCTION public.api_reserve_import(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_reserve_import(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.api_finish_import(
  _job UUID, _created INTEGER, _updated INTEGER, _failed INTEGER, _result JSONB
)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.api_import_jobs
     SET state = 'done', finished_at = now(), created_count = _created, updated_count = _updated,
         failed_count = _failed, result = COALESCE(_result, '{}'::jsonb)
   WHERE id = _job;
$fn$;
REVOKE ALL ON FUNCTION public.api_finish_import(UUID, INTEGER, INTEGER, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_finish_import(UUID, INTEGER, INTEGER, INTEGER, JSONB) TO service_role;
