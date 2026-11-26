-- =====================================================================
-- العينان بلا استثناء للإدارة
-- ---------------------------------------------------------------------
-- بقرار المالك: من رفع تغييراً حرجاً أو أثار رفعُه تنبيهاً حرجاً لا يحسمه بنفسه،
-- ولو كان مديراً. يحسمه مديرٌ آخر أو مشرف الدولة. وتبقى القيمة اليدوية في
-- الحقل الحرج للإدارة وحدها، ويسري عليها فحص الرافع كغيرها.
-- التعريفان منقولان من التعريف الحيّ بعد السلسلة، بالتغيير وحده.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_conflict_resolve(_id uuid, _choice text, _value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _by UUID; _d public.data_conflicts; _fa public.field_authority; _v JSONB; _pin TIMESTAMPTZ; _from TEXT;
BEGIN
  SELECT * INTO _d FROM public.data_conflicts WHERE id = _id FOR UPDATE;
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
END $function$;

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
  IF NOT public.country_can(COALESCE((SELECT country_code FROM public.orphans WHERE id = _a.orphan_id), _a.country_code), 'approve') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _a.id IS NULL OR _a.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'code', 'alert_closed'); END IF;
  IF _a.severity = 'critical' AND _a.raised_by = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'four_eyes_required');
  END IF;
  UPDATE public.data_alerts SET status = _status, note = NULLIF(btrim(COALESCE(_note, '')), ''),
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'golden_alert_resolve', 'orphans', _a.orphan_id,
          jsonb_build_object('alert', _id, 'signal', _a.code, 'severity', _a.severity, 'status', _status, 'note', _note));
  RETURN jsonb_build_object('ok', true);
END $function$;
