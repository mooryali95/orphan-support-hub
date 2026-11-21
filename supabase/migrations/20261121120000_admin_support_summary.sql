-- =====================================================================
-- لوحة الإدارة — مجاميع الدعم (admin_support_summary)
-- ---------------------------------------------------------------------
-- لوحة الإدارة كانت تعرض التأهيل والعيني والاتجاه الشهري والمجموع الدقيق
-- بالعملة الموحّدة والمتعثّرين والمستحقّات من عيّنةٍ نموذجية وحدها: لا دالّة
-- تجمعها (التعهّدات تُقرأ لصاحبها عبر `my_pledges`، والكفلاء أوّل مئة صفّ).
--
-- هذه الهجرة تضيف دالّتين للقراءة وحدها، بلا جدول ولا عمود ولا تغيير بيانات:
--
--   • admin_fx_firm(عملة، موحّدة): أحدث سعرٍ «معتمد» مخزَّن في `fx_rates`
--     (indicative = false، وتاريخه ليس في المستقبل)، مباشراً أو معكوساً.
--     السعر الاسترشادي — وبذرة الهجرة السابقة منه — لا يدخل مجموعاً محاسبياً
--     أبداً: عملةٌ بلا سعرٍ معتمد يعود معادلها NULL، ولا يُخمَّن.
--     داخليةٌ: لا منح لأحد.
--
--   • admin_support_summary(_months): للإدارة وحدها (فحص is_admin داخلها)،
--     مجاميع فقط — لا اسم ولا صورة ولا موقع ولا معرّف:
--       kinds       الدعم بنوعه وحالته وعملته (كفالة مادية، تأهيل، عيني)
--       trend       سلسلةٌ شهرية بالنوع والعملة (المحصَّل للكفالة، والمتعهَّد
--                   المقبول للتأهيل والعيني)
--       money       الملتزَم والمحصَّل والمنتظر والمصروف بعملاته
--       rates       الأسعار المعتمدة التي حُوِّل بها، بتاريخها ومصدرها
--       donors      العدد كلّه، والجدد، والنشطون، والمتعثّرون، والمنقطعون
--       due         المستحقّات بتاريخ استحقاقها
--       by_country  التأهيل والعيني بدولة الوجهة — محميّةٌ بحدّ الحشد
--     وكلّ مبلغٍ يحمل `unified`: معادله بالعملة الموحّدة بالسعر المعتمد أو NULL.
--
-- حدّ الحشد (`cohort_min`) يُطبَّق حيث تُقطَّع الأرقام بصفةٍ من صفات الطفل —
-- وهي هنا الدولة وحدها: دولةٌ منشورُها دون الحدّ، أو تعهّداتها الموجّهة لأطفالٍ
-- بأعيانهم تمسّ أقلّ من الحدّ، تعود بلا عددٍ ولا مبلغ. والمجاميع الأخرى على
-- مستوى المنصّة كلّها (كما في `admin_overview`) فلا صفة طفلٍ فيها تدلّ عليه.
--
-- قواعد الداعمين (تعود في `donors.rule` لتعرضها الواجهة كما هي):
--   جديد      أوّل كفالةٍ له خلال 30 يوماً.
--   متعثّر    له كفالةٌ دورية نشطة فات استحقاقها بأكثر من 14 يوماً، أو كفالةٌ
--             موقوفة مؤقّتاً.
--   منقطع     دفع مرّةً على الأقلّ ولا كفالة حيّة له الآن.
-- والاستحقاق: `next_charge_at` إن وُجد، وإلا شهرٌ بعد آخر دفعةٍ مدفوعة، وإلا
-- شهرٌ بعد بدء الكفالة. وكفالةٌ بانتظار دفعتها الأولى مستحقّةٌ منذ إنشائها.
--
-- تعتمد على ما تضمنه السلسلة قبلها: `fx_rates` و`unified_currency()`
-- (20261121100000) و`cohort_min()` و`is_admin()`.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_fx_firm(_from TEXT, _to TEXT)
RETURNS TABLE (rate NUMERIC, inverse BOOLEAN, as_of DATE, source TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT 1::numeric, false, NULL::date, NULL::text
   WHERE upper(btrim(_from)) = upper(btrim(_to))
  UNION ALL
  (SELECT r.rate, r.base <> upper(btrim(_from)), r.as_of, r.source
     FROM public.fx_rates r
    WHERE upper(btrim(_from)) <> upper(btrim(_to))
      AND NOT r.indicative
      AND r.as_of <= CURRENT_DATE
      AND ((r.base = upper(btrim(_from)) AND r.quote = upper(btrim(_to)))
        OR (r.base = upper(btrim(_to)) AND r.quote = upper(btrim(_from))))
    ORDER BY r.as_of DESC, r.created_at DESC
    LIMIT 1);
$fn$;
REVOKE ALL ON FUNCTION public.admin_fx_firm(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_support_summary(_months INTEGER DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  _m     INTEGER := LEAST(GREATEST(COALESCE(_months, 12), 1), 24);
  _u     TEXT := public.unified_currency();
  _min   INTEGER := public.cohort_min();
  _now   TIMESTAMPTZ := now();
  _first DATE := (date_trunc('month', _now AT TIME ZONE 'UTC')
                  - make_interval(months => _m - 1))::date;
  _new_days  CONSTANT INTEGER := 30;
  _grace     CONSTANT INTEGER := 14;
  _kinds JSONB; _trend JSONB; _money JSONB; _rates JSONB;
  _donors JSONB; _due JSONB; _country JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_support_summary: not authorised' USING ERRCODE = '42501';
  END IF;

  -- ── الدعم بنوعه وحالته وعملته ──────────────────────────────────────
  WITH cells AS (
    SELECT 'sponsorship'::text AS kind, s.status::text AS status,
           upper(btrim(s.currency)) AS currency, count(*) AS n, SUM(s.amount) AS amount
      FROM public.sponsorships s GROUP BY 2, 3
    UNION ALL
    SELECT p.kind, p.status, upper(btrim(p.currency)), count(*), SUM(p.amount)
      FROM public.support_pledges p GROUP BY 1, 2, 3
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', c.kind, 'status', c.status, 'currency', c.currency,
           'count', c.n, 'amount', c.amount,
           'unified', (SELECT CASE WHEN f.inverse THEN round(c.amount / f.rate, 2)
                                   ELSE round(c.amount * f.rate, 2) END
                         FROM public.admin_fx_firm(c.currency, _u) f))
           ORDER BY c.kind, c.status, c.currency), '[]'::jsonb)
    INTO _kinds FROM cells c;

  -- ── السلسلة الشهرية ────────────────────────────────────────────────
  WITH cells AS (
    SELECT 'sponsorship'::text AS kind,
           to_char(COALESCE(sp.paid_at, sp.created_at) AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
           upper(btrim(sp.currency)) AS currency, count(*) AS n, SUM(sp.amount) AS amount
      FROM public.sponsorship_payments sp
     WHERE sp.status = 'paid'
       AND (COALESCE(sp.paid_at, sp.created_at) AT TIME ZONE 'UTC') >= _first
     GROUP BY 2, 3
    UNION ALL
    SELECT p.kind, to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM'),
           upper(btrim(p.currency)), count(*), SUM(p.amount)
      FROM public.support_pledges p
     WHERE p.status IN ('active', 'fulfilled')
       AND (p.created_at AT TIME ZONE 'UTC') >= _first
     GROUP BY 1, 2, 3
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', c.kind, 'month', c.month, 'currency', c.currency,
           'count', c.n, 'amount', c.amount,
           'unified', (SELECT CASE WHEN f.inverse THEN round(c.amount / f.rate, 2)
                                   ELSE round(c.amount * f.rate, 2) END
                         FROM public.admin_fx_firm(c.currency, _u) f))
           ORDER BY c.month, c.kind, c.currency), '[]'::jsonb)
    INTO _trend FROM cells c;

  -- ── المال بعملاته ومعادله المعتمد ──────────────────────────────────
  WITH cells AS (
    SELECT 'committed'::text AS measure, upper(btrim(currency)) AS currency, SUM(amount) AS amount
      FROM public.sponsorships WHERE status = 'active' GROUP BY 2
    UNION ALL
    SELECT CASE status WHEN 'paid' THEN 'collected' ELSE 'pending' END,
           upper(btrim(currency)), SUM(amount)
      FROM public.sponsorship_payments WHERE status IN ('paid', 'pending') GROUP BY 1, 2
    UNION ALL
    SELECT 'disbursed', upper(btrim(currency)), SUM(amount)
      FROM public.disbursements GROUP BY 2
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'measure', c.measure, 'currency', c.currency, 'amount', c.amount,
           'unified', (SELECT CASE WHEN f.inverse THEN round(c.amount / f.rate, 2)
                                   ELSE round(c.amount * f.rate, 2) END
                         FROM public.admin_fx_firm(c.currency, _u) f))
           ORDER BY c.measure, c.currency), '[]'::jsonb)
    INTO _money FROM cells c;

  -- ── الأسعار المعتمدة لكلّ عملةٍ مستعملة ─────────────────────────────
  WITH used AS (
    SELECT upper(btrim(currency)) AS currency FROM public.sponsorships
    UNION SELECT upper(btrim(currency)) FROM public.sponsorship_payments
    UNION SELECT upper(btrim(currency)) FROM public.support_pledges
    UNION SELECT upper(btrim(currency)) FROM public.disbursements
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'currency', u.currency, 'firm', f.rate IS NOT NULL,
           'rate', f.rate, 'inverse', f.inverse, 'as_of', f.as_of, 'source', f.source)
           ORDER BY u.currency), '[]'::jsonb)
    INTO _rates
    FROM used u LEFT JOIN LATERAL public.admin_fx_firm(u.currency, _u) f ON true
   WHERE u.currency IS DISTINCT FROM _u;

  -- ── الداعمون ───────────────────────────────────────────────────────
  WITH live AS (
    SELECT s.sponsor_id, s.status, s.type,
           CASE WHEN s.status = 'pending_payment' THEN s.created_at
                ELSE COALESCE(s.next_charge_at,
                              (SELECT max(sp.paid_at) FROM public.sponsorship_payments sp
                                WHERE sp.sponsorship_id = s.id AND sp.status = 'paid')
                                + interval '1 month',
                              COALESCE(s.started_at, s.created_at) + interval '1 month') END AS due_at
      FROM public.sponsorships s
     WHERE s.status IN ('pending_payment', 'active', 'paused')
  ),
  per AS (
    SELECT s.sponsor_id, min(s.created_at) AS since,
           bool_or(s.status = 'active') AS active
      FROM public.sponsorships s GROUP BY 1
  )
  SELECT jsonb_build_object(
           'total', count(*),
           'active', count(*) FILTER (WHERE p.active),
           'new', count(*) FILTER (WHERE p.since >= _now - make_interval(days => _new_days)),
           'at_risk', count(*) FILTER (WHERE EXISTS (
                        SELECT 1 FROM live l WHERE l.sponsor_id = p.sponsor_id
                           AND (l.status = 'paused'
                                OR (l.status = 'active' AND l.type <> 'one_time'
                                    AND l.due_at < _now - make_interval(days => _grace))))),
           'lapsed', count(*) FILTER (WHERE NOT EXISTS (
                        SELECT 1 FROM live l WHERE l.sponsor_id = p.sponsor_id)
                      AND EXISTS (SELECT 1 FROM public.sponsorship_payments sp
                                   WHERE sp.sponsor_id = p.sponsor_id AND sp.status = 'paid')),
           'rule', jsonb_build_object('new_days', _new_days, 'grace_days', _grace))
    INTO _donors FROM per p;

  -- ── المستحقّات بتاريخها ────────────────────────────────────────────
  WITH live AS (
    SELECT s.status,
           upper(btrim(COALESCE(s.charge_currency, s.currency))) AS currency,
           COALESCE(s.charge_amount, s.amount) AS amount,
           CASE WHEN s.status = 'pending_payment' THEN s.created_at
                ELSE COALESCE(s.next_charge_at,
                              (SELECT max(sp.paid_at) FROM public.sponsorship_payments sp
                                WHERE sp.sponsorship_id = s.id AND sp.status = 'paid')
                                + interval '1 month',
                              COALESCE(s.started_at, s.created_at) + interval '1 month') END AS due_at
      FROM public.sponsorships s
     WHERE s.status = 'pending_payment' OR (s.status = 'active' AND s.type <> 'one_time')
  ),
  cells AS (
    SELECT CASE WHEN l.status = 'pending_payment' THEN 'first'
                WHEN l.due_at < _now THEN 'overdue'
                WHEN l.due_at < _now + interval '7 days' THEN 'week'
                ELSE 'month' END AS bucket,
           l.currency, count(*) AS n, SUM(l.amount) AS amount, min(l.due_at) AS oldest
      FROM live l
     WHERE l.status = 'pending_payment' OR l.due_at < _now + interval '30 days'
     GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', c.bucket, 'currency', c.currency, 'count', c.n, 'amount', c.amount,
           'oldest', c.oldest,
           'unified', (SELECT CASE WHEN f.inverse THEN round(c.amount / f.rate, 2)
                                   ELSE round(c.amount * f.rate, 2) END
                         FROM public.admin_fx_firm(c.currency, _u) f))
           ORDER BY c.bucket, c.currency), '[]'::jsonb)
    INTO _due FROM cells c;

  -- ── التأهيل والعيني بدولة الوجهة — بحدّ الحشد ──────────────────────
  WITH open AS (
    SELECT upper(btrim(p.country_code)) AS cc, upper(btrim(p.currency)) AS currency,
           p.amount, p.orphan_id
      FROM public.support_pledges p
     WHERE p.status IN ('pending', 'active', 'fulfilled')
  ),
  pub AS (
    SELECT upper(btrim(o.country)) AS cc, count(*) AS n
      FROM public.orphans o WHERE o.status IN ('approved', 'fully_sponsored') GROUP BY 1
  ),
  flag AS (
    SELECT g.cc, g.n,
           (COALESCE(pub.n, 0) BETWEEN 1 AND _min - 1) OR (g.kids BETWEEN 1 AND _min - 1) AS small
      FROM (SELECT cc, count(*) AS n, count(DISTINCT orphan_id) AS kids FROM open GROUP BY 1) g
      LEFT JOIN pub ON pub.cc = g.cc
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'country', f.cc, 'small', f.small,
           'count', CASE WHEN f.small THEN NULL ELSE f.n END,
           'amounts', CASE WHEN f.small THEN NULL ELSE (
               SELECT jsonb_agg(jsonb_build_object('currency', q.currency, 'amount', q.amount)
                                ORDER BY q.currency)
                 FROM (SELECT currency, SUM(amount) AS amount FROM open o2
                        WHERE o2.cc = f.cc GROUP BY 1) q) END)
           ORDER BY f.small, f.n DESC, f.cc), '[]'::jsonb)
    INTO _country FROM flag f;

  RETURN jsonb_build_object(
    'version', 1,
    'generated_at', _now,
    'unified', _u,
    'cohort_min', _min,
    'months', (SELECT jsonb_agg(to_char(d, 'YYYY-MM') ORDER BY d)
                 FROM generate_series(_first::timestamp,
                                      date_trunc('month', _now AT TIME ZONE 'UTC'),
                                      interval '1 month') d),
    'kinds', _kinds, 'trend', _trend, 'money', _money, 'rates', _rates,
    'donors', _donors, 'due', _due, 'by_country', _country);
END $fn$;

REVOKE ALL ON FUNCTION public.admin_support_summary(INTEGER) FROM PUBLIC, anon, authenticated;
-- للمسجَّل: الدالّة نفسها ترفض غير الإدارة (كما `admin_overview`).
GRANT EXECUTE ON FUNCTION public.admin_support_summary(INTEGER) TO authenticated;
