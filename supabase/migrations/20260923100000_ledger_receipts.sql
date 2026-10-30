-- =====================================================================
-- إيصال الكافل (ك٨): لكل شهرٍ مضى رقمٌ يُحسب من حقائقه
-- ---------------------------------------------------------------------
-- الإيصال بصمةٌ قصيرة لـ: الكفالة، الشهر، المدفوع، حالة الدفع، حالة
-- الوصول، وتاريخه. يحفظه الكافل (في تقريره السنوي مثلاً)؛ فإن تغيّرت
-- حقيقةٌ من حقائق ذلك الشهر لاحقاً تغيّر الرقم، وظهر الفرق عند التحقّق.
-- وسجلّ الكفالة يذكر الآن إن كان ملفّ الطفل مثبّتاً.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ledger_receipt(
  _sponsorship UUID, _month TEXT, _paid NUMERIC, _payment TEXT, _delivery TEXT, _delivered_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4))
    FROM (SELECT encode(sha256(convert_to(concat_ws('|', 'receipt-v1', _sponsorship::text, _month,
            trim(to_char(COALESCE(_paid, 0), 'FM999999990.00')), COALESCE(_payment, ''), COALESCE(_delivery, ''),
            COALESCE(to_char(_delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), '')), 'UTF8')), 'hex') AS h) x;
$fn$;

CREATE OR REPLACE FUNCTION public.sponsorship_ledger(_sponsorship UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships; _o public.orphans; _months JSONB; _from DATE; _to DATE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT (_s.sponsor_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'ledger_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _s.orphan_id;

  _from := date_trunc('month', COALESCE(_s.started_at, _s.created_at))::date;
  _to := CASE WHEN _s.status IN ('cancelled', 'completed')
              THEN date_trunc('month', COALESCE(_s.ended_at, now()))::date
              ELSE (date_trunc('month', now()) + interval '1 month')::date END;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb || jsonb_build_object(
           'receipt', CASE WHEN m.upcoming OR (m.paid = 0 AND m.delivery_status IS NULL) THEN NULL
                           ELSE public.ledger_receipt(_s.id, m.month, m.paid, m.payment_status,
                                                      m.delivery_status, m.delivered_at) END)
         ORDER BY m.month DESC), '[]'::jsonb) INTO _months
    FROM (
      SELECT to_char(g.m, 'YYYY-MM') AS month,
             g.m > date_trunc('month', now()) AS upcoming,
             _s.amount AS due,
             (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id AND p.status = 'paid'
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date)) = g.m) AS paid,
             (SELECT p.status::text FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date, p.created_at::date)) = g.m
               ORDER BY (p.status = 'paid') DESC, p.created_at DESC LIMIT 1) AS payment_status,
             (SELECT d.status FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY (d.status = 'delivered') DESC, d.created_at DESC LIMIT 1) AS delivery_status,
             (SELECT d.delivered_at FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id AND d.status = 'delivered'
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY d.delivered_at DESC LIMIT 1) AS delivered_at
        FROM generate_series(_from, _to, interval '1 month') AS g(m)
    ) m;

  RETURN jsonb_build_object(
    'sponsorship', jsonb_build_object(
      'id', _s.id, 'amount', _s.amount, 'currency', _s.currency, 'status', _s.status,
      'type', _s.type, 'started_at', _s.started_at, 'next_charge_at', _s.next_charge_at,
      'is_anonymous', _s.is_anonymous, 'message', _s.message, 'message_status', _s.message_status,
      'created_at', _s.created_at),
    'orphan', jsonb_build_object('id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
      'country', _o.country, 'region', _o.region, 'age_band', public.age_band_of(_o.birth_date),
      'locked', public.orphan_is_locked(_o.id)),
    'months', _months,
    'totals', jsonb_build_object(
      'paid', (SELECT COALESCE(sum(amount), 0) FROM public.sponsorship_payments
                WHERE sponsorship_id = _s.id AND status = 'paid'),
      'months_paid', (SELECT count(*) FROM jsonb_array_elements(_months) x WHERE (x->>'paid')::numeric > 0),
      'months_delivered', (SELECT count(*) FROM jsonb_array_elements(_months) x
                            WHERE x->>'delivery_status' = 'delivered')));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsorship_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsorship_ledger(UUID) TO authenticated;

-- التحقّق من إيصالٍ محفوظ: يطابق حقائق الشهر اليوم؟ للكافل صاحب الكفالة وللإدارة.
CREATE OR REPLACE FUNCTION public.verify_ledger_receipt(_sponsorship UUID, _month TEXT, _receipt TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _l JSONB; _m JSONB;
BEGIN
  _l := public.sponsorship_ledger(_sponsorship);
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  IF _m IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'month_not_found'); END IF;
  RETURN jsonb_build_object('ok', true,
    'match', upper(btrim(_receipt)) = _m->>'receipt',
    'current', _m->>'receipt');
END $fn$;
REVOKE ALL ON FUNCTION public.verify_ledger_receipt(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_ledger_receipt(UUID, TEXT, TEXT) TO authenticated;
