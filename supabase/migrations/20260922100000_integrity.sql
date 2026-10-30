-- =====================================================================
-- سلامة الحقيقة: تثبيت الطفل المكفول، والفكّ بموافقتين، وسجلٌّ لا يُمحى
-- ---------------------------------------------------------------------
-- العقد: docs/integration/kahatayn-rowad.ar.md (البنود ٢، ٥، ٦، وك١–ك٧).
--
-- ١) سجلّ السلامة `integrity_log`: كل حدثٍ مهمّ يُكتب ببصمة سابقه، فلا
--    يُعدَّل سطرٌ ولا يُحذف دون أن تنكسر السلسلة — والجدول يرفض التعديل
--    والحذف أصلاً، حتى من صاحب القاعدة.
-- ٢) الأقفال `orphan_locks`: أوّل كفالةٍ فعّالة أو دعمٍ مقبول أو صرفٍ
--    باسم الطفل يقفل ملفّه. المقفول لا يُحذف، ولا تتغيّر هويته.
-- ٣) ما يأتي من المرآة على مقفولٍ يُمسَك ولا يُطبَّق صامتاً: يبقى القديم،
--    ويُكتب «اختلافٌ» في صندوق الإدارة.
-- ٤) الفكّ بطلبٍ رسمي: سببٌ ومستند، وموافقة مسؤولَين غير الطالب، ونافذة
--    ١٥ دقيقة، ويُستعمل مرّة.
-- ٥) المصادر: حالة كل منصّة تشغيل، ووضع الطوارئ للدولة، وسلسلة دفعات
--    المزامنة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) سجلّ السلامة — إلحاقٌ فقط، وكل سطرٍ ببصمة سابقه
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrity_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      UUID,
  kind       TEXT NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  orphan_id  UUID,
  source     TEXT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash  TEXT NOT NULL DEFAULT '',
  hash       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_integrity_orphan ON public.integrity_log(orphan_id, id);
ALTER TABLE public.integrity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS il_admin ON public.integrity_log;
CREATE POLICY il_admin ON public.integrity_log FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.integrity_log FROM anon, authenticated;
GRANT SELECT ON public.integrity_log TO authenticated;

