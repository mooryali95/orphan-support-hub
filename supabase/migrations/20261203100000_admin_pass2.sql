-- =====================================================================
-- أدوات الإدارة، الدفعة الثانية: صفحات بالمؤشّر، وعدّادات، وبحث، وسجلّ قرارات مقروء
-- =====================================================================
-- 1) طوابير التحقق (admin_conflicts / admin_alerts / admin_link_queue /
--    child_update_queue) تُقرأ بصفحاتٍ بالمؤشّر (_after) بدل سقف 200: كلّ بندٍ يحمل
--    `cursor` {k, at, id} على ترتيب طابوره نفسه، فيُعاد كما هو لطلب الصفحة التالية.
--    admin_queue_counts يعدّ المفتوح في كلٍّ منها بفهارسه، فيبقى العدد صادقاً.
-- 2) admin_search: بحثٌ واحد للإدارة (أطفال، كفلاء، كفالات، تحويلات) ولفريق الدولة
--    (أطفال دوله وحدها). الأسماء على golden_canon، ولا يعيد من الطفل إلّا ما تعرضه
--    قوائم الإدارة أصلاً (المعرّف، الرمز، الاسم، الدولة، الحالة).
-- 3) admin_decision_log: خطّ زمني للإدارة وحدها من audit_log (ومنه حسم التعارضات
--    والتنبيهات وتحديثات الأطفال)، ومن data_conflicts لما «أُبقي» بلا سطر تدقيق، ومن
--    integrity_log لأحداث الأمن (sec_*) في مرشّحها الخاصّ.
-- أجسام الدوال المعدّلة مأخوذة من pg_get_functiondef للقاعدة الحيّة.
-- =====================================================================

-- ── 1) الطوابير بالمؤشّر ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_conflicts(text, integer);
CREATE FUNCTION public.admin_conflicts(_country text DEFAULT NULL::text, _limit integer DEFAULT 100, _after jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _k INTEGER := (_after->>'k')::int; _at TIMESTAMPTZ := (_after->>'at')::timestamptz; _id UUID := (_after->>'id')::uuid;
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY r, ca, cid) FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'orphan_id', o.id, 'code', o.code, 'name', o.display_name, 'country', o.country_code,
      'field', d.field, 'field_group', fa.field_group, 'kind', d.kind, 'risk', d.risk,
      'current', d.current_value, 'proposed', d.proposed_value, 'wamy', d.wamy_value, 'office', d.office_value,
      'created_at', d.created_at, 'updated_at', d.updated_at, 'mine', EXISTS (SELECT 1 FROM public.orphan_field_history h
        WHERE h.orphan_id = d.orphan_id AND h.field = d.field AND h.received_by = auth.uid()
          AND h.value IN (d.proposed_value, d.wamy_value, d.office_value)),
      'rank', rk::text,
      'cursor', jsonb_build_object('k', rk, 'at', d.created_at, 'id', d.id)) AS x,
      rk AS r, d.created_at AS ca, d.id AS cid
      FROM public.data_conflicts d
      JOIN public.orphans o ON o.id = d.orphan_id
      JOIN public.field_authority fa ON fa.field = d.field
      CROSS JOIN LATERAL (SELECT CASE d.risk WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END AS rk) z
     WHERE d.status = 'open' AND (_country IS NULL OR o.country_code = _country)
       AND (_after IS NULL OR (rk, d.created_at, d.id) > (_k, _at, _id))
     ORDER BY rk, d.created_at, d.id
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $function$;

DROP FUNCTION IF EXISTS public.admin_alerts(text, integer);
CREATE FUNCTION public.admin_alerts(_country text DEFAULT NULL::text, _limit integer DEFAULT 100, _after jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _k INTEGER := (_after->>'k')::int; _at TIMESTAMPTZ := (_after->>'at')::timestamptz; _id UUID := (_after->>'id')::uuid;
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  -- الترتيب: الشدّة صعوداً، ثم الأحدث تحديثاً، ثم المعرّف.
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY r, ua DESC, cid) FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'orphan_id', a.orphan_id, 'code', o.code, 'name', o.display_name,
      'country', COALESCE(o.country_code, a.country_code), 'field', a.field, 'signal', a.code,
      'severity', a.severity, 'role', a.role, 'source', a.source, 'detail', a.detail,
      'hits', a.hits, 'created_at', a.created_at, 'updated_at', a.updated_at,
      'mine', a.raised_by IS NOT NULL AND a.raised_by = auth.uid(),
      'cursor', jsonb_build_object('k', rk, 'at', a.updated_at, 'id', a.id)) AS x,
      rk AS r, a.updated_at AS ua, a.id AS cid
      FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
      CROSS JOIN LATERAL (SELECT CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END AS rk) z
     WHERE a.status = 'open' AND (_country IS NULL OR COALESCE(o.country_code, a.country_code) = _country)
       AND (_after IS NULL OR rk > _k OR (rk = _k AND (a.updated_at < _at OR (a.updated_at = _at AND a.id > _id))))
     ORDER BY rk, a.updated_at DESC, a.id
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $function$;

