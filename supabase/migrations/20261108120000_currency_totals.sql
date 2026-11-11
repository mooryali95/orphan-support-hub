-- =====================================================================
-- الدفعة ٣أ — المجاميع بعملاتها (APP-04 / UI-01 / UX-07 / PRD-14)
-- ---------------------------------------------------------------------
-- كانت الخزينة (المحصّل، المصروف، الرصيد) والالتزام الشهري والاحتياج،
-- وأرقام الصفحة الأولى، مجموعاً واحداً يضيف اليورو إلى الدولار ويُكتب
-- بعملة المنصّة. وعملة الطفل نصٌّ حرّ تغيّره الجهة بعد الاعتماد.
--
-- الآن:
--   • admin_overview: `orphans_by_currency`, `committed_by_currency`,
--     `money_by_currency` — والحقول القديمة باقية (للتوافق) لا تعرضها الواجهة.
--     والملفات المعلّقة تحمل عملتها.
--   • admin_list('sponsors'): `monthly_by_currency`, `paid_by_currency`.
--   • public_platform_stats: `by_currency`.
--   • عملة الطفل رمزٌ من ثلاثة أحرف عند الإدخال أو التغيير (لا يُفحص القديم
--     فلا يُكسر تحديث تمويله)، ولا تغيّرها الجهة بعد الاعتماد أو مع كفالةٍ حيّة.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guard_orphan_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;
  NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
  IF NEW.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'orphan: currency must be a three-letter code' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency
     AND current_user IN ('authenticated', 'anon') AND NOT public.is_admin()
     AND (OLD.status IN ('approved', 'fully_sponsored')
          OR EXISTS (SELECT 1 FROM public.sponsorships s WHERE s.orphan_id = OLD.id
                       AND s.status IN ('pending_payment', 'active', 'paused'))) THEN
    RAISE EXCEPTION 'orphan: the currency is fixed once the file is published'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_orphan_currency() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_orphan_currency ON public.orphans;
CREATE TRIGGER trg_guard_orphan_currency BEFORE INSERT OR UPDATE OF currency ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.guard_orphan_currency();


CREATE OR REPLACE FUNCTION public.admin_list(_list text, _q text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lim INTEGER := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  _off INTEGER := GREATEST(COALESCE(_offset, 0), 0);
  _pat TEXT := CASE WHEN NULLIF(btrim(COALESCE(_q, '')), '') IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(btrim(_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_list: not authorised' USING ERRCODE = '42501';
  END IF;

  IF _list = 'orphans' THEN
    RETURN (
      WITH base AS (
        SELECT o.id, o.code, o.display_name, o.city, o.status, co.name AS org,
               o.monthly_need, o.funded_monthly, o.currency
          FROM public.orphans o
          LEFT JOIN public.care_organizations co ON co.id = o.org_id
         WHERE o.status IN ('approved', 'fully_sponsored')
           AND (_pat IS NULL OR o.code ILIKE _pat OR o.display_name ILIKE _pat
                OR co.name ILIKE _pat OR o.city ILIKE _pat)
      )
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM base),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'code', b.code, 'name', b.display_name, 'city', b.city,
                    'status', b.status, 'org', b.org, 'need', b.monthly_need,
                    'funded', b.funded_monthly, 'currency', b.currency,
                    'gap', GREATEST(b.monthly_need - b.funded_monthly, 0),
                    'sponsors', (SELECT count(*) FROM public.sponsorships s
                                  WHERE s.orphan_id = b.id AND s.status IN ('active', 'paused')))
                    ORDER BY GREATEST(b.monthly_need - b.funded_monthly, 0) DESC, b.code)
                  FROM (SELECT * FROM base
                         ORDER BY GREATEST(monthly_need - funded_monthly, 0) DESC, code
                         LIMIT _lim OFFSET _off) b), '[]'::jsonb)));
  ELSIF _list = 'sponsors' THEN
    RETURN (
      WITH agg AS (
        SELECT u.id, u.email, p.full_name,
               count(s.id) AS sponsorships,
               count(s.id) FILTER (WHERE s.status = 'active') AS active,
               COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'active'), 0) AS monthly,
               min(s.created_at) AS since,
               -- لكلّ عملةٍ مجموعها (PRD-14): لا يُجمع يورو مع دولار.
               (SELECT COALESCE(jsonb_agg(jsonb_build_object('currency', m.currency, 'amount', m.amount)
                                          ORDER BY m.currency), '[]'::jsonb)
                  FROM (SELECT s2.currency, SUM(s2.amount) AS amount FROM public.sponsorships s2
                         WHERE s2.sponsor_id = u.id AND s2.status = 'active' GROUP BY s2.currency) m)
                 AS monthly_by_currency
          FROM public.sponsorships s
          JOIN auth.users u ON u.id = s.sponsor_id
          LEFT JOIN public.profiles p ON p.id = u.id
         WHERE _pat IS NULL OR u.email ILIKE _pat OR p.full_name ILIKE _pat
         GROUP BY u.id, u.email, p.full_name
      ),
      paid AS (
        SELECT a.*, COALESCE((SELECT SUM(sp.amount) FROM public.sponsorship_payments sp
                               WHERE sp.sponsor_id = a.id AND sp.status = 'paid'), 0) AS paid,
               (SELECT COALESCE(jsonb_agg(jsonb_build_object('currency', m.currency, 'amount', m.amount)
                                          ORDER BY m.currency), '[]'::jsonb)
                  FROM (SELECT sp.currency, SUM(sp.amount) AS amount FROM public.sponsorship_payments sp
                         WHERE sp.sponsor_id = a.id AND sp.status = 'paid' GROUP BY sp.currency) m)
                 AS paid_by_currency
          FROM agg a
      )
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM agg),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', x.id, 'email', x.email, 'name', x.full_name,
                    'sponsorships', x.sponsorships, 'active', x.active, 'monthly', x.monthly,
                    'paid', x.paid, 'since', x.since, 'monthly_by_currency', x.monthly_by_currency,
                    'paid_by_currency', x.paid_by_currency) ORDER BY x.paid DESC, x.email)
                  FROM (SELECT * FROM paid ORDER BY paid DESC, email LIMIT _lim OFFSET _off) x),
                 '[]'::jsonb)));
  END IF;
  RAISE EXCEPTION 'admin_list: unknown list %', _list USING ERRCODE = '22023';
