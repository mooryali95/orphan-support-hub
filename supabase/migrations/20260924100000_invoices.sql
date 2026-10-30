-- =====================================================================
-- الفاتورة والدفع الحقيقي: رقمٌ لكل دفعة، مربوطٌ بمعاملة المزوّد
-- ---------------------------------------------------------------------
-- ١) كل دفعةٍ مدفوعة تأخذ رقم فاتورةٍ دائماً (INV-سنة-تسلسل) عند لحظة
--    الدفع، ويُربط برقم المعاملة لدى المزوّد (provider_payment_id) — وهو
--    ما يجده الكافل في كشف بطاقته، وما تجده الإدارة في لوحة المزوّد.
-- ٢) حقائق الدفعة بعد فوترتها لا تتغيّر: المبلغ والعملة والتاريخ والمزوّد
--    ورقم المعاملة والفاتورة. الحالة وحدها تتقدّم (مدفوع ← مُردّ/منازَع)،
--    ولا تُحذف — ولا بحذف حساب الكافل.
-- ٣) كل فاتورةٍ تُكتب في سجلّ السلامة المربوط بالبصمات، فتُثبت لحظتها.
-- ٤) إيصال الشهر (الإصدار ٢) يدخل فيه رقم الفاتورة ورقم المعاملة، فيرتبط
--    الإيصال بالدفع الحقيقي لا بالأرقام وحدها.
-- ٥) البحث برقم الفاتورة أو برقم المعاملة: للكافل في دفعاته، وللإدارة.
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.invoice_seq;

ALTER TABLE public.sponsorship_payments
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_invoice ON public.sponsorship_payments(invoice_no)
  WHERE invoice_no IS NOT NULL;
-- معاملةٌ واحدة لدى المزوّد = دفعةٌ واحدة عندنا. حدثٌ مكرّر لا يصنع فاتورتين.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_provider_payment
  ON public.sponsorship_payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL AND status IN ('paid', 'refunded', 'disputed');

