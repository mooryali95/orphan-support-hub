-- =====================================================================
-- مركز الثقة في الإدارة: قراءةٌ عبر الدول الخمس الأساسية
-- ---------------------------------------------------------------------
-- خمس دوالّ قراءةٍ للإدارة وحدها (`is_admin()` أوّلاً، لا `country_can`):
--   admin_trust_overview()    حصّة الموثَّق، والمفتوح الحرج وغيره، وطابور الربط،
--                             وآخر مزامنةٍ لكل مصدر، ووضع المكتب.
--   admin_trust_aging()       عمر المفتوح الحرج بأربع فئات، وأقدمه أوّلاً.
--   admin_trust_team()        فريق كل دولة بأدواره، ومن دُعي ولم يدخل.
--   admin_trust_decisions()   سجلّ قرارات السجلّ الذهبي، بصفحاتٍ بالمؤشّر.
--   admin_trust_weekly()      ثمانية أسابيع: ما فُتح وما حُسم والمتراكم.
--
-- الصدق في الاتجاه: حالة الثقة (`golden_trust`) تُحسب من الحاضر ولا تُخزَّن
-- لكل أسبوع، فلا يُعاد بناء «حصّة الموثَّق» لأسبوعٍ مضى. ما يُعاد بناؤه حقّاً
-- من الطوابع: ما فُتح وما حُسم، والمفتوح في نهاية كل أسبوع، وعدد الملفّات التي
-- وصلتها ملاحظة. والحصّة الحالية تُعرض وحدها بقيمة اليوم.
--
-- لا قيم حقولٍ ولا أسماء أطفال: رمز الملف والحقل والإشارة فقط.
-- =====================================================================

-- فهارس للطوابع التي تُقرأ أسبوعيّاً وللسجلّ بالإجراء.
CREATE INDEX IF NOT EXISTS idx_conflict_created ON public.data_conflicts(created_at);
CREATE INDEX IF NOT EXISTS idx_conflict_resolved ON public.data_conflicts(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_created ON public.data_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alert_resolved ON public.data_alerts(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_open_critical ON public.data_alerts(created_at)
  WHERE status = 'open' AND severity = 'critical';
CREATE INDEX IF NOT EXISTS idx_conflict_open_critical ON public.data_conflicts(created_at)
  WHERE status = 'open' AND risk = 'critical';
CREATE INDEX IF NOT EXISTS idx_audit_golden ON public.audit_log(created_at DESC, id DESC)
  WHERE action IN ('golden_conflict_resolve', 'golden_alert_resolve', 'country_staff_set',
                   'country_source_mode', 'golden_ingest');
CREATE INDEX IF NOT EXISTS idx_orphans_country_live ON public.orphans(country_code) WHERE exited_at IS NULL;


-- عدد الموثَّق لدولةٍ بجملةٍ واحدة: الشروط نفسها التي تجعل `golden_trust` تقول
-- «verified» (بلا تنبيهٍ حرج مفتوحٍ أو مؤكَّد، ولا تعارضٍ مفتوح، وله ملاحظة
-- حديثة، ومربوطٌ بالمكتب حين تعمل منصّته)، بلا استدعاءٍ لكل ملف. اختبار
-- trust-center-verification يقارنه بـ golden_trust ملفّاً ملفّاً.
CREATE OR REPLACE FUNCTION public.golden_verified_count(_country TEXT)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH cfg AS (
    SELECT public.golden_office_mode(_country) AS mode,
           COALESCE((SELECT stale_after_days FROM public.country_data_sources WHERE country_code = _country), 180) AS stale_days)
  SELECT count(*)
    FROM public.orphans o CROSS JOIN cfg
   WHERE o.country_code = _country AND o.exited_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.data_alerts a WHERE a.orphan_id = o.id AND a.severity = 'critical'
                       AND a.status IN ('open', 'confirmed'))
     AND NOT EXISTS (SELECT 1 FROM public.data_conflicts d WHERE d.orphan_id = o.id AND d.status = 'open')
     AND (SELECT max(f.observed_at) FROM public.orphan_field_observations f WHERE f.orphan_id = o.id)
         >= now() - make_interval(days => cfg.stale_days)
     AND (cfg.mode NOT IN ('shadow', 'active') OR EXISTS (
            SELECT 1 FROM public.orphan_source_links l WHERE l.orphan_id = o.id AND l.role = 'office'));
$fn$;
REVOKE ALL ON FUNCTION public.golden_verified_count(text) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.admin_trust_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', c.code, 'name_ar', c.name_ar, 'name_local', c.name_local,
      'office_mode', COALESCE(s.office_mode, 'none'), 'office_source', s.office_source,
      'files', t.files, 'verified', t.verified,
      'critical', COALESCE(dc.critical, 0) + COALESCE(da.critical, 0),
      'other', COALESCE(dc.other, 0) + COALESCE(da.other, 0),
      'link_pending', (SELECT count(*) FROM public.source_link_queue q
                        WHERE q.country_code = c.code AND q.status = 'pending'),
      'last_wamy', (SELECT max(f.received_at) FROM public.orphan_field_observations f
                      JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = c.code AND f.role = 'wamy'),
      'last_office', (SELECT max(f.received_at) FROM public.orphan_field_observations f
                        JOIN public.orphans o ON o.id = f.orphan_id WHERE o.country_code = c.code AND f.role = 'office'))
      ORDER BY c.sort_order, c.name_ar)
      FROM public.countries c
      LEFT JOIN public.country_data_sources s ON s.country_code = c.code
      CROSS JOIN LATERAL (
        SELECT count(*) AS files, public.golden_verified_count(c.code) AS verified
          FROM public.orphans o WHERE o.country_code = c.code AND o.exited_at IS NULL) t
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE d.risk = 'critical') AS critical,
               count(*) FILTER (WHERE d.risk <> 'critical') AS other
          FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open' AND o.country_code = c.code) dc ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE a.severity = 'critical') AS critical,
               count(*) FILTER (WHERE a.severity <> 'critical') AS other
          FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'open' AND COALESCE(o.country_code, a.country_code) = c.code) da ON true
     WHERE c.live_focus), '[]'::jsonb);
