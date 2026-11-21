-- =====================================================================
-- العملة الموحّدة وعملة تشغيل كل دولة
-- ---------------------------------------------------------------------
-- كان العطاء يُدفع بعملة حاجة الطفل وحدها: كفالةٌ بغيرها تُرفض عند المزوّد
-- (`currency_mismatch`). الآن يختار الكافل بين عملة تشغيل دولة الطفل والعملة
-- الموحّدة للمنصّة (`platform_settings.currency`)، ويُحفظ مع الكفالة ومع كل
-- دفعةٍ ما حُصِّل، وما قُيِّد لحاجة الطفل، والسعر بتاريخه ومصدره.
--
--   • `fx_rates`: أسعارٌ بتاريخٍ ومصدر، تضيفها الإدارة (`admin_set_fx_rate`)
--     وتُعرض للداعم مع عملات الدفع (`sponsorship_pay_options`).
--     البذرة استرشادية (`indicative`) تُستبدل بسعرٍ معتمد قبل التحصيل الفعلي.
--   • `countries.currency` عملة تشغيل الدولة: تُملأ من قاعدة القارة
--     (`default_operating_currency`، مطابقةٌ لـsrc/lib/currency.ts) حيث غابت،
--     وتبقى قابلة للتغيير لكل دولة.
--   • `sponsorships.amount/currency` تبقيان ما يُقيَّد لحاجة الطفل بعملة
--     الحاجة (فلا يتغيّر `funded_monthly` ولا مجاميع العملات)، وتُضاف
--     `charge_amount/charge_currency` لما يُحصَّل، و`fx_*` للسعر المطبَّق.
--     الفارغ = الدفع بعملة الحاجة كما كان.
--   • `sponsorship_payments.amount/currency` تبقيان ما حُصِّل فعلاً (الفاتورة
--     والخزينة بعملة المال الحقيقية)، وتُضاف `credited_amount/credited_currency`.
--   • المبلغ المقيَّد يحسبه الخادم من السعر المخزَّن، لا العميل.
--   • تعهّد الدعم (`support_pledges`) يُسجَّل بعملته بلا تحويل، ولا يُقبل إلا
--     بالموحّدة أو عملة تشغيل الدولة أو عملة حاجةٍ قائمة فيها.
--
-- لا يتغيّر شيءٌ لكفالةٍ قائمة ولا لمن يدفع بعملة الحاجة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) أسعار الصرف
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- وحدةٌ من base تساوي rate من quote.
  base        TEXT NOT NULL CHECK (base ~ '^[A-Z]{3}$'),
  quote       TEXT NOT NULL CHECK (quote ~ '^[A-Z]{3}$'),
  rate        NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  as_of       DATE NOT NULL,
  source      TEXT NOT NULL CHECK (btrim(source) <> ''),
  -- استرشادي: ليس سعر سوقٍ معتمداً، ويُعرض للداعم كذلك.
  indicative  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT fx_rates_distinct CHECK (base <> quote),
  CONSTRAINT fx_rates_unique UNIQUE (base, quote, as_of)
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
-- لا منح للعموم ولا سياسات: السعر يُقرأ عبر `sponsorship_pay_options` ويُضاف
-- عبر `admin_set_fx_rate` وحدهما.
REVOKE ALL ON public.fx_rates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fx_rates TO service_role;

INSERT INTO public.fx_rates (base, quote, rate, as_of, source, indicative) VALUES
  ('EUR', 'USD', 1.08, DATE '2026-11-21', 'seed:indicative', true)
ON CONFLICT (base, quote, as_of) DO NOTHING;

/* العملة الموحّدة: عملة المنصّة. تُقرأ بدالّةٍ لأن الإعدادات محجوبة عن الزائر. */
CREATE OR REPLACE FUNCTION public.unified_currency()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT upper(btrim(s.currency)) FROM public.platform_settings s WHERE s.id;
$fn$;
REVOKE ALL ON FUNCTION public.unified_currency() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unified_currency() TO authenticated;

/* السعر سجلٌّ يُضاف ولا يُعدَّل: سعرٌ جديد بتاريخه، والقديم باقٍ لما قُيِّد به.
   تكتبه الإدارة وحدها، ويُدوَّن في سجلّ التدقيق. */
