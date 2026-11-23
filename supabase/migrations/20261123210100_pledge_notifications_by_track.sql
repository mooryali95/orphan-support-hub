-- =====================================================================
-- إشعارات التأهيل والعيني تسمّي مسارها
-- ---------------------------------------------------------------------
-- ١) `record_pledge_delivery`: نوعا الإشعار الجديدان، وعنوانٌ يسمّي المسار
--    («يُجهَّز تبرّعك العيني» / «وصل تبرّعك للتأهيل») بدل «دعمك» المجرّد.
-- ٢) `my_journey_feed`: صفّ مرحلة التسليم يحمل اسم المسار في نصّه، كما
--    يحمل صفّ الجلسة عنوانها. لا تغيير آخر في الدالّتين.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_pledge_delivery(
  _pledge UUID, _office UUID, _stage TEXT, _proof_path TEXT DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.support_pledges; _track TEXT;
BEGIN
  IF NOT public.office_permission(_office, 'write') OR NOT public.pledge_in_office(_pledge, _office) THEN
    RAISE EXCEPTION 'delivery_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _p FROM public.support_pledges WHERE id = _pledge;
  -- اسم المسار كما يقرؤه الداعم في «اختر أثرك» (config/giving-tracks).
  _track := CASE _p.kind WHEN 'in_kind' THEN 'تبرّعك العيني' ELSE 'تبرّعك للتأهيل' END;
  IF _p.status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'pledge_not_open';
  END IF;
  IF _stage = 'delivered' THEN
    IF NULLIF(btrim(COALESCE(_proof_path, '')), '') IS NULL THEN RAISE EXCEPTION 'proof_required'; END IF;
    IF split_part(_proof_path, '/', 1) <> _office::text THEN RAISE EXCEPTION 'proof_outside_office'; END IF;
  END IF;

  INSERT INTO public.pledge_deliveries (pledge_id, office_id, stage, proof_path, note, created_by)
  VALUES (_pledge, _office, _stage, NULLIF(btrim(_proof_path), ''), NULLIF(btrim(_note), ''), auth.uid());

  IF _stage = 'delivered' THEN
    UPDATE public.support_pledges SET status = 'fulfilled' WHERE id = _pledge;
    PERFORM public.notify(_p.supporter_id, 'pledge_delivered', 'وصل ' || _track,
      'أكّد المكتب تسليم ' || _track || ' بمستندٍ موثّق.', '/dashboard', 'pledge', _pledge);
  ELSE
    PERFORM public.notify(_p.supporter_id, 'pledge_preparing', 'يُجهَّز ' || _track,
      'بدأ المكتب تجهيز ' || _track || ' للتسليم.', '/dashboard', 'pledge', _pledge);
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.record_pledge_delivery(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pledge_delivery(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_journey_feed(_limit INT DEFAULT 40)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.at DESC)
      FROM (
        -- ما كُتب في الخطّ الزمني لمن يكفلهم — بالمهلة نفسها التي تحكم الملفّ
        SELECT 'timeline' AS kind, t.event_type AS type, t.created_at AS at,
               o.display_name AS orphan, o.id AS orphan_id, t.detail AS text
          FROM public.timeline_events t
          JOIN public.orphans o ON o.id = t.orphan_id
         WHERE public.sponsors_orphan(t.orphan_id)
        UNION ALL
        -- مراحل تسليم تعهّداته
        SELECT 'pledge', 'pledge.' || d.stage, d.created_at,
               NULL, NULL,
               CASE p.kind WHEN 'in_kind' THEN 'تبرع عيني' ELSE 'تبرع تأهيل' END
          FROM public.pledge_deliveries d
          JOIN public.support_pledges p ON p.id = d.pledge_id
         WHERE p.supporter_id = _uid
        UNION ALL
        -- الجلسات المقبولة — حيث له نطاق «الرحلة»
        SELECT 'unit', 'unit.accepted', u.decided_at, o.display_name, o.id, pu.title
          FROM public.enrollment_units u
          JOIN public.program_enrollments e ON e.id = u.enrollment_id
          JOIN public.program_units pu ON pu.id = u.unit_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE u.status = 'accepted' AND u.decided_at IS NOT NULL
           AND public.has_orphan_scope(o.id, 'journey')
        UNION ALL
        -- قياسات السمات — حيث له نطاق «السمات»؛ بلا ملاحظة المشرف
        SELECT 'trait', 'trait.measured', s.observed_at, o.display_name, o.id, t.name_ar
          FROM public.orphan_trait_scores s
          JOIN public.trait_definitions t ON t.id = s.trait_id
          JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.deleted_at IS NULL AND public.has_orphan_scope(o.id, 'traits')
         ORDER BY 3 DESC
         LIMIT LEAST(GREATEST(COALESCE(_limit, 40), 1), 200)
      ) f), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.my_journey_feed(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_journey_feed(INT) TO authenticated;

-- ---------------------------------------------------------------------
-- ٣) ما وُجّه إلى الجهة من التأهيل والعيني — لصاحب الجهة وحده
-- ---------------------------------------------------------------------
-- تعهّدٌ للجهة نفسها أو لطفلٍ من أطفالها. يُعرض المسار والمبلغ والحالة
-- وآخر مرحلة تسليم؛ ولا يُعرض الداعم: هويّته ليست من شأن الجهة.
CREATE OR REPLACE FUNCTION public.org_incoming_pledges(_org UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.owns_org(_org) OR public.is_admin()) THEN
    RAISE EXCEPTION 'org_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'target_type', p.target_type,
             'orphan', o.display_name, 'amount', p.amount, 'currency', p.currency,
             'status', p.status, 'created_at', p.created_at,
             'stage', (SELECT d.stage FROM public.pledge_deliveries d
                        WHERE d.pledge_id = p.id ORDER BY d.created_at DESC LIMIT 1))
           ORDER BY p.created_at DESC)
      FROM public.support_pledges p
      LEFT JOIN public.orphans o ON o.id = p.orphan_id
     WHERE p.status <> 'cancelled'
       AND (p.org_id = _org OR o.org_id = _org)), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.org_incoming_pledges(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_incoming_pledges(UUID) TO authenticated;
