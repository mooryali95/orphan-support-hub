-- =====================================================================
-- مراجعة الأمن، الدفعة الثانية (F6، سجلّ الدفاع، مفاتيح الإيقاف، F8/F9 في الخادم)
-- =====================================================================
-- 1) المصادقة الثنائية إلزامية لمن يحسم: المدير ومشرف الدولة يحتاجان جلسة aal2
--    لحسم التنبيهات والتعارضات وطلبات الفكّ ووضع المصدر وفريق الدولة، وإلّا
--    يعود الرمز mfa_required (كان aal2 مطلوباً فقط لمن فعّل عاملاً).
-- 2) سجلّ الدفاع: رفض العينين، ورفض mfa_required، وإبطال مفاتيح الشركاء، وإخفاق
--    دخول الندوة (السبب وحده، لا الرمز) تُكتب في integrity_log (للإدارة وحدها).
--    الرفض يعود برمزٍ لا باستثناء، فيبقى سطر السجلّ.
-- 3) مفتاحا إيقاف: platform_settings.sso_disabled يوقف دخول الندوة، وorphan_freezes
--    تجمّد ملفّ طفلٍ: لا كتابة ذهبية ولا كفالة جديدة (golden_accepts_new_support
--    يبقى فحصاً بفهرس: المفتاح الأساسي للجدول).
-- أجسام الدوال المعدّلة مأخوذة من pg_get_functiondef للقاعدة الحيّة.
-- =====================================================================

-- ── المستوى aal2 ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.session_strong()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;

-- من يحسم في هذه الدولة (أو في أيّ دولة حين _country فارغ) بجلسةٍ دون aal2.
-- عضو دولةٍ أخرى ليس حاسماً هنا، فيمضي إلى country_forbidden ولا يعرف شيئاً.
CREATE OR REPLACE FUNCTION public.approver_needs_mfa(_country text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.session_strong() AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.country_staff s
                WHERE s.user_id = auth.uid() AND s.role = 'supervisor'
                  AND (_country IS NULL OR s.country_code = _country)));
$$;

-- ── سجلّ الدفاع ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.security_event(_kind text, _detail jsonb DEFAULT '{}'::jsonb, _orphan uuid DEFAULT NULL)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.log_integrity('sec_' || _kind, _orphan, COALESCE(_detail, '{}'::jsonb), 'security') $$;