CREATE OR REPLACE FUNCTION public.integrity_row_hash(
  _prev TEXT, _at TIMESTAMPTZ, _actor UUID, _kind TEXT, _orphan UUID, _source TEXT, _detail JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT encode(sha256(convert_to(concat_ws('|', _prev, to_char(_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
         COALESCE(_actor::text, ''), _kind, COALESCE(_orphan::text, ''), COALESCE(_source, ''),
         _detail::text), 'UTF8')), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public.integrity_log_chain()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- سلسلةٌ واحدة: إدراجٌ واحد في كل لحظة، فلا يتشعّب «السابق».
  PERFORM pg_advisory_xact_lock(hashtext('integrity_log'));
  NEW.at := clock_timestamp();
  NEW.actor := COALESCE(NEW.actor, auth.uid());
  NEW.prev_hash := COALESCE((SELECT hash FROM public.integrity_log ORDER BY id DESC LIMIT 1), 'genesis');
  NEW.hash := public.integrity_row_hash(NEW.prev_hash, NEW.at, NEW.actor, NEW.kind, NEW.orphan_id,
                                        NEW.source, NEW.detail);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS integrity_log_chain ON public.integrity_log;
CREATE TRIGGER integrity_log_chain BEFORE INSERT ON public.integrity_log
  FOR EACH ROW EXECUTE FUNCTION public.integrity_log_chain();

CREATE OR REPLACE FUNCTION public.append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '%_append_only', TG_TABLE_NAME USING ERRCODE = '42501';
END $fn$;
DROP TRIGGER IF EXISTS integrity_log_frozen ON public.integrity_log;
CREATE TRIGGER integrity_log_frozen BEFORE UPDATE OR DELETE ON public.integrity_log
  FOR EACH ROW EXECUTE FUNCTION public.append_only();
DROP TRIGGER IF EXISTS integrity_log_no_truncate ON public.integrity_log;
CREATE TRIGGER integrity_log_no_truncate BEFORE TRUNCATE ON public.integrity_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.append_only();

CREATE OR REPLACE FUNCTION public.log_integrity(
  _kind TEXT, _orphan UUID DEFAULT NULL, _detail JSONB DEFAULT '{}'::jsonb, _source TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public.integrity_log (kind, orphan_id, detail, source) VALUES (_kind, _orphan, _detail, _source);
$fn$;
REVOKE ALL ON FUNCTION public.log_integrity(TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- التحقّق: يعيد حساب السلسلة كاملة، ويذكر أوّل سطرٍ انكسر عنده.
CREATE OR REPLACE FUNCTION public.integrity_verify()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.integrity_log; _prev TEXT := 'genesis'; _n BIGINT := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  FOR _r IN SELECT * FROM public.integrity_log ORDER BY id LOOP
    IF _r.prev_hash <> _prev OR _r.hash <> public.integrity_row_hash(_r.prev_hash, _r.at, _r.actor,
         _r.kind, _r.orphan_id, _r.source, _r.detail) THEN
      RETURN jsonb_build_object('ok', false, 'checked', _n, 'broken_at', _r.id);
    END IF;
    _prev := _r.hash; _n := _n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'checked', _n, 'head', _prev);
END $fn$;
REVOKE ALL ON FUNCTION public.integrity_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integrity_verify() TO authenticated;


-- ---------------------------------------------------------------------
-- ٢) الأقفال
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orphan_locks (
  orphan_id  UUID PRIMARY KEY REFERENCES public.orphans(id) ON DELETE RESTRICT,
  reason     TEXT NOT NULL CHECK (reason IN ('sponsored', 'supported', 'disbursed', 'manual')),
  source_ref UUID,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orphan_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ol_admin ON public.orphan_locks;
CREATE POLICY ol_admin ON public.orphan_locks FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.orphan_locks FROM anon, authenticated;
GRANT SELECT ON public.orphan_locks TO authenticated;

CREATE OR REPLACE FUNCTION public.orphan_is_locked(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.orphan_locks WHERE orphan_id = _orphan);
$fn$;

CREATE OR REPLACE FUNCTION public.lock_orphan(_orphan UUID, _reason TEXT, _ref UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF _orphan IS NULL THEN RETURN; END IF;
  INSERT INTO public.orphan_locks (orphan_id, reason, source_ref) VALUES (_orphan, _reason, _ref)
  ON CONFLICT (orphan_id) DO NOTHING;
  IF FOUND THEN
    PERFORM public.log_integrity('locked', _orphan, jsonb_build_object('reason', _reason, 'ref', _ref));
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.lock_orphan(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- القفل يُرفع بطلب «فكّ» معتمد وحده (البند ٤).
CREATE OR REPLACE FUNCTION public.guard_orphan_locks()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' OR NOT public.unlock_context_allows(OLD.orphan_id, 'unlock') THEN
    RAISE EXCEPTION 'orphan_lock_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $fn$;

-- مُقفِلات: كفالةٌ فعّالة، دعمٌ مقبول لطفلٍ بعينه، صرفٌ باسمه.
CREATE OR REPLACE FUNCTION public.lock_on_sponsorship()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'active' THEN PERFORM public.lock_orphan(NEW.orphan_id, 'sponsored', NEW.id); END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS lock_on_sponsorship ON public.sponsorships;
CREATE TRIGGER lock_on_sponsorship AFTER INSERT OR UPDATE OF status ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.lock_on_sponsorship();

CREATE OR REPLACE FUNCTION public.lock_on_pledge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.orphan_id IS NOT NULL AND NEW.status IN ('active', 'fulfilled') THEN
    PERFORM public.lock_orphan(NEW.orphan_id, 'supported', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS lock_on_pledge ON public.support_pledges;
CREATE TRIGGER lock_on_pledge AFTER INSERT OR UPDATE OF status ON public.support_pledges
  FOR EACH ROW EXECUTE FUNCTION public.lock_on_pledge();

CREATE OR REPLACE FUNCTION public.lock_on_disbursement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.lock_orphan(NEW.orphan_id, 'disbursed', NEW.id);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS lock_on_disbursement ON public.disbursements;
CREATE TRIGGER lock_on_disbursement AFTER INSERT ON public.disbursements
  FOR EACH ROW EXECUTE FUNCTION public.lock_on_disbursement();

-- من كُفل قبل هذه الهجرة يُقفل الآن.
INSERT INTO public.orphan_locks (orphan_id, reason, source_ref)
SELECT DISTINCT ON (s.orphan_id) s.orphan_id, 'sponsored', s.id
  FROM public.sponsorships s WHERE s.status = 'active'
 ORDER BY s.orphan_id, s.started_at NULLS LAST
ON CONFLICT (orphan_id) DO NOTHING;
INSERT INTO public.orphan_locks (orphan_id, reason, source_ref)
SELECT DISTINCT ON (p.orphan_id) p.orphan_id, 'supported', p.id
  FROM public.support_pledges p WHERE p.orphan_id IS NOT NULL AND p.status IN ('active', 'fulfilled')
 ORDER BY p.orphan_id, p.created_at
ON CONFLICT (orphan_id) DO NOTHING;
INSERT INTO public.orphan_locks (orphan_id, reason, source_ref)
SELECT DISTINCT ON (d.orphan_id) d.orphan_id, 'disbursed', d.id
  FROM public.disbursements d WHERE d.orphan_id IS NOT NULL
 ORDER BY d.orphan_id, d.created_at
ON CONFLICT (orphan_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- ٣) طلبات الفكّ — سببٌ ومستند وموافقتان، ونافذة ١٥ دقيقة، ومرّةً واحدة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_quorum()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$ SELECT 2 $fn$;

CREATE TABLE IF NOT EXISTS public.unlock_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id     UUID NOT NULL REFERENCES public.orphans(id) ON DELETE RESTRICT,
  -- edit: تعديل حقولٍ في كهاتين · archive: أرشفة · unlock: رفع القفل
  -- rowad_update / rowad_delete: إذنٌ موقّع يُنفَّذ في منصّة التشغيل
  op            TEXT NOT NULL CHECK (op IN ('edit', 'archive', 'unlock', 'rowad_update', 'rowad_delete')),
  patch         JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason        TEXT NOT NULL CHECK (length(btrim(reason)) >= 10 AND length(reason) <= 2000),
  document      TEXT CHECK (document IS NULL OR length(document) <= 500),
  discrepancy_id UUID,
  requested_by  UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'granted', 'expired')),
  approvals     UUID[] NOT NULL DEFAULT '{}',
  approved_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  decided_by    UUID,
  decision_note TEXT,
  applied_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_unlock_orphan ON public.unlock_requests(orphan_id, created_at DESC);
ALTER TABLE public.unlock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ur_admin ON public.unlock_requests;
CREATE POLICY ur_admin ON public.unlock_requests FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.unlock_requests FROM anon, authenticated;
GRANT SELECT ON public.unlock_requests TO authenticated;

-- الحقول التي يجوز للطلب تعديلها — ما عداها لا يُفتح بطلب.
CREATE OR REPLACE FUNCTION public.unlock_editable_fields()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['display_name', 'gender', 'birth_date', 'country', 'region', 'group_id',
               'external_ref', 'external_source'];
$fn$;

-- هل في هذه المعاملة طلبٌ معتمد يجيز هذه العملية على هذا الطفل؟
CREATE OR REPLACE FUNCTION public.unlock_context_allows(_orphan UUID, _op TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.unlock_requests r
     WHERE r.id::text = NULLIF(current_setting('kahatayn.unlock', true), '')
       AND r.orphan_id = _orphan AND r.op = _op
       AND r.status = 'approved' AND r.expires_at > now());
$fn$;

CREATE OR REPLACE FUNCTION public.admin_request_unlock(
  _orphan UUID, _op TEXT, _patch JSONB, _reason TEXT, _document TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _bad TEXT[];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NOT public.orphan_is_locked(_orphan) THEN RAISE EXCEPTION 'orphan_not_locked'; END IF;
  _patch := COALESCE(_patch, '{}'::jsonb);
  SELECT array_agg(k) INTO _bad FROM jsonb_object_keys(_patch) k WHERE k <> ALL (public.unlock_editable_fields());
  IF _op = 'edit' AND (_patch = '{}'::jsonb OR _bad IS NOT NULL) THEN
    RAISE EXCEPTION 'patch_fields_not_allowed: %', COALESCE(array_to_string(_bad, ','), 'empty');
  END IF;
  IF EXISTS (SELECT 1 FROM public.unlock_requests WHERE orphan_id = _orphan AND status = 'pending' AND op = _op) THEN
    RAISE EXCEPTION 'request_already_pending';
  END IF;
  INSERT INTO public.unlock_requests (orphan_id, op, patch, reason, document, requested_by)
  VALUES (_orphan, _op, _patch, btrim(_reason), NULLIF(btrim(COALESCE(_document, '')), ''), auth.uid())
  RETURNING id INTO _id;
  PERFORM public.log_integrity('unlock_requested', _orphan,
    jsonb_build_object('request', _id, 'op', _op, 'patch', _patch, 'reason', btrim(_reason)));
  RETURN _id;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_approve_unlock(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.unlock_requests; _me UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF _r.requested_by = _me THEN RAISE EXCEPTION 'requester_cannot_approve' USING ERRCODE = '42501'; END IF;
  IF _me = ANY (_r.approvals) THEN RAISE EXCEPTION 'already_approved'; END IF;
  _r.approvals := _r.approvals || _me;
  IF cardinality(_r.approvals) >= public.unlock_quorum() THEN
    UPDATE public.unlock_requests SET approvals = _r.approvals, status = 'approved',
           approved_at = now(), expires_at = now() + interval '15 minutes'
     WHERE id = _request;
  ELSE
    UPDATE public.unlock_requests SET approvals = _r.approvals WHERE id = _request;
  END IF;
  PERFORM public.log_integrity('unlock_approved', _r.orphan_id,
    jsonb_build_object('request', _request, 'approvals', cardinality(_r.approvals)));
  RETURN jsonb_build_object('approvals', cardinality(_r.approvals), 'quorum', public.unlock_quorum());
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_reject_unlock(_request UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.unlock_requests SET status = 'rejected', decided_by = auth.uid(),
         decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
   WHERE id = _request AND status IN ('pending', 'approved') RETURNING orphan_id INTO _o;
  IF _o IS NULL THEN RAISE EXCEPTION 'request_not_open'; END IF;
  PERFORM public.log_integrity('unlock_rejected', _o, jsonb_build_object('request', _request, 'note', _note));
END $fn$;

-- التنفيذ في كهاتين: edit / archive / unlock. يمرّ عبر الحارس نفسه، الذي
-- يجيزه لأن المعاملة تحمل الطلب المعتمد. ثم يُغلق الطلب فلا يُستعمل ثانية.
CREATE OR REPLACE FUNCTION public.admin_apply_unlock(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.unlock_requests; _before JSONB; _after JSONB; _k TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'approved' THEN RAISE EXCEPTION 'request_not_approved'; END IF;
  IF _r.expires_at <= now() THEN
    UPDATE public.unlock_requests SET status = 'expired' WHERE id = _request;
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  IF _r.op NOT IN ('edit', 'archive', 'unlock') THEN RAISE EXCEPTION 'op_applies_in_operating_platform'; END IF;

  SELECT to_jsonb(o) - 'story' - 'photo_url' INTO _before FROM public.orphans o WHERE o.id = _r.orphan_id;
  PERFORM set_config('kahatayn.unlock', _request::text, true);

  IF _r.op = 'edit' THEN
    -- القيم تُحوَّل بأنواع أعمدتها عبر سجلٍّ مُعبّأ، لا بنصٍّ يُلصق في الاستعلام.
    FOR _k IN SELECT jsonb_object_keys(_r.patch) LOOP
      EXECUTE format('UPDATE public.orphans SET %1$I = (jsonb_populate_record(NULL::public.orphans, $1)).%1$I WHERE id = $2', _k)
        USING _r.patch, _r.orphan_id;
    END LOOP;
  ELSIF _r.op = 'archive' THEN
    UPDATE public.orphans SET status = 'archived' WHERE id = _r.orphan_id;
  ELSE
    DELETE FROM public.orphan_locks WHERE orphan_id = _r.orphan_id;
  END IF;

  PERFORM set_config('kahatayn.unlock', '', true);
  UPDATE public.unlock_requests SET status = 'applied', applied_at = now() WHERE id = _request;
  IF _r.discrepancy_id IS NOT NULL THEN
    UPDATE public.integrity_discrepancies SET status = 'accepted', decided_by = auth.uid(), decided_at = now()
     WHERE id = _r.discrepancy_id;
  END IF;
  SELECT to_jsonb(o) - 'story' - 'photo_url' INTO _after FROM public.orphans o WHERE o.id = _r.orphan_id;
  PERFORM public.log_integrity('unlock_applied', _r.orphan_id,
    jsonb_build_object('request', _request, 'op', _r.op,
      'changed', (SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('was', _before->k, 'now', _after->k)), '{}')
                    FROM jsonb_object_keys(_after) k WHERE _before->k IS DISTINCT FROM _after->k)));
  RETURN jsonb_build_object('ok', true);
END $fn$;

-- إذنٌ لمنصّة التشغيل: يُعيد الحمولة التي يوقّعها الخادم (Ed25519)،
-- ويُغلق الطلب «granted». المفتاح الخاصّ لا يدخل القاعدة أبداً.
CREATE OR REPLACE FUNCTION public.admin_grant_payload(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.unlock_requests; _o public.orphans; _country TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'approved' OR _r.expires_at <= now() THEN
    RAISE EXCEPTION 'request_not_approved';
  END IF;
  IF _r.op NOT IN ('rowad_update', 'rowad_delete') THEN RAISE EXCEPTION 'op_not_for_operating_platform'; END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _r.orphan_id;
  IF _o.external_source IS NULL OR _o.external_ref IS NULL THEN RAISE EXCEPTION 'orphan_not_linked'; END IF;
  SELECT country_code INTO _country FROM public.operating_platforms WHERE key = _o.external_source;
  UPDATE public.unlock_requests SET status = 'granted', applied_at = now() WHERE id = _request;
  PERFORM public.log_integrity('grant_issued', _r.orphan_id,
    jsonb_build_object('request', _request, 'op', _r.op, 'source', _o.external_source), _o.external_source);
  RETURN jsonb_build_object(
    'iss', 'kahatayn', 'aud', 'rowad:' || COALESCE(_country, '??'),
    'sub', 'students/' || _o.external_ref,
    'op', CASE _r.op WHEN 'rowad_delete' THEN 'delete' ELSE 'update' END,
    'fields', COALESCE((SELECT jsonb_agg(k) FROM jsonb_object_keys(_r.patch) k), '[]'::jsonb),
    'request_id', _request, 'approved_by', to_jsonb(_r.approvals),
    'exp', extract(epoch FROM _r.expires_at)::bigint,
    'jti', gen_random_uuid());
END $fn$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.admin_request_unlock(UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_approve_unlock(UUID) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_reject_unlock(UUID, TEXT) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_apply_unlock(UUID) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_grant_payload(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.admin_request_unlock(UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_approve_unlock(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_reject_unlock(UUID, TEXT) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_apply_unlock(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_grant_payload(UUID) TO authenticated;
END $$;


-- ---------------------------------------------------------------------
-- ٤) الحارس على الطفل المقفول — والاختلافات الممسوكة
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrity_discrepancies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id   UUID NOT NULL REFERENCES public.orphans(id) ON DELETE RESTRICT,
  source      TEXT,
  changes     JSONB NOT NULL,                -- {field: {was, proposed}}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed')),
  decided_by  UUID,
  decided_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_discrepancy_open ON public.integrity_discrepancies(status, created_at);
ALTER TABLE public.integrity_discrepancies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS idc_admin ON public.integrity_discrepancies;
CREATE POLICY idc_admin ON public.integrity_discrepancies FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.integrity_discrepancies FROM anon, authenticated;
GRANT SELECT ON public.integrity_discrepancies TO authenticated;

CREATE OR REPLACE FUNCTION public.request_is_service()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT current_setting('role', true) = 'service_role'
      OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
$fn$;

CREATE OR REPLACE FUNCTION public.guard_locked_orphan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changes JSONB := '{}'::jsonb; _f TEXT; _o JSONB; _n JSONB;
BEGIN
  IF NOT public.orphan_is_locked(OLD.id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'orphan_locked' USING ERRCODE = '42501',
      HINT = 'ملفّ طفلٍ مكفول لا يُحذف. الأرشفة بطلبٍ رسمي.';
  END IF;

  _o := to_jsonb(OLD); _n := to_jsonb(NEW);
  -- الهوية وحدها: المرحلة الدراسية تتقدّم مع الطفل فلا تُجمَّد.
  FOREACH _f IN ARRAY ARRAY['code', 'org_id', 'external_source', 'external_ref', 'display_name', 'gender',
                             'birth_date', 'country', 'region', 'group_id'] LOOP
    IF _o->_f IS DISTINCT FROM _n->_f THEN
      _changes := _changes || jsonb_build_object(_f, jsonb_build_object('was', _o->_f, 'proposed', _n->_f));
    END IF;
  END LOOP;
  IF OLD.external_deleted_at IS NULL AND NEW.external_deleted_at IS NOT NULL THEN
    _changes := _changes || jsonb_build_object('external_deleted_at',
      jsonb_build_object('was', NULL, 'proposed', NEW.external_deleted_at));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('draft', 'submitted', 'under_review', 'rejected', 'archived')
     AND NOT (NEW.status::text = 'archived' AND public.unlock_context_allows(OLD.id, 'archive')) THEN
    _changes := _changes || jsonb_build_object('status',
      jsonb_build_object('was', OLD.status, 'proposed', NEW.status));
  END IF;

  IF _changes = '{}'::jsonb OR public.unlock_context_allows(OLD.id, 'edit') THEN
    RETURN NEW;
  END IF;

  -- المرآة (الخادم بمفتاح الخدمة): يُمسَك التغيير، ويبقى القديم، ويُسجَّل اختلاف.
  IF public.request_is_service() THEN
    INSERT INTO public.integrity_discrepancies (orphan_id, source, changes)
    VALUES (OLD.id, OLD.external_source, _changes);
    PERFORM public.log_integrity('mirror_change_held', OLD.id, _changes, OLD.external_source);
    NEW.code := OLD.code; NEW.org_id := OLD.org_id;
    NEW.external_source := OLD.external_source; NEW.external_ref := OLD.external_ref;
    NEW.display_name := OLD.display_name; NEW.gender := OLD.gender; NEW.birth_date := OLD.birth_date;
    NEW.country := OLD.country; NEW.region := OLD.region; NEW.group_id := OLD.group_id;
    NEW.external_deleted_at := OLD.external_deleted_at;
    IF _changes ? 'status' THEN NEW.status := OLD.status; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'orphan_locked' USING ERRCODE = '42501',
    DETAIL = _changes::text, HINT = 'تعديل هوية طفلٍ مكفول يحتاج طلب فكٍّ بموافقتين.';
END $fn$;
DROP TRIGGER IF EXISTS guard_locked_orphan ON public.orphans;
CREATE TRIGGER guard_locked_orphan BEFORE UPDATE OR DELETE ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_orphan();

DROP TRIGGER IF EXISTS guard_orphan_locks ON public.orphan_locks;
CREATE TRIGGER guard_orphan_locks BEFORE UPDATE OR DELETE ON public.orphan_locks
  FOR EACH ROW EXECUTE FUNCTION public.guard_orphan_locks();

-- درجات السمات لطفلٍ مقفول: لا حذف؛ «الحذف» من المرآة يُمسَك؛ والتصحيح
-- يحفظ الأصل في سجلّ المراجعات قبل أن يُطبَّق.
CREATE TABLE IF NOT EXISTS public.trait_score_revisions (
  id          BIGSERIAL PRIMARY KEY,
  score_id    UUID NOT NULL,
  orphan_id   UUID NOT NULL,
  was_score   NUMERIC NOT NULL,
  was_observed_at TIMESTAMPTZ NOT NULL,
  new_score   NUMERIC NOT NULL,
  revised_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trait_score_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tsr_admin ON public.trait_score_revisions;
CREATE POLICY tsr_admin ON public.trait_score_revisions FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.trait_score_revisions FROM anon, authenticated;
GRANT SELECT ON public.trait_score_revisions TO authenticated;
DROP TRIGGER IF EXISTS tsr_frozen ON public.trait_score_revisions;
CREATE TRIGGER tsr_frozen BEFORE UPDATE OR DELETE ON public.trait_score_revisions
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

CREATE OR REPLACE FUNCTION public.guard_locked_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.orphan_is_locked(OLD.orphan_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'score_locked' USING ERRCODE = '42501';
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.integrity_discrepancies (orphan_id, source, changes)
    VALUES (OLD.orphan_id, OLD.source, jsonb_build_object('trait_score:' || OLD.external_ref,
            jsonb_build_object('was', OLD.score, 'proposed', 'deleted')));
    PERFORM public.log_integrity('score_delete_held', OLD.orphan_id,
      jsonb_build_object('score', OLD.external_ref), OLD.source);
    NEW.deleted_at := NULL;
  END IF;
  IF NEW.score IS DISTINCT FROM OLD.score THEN
    INSERT INTO public.trait_score_revisions (score_id, orphan_id, was_score, was_observed_at, new_score)
    VALUES (OLD.id, OLD.orphan_id, OLD.score, OLD.observed_at, NEW.score);
    PERFORM public.log_integrity('score_revised', OLD.orphan_id,
      jsonb_build_object('score', OLD.external_ref, 'was', OLD.score, 'now', NEW.score), OLD.source);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS guard_locked_scores ON public.orphan_trait_scores;
CREATE TRIGGER guard_locked_scores BEFORE UPDATE OR DELETE ON public.orphan_trait_scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_scores();

-- قبول اختلافٍ = طلب «edit» بالقيم المقترحة، يمرّ بالموافقتين. الرفض يُبقي الحقيقة.
CREATE OR REPLACE FUNCTION public.admin_resolve_discrepancy(_id UUID, _accept BOOLEAN, _reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.integrity_discrepancies; _patch JSONB; _req UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _d FROM public.integrity_discrepancies WHERE id = _id AND status = 'open' FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'discrepancy_not_open'; END IF;
  IF NOT _accept THEN
    UPDATE public.integrity_discrepancies SET status = 'dismissed', decided_by = auth.uid(), decided_at = now()
     WHERE id = _id;
    PERFORM public.log_integrity('discrepancy_dismissed', _d.orphan_id,
      jsonb_build_object('discrepancy', _id, 'reason', _reason), _d.source);
    RETURN NULL;
  END IF;
  SELECT jsonb_object_agg(k, _d.changes->k->'proposed') INTO _patch
    FROM jsonb_object_keys(_d.changes) k WHERE k = ANY (public.unlock_editable_fields());
  IF _patch IS NULL THEN RAISE EXCEPTION 'discrepancy_not_editable'; END IF;
  _req := public.admin_request_unlock(_d.orphan_id, 'edit', _patch, _reason, 'discrepancy:' || _id);
  UPDATE public.unlock_requests SET discrepancy_id = _id WHERE id = _req;
  RETURN _req;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_resolve_discrepancy(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_discrepancy(UUID, BOOLEAN, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٥) المصادر: الحالة، والطوارئ، وسلسلة دفعات المزامنة
-- ---------------------------------------------------------------------
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_status_check;
ALTER TABLE public.countries ADD CONSTRAINT countries_status_check
  CHECK (status IN ('planned', 'active', 'paused', 'emergency'));
ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS emergency_note TEXT;

ALTER TABLE public.operating_platforms
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding', 'trial', 'active', 'paused')),
  ADD COLUMN IF NOT EXISTS regions_mapped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS office_reviewed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reconcile_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.mirror_batches (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL REFERENCES public.operating_platforms(key),
  entity       TEXT NOT NULL,
  records      INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mirror_batches_source ON public.mirror_batches(source, id DESC);
ALTER TABLE public.mirror_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mb_admin ON public.mirror_batches;
CREATE POLICY mb_admin ON public.mirror_batches FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.mirror_batches FROM anon, authenticated;
GRANT SELECT ON public.mirror_batches TO authenticated;
DROP TRIGGER IF EXISTS mirror_batches_frozen ON public.mirror_batches;
CREATE TRIGGER mirror_batches_frozen BEFORE UPDATE OR DELETE ON public.mirror_batches
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

-- يُستدعى بعد كل دفعةٍ مقبولة: بصمة المحتوى (يحسبها الخادم) مربوطةٌ ببصمة
-- الدفعة السابقة من المصدر نفسه.
CREATE OR REPLACE FUNCTION public.mirror_log_batch(
  _client UUID, _entity TEXT, _records INTEGER, _deleted INTEGER, _payload_hash TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _src TEXT; _prev TEXT; _hash TEXT;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RAISE EXCEPTION 'client_not_permitted' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mirror_batches:' || _src));
  SELECT hash INTO _prev FROM public.mirror_batches WHERE source = _src ORDER BY id DESC LIMIT 1;
  _prev := COALESCE(_prev, 'genesis');
  _hash := encode(sha256(convert_to(concat_ws('|', _prev, _src, _entity, _records, _deleted, _payload_hash), 'UTF8')), 'hex');
  INSERT INTO public.mirror_batches (source, entity, records, deleted, payload_hash, prev_hash, hash)
  VALUES (_src, _entity, _records, _deleted, lower(_payload_hash), _prev, _hash);
  RETURN _hash;
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_log_batch(UUID, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_log_batch(UUID, TEXT, INTEGER, INTEGER, TEXT) TO service_role;

-- وضع الطوارئ يوقف الكفالة الجديدة في الدولة (الدعم يوقفه شرط «مفعّلة» القائم).
CREATE OR REPLACE FUNCTION public.block_sponsorship_in_emergency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orphans o JOIN public.countries c
               ON c.code = o.country OR c.name_ar = o.country OR c.name_local = o.country
              WHERE o.id = NEW.orphan_id AND c.status = 'emergency') THEN
    RAISE EXCEPTION 'country_emergency' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS block_sponsorship_in_emergency ON public.sponsorships;
CREATE TRIGGER block_sponsorship_in_emergency BEFORE INSERT ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.block_sponsorship_in_emergency();

CREATE OR REPLACE FUNCTION public.admin_set_country_emergency(_code TEXT, _on BOOLEAN, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _on AND length(btrim(COALESCE(_note, ''))) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;
  UPDATE public.countries SET status = CASE WHEN _on THEN 'emergency' ELSE 'active' END,
         emergency_note = CASE WHEN _on THEN btrim(_note) END
   WHERE code = _code AND status IN ('active', 'emergency');
  IF NOT FOUND THEN RAISE EXCEPTION 'country_not_active'; END IF;
  PERFORM public.log_integrity(CASE WHEN _on THEN 'emergency_on' ELSE 'emergency_off' END, NULL,
    jsonb_build_object('country', _code, 'note', _note));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_country_emergency(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_country_emergency(TEXT, BOOLEAN, TEXT) TO authenticated;

-- حالة المصدر تتقدّم بقائمة التحقّق: لا «مفعّل» قبل مزامنةٍ ومطابقةٍ نظيفة
-- ومراجعة المكتب وربط المناطق.
CREATE OR REPLACE FUNCTION public.source_checklist(_key TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'key_issued', EXISTS (SELECT 1 FROM public.api_clients c WHERE c.source = p.key AND c.active
                           AND c.revoked_at IS NULL AND 'mirror:write' = ANY (c.scopes)),
    'first_sync', EXISTS (SELECT 1 FROM public.mirror_sync_state m WHERE m.source = p.key AND m.last_run_at IS NOT NULL),
    'reconciled', p.last_reconcile_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM public.mirror_sync_state m
                                   WHERE m.source = p.key AND m.drift IS NOT NULL
                                     AND m.drift::text NOT IN ('null', '{}', '[]')),
    'org_linked', p.org_id IS NOT NULL,
    'office_reviewed', p.office_reviewed,
    'regions_mapped', p.regions_mapped)
  FROM public.operating_platforms p WHERE p.key = _key;
$fn$;
REVOKE ALL ON FUNCTION public.source_checklist(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_source(
  _key TEXT, _status TEXT, _office_reviewed BOOLEAN DEFAULT NULL, _regions_mapped BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _c JSONB; _missing TEXT[];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.operating_platforms SET
    office_reviewed = COALESCE(_office_reviewed, office_reviewed),
    regions_mapped = COALESCE(_regions_mapped, regions_mapped)
   WHERE key = _key;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_not_found'; END IF;
  _c := public.source_checklist(_key);
  IF _status = 'active' THEN
    SELECT array_agg(k) INTO _missing FROM jsonb_each(_c) e(k, v) WHERE v = 'false'::jsonb;
    IF _missing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'checklist_incomplete', 'missing', to_jsonb(_missing));
    END IF;
  END IF;
  IF _status IS NOT NULL THEN
    UPDATE public.operating_platforms SET status = _status, active = (_status <> 'paused') WHERE key = _key;
    PERFORM public.log_integrity('source_status', NULL, jsonb_build_object('status', _status), _key);
  END IF;
  RETURN jsonb_build_object('ok', true, 'checklist', public.source_checklist(_key));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_source(TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_source(TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- لوحة المصادر: كل منصّة بدولتها وحالتها وصحّتها وأقفالها واختلافاتها.
CREATE OR REPLACE FUNCTION public.admin_sources_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'key', p.key, 'name', p.name, 'country', p.country_code, 'country_name', c.name_ar,
        'country_status', c.status, 'emergency_note', c.emergency_note,
        'status', p.status, 'base_url', p.base_url,
        'last_sync_at', (SELECT max(m.last_run_at) FROM public.mirror_sync_state m WHERE m.source = p.key),
        'last_error', (SELECT m.last_error FROM public.mirror_sync_state m WHERE m.source = p.key
                        AND m.last_error IS NOT NULL ORDER BY m.last_run_at DESC NULLS LAST LIMIT 1),
        'last_reconcile_at', p.last_reconcile_at,
        'mirrored', (SELECT count(*) FROM public.orphans o WHERE o.external_source = p.key AND o.external_deleted_at IS NULL),
        'locked', (SELECT count(*) FROM public.orphan_locks l JOIN public.orphans o ON o.id = l.orphan_id
                    WHERE o.external_source = p.key),
        'open_discrepancies', (SELECT count(*) FROM public.integrity_discrepancies d
                                WHERE d.source = p.key AND d.status = 'open'),
        'batches', (SELECT count(*) FROM public.mirror_batches b WHERE b.source = p.key),
        'checklist', public.source_checklist(p.key)) ORDER BY c.sort_order, p.key)
      FROM public.operating_platforms p JOIN public.countries c ON c.code = p.country_code), '[]'::jsonb),
    'pending_unlocks', (SELECT count(*) FROM public.unlock_requests WHERE status IN ('pending', 'approved')),
    'open_discrepancies', (SELECT count(*) FROM public.integrity_discrepancies WHERE status = 'open'),
    'locked_total', (SELECT count(*) FROM public.orphan_locks));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_sources_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sources_overview() TO authenticated;

-- طلبات الفكّ والاختلافات مع أسماء الأطفال، لصفحة السلامة.
CREATE OR REPLACE FUNCTION public.admin_integrity_queue()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  -- الطلبات المعتمدة التي انتهت نافذتها تظهر «منتهية» (القراءة لا تكتب).
  RETURN jsonb_build_object(
    'requests', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'orphan_id', r.orphan_id, 'orphan', o.display_name, 'code', o.code,
        'op', r.op, 'patch', r.patch, 'reason', r.reason, 'document', r.document,
        'status', CASE WHEN r.status = 'approved' AND r.expires_at <= now() THEN 'expired' ELSE r.status END,
        'approvals', cardinality(r.approvals), 'quorum', public.unlock_quorum(),
        'mine', r.requested_by = auth.uid(), 'i_approved', auth.uid() = ANY (r.approvals),
        'expires_at', r.expires_at, 'created_at', r.created_at) ORDER BY r.created_at DESC)
      FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
     WHERE r.created_at > now() - interval '90 days'), '[]'::jsonb),
    'discrepancies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'orphan_id', d.orphan_id, 'orphan', o.display_name, 'code', o.code,
        'source', d.source, 'changes', d.changes, 'created_at', d.created_at) ORDER BY d.created_at DESC)
      FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
     WHERE d.status = 'open'), '[]'::jsonb),
    'recent', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'id')::bigint DESC) FROM (
        SELECT jsonb_build_object('id', l.id, 'at', l.at, 'kind', l.kind, 'orphan_id', l.orphan_id,
               'source', l.source, 'hash', left(l.hash, 12)) AS x
          FROM public.integrity_log l ORDER BY l.id DESC LIMIT 30) t), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_integrity_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_integrity_queue() TO authenticated;

-- حالة القفل لملفّ طفل — تُعرض للإدارة في صفحته.
CREATE OR REPLACE FUNCTION public.admin_orphan_lock(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('locked', true, 'reason', l.reason, 'locked_at', l.locked_at)
            FROM public.orphan_locks l WHERE l.orphan_id = _orphan);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_orphan_lock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_orphan_lock(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- ٦) صندوق القرارات: طلبات الفكّ والاختلافات
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
        UNION ALL
        SELECT 'unlock', r.id, o.display_name,
               'طلب فكّ · ' || r.op || ' · ' || cardinality(r.approvals) || '/' || public.unlock_quorum(),
               r.created_at
          FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'pending' AND r.requested_by <> auth.uid() AND auth.uid() <> ALL (r.approvals)
        UNION ALL
        SELECT 'discrepancy', d.id, o.display_name, 'اختلافٌ من ' || COALESCE(d.source, 'المصدر'), d.created_at
          FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open'
      ) i), '[]'::jsonb);
END $fn$;


-- ---------------------------------------------------------------------
-- ٧) سجلّ المال لطفلٍ مقفول لا يُحذف — ولا من حذف حساب الكافل
-- ---------------------------------------------------------------------
-- `sponsorships.sponsor_id` يُحذف تسلسلياً مع حساب الكافل؛ فحذف حسابٍ كان
-- يمحو تاريخ كفالةٍ وصلت طفلاً. الحارس يعمل على الحذف المتسلسل أيضاً:
-- يُغلق الحساب أو يُجهَّل، ولا يُمحى أثره المالي.
CREATE OR REPLACE FUNCTION public.guard_locked_money()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.orphan_is_locked(OLD.orphan_id)
     AND (TG_OP = 'DELETE' OR NEW.orphan_id IS DISTINCT FROM OLD.orphan_id) THEN
    RAISE EXCEPTION '%_locked', TG_TABLE_NAME USING ERRCODE = '42501',
      HINT = 'سجلٌّ ماليّ لطفلٍ مكفول لا يُحذف ولا يُنقل.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;
DO $$
DECLARE _t TEXT;
BEGIN
  FOREACH _t IN ARRAY ARRAY['sponsorships', 'disbursements', 'support_pledges'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_locked_money ON public.%I', _t);
    EXECUTE format('CREATE TRIGGER guard_locked_money BEFORE UPDATE OF orphan_id OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.guard_locked_money()', _t);
  END LOOP;
END $$;
