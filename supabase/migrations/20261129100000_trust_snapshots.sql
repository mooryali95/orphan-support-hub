-- =====================================================================
-- لقطة الثقة الأسبوعية: حصّة الموثَّق لكل دولةٍ أساسية تُحفظ من الآن
-- ---------------------------------------------------------------------
-- `golden_trust` تُحسب من الحاضر، فلا يُعاد بناء حصّة أسبوعٍ مضى. من هذه
-- الهجرة تُحفظ لقطةٌ لكل أسبوع (الاثنين بتوقيت UTC) لكل دولة `live_focus`:
--   trust_snapshots         صفٌّ لكل (دولة، أسبوع)، قراءةٌ للإدارة وحدها.
--   trust_snapshot_take()   service_role وحده؛ تُحدّث صفّ الأسبوع الجاري
--                           (لا صفّاً جديداً)، فتكرارها في الأسبوع آمن.
-- تُنادى من مسار التشغيل الدوري القائم (POST /api/ops/health)، وتُؤخذ
-- لقطةٌ أولى هنا. الأسابيع قبل أوّل لقطة تبقى «لم تُسجَّل»: لا تاريخ مختلَق.
-- لا أسماء ولا قيم حقول: أعدادٌ فقط.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.trust_snapshots (
  country_code          TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  week_start            DATE NOT NULL,
  files                 INTEGER NOT NULL CHECK (files >= 0),
  verified              INTEGER NOT NULL CHECK (verified >= 0 AND verified <= files),
  flagged               INTEGER NOT NULL CHECK (flagged >= 0),
  conflicts_open        INTEGER NOT NULL CHECK (conflicts_open >= 0),
  alerts_critical_open  INTEGER NOT NULL CHECK (alerts_critical_open >= 0),
  taken_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, week_start),
  CHECK (extract(isodow FROM week_start) = 1)
);
ALTER TABLE public.trust_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ts_admin ON public.trust_snapshots;
CREATE POLICY ts_admin ON public.trust_snapshots FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.trust_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trust_snapshots TO authenticated;
GRANT ALL ON public.trust_snapshots TO service_role;


-- الأعداد السريعة نفسها التي تقرؤها النظرة: `golden_verified_count` للموثَّق،
-- والمُعلَّم ملفٌّ حيّ عليه تنبيهٌ حرج مفتوح أو مؤكَّد (ما يمنع دعماً جديداً).
CREATE OR REPLACE FUNCTION public.trust_snapshot_take()
RETURNS INTEGER LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _week DATE := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
        _n INTEGER;
BEGIN
  INSERT INTO public.trust_snapshots AS t
    (country_code, week_start, files, verified, flagged, conflicts_open, alerts_critical_open, taken_at)
  SELECT c.code, _week, f.files, LEAST(public.golden_verified_count(c.code), f.files), f.flagged,
         (SELECT count(*) FROM public.data_conflicts d JOIN public.orphans o ON o.id = d.orphan_id
           WHERE d.status = 'open' AND o.country_code = c.code),
         (SELECT count(*) FROM public.data_alerts a LEFT JOIN public.orphans o ON o.id = a.orphan_id
           WHERE a.status = 'open' AND a.severity = 'critical'
             AND COALESCE(o.country_code, a.country_code) = c.code),
         now()
    FROM public.countries c
    CROSS JOIN LATERAL (
      SELECT count(*) AS files,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM public.data_alerts a WHERE a.orphan_id = o.id AND a.severity = 'critical'
                  AND a.status IN ('open', 'confirmed'))) AS flagged
        FROM public.orphans o WHERE o.country_code = c.code AND o.exited_at IS NULL) f
   WHERE c.live_focus
  ON CONFLICT (country_code, week_start) DO UPDATE
    SET files = EXCLUDED.files, verified = EXCLUDED.verified, flagged = EXCLUDED.flagged,
        conflicts_open = EXCLUDED.conflicts_open, alerts_critical_open = EXCLUDED.alerts_critical_open,
        taken_at = EXCLUDED.taken_at;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.trust_snapshot_take() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trust_snapshot_take() TO service_role;


-- الأسابيع الثمانية كما في 20261127300000، ومعها لقطة كل أسبوعٍ إن وُجدت:
-- `verified_share` نسبةٌ صحيحة (أرضيّة)، و`null` لأسبوعٍ لم يُسجَّل أو بلا ملفّات؛
-- و`recorded` يفرّق بينهما.
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
      'recorded_from', (SELECT to_char(min(s.week_start), 'YYYY-MM-DD') FROM public.trust_snapshots s
                         WHERE s.country_code = _country),
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
                                AND h.received_at >= w AND h.received_at < w + interval '1 week'),
          'verified_share', (SELECT CASE WHEN s.files > 0 THEN floor(s.verified * 100.0 / s.files)::int END
                               FROM public.trust_snapshots s
                              WHERE s.country_code = _country AND s.week_start = (w AT TIME ZONE 'UTC')::date),
          'recorded', EXISTS (SELECT 1 FROM public.trust_snapshots s
                               WHERE s.country_code = _country AND s.week_start = (w AT TIME ZONE 'UTC')::date))
          ORDER BY w) FROM weeks))
  );
END $fn$;
REVOKE ALL ON FUNCTION public.admin_trust_weekly(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_trust_weekly(text) TO authenticated;

-- اللقطة الأولى: من هذا الأسبوع يبدأ الخطّ.
SELECT public.trust_snapshot_take();