CREATE OR REPLACE FUNCTION public.mfa_refusal(_action text, _orphan uuid, _detail jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.security_event('mfa_required', COALESCE(_detail, '{}'::jsonb) || jsonb_build_object('action', _action), _orphan);
  RETURN jsonb_build_object('ok', false, 'code', 'mfa_required');
END $$;

CREATE OR REPLACE FUNCTION public.four_eyes_refusal(_action text, _orphan uuid, _detail jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.security_event('four_eyes_refused', COALESCE(_detail, '{}'::jsonb) || jsonb_build_object('action', _action), _orphan);
  RETURN jsonb_build_object('ok', false, 'code', 'four_eyes_required');
END $$;

-- إخفاق دخول الندوة من الخادم (مفتاح الخدمة): سببٌ من قائمةٍ قصيرة، بلا رمز ولا بريد.
CREATE OR REPLACE FUNCTION public.sso_log_failure(_reason text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.security_event('sso_failure', jsonb_build_object('reason',
    CASE WHEN _reason ~ '^[a-z_]{1,40}$' THEN _reason ELSE 'other' END));
$$;

-- ── إيقاف دخول الندوة ────────────────────────────────────────────────
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS sso_disabled BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sso_disabled()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT sso_disabled FROM public.platform_settings LIMIT 1), false) $$;

CREATE OR REPLACE FUNCTION public.admin_sso_set_disabled(_disabled boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _disabled IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'value_invalid'); END IF;
  UPDATE public.platform_settings SET sso_disabled = _disabled, updated_at = now();
  PERFORM public.security_event(CASE WHEN _disabled THEN 'sso_disabled' ELSE 'sso_enabled' END);
  RETURN jsonb_build_object('ok', true, 'disabled', _disabled);
END $$;

-- ── تجميد ملفّ طفل ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orphan_freezes (
  orphan_id UUID PRIMARY KEY REFERENCES public.orphans(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  frozen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orphan_freezes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orphan_freezes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orphan_freezes TO authenticated;
GRANT ALL ON public.orphan_freezes TO service_role;
DROP POLICY IF EXISTS orphan_freezes_admin ON public.orphan_freezes;
CREATE POLICY orphan_freezes_admin ON public.orphan_freezes FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.orphan_frozen(_orphan uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.orphan_freezes WHERE orphan_id = _orphan) $$;

CREATE OR REPLACE FUNCTION public.admin_orphan_freeze(_orphan uuid, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NULLIF(btrim(COALESCE(_reason, '')), '') IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'note_required'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'orphan_unknown');
  END IF;
  INSERT INTO public.orphan_freezes (orphan_id, reason, frozen_by) VALUES (_orphan, btrim(_reason), auth.uid())
  ON CONFLICT (orphan_id) DO UPDATE SET reason = EXCLUDED.reason, frozen_by = EXCLUDED.frozen_by, frozen_at = now();
  PERFORM public.security_event('orphan_frozen', jsonb_build_object('reason', btrim(_reason)), _orphan);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_orphan_unfreeze(_orphan uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  -- الرفع قرارٌ يعيد المال إلى الملف: بعاملٍ ثانٍ كبقية القرارات.
  IF public.approver_needs_mfa(NULL) THEN
    RETURN public.mfa_refusal('orphan_unfreeze', _orphan, '{}'::jsonb);
  END IF;
  DELETE FROM public.orphan_freezes WHERE orphan_id = _orphan;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'not_frozen'); END IF;
  PERFORM public.security_event('orphan_unfrozen', '{}'::jsonb, _orphan);
  RETURN jsonb_build_object('ok', true);
END $$;

-- حال المفتاحين للوحة الإدارة: دخول الندوة، وتجميد ملفٍّ بعينه إن طُلب.
CREATE OR REPLACE FUNCTION public.admin_security_switches(_orphan uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('ok', true, 'sso_disabled', public.sso_disabled(),
    'frozen', (SELECT jsonb_build_object('reason', z.reason, 'at', z.frozen_at)
                 FROM public.orphan_freezes z WHERE z.orphan_id = _orphan));
END $$;

-- حارسٌ أخير: لا تُكتب حالة حقلٍ لملفٍّ مجمَّد من أيّ طريق.
CREATE OR REPLACE FUNCTION public.guard_frozen_field_state()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.orphan_frozen(NEW.orphan_id) THEN RAISE EXCEPTION 'orphan_frozen' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_frozen_field_state ON public.orphan_field_state;
CREATE TRIGGER trg_frozen_field_state BEFORE INSERT OR UPDATE ON public.orphan_field_state
  FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_field_state();
DROP TRIGGER IF EXISTS trg_frozen_field_obs ON public.orphan_field_observations;
CREATE TRIGGER trg_frozen_field_obs BEFORE INSERT OR UPDATE ON public.orphan_field_observations
  FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_field_state();

-- ── الدوال المعدّلة ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_alert_resolve(_id uuid, _status text, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.data_alerts;
BEGIN
  IF _status NOT IN ('reviewed', 'false_positive', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'status_unknown');
  END IF;
  IF _status = 'confirmed' AND NULLIF(btrim(COALESCE(_note, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'note_required');
  END IF;
  SELECT * INTO _a FROM public.data_alerts WHERE id = _id FOR UPDATE;
  IF public.approver_needs_mfa(COALESCE((SELECT country_code FROM public.orphans WHERE id = _a.orphan_id), _a.country_code)) THEN RETURN public.mfa_refusal('alert_resolve', _a.orphan_id, jsonb_build_object('alert', _id)); END IF;
  IF NOT public.country_can(COALESCE((SELECT country_code FROM public.orphans WHERE id = _a.orphan_id), _a.country_code), 'approve') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _a.id IS NULL OR _a.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'alert_closed'); END IF;
  IF _a.severity = 'critical' AND _a.raised_by = auth.uid() THEN
    RETURN public.four_eyes_refusal('alert_resolve', _a.orphan_id, jsonb_build_object('alert', _id));
  END IF;
  UPDATE public.data_alerts SET status = _status, note = NULLIF(btrim(COALESCE(_note, '')), ''),
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'golden_alert_resolve', 'orphans', _a.orphan_id,
          jsonb_build_object('alert', _id, 'signal', _a.code, 'severity', _a.severity, 'status', _status, 'note', _note));
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_conflict_resolve(_id uuid, _choice text, _value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _by UUID; _d public.data_conflicts; _fa public.field_authority; _v JSONB; _pin TIMESTAMPTZ; _from TEXT;
BEGIN
  SELECT * INTO _d FROM public.data_conflicts WHERE id = _id FOR UPDATE;
  IF public.approver_needs_mfa((SELECT country_code FROM public.orphans WHERE id = _d.orphan_id)) THEN RETURN public.mfa_refusal('conflict_resolve', _d.orphan_id, jsonb_build_object('conflict', _id)); END IF;
  -- النطاق قبل الحالة: لا يعرف عضو دولةٍ أخرى حتى أن البند أُغلق.
  IF NOT public.country_can((SELECT country_code FROM public.orphans WHERE id = _d.orphan_id), 'approve') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _d.id IS NULL OR _d.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'conflict_closed'); END IF;
  SELECT * INTO _fa FROM public.field_authority WHERE field = _d.field;
  -- عينان: من رفع القيمة المقترحة لا يعتمد تغييرها الحرج بنفسه، ولا استثناء للإدارة.
  IF _d.risk = 'critical' AND _choice <> 'keep' THEN
    -- قيمةٌ يكتبها المشرف بيده في حقلٍ حرج: تتجاوز المصدرين، فهي للإدارة وحدها.
    IF _choice = 'manual' AND NOT public.is_admin() THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manual_critical_admin_only');
    END IF;
    -- من رفع أيّ قيمةٍ مطروحة في البند، في أيّ وقت (السجلّ لا آخر رفعٍ وحده)، لا يحسمه.
    SELECT h.received_by INTO _by FROM public.orphan_field_history h
     WHERE h.orphan_id = _d.orphan_id AND h.field = _d.field
       AND h.value IN (_d.proposed_value, _d.wamy_value, _d.office_value)
       AND h.received_by = auth.uid() LIMIT 1;
    IF _by IS NOT NULL THEN
      RETURN public.four_eyes_refusal('conflict_resolve', _d.orphan_id, jsonb_build_object('conflict', _id));
    END IF;
  END IF;

  -- ملفٌّ مجمَّد: لا يُكتب فيه قرارٌ حتى يرفع المدير التجميد.
  IF public.orphan_frozen(_d.orphan_id) THEN RETURN jsonb_build_object('ok', false, 'code', 'orphan_frozen'); END IF;

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
END $function$;

CREATE OR REPLACE FUNCTION public.admin_conflicts_resolve_bulk(_ids uuid[], _choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id UUID; _d public.data_conflicts; _country TEXT; _r JSONB;
  _out JSONB := '[]'::jsonb; _done INTEGER := 0; _failed INTEGER := 0;
BEGIN
  IF public.approver_needs_mfa(NULL) THEN RETURN public.mfa_refusal('conflicts_resolve_bulk', NULL, jsonb_build_object('count', cardinality(_ids))); END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.admin_approve_unlock(_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.unlock_requests; _me UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF public.approver_needs_mfa(NULL) THEN RETURN public.mfa_refusal('unlock_approve', NULL, jsonb_build_object('request', _request)); END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF _r.requested_by = _me THEN
    RETURN public.four_eyes_refusal('unlock_approve', _r.orphan_id, jsonb_build_object('request', _request));
  END IF;
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
  RETURN jsonb_build_object('ok', true, 'approvals', cardinality(_r.approvals), 'quorum', public.unlock_quorum());
END $function$;

CREATE OR REPLACE FUNCTION public.admin_apply_unlock(_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.unlock_requests; _before JSONB; _after JSONB; _k TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF public.approver_needs_mfa(NULL) THEN RETURN public.mfa_refusal('unlock_apply', NULL, jsonb_build_object('request', _request)); END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.admin_country_source_set(_country text, _source text, _mode text, _stale_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _was TEXT; _n INTEGER := 0; _r RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF public.approver_needs_mfa(NULL) THEN RETURN public.mfa_refusal('country_source_set', NULL, jsonb_build_object('country', _country)); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _country) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'country_unknown');
  END IF;
  IF _mode NOT IN ('none', 'shadow', 'active') THEN RETURN jsonb_build_object('ok', false, 'code', 'mode_unknown'); END IF;
  _source := NULLIF(_source, '');
  IF _mode <> 'none' AND NOT EXISTS (SELECT 1 FROM public.operating_platforms p
                                      WHERE p.key = _source AND p.country_code = _country) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'source_unknown');
  END IF;
  IF _stale_days IS NOT NULL AND _stale_days NOT BETWEEN 30 AND 730 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_days_invalid');
  END IF;
  _was := public.golden_office_mode(_country);

  INSERT INTO public.country_data_sources AS s (country_code, office_source, office_mode, stale_after_days, changed_at, changed_by)
  VALUES (_country, _source, _mode, COALESCE(_stale_days, 180), now(), auth.uid())
  ON CONFLICT (country_code) DO UPDATE SET office_source = EXCLUDED.office_source, office_mode = EXCLUDED.office_mode,
    stale_after_days = COALESCE(_stale_days, s.stale_after_days), changed_at = now(), changed_by = auth.uid();

  IF _was IS DISTINCT FROM _mode THEN
    FOR _r IN SELECT DISTINCT f.orphan_id, f.field FROM public.orphan_field_observations f
                JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = _country LOOP
      PERFORM public.golden_evaluate(_r.orphan_id, _r.field);
      _n := _n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'country_source_mode', 'countries', NULL,
          jsonb_build_object('country', _country, 'from', _was, 'to', _mode, 'source', _source, 'reevaluated', _n));
  RETURN jsonb_build_object('ok', true, 'from', _was, 'to', _mode, 'reevaluated', _n);
END $function$;

CREATE OR REPLACE FUNCTION public.country_staff_set(_country text, _email text, _role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid UUID; _was TEXT; _admin BOOLEAN := public.is_admin();
BEGIN
  IF public.approver_needs_mfa(_country) THEN RETURN public.mfa_refusal('country_staff_set', NULL, jsonb_build_object('country', _country)); END IF;
  IF NOT public.country_can(_country, 'manage') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  IF _role IS NOT NULL AND _role NOT IN ('supervisor', 'data_entry', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'role_unknown');
  END IF;
  -- الدور قبل البحث: لا تُنشأ دعوةٌ لدورٍ لا يملك المشرف منحه.
  IF NOT _admin AND _role = 'supervisor' THEN RETURN jsonb_build_object('ok', false, 'code', 'role_forbidden'); END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.golden_accepts_new_support(_orphan uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT (
    EXISTS (SELECT 1 FROM public.orphan_freezes z WHERE z.orphan_id = _orphan)
    OR EXISTS (SELECT 1 FROM public.data_alerts a WHERE a.orphan_id = _orphan
               AND a.severity = 'critical' AND a.status IN ('open', 'confirmed'))
    OR EXISTS (SELECT 1 FROM public.data_conflicts d WHERE d.orphan_id = _orphan AND d.status = 'open')
    OR (EXISTS (SELECT 1 FROM public.orphans o JOIN public.country_data_sources s ON s.country_code = o.country_code
                 WHERE o.id = _orphan AND s.office_mode IN ('shadow', 'active'))
        AND EXISTS (SELECT 1 FROM public.orphan_field_observations f
                     WHERE f.orphan_id = _orphan
                       AND f.observed_at >= now() - make_interval(days => COALESCE(
                             (SELECT s.stale_after_days FROM public.orphans o
                                JOIN public.country_data_sources s ON s.country_code = o.country_code
                               WHERE o.id = _orphan), 180)))
        AND NOT EXISTS (SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = _orphan AND l.role = 'office')));
$function$;

CREATE OR REPLACE FUNCTION public.golden_trust(_orphan uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH o AS (
    SELECT o.id, public.golden_office_mode(o.country_code) AS mode,
           COALESCE((SELECT stale_after_days FROM public.country_data_sources WHERE country_code = o.country_code), 180) AS stale_days
      FROM public.orphans o WHERE o.id = _orphan),
  s AS (
    SELECT o.*,
      EXISTS (SELECT 1 FROM public.data_alerts a WHERE a.orphan_id = o.id AND a.severity = 'critical'
                AND a.status IN ('open', 'confirmed'))
        OR EXISTS (SELECT 1 FROM public.orphan_freezes z WHERE z.orphan_id = o.id) AS flagged,
      EXISTS (SELECT 1 FROM public.orphan_freezes z WHERE z.orphan_id = o.id) AS frozen,
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
    'warnings', warnings, 'frozen', frozen)
  FROM s;
$function$;

CREATE OR REPLACE FUNCTION public.golden_evaluate(_orphan uuid, _field text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _fa public.field_authority; _mode TEXT; _own TEXT; _ver TEXT;
  _ow public.orphan_field_observations; _vo public.orphan_field_observations;
  _w JSONB; _o JSONB; _st public.orphan_field_state; _golden JSONB; _has_state BOOLEAN; _cur TEXT;
BEGIN
  -- ملفٌّ مجمَّد: الملاحظات لا تبلغه، فلا يتغيّر فيه شيءٌ حتى يُرفع التجميد.
  IF public.orphan_frozen(_orphan) THEN RETURN; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.golden_ingest_core(_role text, _source text, _country text, _records jsonb, _actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    IF public.orphan_frozen(_orphan) THEN
      _skipped := _skipped || jsonb_build_object('index', _i, 'ref', _ref, 'reason', 'orphan_frozen');
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
END $function$;

CREATE OR REPLACE FUNCTION public.golden_write_column(_orphan uuid, _col text, _v jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _now JSONB;
BEGIN
  IF public.orphan_frozen(_orphan) THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION public.revoke_api_client(_client uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إبطال المفاتيح للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  UPDATE public.api_clients
     SET active = false, revoked_at = now()
   WHERE id = _client AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا مفتاح قائماً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_audit('api_client.revoked', 'api_client', _client, '{}'::jsonb);
  PERFORM public.security_event('api_client_revoked', jsonb_build_object('client', _client));
  RETURN jsonb_build_object('revoked', true);
END $function$;


-- ── الصلاحيات ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.approver_needs_mfa(text), public.security_event(text, jsonb, uuid),
  public.mfa_refusal(text, uuid, jsonb), public.four_eyes_refusal(text, uuid, jsonb),
  public.sso_log_failure(text), public.sso_disabled(), public.orphan_frozen(uuid),
  public.guard_frozen_field_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sso_log_failure(text), public.sso_disabled() TO service_role;
REVOKE ALL ON FUNCTION public.admin_sso_set_disabled(boolean), public.admin_orphan_freeze(uuid, text),
  public.admin_orphan_unfreeze(uuid), public.admin_security_switches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sso_set_disabled(boolean), public.admin_orphan_freeze(uuid, text),
  public.admin_orphan_unfreeze(uuid), public.admin_security_switches(uuid) TO authenticated, service_role;