DROP FUNCTION IF EXISTS public.admin_link_queue(text, integer);
CREATE FUNCTION public.admin_link_queue(_country text DEFAULT NULL::text, _limit integer DEFAULT 100, _after jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _k INTEGER := (_after->>'k')::int; _at TIMESTAMPTZ := (_after->>'at')::timestamptz; _id UUID := (_after->>'id')::uuid;
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY n DESC, ca, cid) FROM (
    SELECT jsonb_build_object(
      'id', q.id, 'role', q.role, 'source', q.source, 'external_ref', q.external_ref, 'country', q.country_code,
      'name', q.record->'fields'->>'display_name', 'birth_date', q.record->'fields'->>'birth_date',
      'gender', q.record->'fields'->>'gender', 'created_at', q.created_at,
      'candidates', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                                'birth_date', o.birth_date, 'region', o.region))
                                FROM public.orphans o WHERE o.id = ANY(q.candidates)), '[]'::jsonb),
      'cursor', jsonb_build_object('k', cardinality(q.candidates), 'at', q.created_at, 'id', q.id)) AS x,
      cardinality(q.candidates) AS n, q.created_at AS ca, q.id AS cid
      FROM public.source_link_queue q
     WHERE q.status = 'pending' AND (_country IS NULL OR q.country_code = _country)
       AND (_after IS NULL OR cardinality(q.candidates) < _k
            OR (cardinality(q.candidates) = _k AND (q.created_at, q.id) > (_at, _id)))
     ORDER BY cardinality(q.candidates) DESC, q.created_at, q.id
     LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb);
END $function$;

DROP FUNCTION IF EXISTS public.child_update_queue(text);
CREATE FUNCTION public.child_update_queue(_country text DEFAULT NULL::text, _limit integer DEFAULT 100, _after jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _at TIMESTAMPTZ := (_after->>'at')::timestamptz; _id UUID := (_after->>'id')::uuid;
BEGIN
  IF _country IS NULL AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _country IS NOT NULL AND NOT public.country_can(_country, 'read') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE((
    SELECT jsonb_agg(x ORDER BY ca, cid) FROM (
      SELECT jsonb_build_object(
             'id', u.id, 'orphan_id', u.orphan_id, 'orphan_name', o.display_name, 'orphan_code', o.code,
             'country_code', u.country_code, 'kind', u.kind, 'storage_path', u.storage_path,
             'poster_path', u.poster_path, 'duration_seconds', u.duration_seconds,
             'caption_ar', u.caption_ar, 'caption_en', u.caption_en, 'created_at', u.created_at,
             'mine', u.uploaded_by IS NOT DISTINCT FROM auth.uid(),
             'frozen', public.orphan_frozen(u.orphan_id),
             'cursor', jsonb_build_object('k', 0, 'at', u.created_at, 'id', u.id)) AS x,
             u.created_at AS ca, u.id AS cid
        FROM public.child_updates u JOIN public.orphans o ON o.id = u.orphan_id
       WHERE u.status = 'pending' AND (_country IS NULL OR u.country_code = _country)
         AND (_after IS NULL OR (u.created_at, u.id) > (_at, _id))
       ORDER BY u.created_at, u.id
       LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) s), '[]'::jsonb));
END $function$;

-- عدّ المفتوح في الطوابير الأربعة، بنطاق القراءة نفسه.
CREATE OR REPLACE FUNCTION public.admin_queue_counts(_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() AND (_country IS NULL OR NOT public.country_can(_country, 'read')) THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'conflicts', (SELECT count(*) FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
                   WHERE d.status = 'open' AND (_country IS NULL OR o.country_code = _country)),
    'alerts', (SELECT count(*) FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
                WHERE a.status = 'open' AND (_country IS NULL OR COALESCE(o.country_code, a.country_code) = _country)),
    'links', (SELECT count(*) FROM public.source_link_queue q
               WHERE q.status = 'pending' AND (_country IS NULL OR q.country_code = _country)),
    'updates', (SELECT count(*) FROM public.child_updates u
                 WHERE u.status = 'pending' AND (_country IS NULL OR u.country_code = _country)));
END $function$;