END $fn$;


-- المفتوح الحرج: تعارضٌ بخطورة حرجة أو تنبيهٌ حرج لم يُحسم.
CREATE OR REPLACE FUNCTION public.admin_trust_aging(_limit INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH items AS (
      SELECT 'conflict'::text AS kind, d.id, o.country_code AS country, o.code AS file_code,
             d.field, NULL::text AS signal, d.created_at
        FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
       WHERE d.status = 'open' AND d.risk = 'critical'
      UNION ALL
      SELECT 'alert', a.id, COALESCE(o.country_code, a.country_code), o.code, a.field, a.code, a.created_at
        FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
       WHERE a.status = 'open' AND a.severity = 'critical'),
    focus AS (SELECT code, name_ar, name_local, sort_order FROM public.countries WHERE live_focus),
    scoped AS (SELECT i.* FROM items i JOIN focus f ON f.code = i.country)
    SELECT jsonb_build_object(
      'buckets', COALESCE((SELECT jsonb_agg(b.x ORDER BY b.sort_order, b.name_ar) FROM (
        SELECT f.sort_order, f.name_ar, jsonb_build_object(
          'code', f.code, 'name_ar', f.name_ar, 'name_local', f.name_local,
          'lt1', count(s.id) FILTER (WHERE s.created_at > now() - interval '1 day'),
          'd1_3', count(s.id) FILTER (WHERE s.created_at <= now() - interval '1 day' AND s.created_at > now() - interval '3 days'),
          'd3_7', count(s.id) FILTER (WHERE s.created_at <= now() - interval '3 days' AND s.created_at > now() - interval '7 days'),
          'gt7', count(s.id) FILTER (WHERE s.created_at <= now() - interval '7 days'),
          'oldest', min(s.created_at)) AS x
        FROM focus f LEFT JOIN scoped s ON s.country = f.code
        GROUP BY f.code, f.name_ar, f.name_local, f.sort_order) b), '[]'::jsonb),
      'oldest', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'created_at') FROM (
          SELECT jsonb_build_object('kind', kind, 'id', id, 'country', country, 'file_code', file_code,
                                    'field', field, 'signal', signal, 'created_at', created_at) AS x
            FROM scoped ORDER BY created_at
           LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)) q), '[]'::jsonb),
      'total', (SELECT count(*) FROM scoped))
  );
END $fn$;


CREATE OR REPLACE FUNCTION public.admin_trust_team()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(t.x ORDER BY t.sort_order, t.name_ar) FROM (
    SELECT c.sort_order, c.name_ar, jsonb_build_object(
      'code', c.code, 'name_ar', c.name_ar, 'name_local', c.name_local,
      'supervisors', count(s.user_id) FILTER (WHERE s.role = 'supervisor'),
      'data_entry', count(s.user_id) FILTER (WHERE s.role = 'data_entry'),
      'viewers', count(s.user_id) FILTER (WHERE s.role = 'viewer'),
      -- المشرف المدعوّ لا يُحسب في العينين حتى يدخل.
      'active_supervisors', count(s.user_id) FILTER (WHERE s.role = 'supervisor' AND u.last_sign_in_at IS NOT NULL),
      'pending', count(s.user_id) FILTER (WHERE u.last_sign_in_at IS NULL)) AS x
      FROM public.countries c
      LEFT JOIN public.country_staff s ON s.country_code = c.code
      LEFT JOIN auth.users u ON u.id = s.user_id
     WHERE c.live_focus
     GROUP BY c.code, c.name_ar, c.name_local, c.sort_order) t), '[]'::jsonb);