CREATE OR REPLACE FUNCTION public.admin_set_fx_rate(
  _base TEXT, _quote TEXT, _rate NUMERIC, _as_of DATE, _source TEXT, _indicative BOOLEAN DEFAULT false)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _b TEXT := upper(btrim(COALESCE(_base, ''))); _q TEXT := upper(btrim(COALESCE(_quote, '')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_set_fx_rate: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _as_of IS NULL OR _as_of > CURRENT_DATE THEN
    RAISE EXCEPTION 'admin_set_fx_rate: as_of must not be in the future' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fx_rates (base, quote, rate, as_of, source, indicative, created_by)
  VALUES (_b, _q, _rate, _as_of, btrim(_source), COALESCE(_indicative, false), auth.uid())
  RETURNING id INTO _id;
  PERFORM public.write_audit('fx_rate.set', 'fx_rate', _id,
    jsonb_build_object('pair', _b || '/' || _q, 'rate', _rate, 'as_of', _as_of,
                       'source', btrim(_source), 'indicative', COALESCE(_indicative, false)));
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_fx_rate(TEXT, TEXT, NUMERIC, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_fx_rate(TEXT, TEXT, NUMERIC, DATE, TEXT, BOOLEAN) TO authenticated;

/* تحويل مبلغ بأحدث سعرٍ مخزَّن: المباشر ثم معكوسه. القسمة على السعر المنشور
   (لا الضرب في معكوسٍ مقرَّب) فلا يضيع سنتٌ بالتقريب؛ والناتج نزولاً إلى سنتين.
   لا سعر ⇒ لا صفّ. */
CREATE OR REPLACE FUNCTION public.fx_convert(_from TEXT, _to TEXT, _amount NUMERIC)
RETURNS TABLE (converted NUMERIC, pair TEXT, rate NUMERIC, as_of DATE, source TEXT, indicative BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE WHEN r.base = upper(btrim(_from)) THEN trunc(_amount * r.rate, 2)
              ELSE trunc(_amount / r.rate, 2) END,
         r.base || '/' || r.quote, r.rate, r.as_of, r.source, r.indicative
    FROM public.fx_rates r
   WHERE (r.base = upper(btrim(_from)) AND r.quote = upper(btrim(_to)))
      OR (r.base = upper(btrim(_to)) AND r.quote = upper(btrim(_from)))
   ORDER BY r.as_of DESC, r.created_at DESC
   LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public.fx_convert(TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
-- للمسجَّل: مُشغّل إنشاء الكفالة يعمل بصلاحية الكافل ويحسب به المقيَّد.
GRANT EXECUTE ON FUNCTION public.fx_convert(TEXT, TEXT, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) عملة تشغيل الدولة
-- ---------------------------------------------------------------------
/* قاعدة القارة كما في src/lib/currency.ts (REGION_CURRENCY + COUNTRY_CURRENCY):
   أوروبا (وقبرص) باليورو، وما عداها بالدولار. اختبار الواجهة يثبت التطابق. */
CREATE OR REPLACE FUNCTION public.default_operating_currency(_code TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE WHEN _code = ANY (string_to_array(
    'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
    ' ')) THEN 'EUR' ELSE 'USD' END;
$fn$;
REVOKE ALL ON FUNCTION public.default_operating_currency(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.default_operating_currency(TEXT) TO authenticated;

UPDATE public.countries SET currency = public.default_operating_currency(code) WHERE currency IS NULL;

/* دولةٌ تُضاف بلا عملة تأخذ عملة قارّتها؛ والإدارة تغيّرها متى شاءت. */
CREATE OR REPLACE FUNCTION public.fill_country_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.currency IS NULL THEN
    NEW.currency := public.default_operating_currency(NEW.code);
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.fill_country_currency() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fill_country_currency ON public.countries;
CREATE TRIGGER trg_fill_country_currency BEFORE INSERT OR UPDATE OF currency ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.fill_country_currency();

-- ---------------------------------------------------------------------
-- 3) ما يُحصَّل وما يُقيَّد
-- ---------------------------------------------------------------------
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS charge_currency TEXT,
  ADD COLUMN IF NOT EXISTS charge_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fx_pair         TEXT,
  ADD COLUMN IF NOT EXISTS fx_rate         NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS fx_as_of        DATE,
  ADD COLUMN IF NOT EXISTS fx_source       TEXT;
ALTER TABLE public.sponsorships DROP CONSTRAINT IF EXISTS ck_sponsorship_charge_terms;
ALTER TABLE public.sponsorships ADD CONSTRAINT ck_sponsorship_charge_terms CHECK (
  (charge_currency IS NULL AND charge_amount IS NULL AND fx_pair IS NULL
     AND fx_rate IS NULL AND fx_as_of IS NULL AND fx_source IS NULL)
  OR (charge_currency ~ '^[A-Z]{3}$' AND charge_currency <> currency AND charge_amount > 0
      AND fx_pair ~ '^[A-Z]{3}/[A-Z]{3}$' AND fx_rate > 0 AND fx_as_of IS NOT NULL
      AND fx_source IS NOT NULL));
COMMENT ON COLUMN public.sponsorships.charge_amount IS
  'ما يُحصَّل من الكافل بعملة الدفع؛ amount/currency هما المقيَّد لحاجة الطفل. الفارغ: الدفع بعملة الحاجة.';

ALTER TABLE public.sponsorship_payments
  ADD COLUMN IF NOT EXISTS credited_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS credited_currency TEXT,
  ADD COLUMN IF NOT EXISTS fx_pair           TEXT,
  ADD COLUMN IF NOT EXISTS fx_rate           NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS fx_as_of          DATE,
  ADD COLUMN IF NOT EXISTS fx_source         TEXT;
COMMENT ON COLUMN public.sponsorship_payments.credited_amount IS
  'ما قُيِّد لحاجة الطفل بعملة الحاجة من هذه الدفعة؛ amount/currency هما ما حُصِّل فعلاً.';

/* العملات التي يُدفع بها لطفل: عملة حاجته، وعملة تشغيل دولته، والموحّدة —
   وما عدا عملة الحاجة لا يُعرض إلا إن وُجد له سعرٌ مخزَّن. */
CREATE OR REPLACE FUNCTION public.sponsorship_pay_options(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _need TEXT; _cc TEXT; _op TEXT; _uni TEXT := public.unified_currency();
  _out JSONB; _q RECORD; _c RECORD;
BEGIN
  SELECT o.currency, o.country_code INTO _need, _cc FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF _need IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT c.currency INTO _op FROM public.countries c WHERE c.code = _cc;
  _out := jsonb_build_array(jsonb_build_object('currency', _need, 'kind',
            CASE WHEN _need = _op THEN 'operating' ELSE 'need' END));
  FOR _c IN SELECT x.cur, x.kind FROM (VALUES (_op, 'operating', 1), (_uni, 'unified', 2)) AS x(cur, kind, ord)
             WHERE x.cur IS NOT NULL AND x.cur <> _need ORDER BY x.ord LOOP
    CONTINUE WHEN _out @> jsonb_build_array(jsonb_build_object('currency', _c.cur));
    SELECT * INTO _q FROM public.fx_convert(_c.cur, _need, 1);
    CONTINUE WHEN NOT FOUND;
    _out := _out || jsonb_build_object('currency', _c.cur, 'kind', _c.kind, 'pair', _q.pair,
              'rate', _q.rate, 'as_of', _q.as_of, 'source', _q.source, 'indicative', _q.indicative);
  END LOOP;
  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.sponsorship_pay_options(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsorship_pay_options(UUID) TO anon, authenticated;

/* الإنشاء من العميل: العملة والحالة من الخادم كما كانتا. وإن اختار الكافل
   عملة دفعٍ غير عملة الحاجة، يُتحقَّق أنها ممّا يُدفع به لهذا الطفل، ويُحسب
   المقيَّد من السعر المخزَّن — لا من رقمٍ يرسله العميل. */
CREATE OR REPLACE FUNCTION public.guard_sponsorship_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _currency TEXT; _pay TEXT; _q RECORD;
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  -- لا تُنشأ كفالة إلا على ملف منشور فعلياً.
  SELECT o.currency INTO _currency
  FROM public.orphans o
  WHERE o.id = NEW.orphan_id AND o.status IN ('approved', 'fully_sponsored');

  IF _currency IS NULL THEN
    RAISE EXCEPTION 'sponsorship: orphan is not open for sponsorship'
      USING ERRCODE = '42501';
  END IF;

  _pay := NULLIF(upper(btrim(COALESCE(NEW.charge_currency, ''))), '');
  IF _pay IS NOT NULL AND _pay <> _currency THEN
    IF NOT public.sponsorship_pay_options(NEW.orphan_id)
             @> jsonb_build_array(jsonb_build_object('currency', _pay)) THEN
      RAISE EXCEPTION 'sponsorship: currency_not_payable' USING ERRCODE = '22023';
    END IF;
    IF NEW.charge_amount IS NULL OR NEW.charge_amount <= 0 THEN
      RAISE EXCEPTION 'sponsorship: charge_amount_required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _q FROM public.fx_convert(_pay, _currency, NEW.charge_amount);
    IF NOT FOUND OR _q.converted <= 0 THEN
      RAISE EXCEPTION 'sponsorship: currency_not_payable' USING ERRCODE = '22023';
    END IF;
    NEW.charge_currency := _pay;
    NEW.amount    := _q.converted;
    NEW.fx_pair   := _q.pair;
    NEW.fx_rate   := _q.rate;
    NEW.fx_as_of  := _q.as_of;
    NEW.fx_source := _q.source;
  ELSE
    NEW.charge_currency := NULL;
    NEW.charge_amount   := NULL;
    NEW.fx_pair := NULL; NEW.fx_rate := NULL; NEW.fx_as_of := NULL; NEW.fx_source := NULL;
  END IF;

  NEW.sponsor_id              := auth.uid();
  NEW.currency                := _currency;
  NEW.status                  := 'pending_payment';
  NEW.started_at              := NULL;
  NEW.ended_at                := NULL;
  NEW.next_charge_at          := NULL;
  NEW.provider                := NULL;
  NEW.provider_subscription_id := NULL;

  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_sponsorship_insert() FROM PUBLIC, anon, authenticated;

/* شروط التحصيل تُثبَّت عند الإنشاء: السعر المحفوظ لا يتبدّل بعده من العميل. */
CREATE OR REPLACE FUNCTION public.guard_sponsorship_charge_terms()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.charge_currency IS DISTINCT FROM OLD.charge_currency
     OR NEW.charge_amount IS DISTINCT FROM OLD.charge_amount
     OR NEW.fx_pair IS DISTINCT FROM OLD.fx_pair
     OR NEW.fx_rate IS DISTINCT FROM OLD.fx_rate
     OR NEW.fx_as_of IS DISTINCT FROM OLD.fx_as_of
     OR NEW.fx_source IS DISTINCT FROM OLD.fx_source THEN
    RAISE EXCEPTION 'sponsorship: charge terms are server-managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_sponsorship_charge_terms() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_sponsorship_charge_terms ON public.sponsorships;
CREATE TRIGGER trg_guard_sponsorship_charge_terms BEFORE UPDATE ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.guard_sponsorship_charge_terms();

/* تعهّد الدعم يُسجَّل بعملته كما كُتب (بلا تحويل): الموحّدة، أو عملة تشغيل
   الدولة، أو عملة حاجة الطفل المقصود، أو عملةٌ يُكتب بها احتياج ملفٍّ منشور في
   الدولة نفسها (فجوة المكان). ما عداها مرفوض. */
CREATE OR REPLACE FUNCTION public.guard_pledge_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.currency = public.unified_currency()
     OR NEW.currency = (SELECT c.currency FROM public.countries c WHERE c.code = NEW.country_code)
     OR NEW.currency = (SELECT o.currency FROM public.orphans o WHERE o.id = NEW.orphan_id)
     OR EXISTS (SELECT 1 FROM public.orphans o
                 WHERE o.country_code = NEW.country_code AND o.currency = NEW.currency
                   AND o.status IN ('approved', 'fully_sponsored')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'currency_not_payable' USING ERRCODE = '22023';
END $fn$;
REVOKE ALL ON FUNCTION public.guard_pledge_currency() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_pledge_currency ON public.support_pledges;
CREATE TRIGGER trg_guard_pledge_currency BEFORE INSERT ON public.support_pledges
  FOR EACH ROW EXECUTE FUNCTION public.guard_pledge_currency();

-- ---------------------------------------------------------------------
-- 4) المزوّد: المتوقَّع هو ما اتُّفق على تحصيله، والدفعة تحمل المقيَّد وسعره
-- ---------------------------------------------------------------------
-- نصّ الدالّة كما في 20261108100000 مع: المتوقَّع من charge_* إن وُجدت،
-- وأعمدة المقيَّد والسعر على الدفعة. التوقيع والمنح لا يتغيّران.
CREATE OR REPLACE FUNCTION public.record_provider_charge(
  _sponsorship UUID, _provider TEXT, _event_id TEXT, _payment_ref TEXT, _checkout_id TEXT,
  _subscription_id TEXT, _amount NUMERIC, _currency TEXT, _paid_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _s       public.sponsorships%ROWTYPE;
  _ref     TEXT := COALESCE(_payment_ref, _checkout_id);
  _cur     TEXT := upper(btrim(COALESCE(_currency, '')));
  _amt     NUMERIC(12,2);
  _at      TIMESTAMPTZ := COALESCE(_paid_at, now());
  _kind    TEXT;
  _issue   UUID;
  _payment UUID;
  _fee_pct NUMERIC;
  _fee     NUMERIC(12,2);
  _sub     TEXT;
  _exp_cur TEXT;
  _exp_amt NUMERIC(12,2);
  _cred    NUMERIC(12,2);
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_provider_charge: no sponsorship %', _sponsorship USING ERRCODE = 'P0002';
  END IF;

  -- الإعادة: المعاملة نفسها قُيّدت أو رُفعت سابقاً.
  IF _ref IS NOT NULL THEN
    SELECT id INTO _payment FROM public.sponsorship_payments
     WHERE provider = _provider AND provider_payment_id = _ref
       AND status IN ('paid', 'refunded', 'disputed');
    IF FOUND THEN
      RETURN jsonb_build_object('outcome', 'replay', 'payment_id', _payment);
    END IF;
    SELECT id, kind INTO _issue, _kind FROM public.money_issues
     WHERE provider = _provider AND provider_payment_id = _ref
       AND kind IN ('charge_after_end', 'currency_mismatch');
    IF FOUND THEN
      RETURN jsonb_build_object('outcome', 'refused', 'reason', _kind, 'issue_id', _issue,
                                'replay', true,
                                'cancel_subscription', COALESCE(_subscription_id, _s.provider_subscription_id));
    END IF;
  END IF;

  -- المتّفق عليه هو ما يُحصَّل: بعملة الدفع إن اختار الكافل غير عملة الحاجة.
  _exp_cur := COALESCE(_s.charge_currency, _s.currency);
  _exp_amt := COALESCE(_s.charge_amount, _s.amount);
  _amt := COALESCE(_amount, _exp_amt);
  IF _cur = '' THEN _cur := _exp_cur; END IF;
  _sub := COALESCE(_subscription_id, _s.provider_subscription_id);

  -- التحصيل على كفالةٍ منتهية أو بعملةٍ مخالفة لا يُقيَّد: يُرفع للإدارة.
  IF public.sponsorship_ended_at(_s, _at) THEN
    _kind := 'charge_after_end';
  ELSIF _cur <> _exp_cur THEN
    _kind := 'currency_mismatch';
  END IF;

  IF _kind IS NOT NULL THEN
    INSERT INTO public.money_issues (kind, sponsorship_id, orphan_id, amount, currency, provider,
                                     provider_payment_id, provider_event_id, detail)
    VALUES (_kind, _s.id, _s.orphan_id, _amt, _cur, _provider, _ref, _event_id,
            jsonb_build_object('sponsorship_status', _s.status, 'expected_currency', _exp_cur,
                               'expected_amount', _exp_amt, 'subscription', _sub,
                               'action', CASE _kind WHEN 'charge_after_end'
                                           THEN 'refund' ELSE 'refund_or_reconcile' END))
    RETURNING id INTO _issue;

    IF _kind = 'charge_after_end' THEN
      -- موعد الإلغاء حلّ ولم يُنفَّذ بعد: يُنفَّذ الآن.
      IF _s.status IN ('active', 'paused', 'pending_payment') THEN
        UPDATE public.sponsorships
           SET status = 'cancelled', ended_at = COALESCE(cancel_effective_at, now()),
               end_reason = COALESCE(end_reason,
                              CASE WHEN cancel_effective_at IS NOT NULL THEN 'sponsor_cancelled'
                                   ELSE 'child_exit' END),
               paused_until = NULL
         WHERE id = _s.id;
      END IF;
      -- والاشتراك يُلغى فوراً، لا آخر الدورة: التحصيل التالي مرفوضٌ سلفاً.
      IF _sub IS NOT NULL THEN
        UPDATE public.sponsorships
           SET provider_subscription_id = _sub, provider_cancel_state = 'pending',
               provider_cancel_mode = 'immediate', provider_cancel_error = NULL
         WHERE id = _s.id;
      END IF;
    END IF;

    PERFORM public.write_audit('payment.refused', 'sponsorship', _s.id,
      jsonb_build_object('reason', _kind, 'provider', _provider, 'payment_ref', _ref,
                         'amount', _amt, 'currency', _cur, 'issue', _issue));
    RETURN jsonb_build_object('outcome', 'refused', 'reason', _kind, 'issue_id', _issue,
                              'cancel_subscription', CASE WHEN _kind = 'charge_after_end' THEN _sub END);
  END IF;

  SELECT fee_percent INTO _fee_pct FROM public.platform_settings WHERE id;
  _fee := round(_amt * COALESCE(_fee_pct, 0) / 100, 2);

  -- المقيَّد لحاجة الطفل بعملة الحاجة: المتّفق عليه إن وصل المبلغ كما هو،
  -- وإلا بنسبته بالسعر المحفوظ مع الكفالة (نزولاً إلى سنتين).
  _cred := CASE WHEN _s.charge_currency IS NULL THEN _amt
                WHEN _amt = _s.charge_amount THEN _s.amount
                ELSE trunc(_amt * _s.amount / _s.charge_amount, 2) END;

  -- الدفعة المعلّقة التي أنشأتها جلسة الدفع نفسها تصير هي المدفوعة.
  IF _checkout_id IS NOT NULL THEN
    SELECT id INTO _payment FROM public.sponsorship_payments
     WHERE sponsorship_id = _s.id AND status = 'pending' AND provider_checkout_id = _checkout_id
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  END IF;

  IF _payment IS NOT NULL THEN
    UPDATE public.sponsorship_payments
       SET status = 'paid', amount = _amt, currency = _cur, provider = _provider,
           provider_ref = _checkout_id, provider_payment_id = _ref, provider_event_id = _event_id,
           fee_amount = _fee, net_amount = _amt - _fee, paid_at = _at,
           credited_amount = _cred, credited_currency = _s.currency,
           fx_pair = _s.fx_pair, fx_rate = _s.fx_rate, fx_as_of = _s.fx_as_of, fx_source = _s.fx_source
     WHERE id = _payment;
  ELSE
    INSERT INTO public.sponsorship_payments
      (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_ref,
       provider_checkout_id, provider_payment_id, provider_event_id, fee_amount, net_amount, paid_at,
       credited_amount, credited_currency, fx_pair, fx_rate, fx_as_of, fx_source)
    VALUES (_s.id, _s.sponsor_id, _amt, _cur, 'paid', _provider, _checkout_id,
            _checkout_id, _ref, _event_id, _fee, _amt - _fee, _at,
            _cred, _s.currency, _s.fx_pair, _s.fx_rate, _s.fx_as_of, _s.fx_source)
    RETURNING id INTO _payment;
  END IF;

  -- مبلغٌ غير المتّفق عليه يُقيَّد كما وصل، ويُرفع للمراجعة.
  IF _amt <> _exp_amt THEN
    INSERT INTO public.money_issues (kind, sponsorship_id, orphan_id, amount, currency, provider,
                                     provider_payment_id, provider_event_id, detail)
    VALUES ('amount_mismatch', _s.id, _s.orphan_id, _amt, _cur, _provider, _ref, _event_id,
            jsonb_build_object('expected_amount', _exp_amt, 'payment_id', _payment))
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.sponsorships
     SET status = 'active', provider = _provider,
         provider_subscription_id = COALESCE(_subscription_id, provider_subscription_id),
         started_at = COALESCE(started_at, _at), paused_until = NULL
   WHERE id = _s.id;

  PERFORM public.announce_payment(_s.id, true, _amt, _cur);
  RETURN jsonb_build_object('outcome', 'recorded', 'payment_id', _payment);
END $fn$;