-- ── 2) البحث الموحّد ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_search(_q text, _limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _n INTEGER := LEAST(GREATEST(COALESCE(_limit, 6), 1), 20);
  _canon TEXT := public.golden_canon(left(COALESCE(_q, ''), 80));
  _raw TEXT := btrim(left(COALESCE(_q, ''), 80));
  _like TEXT; _rlike TEXT; _admin BOOLEAN := public.is_admin();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF NOT _admin AND NOT EXISTS (SELECT 1 FROM public.country_staff s WHERE s.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  IF _canon IS NULL OR length(_canon) < 2 THEN
    RETURN jsonb_build_object('children', '[]'::jsonb, 'sponsors', '[]'::jsonb,
                              'sponsorships', '[]'::jsonb, 'transfers', '[]'::jsonb);
  END IF;
  _like := '%' || replace(replace(replace(_canon, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  _rlike := replace(replace(replace(lower(_raw), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN jsonb_build_object(
    -- ما تعرضه قوائم الإدارة من الطفل لا أكثر؛ النطاق قبل المطابقة.
    'children', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                                'country', o.country_code, 'status', o.status) AS x
        FROM public.orphans o
       WHERE (_admin OR (o.country_code IS NOT NULL AND public.country_can(o.country_code, 'read')))
         AND (lower(o.code) LIKE _rlike OR public.golden_canon(o.display_name) LIKE _like)
       ORDER BY (lower(o.code) LIKE _rlike) DESC, o.code
       LIMIT _n) s), '[]'::jsonb),
    'sponsors', CASE WHEN NOT _admin THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', u.id, 'name', p.full_name, 'email', u.email) AS x
        FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
       WHERE lower(u.email) LIKE '%' || _rlike OR public.golden_canon(p.full_name) LIKE _like
       ORDER BY u.email
       LIMIT _n) s), '[]'::jsonb) END,
    'sponsorships', CASE WHEN NOT _admin THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', sp.id, 'status', sp.status, 'amount', sp.amount, 'currency', sp.currency,
                                'code', o.code, 'child', o.display_name, 'sponsor', COALESCE(p.full_name, u.email),
                                'created_at', sp.created_at) AS x
        FROM public.sponsorships sp
        JOIN public.orphans o ON o.id = sp.orphan_id
        LEFT JOIN auth.users u ON u.id = sp.sponsor_id
        LEFT JOIN public.profiles p ON p.id = sp.sponsor_id
       WHERE lower(sp.id::text) LIKE _rlike OR lower(o.code) LIKE _rlike
          OR lower(u.email) LIKE '%' || _rlike OR public.golden_canon(p.full_name) LIKE _like
       ORDER BY sp.created_at DESC
       LIMIT _n) s), '[]'::jsonb) END,
    -- التحويل البنكي: مرجعه أوّل ثمانية من معرّف الكفالة (كما في صندوق القرارات)، أو مرجع البنك.
    'transfers', CASE WHEN NOT _admin THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', sp.id, 'ref', upper(left(sp.id::text, 8)), 'amount', sp.amount,
                                'currency', sp.currency, 'status', sp.status, 'code', o.code,
                                'bank_reference', r.bank_reference, 'created_at', sp.created_at) AS x
        FROM public.sponsorships sp
        JOIN public.orphans o ON o.id = sp.orphan_id
        LEFT JOIN LATERAL (SELECT m.bank_reference FROM public.manual_transfer_reconciliations m
                            WHERE m.sponsorship_id = sp.id ORDER BY m.confirmed_at DESC LIMIT 1) r ON true
       WHERE (lower(left(sp.id::text, 8)) LIKE _rlike OR lower(r.bank_reference) LIKE '%' || _rlike)
         AND (r.bank_reference IS NOT NULL OR public.awaits_manual_transfer(sp.id))
       ORDER BY sp.created_at DESC
       LIMIT _n) s), '[]'::jsonb) END);
END $function$;

-- ── 3) سجلّ القرارات المقروء ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_entity_time ON public.audit_log (entity_id, created_at DESC) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_time ON public.audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_integrity_security ON public.integrity_log (at DESC, id DESC) WHERE kind LIKE 'sec\_%';
CREATE INDEX IF NOT EXISTS idx_conflict_kept ON public.data_conflicts (resolved_at DESC) WHERE resolution = 'kept';