END $function$;

CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _out JSONB; _orphans JSONB; _sponsors JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_overview: not authorised' USING ERRCODE = '42501';
  END IF;

  _orphans := public.admin_list('orphans', NULL, 100, 0);
  _sponsors := public.admin_list('sponsors', NULL, 100, 0);

  SELECT jsonb_build_object(
    'currency', (SELECT currency FROM public.platform_settings WHERE id),

    'orphans', (
      SELECT jsonb_build_object(
        'total', count(*),
        'published', count(*) FILTER (WHERE status IN ('approved','fully_sponsored')),
        'fully_sponsored', count(*) FILTER (WHERE status = 'fully_sponsored'),
        'awaiting_review', count(*) FILTER (WHERE status IN ('submitted','under_review')),
        'monthly_need', COALESCE(SUM(monthly_need) FILTER (WHERE status IN ('approved','fully_sponsored')), 0),
        'monthly_funded', COALESCE(SUM(funded_monthly) FILTER (WHERE status IN ('approved','fully_sponsored')), 0),
        'monthly_gap', GREATEST(COALESCE(SUM(monthly_need - funded_monthly)
                        FILTER (WHERE status = 'approved'), 0), 0)
      ) FROM public.orphans
    ),

    'organizations', (
      SELECT jsonb_build_object(
        'total', count(*),
        'approved', count(*) FILTER (WHERE status = 'approved'),
        'pending', count(*) FILTER (WHERE status = 'pending')
      ) FROM public.care_organizations
    ),

    'sponsors', (
      SELECT jsonb_build_object(
        'total', count(DISTINCT sponsor_id),
        'with_active', count(DISTINCT sponsor_id) FILTER (WHERE status = 'active'),
        'sponsorships', count(*),
        'active', count(*) FILTER (WHERE status = 'active'),
        'awaiting_payment', count(*) FILTER (WHERE status = 'pending_payment'),
        'monthly_committed', COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)
      ) FROM public.sponsorships
    ),

    'money', (
      SELECT jsonb_build_object(
        'collected', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0),
        'fees', COALESCE((SELECT SUM(fee_amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0),
        'pending', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'pending'), 0),
        'failed', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'failed'), 0),
        'disputed', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'disputed'), 0),
        'disbursed', COALESCE((SELECT SUM(amount) FROM public.disbursements), 0),
        'balance', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0)
                 - COALESCE((SELECT SUM(amount) FROM public.disbursements), 0)
      )
    ),

    -- لكلّ عملةٍ مجاميعها (PRD-14 / UX-07). الحقول أعلاه باقيةٌ لمن يقرؤها،
    -- والواجهة لا تعرض إلا هذه.
    'orphans_by_currency', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'currency', q.currency, 'monthly_need', q.need, 'monthly_funded', q.funded,
               'monthly_gap', q.gap) ORDER BY q.currency), '[]'::jsonb)
        FROM (SELECT currency,
                     COALESCE(SUM(monthly_need), 0) AS need,
                     COALESCE(SUM(funded_monthly), 0) AS funded,
                     GREATEST(COALESCE(SUM(monthly_need - funded_monthly) FILTER (WHERE status = 'approved'), 0), 0) AS gap
                FROM public.orphans WHERE status IN ('approved', 'fully_sponsored')
               GROUP BY currency) q
    ),
    'committed_by_currency', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('currency', q.currency, 'amount', q.amount)
                                ORDER BY q.currency), '[]'::jsonb)
        FROM (SELECT currency, SUM(amount) AS amount FROM public.sponsorships
               WHERE status = 'active' GROUP BY currency) q
    ),
    'money_by_currency', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'currency', c.currency,
               'collected', COALESCE(p.collected, 0), 'fees', COALESCE(p.fees, 0),
               'pending', COALESCE(p.pending, 0), 'failed', COALESCE(p.failed, 0),
               'disputed', COALESCE(p.disputed, 0), 'disbursed', COALESCE(d.disbursed, 0),
               'balance', COALESCE(p.collected, 0) - COALESCE(d.disbursed, 0)) ORDER BY c.currency), '[]'::jsonb)
        FROM (SELECT currency FROM public.sponsorship_payments
              UNION SELECT currency FROM public.disbursements) c
        LEFT JOIN (SELECT currency,
                          SUM(amount) FILTER (WHERE status = 'paid') AS collected,
                          SUM(fee_amount) FILTER (WHERE status = 'paid') AS fees,
                          SUM(amount) FILTER (WHERE status = 'pending') AS pending,
                          SUM(amount) FILTER (WHERE status = 'failed') AS failed,
                          SUM(amount) FILTER (WHERE status = 'disputed') AS disputed
                     FROM public.sponsorship_payments GROUP BY currency) p ON p.currency = c.currency
        LEFT JOIN (SELECT currency, SUM(amount) AS disbursed FROM public.disbursements
                    GROUP BY currency) d ON d.currency = c.currency
    ),

    'orphan_rows', _orphans->'rows',
    'orphan_rows_total', (_orphans->>'total')::integer,
    'sponsor_rows', _sponsors->'rows',
    'sponsor_rows_total', (_sponsors->>'total')::integer,

    'pending_orphans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'name', display_name, 'city', city,
        'region', region, 'need', monthly_need, 'currency', currency, 'status', status,
        'created_at', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM (SELECT * FROM public.orphans WHERE status IN ('submitted','under_review')
             ORDER BY created_at LIMIT 200) q
    ),

    'pending_orgs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'city', city, 'region', region,
        'license', license_number, 'email', contact_email, 'created_at', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM (SELECT * FROM public.care_organizations WHERE status = 'pending'
             ORDER BY created_at LIMIT 200) q
    )
  ) INTO _out;

  RETURN _out;
END; $function$;


CREATE OR REPLACE FUNCTION public.public_platform_stats()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'total', count(*),
    'fully_sponsored', count(*) FILTER (WHERE o.status = 'fully_sponsored'),
    'monthly_need', COALESCE(sum(o.monthly_need), 0),
    'monthly_funded', COALESCE(sum(o.funded_monthly), 0),
    'by_currency', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('currency', q.currency, 'monthly_need', q.need,
                                          'monthly_funded', q.funded) ORDER BY q.need DESC, q.currency)
        FROM (SELECT o2.currency, sum(o2.monthly_need) AS need, sum(o2.funded_monthly) AS funded
                FROM public.orphans o2 WHERE o2.status IN ('approved', 'fully_sponsored')
               GROUP BY o2.currency) q), '[]'::jsonb)
  )
    FROM public.orphans o
   WHERE o.status IN ('approved', 'fully_sponsored');
$fn$;