END $fn$;


-- صفحاتٌ بالمؤشّر (created_at, id) لا بالإزاحة، فتبقى سريعة مهما طال السجلّ.
CREATE OR REPLACE FUNCTION public.admin_trust_decisions(
  _country TEXT DEFAULT NULL, _action TEXT DEFAULT NULL,
  _before_at TIMESTAMPTZ DEFAULT NULL, _before_id UUID DEFAULT NULL, _limit INTEGER DEFAULT 25)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100); _rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  WITH r AS (
    SELECT l.id, l.action, l.created_at, u.email AS actor_email,
           COALESCE(l.meta->>'country', o.country_code) AS country, o.code AS file_code,
           -- ما يُفهم به القرار، بلا قيم الحقول.
           jsonb_strip_nulls(jsonb_build_object(
             'field', l.meta->>'field', 'choice', l.meta->>'choice', 'signal', l.meta->>'signal',
             'severity', l.meta->>'severity', 'status', l.meta->>'status',
             'from', l.meta->>'from', 'to', l.meta->>'to', 'role', l.meta->>'role',
             'records', l.meta->'records', 'unlinked', l.meta->'unlinked')) AS detail
      FROM public.audit_log l
      LEFT JOIN auth.users u ON u.id = l.actor_id
      LEFT JOIN public.orphans o ON l.entity = 'orphans' AND o.id = l.entity_id
     WHERE l.action IN ('golden_conflict_resolve', 'golden_alert_resolve', 'country_staff_set',
                        'country_source_mode', 'golden_ingest')
       AND (_action IS NULL OR l.action = _action)
       AND (_before_at IS NULL OR (l.created_at, l.id) < (_before_at, COALESCE(_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
       AND (_country IS NULL OR COALESCE(l.meta->>'country', o.country_code) = _country)
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT _n + 1)
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id DESC) INTO _rows FROM r;
  _rows := COALESCE(_rows, '[]'::jsonb);
  RETURN jsonb_build_object(
    'rows', CASE WHEN jsonb_array_length(_rows) > _n THEN _rows - _n ELSE _rows END,
    'has_more', jsonb_array_length(_rows) > _n);
END $fn$;


-- ثمانية أسابيع (الاثنين بداية الأسبوع، بتوقيت UTC)، لدولةٍ أساسية واحدة.
CREATE OR REPLACE FUNCTION public.admin_trust_weekly(_country TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _start TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _country AND live_focus) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'country_unknown');
  END IF;
  _start := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '7 weeks';
  RETURN (
    WITH items AS (
      SELECT d.created_at, d.resolved_at, (d.risk = 'critical') AS critical
        FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
       WHERE o.country_code = _country
      UNION ALL
      SELECT a.created_at, a.resolved_at, (a.severity = 'critical')
        FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
       WHERE COALESCE(o.country_code, a.country_code) = _country),
    weeks AS (SELECT generate_series(_start, _start + interval '7 weeks', interval '1 week') AS w)
    SELECT jsonb_build_object(
      'ok', true,
      'country', _country,
      'files', (SELECT count(*) FROM public.orphans WHERE country_code = _country AND exited_at IS NULL),
      'verified_now', public.golden_verified_count(_country),
      'weeks', (SELECT jsonb_agg(jsonb_build_object(
          'week', to_char(w AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
          'opened', (SELECT count(*) FROM items i WHERE i.created_at >= w AND i.created_at < w + interval '1 week'),
          'opened_critical', (SELECT count(*) FROM items i WHERE i.critical
                                AND i.created_at >= w AND i.created_at < w + interval '1 week'),
          'settled', (SELECT count(*) FROM items i WHERE i.resolved_at >= w AND i.resolved_at < w + interval '1 week'),
          'open_at_end', (SELECT count(*) FROM items i WHERE i.created_at < w + interval '1 week'
                            AND (i.resolved_at IS NULL OR i.resolved_at >= w + interval '1 week')),
          'files_observed', (SELECT count(DISTINCT h.orphan_id) FROM public.orphan_field_history h
                               JOIN public.orphans o ON o.id = h.orphan_id
                              WHERE o.country_code = _country
                                AND h.received_at >= w AND h.received_at < w + interval '1 week'))
          ORDER BY w) FROM weeks))
  );
END $fn$;

DO $$
DECLARE _f TEXT;
BEGIN
  FOREACH _f IN ARRAY ARRAY['admin_trust_overview()', 'admin_trust_aging(integer)', 'admin_trust_team()',
      'admin_trust_decisions(text, text, timestamptz, uuid, integer)', 'admin_trust_weekly(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
END $$;