-- _kind: NULL للكلّ، 'decisions' لغير الأمن، 'security' لأحداث sec_* وحدها.
CREATE OR REPLACE FUNCTION public.admin_decision_log(
  _orphan uuid DEFAULT NULL::uuid, _kind text DEFAULT NULL::text,
  _before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _before_id text DEFAULT NULL::text,
  _limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _n INTEGER := LEAST(GREATEST(COALESCE(_limit, 30), 1), 100); _rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _kind IS NOT NULL AND _kind NOT IN ('decisions', 'security') THEN
    RAISE EXCEPTION 'kind_unknown' USING ERRCODE = '22023';
  END IF;
  WITH ev AS (
    (SELECT l.id::text AS id, 'audit' AS src, l.created_at AS at, l.actor_id AS actor, l.action,
            CASE WHEN l.entity = 'orphans' THEN l.entity_id END AS orphan_id,
            l.meta->>'field' AS field, l.meta->'was' AS was, l.meta->'value' AS val,
            -- ما يُفهم به القرار؛ الملاحظة الحرّة لا تُعاد.
            jsonb_strip_nulls(jsonb_build_object(
              'choice', l.meta->>'choice', 'signal', l.meta->>'signal', 'severity', l.meta->>'severity',
              'status', l.meta->>'status', 'decision', l.meta->>'decision', 'from', l.meta->>'from',
              'to', l.meta->>'to', 'role', l.meta->>'role', 'records', l.meta->'records',
              'country', l.meta->>'country')) AS detail
       FROM public.audit_log l
      WHERE COALESCE(_kind, 'decisions') = 'decisions'
        AND (_orphan IS NULL OR (l.entity = 'orphans' AND l.entity_id = _orphan))
        AND (_before_at IS NULL OR (l.created_at, l.id::text) < (_before_at, _before_id))
      ORDER BY l.created_at DESC, l.id DESC LIMIT _n + 1)
    UNION ALL
    -- «أُبقيت القيمة»: الحسم بـkeep لا يكتب سطر تدقيق، فيُقرأ من التعارض نفسه.
    (SELECT d.id::text, 'conflict', d.resolved_at, d.resolved_by, 'golden_conflict_keep', d.orphan_id,
            d.field, d.current_value, COALESCE(d.proposed_value, d.office_value, d.wamy_value), '{}'::jsonb
       FROM public.data_conflicts d
      WHERE d.resolution = 'kept' AND d.resolved_at IS NOT NULL
        AND COALESCE(_kind, 'decisions') = 'decisions'
        AND (_orphan IS NULL OR d.orphan_id = _orphan)
        AND (_before_at IS NULL OR (d.resolved_at, d.id::text) < (_before_at, _before_id))
      ORDER BY d.resolved_at DESC, d.id DESC LIMIT _n + 1)
    UNION ALL
    (SELECT 'i' || lpad(g.id::text, 19, '0'), 'security', g.at, g.actor, g.kind, g.orphan_id, NULL, NULL, NULL,
            jsonb_strip_nulls(jsonb_build_object('action', g.detail->>'action', 'code', g.detail->>'code',
                                                 'reason', g.detail->>'reason')) AS detail
       FROM public.integrity_log g
      WHERE g.kind LIKE 'sec\_%' AND COALESCE(_kind, 'security') = 'security'
        AND (_orphan IS NULL OR g.orphan_id = _orphan)
        AND (_before_at IS NULL OR (g.at, 'i' || lpad(g.id::text, 19, '0')) < (_before_at, _before_id))
      ORDER BY g.at DESC, g.id DESC LIMIT _n + 1)
  ), page AS (
    SELECT ev.*, COALESCE(NULLIF(btrim(p.full_name), ''), u.email) AS actor_name,
           o.code AS code, o.country_code AS country
      FROM ev
      LEFT JOIN public.profiles p ON p.id = ev.actor
      LEFT JOIN auth.users u ON u.id = ev.actor
      LEFT JOIN public.orphans o ON o.id = ev.orphan_id
     ORDER BY ev.at DESC, ev.id DESC
     LIMIT _n + 1)
  SELECT jsonb_agg(jsonb_build_object(
           'id', id, 'src', src, 'at', at, 'actor', actor_name, 'action', action, 'orphan_id', orphan_id,
           'code', code, 'country', COALESCE(country, detail->>'country'), 'field', field,
           'from', was, 'to', val, 'detail', detail) ORDER BY at DESC, id DESC)
    INTO _rows FROM page;
  _rows := COALESCE(_rows, '[]'::jsonb);
  RETURN jsonb_build_object(
    'rows', CASE WHEN jsonb_array_length(_rows) > _n THEN _rows - _n ELSE _rows END,
    'has_more', jsonb_array_length(_rows) > _n);
END $function$;

DO $grants$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'admin_conflicts(TEXT, INTEGER, JSONB)', 'admin_alerts(TEXT, INTEGER, JSONB)',
    'admin_link_queue(TEXT, INTEGER, JSONB)', 'child_update_queue(TEXT, INTEGER, JSONB)',
    'admin_queue_counts(TEXT)', 'admin_search(TEXT, INTEGER)',
    'admin_decision_log(UUID, TEXT, TIMESTAMPTZ, TEXT, INTEGER)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
END $grants$;