CREATE OR REPLACE FUNCTION public.next_invoice_no(_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql VOLATILE AS $fn$
  SELECT 'INV-' || to_char(COALESCE(_at, now()) AT TIME ZONE 'UTC', 'YYYY') || '-'
         || lpad(nextval('public.invoice_seq')::text, 6, '0');
$fn$;

-- ما قبل هذه الهجرة: فواتير بترتيب تاريخ الدفع، ورقم المعاملة من المرجع القائم.
UPDATE public.sponsorship_payments SET provider_payment_id = provider_ref
 WHERE provider_payment_id IS NULL AND provider_ref IS NOT NULL AND status IN ('paid', 'refunded', 'disputed');
DO $$
DECLARE _r RECORD;
BEGIN
  FOR _r IN SELECT id, paid_at FROM public.sponsorship_payments
             WHERE invoice_no IS NULL AND status IN ('paid', 'refunded', 'disputed')
             ORDER BY paid_at NULLS LAST, created_at LOOP
    UPDATE public.sponsorship_payments SET invoice_no = public.next_invoice_no(_r.paid_at) WHERE id = _r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.issue_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'paid' AND NEW.invoice_no IS NULL THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
    NEW.invoice_no := public.next_invoice_no(NEW.paid_at);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS issue_invoice ON public.sponsorship_payments;
CREATE TRIGGER issue_invoice BEFORE INSERT OR UPDATE OF status ON public.sponsorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.issue_invoice();

CREATE OR REPLACE FUNCTION public.anchor_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID;
BEGIN
  SELECT orphan_id INTO _orphan FROM public.sponsorships WHERE id = NEW.sponsorship_id;
  IF NEW.invoice_no IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.invoice_no IS NULL) THEN
    PERFORM public.log_integrity('payment_invoiced', _orphan, jsonb_build_object(
      'invoice', NEW.invoice_no, 'provider', NEW.provider, 'provider_payment_id', NEW.provider_payment_id,
      'amount', NEW.amount, 'currency', NEW.currency, 'paid_at', NEW.paid_at,
      'sponsorship', NEW.sponsorship_id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.invoice_no IS NOT NULL THEN
    PERFORM public.log_integrity('payment_status', _orphan, jsonb_build_object(
      'invoice', NEW.invoice_no, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS anchor_invoice ON public.sponsorship_payments;
CREATE TRIGGER anchor_invoice AFTER INSERT OR UPDATE ON public.sponsorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.anchor_invoice();

-- الحقائق المفوترة مجمّدة؛ والحالة تتقدّم في مسارٍ معلوم فقط.
CREATE OR REPLACE FUNCTION public.freeze_invoiced_payment()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.invoice_no IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoiced_payment_permanent' USING ERRCODE = '42501',
      HINT = 'دفعةٌ مفوترة سجلٌّ ماليّ دائم: لا تُحذف، ولا بحذف حساب الكافل.';
  END IF;
  IF NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
     OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id
     OR NEW.sponsorship_id IS DISTINCT FROM OLD.sponsorship_id OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id
     OR NEW.period_start IS DISTINCT FROM OLD.period_start THEN
    RAISE EXCEPTION 'invoiced_payment_frozen' USING ERRCODE = '42501',
      HINT = 'حقائق الدفعة المفوترة لا تتغيّر؛ التصحيح ردٌّ ودفعةٌ جديدة.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'paid' AND NEW.status IN ('refunded', 'disputed'))
    OR (OLD.status = 'disputed' AND NEW.status IN ('paid', 'refunded'))) THEN
    RAISE EXCEPTION 'invoiced_payment_bad_transition: % -> %', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS freeze_invoiced_payment ON public.sponsorship_payments;
CREATE TRIGGER freeze_invoiced_payment BEFORE UPDATE OR DELETE ON public.sponsorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.freeze_invoiced_payment();

-- دفعات الشهر كما يراها الكافل: الفاتورة، والمزوّد، ورقم المعاملة، والحالة.
CREATE OR REPLACE FUNCTION public.month_payments(_sponsorship UUID, _month TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'invoice_no', p.invoice_no, 'provider', p.provider,
           'provider_payment_id', p.provider_payment_id,
           'amount', p.amount, 'currency', p.currency, 'status', p.status, 'paid_at', p.paid_at,
           'receipt_url', p.receipt_url) ORDER BY p.paid_at NULLS LAST, p.created_at), '[]'::jsonb)
    FROM public.sponsorship_payments p
   WHERE p.sponsorship_id = _sponsorship AND p.invoice_no IS NOT NULL
     AND to_char(COALESCE(p.period_start, p.paid_at::date), 'YYYY-MM') = _month;
$fn$;
REVOKE ALL ON FUNCTION public.month_payments(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.month_payment_refs(_sponsorship UUID, _month TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(string_agg(concat_ws(':', p.invoice_no, COALESCE(p.provider, ''),
                    COALESCE(p.provider_payment_id, ''), trim(to_char(p.amount, 'FM999999990.00')), p.status::text),
                  ',' ORDER BY p.invoice_no), '')
    FROM public.sponsorship_payments p
   WHERE p.sponsorship_id = _sponsorship AND p.invoice_no IS NOT NULL
     AND to_char(COALESCE(p.period_start, p.paid_at::date), 'YYYY-MM') = _month;
$fn$;
REVOKE ALL ON FUNCTION public.month_payment_refs(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ledger_receipt_v2(
  _sponsorship UUID, _month TEXT, _paid NUMERIC, _payment TEXT, _delivery TEXT, _delivered_at TIMESTAMPTZ,
  _refs TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4))
    FROM (SELECT encode(sha256(convert_to(concat_ws('|', 'receipt-v2', _sponsorship::text, _month,
            trim(to_char(COALESCE(_paid, 0), 'FM999999990.00')), COALESCE(_payment, ''), COALESCE(_delivery, ''),
            COALESCE(to_char(_delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), ''),
            COALESCE(_refs, '')), 'UTF8')), 'hex') AS h) x;
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
           'payments', public.month_payments(_s.id, m.month),
           'receipt', CASE WHEN m.upcoming OR (m.paid = 0 AND m.delivery_status IS NULL) THEN NULL
                           ELSE public.ledger_receipt_v2(_s.id, m.month, m.paid, m.payment_status,
                                                         m.delivery_status, m.delivered_at,
                                                         public.month_payment_refs(_s.id, m.month)) END)
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

-- البحث برقم الفاتورة أو برقم المعاملة لدى المزوّد. الكافل يجد دفعاته
-- وحدها؛ والإدارة تجد كل شيء. يُعيد الربط كاملاً: الفاتورة ← المعاملة ←
-- الكفالة والشهر ← إيصال الشهر ← بصمة الفاتورة في سجلّ السلامة.
CREATE OR REPLACE FUNCTION public.lookup_payment(_ref TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.sponsorship_payments; _month TEXT; _l JSONB; _m JSONB; _anchor TEXT; _q TEXT := btrim(COALESCE(_ref, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF length(_q) < 6 THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO _p FROM public.sponsorship_payments p
   WHERE p.invoice_no IS NOT NULL
     AND (upper(p.invoice_no) = upper(_q) OR p.provider_payment_id = _q OR p.provider_ref = _q)
     AND (p.sponsor_id = auth.uid() OR public.is_admin())
   ORDER BY p.paid_at DESC LIMIT 1;
  IF _p.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  _month := to_char(COALESCE(_p.period_start, _p.paid_at::date), 'YYYY-MM');
  _l := public.sponsorship_ledger(_p.sponsorship_id);
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  SELECT l.hash INTO _anchor FROM public.integrity_log l
   WHERE l.kind = 'payment_invoiced' AND l.detail->>'invoice' = _p.invoice_no ORDER BY l.id LIMIT 1;
  RETURN jsonb_build_object('found', true,
    'invoice_no', _p.invoice_no, 'provider', _p.provider, 'provider_payment_id', _p.provider_payment_id,
    'amount', _p.amount, 'currency', _p.currency, 'status', _p.status, 'paid_at', _p.paid_at,
    'sponsorship_id', _p.sponsorship_id, 'month', _month,
    'orphan', _l->'orphan'->>'display_name', 'orphan_code', _l->'orphan'->>'code',
    'month_receipt', _m->>'receipt', 'delivery_status', _m->>'delivery_status',
    'anchor', left(_anchor, 16));
END $fn$;
REVOKE ALL ON FUNCTION public.lookup_payment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_payment(TEXT) TO authenticated;
