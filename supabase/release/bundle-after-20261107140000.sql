-- ملف نشر كهاتين — كل الهجرات بعد 20261107140000
-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: 2026-11-11T03:29Z
BEGIN;

-- >>> migration 20261108100000 sponsorship_lifecycle
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108100000') THEN
    RAISE EXCEPTION 'الهجرة 20261108100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة ٣أ — سلامة المال ودورة حياة الكفالة
-- ---------------------------------------------------------------------
--   APP-02 / PRD-10 / UX-02  كان الإلغاء تحديثاً مباشراً من العميل: فورياً،
--           بلا تأكيدٍ ولا سبب، لا تعلم به الجهة ولا الإدارة، ولا يُلغى
--           الاشتراك لدى المزوّد؛ ثم يأتي التجديد فيُعيد webhook الكفالة
--           «نشطة» دون أن يسأل.
--   UX-13   لا إيقاف ولا استئناف ولا تعديل مبلغ، والنصوص تَعِد بها.
--   APP-03 / ARC-03  قيد التحصيل كتاباتٌ متفرّقة لا يُفحص خطؤها.
--   APP-04  التحصيل يُقيَّد بأيّ عملةٍ وصل بها.
--   APP-07  الدفعة المعلّقة لا تصير مدفوعة (يُضاف قيدٌ بجانبها) ولا تنقضي.
--
-- الآن:
--   • الكافل يُلغي عبر `sponsor_cancel_sponsorship` بسببٍ اختياري: الطلب
--     المعلّق يُلغى فوراً، والجارية تبقى جاريةً حتى آخر المدّة المدفوعة
--     (`cancel_effective_at`) ثم تُنهى. الجهة والإدارة تُبلَّغان، والأثر
--     يُكتب، وإن كان لها اشتراكٌ لدى مزوّد صار «بانتظار الإلغاء لديه»
--     (`provider_cancel_state`) فيُلغيه الخادم ويسجّل النتيجة.
--   • التحديث المباشر لا يُنهي إلا طلباً «بانتظار الدفع» (لا مال فيه).
--   • `sponsor_pause_sponsorship` (شهر إلى ثلاثة) و`sponsor_resume_sponsorship`
--     و`sponsor_change_amount` — لكفالات التحويل اليدوي. اشتراك المزوّد لا
--     يُوقَف ولا يُعدَّل مبلغه في القاعدة وحدها: يُرفض بوضوح بدل وعدٍ لا يحدث.
--   • `record_provider_charge` معاملةٌ واحدة: الإعادة بلا أثر، والمعلّقة تصير
--     المدفوعة، والتحصيل على كفالةٍ منتهية أو بعملةٍ مخالفة لا يُقيَّد بل
--     يُرفع للإدارة في `money_issues` ويُطلب إلغاء الاشتراك فوراً.
--   • `apply_due_sponsorship_transitions` تُنفذ الإلغاء عند موعده وتستأنف
--     الموقوف عند انقضاء مدّته، و`expire_stale_checkouts` تُنهي جلسات الدفع
--     المهجورة — يشغّلهما المجدول عبر /api/payments/reconcile.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) حقول الدورة على الكفالة — يكتبها الخادم وحده
-- ---------------------------------------------------------------------
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS cancel_requested_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_effective_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason          TEXT,
  ADD COLUMN IF NOT EXISTS cancel_note            TEXT,
  ADD COLUMN IF NOT EXISTS end_reason             TEXT,
  ADD COLUMN IF NOT EXISTS paused_until           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_cancel_state  TEXT,
  ADD COLUMN IF NOT EXISTS provider_cancel_mode   TEXT,
  ADD COLUMN IF NOT EXISTS provider_cancel_error  TEXT,
  ADD COLUMN IF NOT EXISTS provider_cancel_attempts SMALLINT NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.sponsorships ADD CONSTRAINT sponsorships_cancel_reason_check
    CHECK (cancel_reason IS NULL OR cancel_reason IN
           ('financial', 'another_child', 'dissatisfied', 'temporary', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sponsorships ADD CONSTRAINT sponsorships_cancel_note_check
    CHECK (cancel_note IS NULL OR length(cancel_note) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sponsorships ADD CONSTRAINT sponsorships_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN
           ('sponsor_cancelled', 'child_exit', 'provider_cancelled', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sponsorships ADD CONSTRAINT sponsorships_provider_cancel_check
    CHECK ((provider_cancel_state IS NULL OR provider_cancel_state IN ('pending', 'done', 'failed'))
       AND (provider_cancel_mode IS NULL OR provider_cancel_mode IN ('scheduled', 'immediate')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sponsorships_cancel_due
  ON public.sponsorships (cancel_effective_at) WHERE cancel_effective_at IS NOT NULL
                                                  AND status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS idx_sponsorships_pause_due
  ON public.sponsorships (paused_until) WHERE paused_until IS NOT NULL AND status = 'paused';
CREATE INDEX IF NOT EXISTS idx_sponsorships_provider_cancel
  ON public.sponsorships (provider_cancel_state) WHERE provider_cancel_state IN ('pending', 'failed');


-- ---------------------------------------------------------------------
-- ٢) بنود المال للإدارة: ما لا يُقيَّد صامتاً
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.money_issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                TEXT NOT NULL CHECK (kind IN
                        ('charge_after_end', 'currency_mismatch', 'amount_mismatch',
                         'provider_cancel_failed', 'child_exit')),
  sponsorship_id      UUID REFERENCES public.sponsorships(id) ON DELETE SET NULL,
  orphan_id           UUID REFERENCES public.orphans(id) ON DELETE SET NULL,
  amount              NUMERIC(12,2),
  currency            TEXT,
  provider            TEXT,
  provider_payment_id TEXT,
  provider_event_id   TEXT,
  detail              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by         UUID,
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_money_issues_open ON public.money_issues (created_at) WHERE status = 'open';
-- معاملةٌ واحدة لدى المزوّد لا تفتح بندين (إعادة إرسال الحدث).
CREATE UNIQUE INDEX IF NOT EXISTS ux_money_issues_provider_payment
  ON public.money_issues (provider, provider_payment_id, kind) WHERE provider_payment_id IS NOT NULL;
ALTER TABLE public.money_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS money_issues_admin ON public.money_issues;
CREATE POLICY money_issues_admin ON public.money_issues FOR SELECT TO authenticated
  USING (public.is_admin());
REVOKE ALL ON TABLE public.money_issues FROM anon, authenticated;
GRANT SELECT ON TABLE public.money_issues TO authenticated;
GRANT ALL ON TABLE public.money_issues TO service_role;


-- ---------------------------------------------------------------------
-- ٣) الحارس: الكافل لا يُنهي بالتحديث المباشر إلا طلباً بلا مال
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_sponsorship_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id
     OR NEW.orphan_id IS DISTINCT FROM OLD.orphan_id THEN
    RAISE EXCEPTION 'sponsorship: sponsor_id and orphan_id are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'sponsorship: financial fields are server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_subscription_id IS DISTINCT FROM OLD.provider_subscription_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.next_charge_at IS DISTINCT FROM OLD.next_charge_at THEN
    RAISE EXCEPTION 'sponsorship: payment provider fields are server-managed'
      USING ERRCODE = '42501';
  END IF;

  -- حقول الدورة تُكتب من الدوالّ (الإلغاء، الإيقاف، المزوّد) لا من العميل.
  IF NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at
     OR NEW.cancel_effective_at IS DISTINCT FROM OLD.cancel_effective_at
     OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
     OR NEW.cancel_note IS DISTINCT FROM OLD.cancel_note
     OR NEW.end_reason IS DISTINCT FROM OLD.end_reason
     OR NEW.paused_until IS DISTINCT FROM OLD.paused_until
     OR NEW.provider_cancel_state IS DISTINCT FROM OLD.provider_cancel_state
     OR NEW.provider_cancel_mode IS DISTINCT FROM OLD.provider_cancel_mode
     OR NEW.provider_cancel_error IS DISTINCT FROM OLD.provider_cancel_error
     OR NEW.provider_cancel_attempts IS DISTINCT FROM OLD.provider_cancel_attempts THEN
    RAISE EXCEPTION 'sponsorship: lifecycle fields are server-managed'
      USING ERRCODE = '42501';
  END IF;

  -- الإلغاء المباشر لطلبٍ لم يُدفع بعد وحده. الكفالة الجارية تُلغى عبر
  -- sponsor_cancel_sponsorship: آخر المدّة المدفوعة، ومع إلغاء الاشتراك.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (NEW.status = 'cancelled' AND OLD.status = 'pending_payment') THEN
    RAISE EXCEPTION 'sponsorship: status transition is server-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_sponsorship_update() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٤) أدوات
-- ---------------------------------------------------------------------
/* آخر يومٍ تغطّيه الدفعات المدفوعة: نهاية فترةٍ مذكورة، وإلا شهرٌ من الدفع. */
CREATE OR REPLACE FUNCTION public.sponsorship_paid_through(_sponsorship UUID)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT max(COALESCE((p.period_end + 1)::timestamptz, COALESCE(p.paid_at, p.created_at) + interval '1 month'))
    FROM public.sponsorship_payments p
   WHERE p.sponsorship_id = _sponsorship AND p.status = 'paid';
$fn$;
REVOKE ALL ON FUNCTION public.sponsorship_paid_through(UUID) FROM PUBLIC, anon, authenticated;

/* جهة الرعاية والإدارة تعلمان بما يتغيّر في الكفالة. */
CREATE OR REPLACE FUNCTION public.notify_sponsorship_watchers(
  _sponsorship UUID, _title TEXT, _body TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _owner UUID; _admin UUID;
BEGIN
  SELECT c.owner_id INTO _owner
    FROM public.sponsorships s
    JOIN public.orphans o ON o.id = s.orphan_id
    JOIN public.care_organizations c ON c.id = o.org_id
   WHERE s.id = _sponsorship;
  IF _owner IS NOT NULL THEN
    PERFORM public.notify(_owner, 'other', _title, _body, '/org', 'sponsorship', _sponsorship);
  END IF;
  FOR _admin IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin'
                 AND user_id IS DISTINCT FROM _owner LOOP
    PERFORM public.notify(_admin, 'other', _title, _body, '/admin', 'sponsorship', _sponsorship);
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.notify_sponsorship_watchers(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sponsorship_child_name(_sponsorship UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(o.display_name, '') FROM public.sponsorships s
    JOIN public.orphans o ON o.id = s.orphan_id WHERE s.id = _sponsorship;
$fn$;
REVOKE ALL ON FUNCTION public.sponsorship_child_name(UUID) FROM PUBLIC, anon, authenticated;

/* الطلب المعلّق يُغلق ويتحرّر مفتاحه، فلا يُقرأ مالاً منتظَراً. */
CREATE OR REPLACE FUNCTION public.close_pending_payments(_sponsorship UUID, _reason TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.sponsorship_payments
     SET status = 'failed', failure_reason = _reason,
         idempotency_key = CASE WHEN idempotency_key IS NULL THEN NULL
                                ELSE idempotency_key || ':' || _reason || ':' || id END
   WHERE sponsorship_id = _sponsorship AND status = 'pending';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.close_pending_payments(UUID, TEXT) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٥) الكافل: الإلغاء والإيقاف والاستئناف وتعديل المبلغ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sponsor_cancel_sponsorship(
  _sponsorship UUID, _reason TEXT DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _s         public.sponsorships%ROWTYPE;
  _effective TIMESTAMPTZ;
  _immediate BOOLEAN;
  _provider  BOOLEAN;
  _name      TEXT;
  _note_c    TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF _reason IS NOT NULL AND _reason NOT IN ('financial', 'another_child', 'dissatisfied', 'temporary', 'other') THEN
    RAISE EXCEPTION 'sponsor_cancel: unknown reason %', _reason USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(_note_c, '')) > 500 THEN
    RAISE EXCEPTION 'sponsor_cancel: note too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _s FROM public.sponsorships
   WHERE id = _sponsorship AND sponsor_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sponsor_cancel: no such sponsorship' USING ERRCODE = 'P0002';
  END IF;
  IF _s.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'sponsor_cancel: already ended' USING ERRCODE = '55000';
  END IF;
  IF _s.cancel_effective_at IS NOT NULL THEN
    RAISE EXCEPTION 'sponsor_cancel: already scheduled' USING ERRCODE = '55000';
  END IF;

  _name := public.sponsorship_child_name(_sponsorship);
  _provider := _s.provider_subscription_id IS NOT NULL;

  IF _s.status = 'pending_payment' THEN
    _immediate := true;
    _effective := now();
  ELSE
    _effective := GREATEST(now(), COALESCE(public.sponsorship_paid_through(_sponsorship), now()));
    _immediate := _effective <= now();
  END IF;

  UPDATE public.sponsorships
     SET cancel_requested_at = now(), cancel_effective_at = _effective,
         cancel_reason = _reason, cancel_note = _note_c,
         status = CASE WHEN _immediate THEN 'cancelled'::public.sponsorship_status ELSE status END,
         ended_at = CASE WHEN _immediate THEN now() ELSE ended_at END,
         end_reason = CASE WHEN _immediate THEN 'sponsor_cancelled' ELSE end_reason END,
         paused_until = CASE WHEN _immediate THEN NULL ELSE paused_until END,
         provider_cancel_state = CASE WHEN _provider THEN 'pending' ELSE provider_cancel_state END,
         provider_cancel_mode = CASE WHEN _provider THEN
                                  (CASE WHEN _immediate THEN 'immediate' ELSE 'scheduled' END)
                                ELSE provider_cancel_mode END
   WHERE id = _sponsorship;

  IF _immediate THEN
    PERFORM public.close_pending_payments(_sponsorship, 'sponsorship_cancelled');
  END IF;

  PERFORM public.write_audit('sponsorship.cancel_requested', 'sponsorship', _sponsorship,
    jsonb_build_object('reason', _reason, 'note', _note_c, 'effective_at', _effective,
                       'immediate', _immediate, 'provider_cancel', _provider,
                       'from', _s.status));

  IF _s.status <> 'pending_payment' THEN
    PERFORM public.notify_sponsorship_watchers(_sponsorship,
      'كافلٌ أنهى كفالة ' || _name,
      'تنتهي الكفالة في ' || to_char(_effective AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        || ' بعد آخر شهرٍ مدفوع. ' || COALESCE('السبب: ' || (CASE _reason
             WHEN 'financial' THEN 'ظرفٌ مالي' WHEN 'another_child' THEN 'كفالة طفلٍ آخر'
             WHEN 'dissatisfied' THEN 'عدم رضا' WHEN 'temporary' THEN 'توقّفٌ مؤقّت'
             WHEN 'other' THEN 'آخر' END) || '.', ''));
    PERFORM public.notify(_s.sponsor_id, 'other',
      'سُجّل إنهاء كفالتك لـ' || _name,
      'تبقى الكفالة جاريةً حتى ' || to_char(_effective AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        || ' ثم تنتهي، ولا يُحصَّل منك شيءٌ بعدها.',
      '/dashboard', 'sponsorship', _sponsorship);
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN _immediate THEN 'cancelled' ELSE _s.status::text END,
                            'effective_at', _effective, 'immediate', _immediate,
                            'provider_cancel', _provider);
END $fn$;

CREATE OR REPLACE FUNCTION public.sponsor_pause_sponsorship(_sponsorship UUID, _months INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships%ROWTYPE; _until TIMESTAMPTZ; _name TEXT;
BEGIN
  IF _months IS NULL OR _months < 1 OR _months > 3 THEN
    RAISE EXCEPTION 'sponsor_pause: between one and three months' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _s FROM public.sponsorships
   WHERE id = _sponsorship AND sponsor_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sponsor_pause: no such sponsorship' USING ERRCODE = 'P0002';
  END IF;
  IF _s.status <> 'active' OR _s.cancel_effective_at IS NOT NULL THEN
    RAISE EXCEPTION 'sponsor_pause: only an ongoing sponsorship can pause (%)', _s.status
      USING ERRCODE = '55000';
  END IF;
  IF _s.provider_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'sponsor_pause: card subscriptions cannot be paused yet'
      USING ERRCODE = '0A000';
  END IF;

  -- الإيقاف يبدأ بعد ما دُفع: الشهر المدفوع يصل الطفلَ كاملاً.
  _until := GREATEST(now(), COALESCE(public.sponsorship_paid_through(_sponsorship), now()))
            + make_interval(months => _months);
  UPDATE public.sponsorships SET status = 'paused', paused_until = _until WHERE id = _sponsorship;

  _name := public.sponsorship_child_name(_sponsorship);
  PERFORM public.write_audit('sponsorship.paused', 'sponsorship', _sponsorship,
    jsonb_build_object('months', _months, 'until', _until));
  PERFORM public.notify_sponsorship_watchers(_sponsorship,
    'كفالة ' || _name || ' موقوفةٌ مؤقّتاً',
    'أوقف الكافل التحويل ' || _months || ' شهر/أشهر، وتُستأنف تلقائياً في '
      || to_char(_until AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '.');
  RETURN jsonb_build_object('status', 'paused', 'paused_until', _until);
END $fn$;

CREATE OR REPLACE FUNCTION public.sponsor_resume_sponsorship(_sponsorship UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships
   WHERE id = _sponsorship AND sponsor_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sponsor_resume: no such sponsorship' USING ERRCODE = 'P0002';
  END IF;
  -- إيقاف المزوّد (paused_until فارغ) لا يُرفع من هنا.
  IF _s.status <> 'paused' OR _s.paused_until IS NULL THEN
    RAISE EXCEPTION 'sponsor_resume: not paused by the sponsor' USING ERRCODE = '55000';
  END IF;
  UPDATE public.sponsorships SET status = 'active', paused_until = NULL WHERE id = _sponsorship;
  PERFORM public.write_audit('sponsorship.resumed', 'sponsorship', _sponsorship,
    jsonb_build_object('by', 'sponsor'));
  PERFORM public.notify_sponsorship_watchers(_sponsorship,
    'استُؤنفت كفالة ' || public.sponsorship_child_name(_sponsorship),
    'رفع الكافل الإيقاف المؤقّت.');
  RETURN jsonb_build_object('status', 'active');
END $fn$;

CREATE OR REPLACE FUNCTION public.sponsor_change_amount(_sponsorship UUID, _amount NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships%ROWTYPE; _min NUMERIC; _max NUMERIC;
BEGIN
  SELECT min_sponsorship, max_sponsorship INTO _min, _max FROM public.platform_settings WHERE id;
  IF _amount IS NULL OR _amount < COALESCE(_min, 5) OR _amount > COALESCE(_max, 100000)
     OR _amount <> round(_amount, 2) THEN
    RAISE EXCEPTION 'sponsor_change_amount: amount out of range' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _s FROM public.sponsorships
   WHERE id = _sponsorship AND sponsor_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sponsor_change_amount: no such sponsorship' USING ERRCODE = 'P0002';
  END IF;
  IF _s.status NOT IN ('pending_payment', 'active', 'paused') OR _s.cancel_effective_at IS NOT NULL THEN
    RAISE EXCEPTION 'sponsor_change_amount: sponsorship is ending' USING ERRCODE = '55000';
  END IF;
  IF _s.provider_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'sponsor_change_amount: card subscriptions cannot change amount yet'
      USING ERRCODE = '0A000';
  END IF;
  IF _amount = _s.amount THEN
    RETURN jsonb_build_object('amount', _amount, 'changed', false);
  END IF;

  UPDATE public.sponsorships SET amount = _amount WHERE id = _sponsorship;
  -- التحويل المنتظَر يُنتظر بالمبلغ الجديد.
  UPDATE public.sponsorship_payments SET amount = _amount
   WHERE sponsorship_id = _sponsorship AND status = 'pending'
     AND COALESCE(provider, 'manual') = 'manual';

  PERFORM public.write_audit('sponsorship.amount_changed', 'sponsorship', _sponsorship,
    jsonb_build_object('from', _s.amount, 'to', _amount, 'currency', _s.currency));
  IF _s.status <> 'pending_payment' THEN
    PERFORM public.notify_sponsorship_watchers(_sponsorship,
      'تغيّر مبلغ كفالة ' || public.sponsorship_child_name(_sponsorship),
      'من ' || _s.amount || ' إلى ' || _amount || ' ' || _s.currency || ' شهرياً، من التحويل القادم.');
  END IF;
  RETURN jsonb_build_object('amount', _amount, 'changed', true);
END $fn$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.sponsor_cancel_sponsorship(UUID, TEXT, TEXT) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.sponsor_pause_sponsorship(UUID, INTEGER) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.sponsor_resume_sponsorship(UUID) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.sponsor_change_amount(UUID, NUMERIC) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.sponsor_cancel_sponsorship(UUID, TEXT, TEXT) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.sponsor_pause_sponsorship(UUID, INTEGER) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.sponsor_resume_sponsorship(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.sponsor_change_amount(UUID, NUMERIC) TO authenticated;
END $$;


-- ---------------------------------------------------------------------
-- ٦) المزوّد (webhook بمفتاح الخدمة): قيدٌ ذرّيّ لكلّ حدث
-- ---------------------------------------------------------------------
/* هل انتهت الكفالة عند لحظةٍ ما: ملغاة، أو مكتملة، أو حلّ موعد إلغائها،
   أو خرج الطفل من البرنامج. */
CREATE OR REPLACE FUNCTION public.sponsorship_ended_at(_s public.sponsorships, _at TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT _s.status IN ('cancelled', 'completed')
      OR (_s.cancel_effective_at IS NOT NULL AND _at >= _s.cancel_effective_at)
      OR EXISTS (SELECT 1 FROM public.orphans o WHERE o.id = _s.orphan_id AND o.status = 'archived');
$fn$;
REVOKE ALL ON FUNCTION public.sponsorship_ended_at(public.sponsorships, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

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

  _amt := COALESCE(_amount, _s.amount);
  IF _cur = '' THEN _cur := _s.currency; END IF;
  _sub := COALESCE(_subscription_id, _s.provider_subscription_id);

  -- التحصيل على كفالةٍ منتهية أو بعملةٍ مخالفة لا يُقيَّد: يُرفع للإدارة.
  IF public.sponsorship_ended_at(_s, _at) THEN
    _kind := 'charge_after_end';
  ELSIF _cur <> _s.currency THEN
    _kind := 'currency_mismatch';
  END IF;

  IF _kind IS NOT NULL THEN
    INSERT INTO public.money_issues (kind, sponsorship_id, orphan_id, amount, currency, provider,
                                     provider_payment_id, provider_event_id, detail)
    VALUES (_kind, _s.id, _s.orphan_id, _amt, _cur, _provider, _ref, _event_id,
            jsonb_build_object('sponsorship_status', _s.status, 'expected_currency', _s.currency,
                               'expected_amount', _s.amount, 'subscription', _sub,
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
           fee_amount = _fee, net_amount = _amt - _fee, paid_at = _at
     WHERE id = _payment;
  ELSE
    INSERT INTO public.sponsorship_payments
      (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_ref,
       provider_checkout_id, provider_payment_id, provider_event_id, fee_amount, net_amount, paid_at)
    VALUES (_s.id, _s.sponsor_id, _amt, _cur, 'paid', _provider, _checkout_id,
            _checkout_id, _ref, _event_id, _fee, _amt - _fee, _at)
    RETURNING id INTO _payment;
  END IF;

  -- مبلغٌ غير المتّفق عليه يُقيَّد كما وصل، ويُرفع للمراجعة.
  IF _amt <> _s.amount THEN
    INSERT INTO public.money_issues (kind, sponsorship_id, orphan_id, amount, currency, provider,
                                     provider_payment_id, provider_event_id, detail)
    VALUES ('amount_mismatch', _s.id, _s.orphan_id, _amt, _cur, _provider, _ref, _event_id,
            jsonb_build_object('expected_amount', _s.amount, 'payment_id', _payment))
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

CREATE OR REPLACE FUNCTION public.record_provider_failure(
  _sponsorship UUID, _provider TEXT, _event_id TEXT, _payment_ref TEXT, _checkout_id TEXT,
  _amount NUMERIC, _currency TEXT, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships%ROWTYPE; _payment UUID; _amt NUMERIC; _cur TEXT;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_provider_failure: no sponsorship %', _sponsorship USING ERRCODE = 'P0002';
  END IF;
  IF _event_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sponsorship_payments
                                        WHERE provider = _provider AND provider_event_id = _event_id) THEN
    RETURN jsonb_build_object('outcome', 'replay');
  END IF;
  -- كفالةٌ انتهت: فشل تحصيلٍ عليها ليس خبراً للكافل.
  IF public.sponsorship_ended_at(_s, now()) THEN
    RETURN jsonb_build_object('outcome', 'ignored');
  END IF;
  _amt := COALESCE(_amount, _s.amount);
  _cur := COALESCE(NULLIF(upper(btrim(COALESCE(_currency, ''))), ''), _s.currency);
  INSERT INTO public.sponsorship_payments
    (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_ref,
     provider_payment_id, provider_event_id, failure_reason)
  VALUES (_s.id, _s.sponsor_id, _amt, _cur, 'failed', _provider, _checkout_id,
          _payment_ref, _event_id, _reason)
  RETURNING id INTO _payment;
  PERFORM public.announce_payment(_s.id, false, _amt, _cur);
  RETURN jsonb_build_object('outcome', 'recorded', 'payment_id', _payment);
END $fn$;

/* الردّ والمنازعة: يُطابَقان بمعاملة المزوّد ثم بالمرجع القديم. والردّ على
   تحصيلٍ مرفوض يُغلق بنده. */
CREATE OR REPLACE FUNCTION public.mark_provider_payment(
  _sponsorship UUID, _provider TEXT, _payment_ref TEXT, _checkout_id TEXT, _status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER := 0; _issues INTEGER := 0;
BEGIN
  IF _status NOT IN ('refunded', 'disputed') THEN
    RAISE EXCEPTION 'mark_provider_payment: unknown status %', _status USING ERRCODE = '22023';
  END IF;
  IF _payment_ref IS NOT NULL THEN
    UPDATE public.sponsorship_payments SET status = _status::public.payment_status
     WHERE sponsorship_id = _sponsorship AND provider_payment_id = _payment_ref;
    GET DIAGNOSTICS _n = ROW_COUNT;
  END IF;
  IF _n = 0 AND _checkout_id IS NOT NULL THEN
    UPDATE public.sponsorship_payments SET status = _status::public.payment_status
     WHERE sponsorship_id = _sponsorship AND provider_ref = _checkout_id;
    GET DIAGNOSTICS _n = ROW_COUNT;
  END IF;
  IF _status = 'refunded' AND _payment_ref IS NOT NULL THEN
    UPDATE public.money_issues
       SET status = 'resolved', resolved_at = now(),
           resolution_note = 'ردّ المزوّد المبلغ (حدث refund)'
     WHERE provider = _provider AND provider_payment_id = _payment_ref
       AND kind IN ('charge_after_end', 'currency_mismatch') AND status = 'open';
    GET DIAGNOSTICS _issues = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('payments', _n, 'issues_resolved', _issues);
END $fn$;

/* حال الاشتراك كما يعلنها المزوّد: انتهى، أو أُوقف. */
CREATE OR REPLACE FUNCTION public.record_provider_subscription_state(
  _sponsorship UUID, _state TEXT, _subscription_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_provider_subscription_state: no sponsorship %', _sponsorship
      USING ERRCODE = 'P0002';
  END IF;
  IF _state = 'cancelled' THEN
    UPDATE public.sponsorships
       SET status = CASE WHEN status IN ('cancelled', 'completed') THEN status
                         ELSE 'cancelled'::public.sponsorship_status END,
           ended_at = COALESCE(ended_at, now()),
           end_reason = COALESCE(end_reason, CASE WHEN cancel_requested_at IS NOT NULL
                                                  THEN 'sponsor_cancelled' ELSE 'provider_cancelled' END),
           paused_until = NULL,
           provider_cancel_state = CASE WHEN provider_cancel_state IS NOT NULL THEN 'done'
                                        ELSE provider_cancel_state END,
           provider_cancel_error = NULL
     WHERE id = _sponsorship;
  ELSIF _state = 'paused' THEN
    UPDATE public.sponsorships SET status = 'paused'
     WHERE id = _sponsorship AND status = 'active';
  ELSE
    RAISE EXCEPTION 'record_provider_subscription_state: unknown state %', _state USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('from', _s.status,
    'to', (SELECT status FROM public.sponsorships WHERE id = _sponsorship));
END $fn$;

/* ما ينتظر إلغاءً لدى المزوّد — يُلغيه الخادم (المحوّل) ثم يسجّل النتيجة. */
CREATE OR REPLACE FUNCTION public.provider_cancellations_due(_limit INTEGER DEFAULT 50)
RETURNS TABLE (sponsorship_id UUID, provider TEXT, provider_subscription_id TEXT, mode TEXT, attempts SMALLINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT s.id, s.provider, s.provider_subscription_id, COALESCE(s.provider_cancel_mode, 'immediate'),
         s.provider_cancel_attempts
    FROM public.sponsorships s
   WHERE s.provider_cancel_state IN ('pending', 'failed')
     AND s.provider_subscription_id IS NOT NULL
     AND s.provider_cancel_attempts < 20
   ORDER BY s.updated_at
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
$fn$;

CREATE OR REPLACE FUNCTION public.mark_provider_cancel_result(
  _sponsorship UUID, _ok BOOLEAN, _error TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF _ok THEN
    UPDATE public.sponsorships
       SET provider_cancel_state = 'done', provider_cancel_error = NULL
     WHERE id = _sponsorship;
    UPDATE public.money_issues SET status = 'resolved', resolved_at = now(),
           resolution_note = 'أُلغي الاشتراك لدى المزوّد'
     WHERE sponsorship_id = _sponsorship AND kind = 'provider_cancel_failed' AND status = 'open';
    PERFORM public.write_audit('sponsorship.provider_cancelled', 'sponsorship', _sponsorship,
      jsonb_build_object('subscription', _s.provider_subscription_id, 'mode', _s.provider_cancel_mode));
    RETURN;
  END IF;

  UPDATE public.sponsorships
     SET provider_cancel_state = 'failed', provider_cancel_error = left(COALESCE(_error, ''), 500),
         provider_cancel_attempts = provider_cancel_attempts + 1
   WHERE id = _sponsorship;
  -- فشلٌ متكرّر يصير قراراً بشرياً: الإلغاء من لوحة المزوّد يدوياً.
  IF _s.provider_cancel_attempts + 1 >= 3
     AND NOT EXISTS (SELECT 1 FROM public.money_issues WHERE sponsorship_id = _sponsorship
                        AND kind = 'provider_cancel_failed' AND status = 'open') THEN
    INSERT INTO public.money_issues (kind, sponsorship_id, orphan_id, provider, detail)
    VALUES ('provider_cancel_failed', _sponsorship, _s.orphan_id, _s.provider,
            jsonb_build_object('subscription', _s.provider_subscription_id, 'error', left(COALESCE(_error, ''), 500)));
  END IF;
END $fn$;

/* انتقالاتٌ يحين موعدها: إلغاءٌ مجدول، وإيقافٌ انقضى. */
CREATE OR REPLACE FUNCTION public.apply_due_sponsorship_transitions()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r RECORD; _cancelled INTEGER := 0; _resumed INTEGER := 0;
BEGIN
  FOR _r IN SELECT id, sponsor_id, cancel_effective_at FROM public.sponsorships
             WHERE status IN ('active', 'paused') AND cancel_effective_at IS NOT NULL
               AND cancel_effective_at <= now()
             FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.sponsorships
       SET status = 'cancelled', ended_at = _r.cancel_effective_at,
           end_reason = COALESCE(end_reason, 'sponsor_cancelled'), paused_until = NULL
     WHERE id = _r.id;
    PERFORM public.close_pending_payments(_r.id, 'sponsorship_cancelled');
    PERFORM public.notify(_r.sponsor_id, 'other',
      'انتهت كفالتك لـ' || public.sponsorship_child_name(_r.id),
      'انتهت الكفالة كما طلبت بعد آخر شهرٍ مدفوع. شكراً لما قدّمت.',
      '/dashboard', 'sponsorship', _r.id);
    _cancelled := _cancelled + 1;
  END LOOP;

  FOR _r IN SELECT id, sponsor_id FROM public.sponsorships
             WHERE status = 'paused' AND paused_until IS NOT NULL AND paused_until <= now()
             FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.sponsorships SET status = 'active', paused_until = NULL WHERE id = _r.id;
    PERFORM public.notify(_r.sponsor_id, 'other',
      'استُؤنفت كفالتك لـ' || public.sponsorship_child_name(_r.id),
      'انتهت مدّة الإيقاف المؤقّت، وعادت الكفالة جارية.',
      '/dashboard', 'sponsorship', _r.id);
    _resumed := _resumed + 1;
  END LOOP;

  RETURN jsonb_build_object('cancelled', _cancelled, 'resumed', _resumed);
END $fn$;

/* جلسة دفعٍ إلكتروني مهجورة: تُنهى ويتحرّر مفتاحها. التحويل اليدوي المنتظَر
   ليس مهجوراً — ينتظر مطابقة الإدارة. */
CREATE OR REPLACE FUNCTION public.expire_stale_checkouts(_older_than INTERVAL DEFAULT interval '24 hours')
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.sponsorship_payments
     SET status = 'failed', failure_reason = 'checkout_expired',
         idempotency_key = CASE WHEN idempotency_key IS NULL THEN NULL
                                ELSE idempotency_key || ':expired:' || id END
   WHERE status = 'pending' AND COALESCE(provider, 'manual') <> 'manual'
     AND created_at < now() - GREATEST(COALESCE(_older_than, interval '24 hours'), interval '1 hour');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.record_provider_charge(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.record_provider_failure(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.mark_provider_payment(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.record_provider_subscription_state(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.provider_cancellations_due(INTEGER) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.mark_provider_cancel_result(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.apply_due_sponsorship_transitions() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.expire_stale_checkouts(INTERVAL) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_provider_charge(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ) TO service_role;
  GRANT EXECUTE ON FUNCTION public.record_provider_failure(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.mark_provider_payment(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.record_provider_subscription_state(UUID, TEXT, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.provider_cancellations_due(INTEGER) TO service_role;
  GRANT EXECUTE ON FUNCTION public.mark_provider_cancel_result(UUID, BOOLEAN, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.apply_due_sponsorship_transitions() TO service_role;
  GRANT EXECUTE ON FUNCTION public.expire_stale_checkouts(INTERVAL) TO service_role;
END $$;


-- ---------------------------------------------------------------------
-- ٧) الإدارة تُغلق البند بملاحظة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_money_issue(_issue UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _i public.money_issues%ROWTYPE; _n TEXT := btrim(COALESCE(_note, ''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF length(_n) < 3 OR length(_n) > 1000 THEN
    RAISE EXCEPTION 'admin_resolve_money_issue: a note says what was done' USING ERRCODE = '22023';
  END IF;
  UPDATE public.money_issues
     SET status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_note = _n
   WHERE id = _issue AND status = 'open'
  RETURNING * INTO _i;
  IF _i.id IS NULL THEN
    RAISE EXCEPTION 'admin_resolve_money_issue: no open issue' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit('money_issue.resolved', 'money_issue', _issue,
    jsonb_build_object('kind', _i.kind, 'sponsorship', _i.sponsorship_id, 'note', _n));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_resolve_money_issue(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_money_issue(UUID, TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108100000', 'sponsorship_lifecycle');

-- >>> migration 20261108110000 child_exit_stops_money
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108110000') THEN
    RAISE EXCEPTION 'الهجرة 20261108110000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة ٣أ — خروج الطفل يوقف المال (GAP-05)
-- ---------------------------------------------------------------------
-- كانت أرشفة الطفل (تخرّجٌ، بلوغ سنّ البرنامج، عودةٌ إلى أسرته، انتقال،
-- وفاة) تترك كفالاته «نشطة»: التمويل يبقى محسوباً، والتجديد لدى المزوّد
-- يُقبل ويُعيد الكفالة، والكافل لا يُخبَر.
--
-- الآن:
--   • سببٌ مُهيكل للخروج على الطفل (`exit_reason`, `exit_note`, `exited_at`).
--     طلب الأرشفة على المقفول يحمله في `patch`، ويُرفض بدونه؛ والإدارة
--     تُخرج غير المقفول بـ`admin_archive_child`.
--   • عند الأرشفة: الكفالات الجارية تكتمل (`completed`) والمعلّقة تُلغى،
--     بسبب `child_exit`، ودفعاتها المعلّقة تُغلق، واشتراكاتها لدى المزوّد
--     تُطلب إلغاؤها فوراً. التحصيل اللاحق مرفوضٌ في record_provider_charge.
--   • إشعاران للكافل: الأول فوراً بالسبب (بلا مطالبة)، والثاني بعد مهلة —
--     ثلاثة أيام، وأربعة عشر عند الوفاة — يعرض طفلاً ينتظر بالعملة نفسها
--     من `suggest_orphans_for_amount`. يرسله المجدول (`send_due_exit_followups`).
--   • بندٌ في صندوق القرارات (`money_issue` / `child_exit`) بما أُنهي.
-- =====================================================================

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS exit_reason TEXT,
  ADD COLUMN IF NOT EXISTS exit_note   TEXT,
  ADD COLUMN IF NOT EXISTS exited_at   TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.orphans ADD CONSTRAINT orphans_exit_reason_check
    CHECK (exit_reason IS NULL OR exit_reason IN
           ('graduated', 'aged_out', 'returned_to_family', 'transferred', 'deceased', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orphans ADD CONSTRAINT orphans_exit_note_check
    CHECK (exit_note IS NULL OR length(exit_note) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.child_exit_reasons()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['graduated', 'aged_out', 'returned_to_family', 'transferred', 'deceased', 'other'];
$fn$;

/* جملة السبب كما تُقال للكافل. */
CREATE OR REPLACE FUNCTION public.child_exit_sentence(_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _reason
    WHEN 'graduated' THEN 'أتمّ مرحلته وتخرّج من البرنامج'
    WHEN 'aged_out' THEN 'بلغ السنّ التي ينتهي عندها البرنامج'
    WHEN 'returned_to_family' THEN 'عاد إلى رعاية أسرته'
    WHEN 'transferred' THEN 'انتقل إلى رعاية جهةٍ أخرى'
    WHEN 'deceased' THEN 'ببالغ الحزن نُعلمك أنه توفّي، رحمه الله'
    ELSE 'انتهت رعايته في البرنامج' END;
$fn$;

CREATE OR REPLACE FUNCTION public.child_exit_label(_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _reason
    WHEN 'graduated' THEN 'تخرّج' WHEN 'aged_out' THEN 'بلغ سنّ الخروج'
    WHEN 'returned_to_family' THEN 'عاد إلى أسرته' WHEN 'transferred' THEN 'انتقل إلى جهةٍ أخرى'
    WHEN 'deceased' THEN 'وفاة' ELSE 'سببٌ آخر' END;
$fn$;


-- ---------------------------------------------------------------------
-- ١) طلب الأرشفة يحمل السبب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_archive_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.op = 'archive' THEN
    IF NOT (COALESCE(NEW.patch->>'exit_reason', '') = ANY (public.child_exit_reasons())) THEN
      RAISE EXCEPTION 'archive_needs_exit_reason' USING ERRCODE = '22023',
        HINT = 'graduated | aged_out | returned_to_family | transferred | deceased | other';
    END IF;
    IF length(COALESCE(NEW.patch->>'exit_note', '')) > 500
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.patch) k WHERE k NOT IN ('exit_reason', 'exit_note')) THEN
      RAISE EXCEPTION 'archive_patch_invalid' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS guard_archive_request ON public.unlock_requests;
CREATE TRIGGER guard_archive_request BEFORE INSERT ON public.unlock_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_archive_request();


-- ---------------------------------------------------------------------
-- ٢) لحظة الخروج: السبب يُختم، وحقوله لا تُكتب من العميل
-- ---------------------------------------------------------------------
-- ليست DEFINER: الحارس يحتاج current_user الحقيقي ليميّز العميل. والأرشفة
-- نفسها تمرّ من دوالّ الإدارة (DEFINER) فتقرأ الطلب المعتمد.
CREATE OR REPLACE FUNCTION public.stamp_child_exit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _patch JSONB;
BEGIN
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
    -- الأرشفة بطلبٍ معتمد: السبب في الطلب نفسه.
    IF NULLIF(current_setting('kahatayn.unlock', true), '') IS NOT NULL THEN
      SELECT r.patch INTO _patch FROM public.unlock_requests r
       WHERE r.id::text = current_setting('kahatayn.unlock', true)
         AND r.orphan_id = NEW.id AND r.op = 'archive';
    END IF;
    NEW.exit_reason := COALESCE(NEW.exit_reason, _patch->>'exit_reason', 'other');
    NEW.exit_note := COALESCE(NEW.exit_note, NULLIF(btrim(COALESCE(_patch->>'exit_note', '')), ''));
    NEW.exited_at := now();
    RETURN NEW;
  END IF;

  IF (NEW.exit_reason IS DISTINCT FROM OLD.exit_reason
      OR NEW.exit_note IS DISTINCT FROM OLD.exit_note
      OR NEW.exited_at IS DISTINCT FROM OLD.exited_at)
     AND current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'orphan: the exit is recorded by the administration' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_stamp_child_exit ON public.orphans;
CREATE TRIGGER trg_stamp_child_exit BEFORE UPDATE ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_exit();
REVOKE ALL ON FUNCTION public.stamp_child_exit() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٣) الخروج يُنهي الكفالات ويوقف المال
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_exit_followups (
  sponsorship_id   UUID PRIMARY KEY REFERENCES public.sponsorships(id) ON DELETE CASCADE,
  sponsor_id       UUID NOT NULL,
  orphan_id        UUID,
  amount           NUMERIC(12,2) NOT NULL,
  currency         TEXT NOT NULL,
  due_at           TIMESTAMPTZ NOT NULL,
  sent_at          TIMESTAMPTZ,
  suggested_orphan UUID
);
CREATE INDEX IF NOT EXISTS idx_exit_followups_due ON public.sponsor_exit_followups (due_at) WHERE sent_at IS NULL;
ALTER TABLE public.sponsor_exit_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sponsor_exit_followups FROM anon, authenticated;
GRANT ALL ON TABLE public.sponsor_exit_followups TO service_role;

CREATE OR REPLACE FUNCTION public.end_sponsorships_on_child_exit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _s        RECORD;
  _ended    INTEGER := 0;
  _live     INTEGER := 0;
  _sentence TEXT := public.child_exit_sentence(NEW.exit_reason);
  _delay    INTERVAL := CASE WHEN NEW.exit_reason = 'deceased' THEN interval '14 days' ELSE interval '3 days' END;
BEGIN
  FOR _s IN SELECT * FROM public.sponsorships
             WHERE orphan_id = NEW.id AND status IN ('pending_payment', 'active', 'paused')
             FOR UPDATE LOOP
    UPDATE public.sponsorships
       SET status = CASE WHEN _s.status = 'pending_payment' THEN 'cancelled'::public.sponsorship_status
                         ELSE 'completed'::public.sponsorship_status END,
           ended_at = now(), end_reason = 'child_exit', paused_until = NULL,
           provider_cancel_state = CASE WHEN _s.provider_subscription_id IS NOT NULL THEN 'pending'
                                        ELSE provider_cancel_state END,
           provider_cancel_mode = CASE WHEN _s.provider_subscription_id IS NOT NULL THEN 'immediate'
                                       ELSE provider_cancel_mode END
     WHERE id = _s.id;
    PERFORM public.close_pending_payments(_s.id, 'child_exit');
    _ended := _ended + 1;

    IF _s.status = 'pending_payment' THEN
      PERFORM public.notify(_s.sponsor_id, 'other',
        'أُغلق طلب كفالتك لـ' || NEW.display_name,
        _sentence || '. أُغلق الطلب ولن يُطلب منك أي دفع.',
        '/dashboard', 'sponsorship', _s.id);
    ELSE
      _live := _live + 1;
      PERFORM public.notify(_s.sponsor_id, 'other',
        'انتهت كفالتك لـ' || NEW.display_name,
        _sentence || '. انتهت الكفالة اليوم ولن يُحصَّل منك شيءٌ بعده. شكراً لأنك كنت معه في رحلته.',
        '/dashboard', 'sponsorship', _s.id);
      INSERT INTO public.sponsor_exit_followups (sponsorship_id, sponsor_id, orphan_id, amount, currency, due_at)
      VALUES (_s.id, _s.sponsor_id, NEW.id, _s.amount, _s.currency, now() + _delay)
      ON CONFLICT (sponsorship_id) DO NOTHING;
    END IF;
  END LOOP;

  IF _ended > 0 THEN
    INSERT INTO public.money_issues (kind, orphan_id, detail)
    VALUES ('child_exit', NEW.id, jsonb_build_object('reason', NEW.exit_reason, 'note', NEW.exit_note,
                                                     'ended', _ended, 'live', _live));
  END IF;
  PERFORM public.log_integrity('child_exit', NEW.id,
    jsonb_build_object('reason', NEW.exit_reason, 'sponsorships_ended', _ended));
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS trg_end_sponsorships_on_child_exit ON public.orphans;
CREATE TRIGGER trg_end_sponsorships_on_child_exit AFTER UPDATE OF status ON public.orphans
  FOR EACH ROW WHEN (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.end_sponsorships_on_child_exit();
REVOKE ALL ON FUNCTION public.end_sponsorships_on_child_exit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_archive_request() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٤) الإشعار الثاني: طفلٌ ينتظر، بالعملة نفسها
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_due_exit_followups()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _f RECORD; _c RECORD; _n INTEGER := 0;
BEGIN
  FOR _f IN SELECT * FROM public.sponsor_exit_followups
             WHERE sent_at IS NULL AND due_at <= now()
             ORDER BY due_at FOR UPDATE SKIP LOCKED LOOP
    SELECT s.id, s.display_name, s.gap, s.currency INTO _c
      FROM public.suggest_orphans_for_amount(_f.amount, _f.orphan_id, 10) s
     WHERE s.currency = _f.currency
       AND NOT EXISTS (SELECT 1 FROM public.sponsorships x
                        WHERE x.orphan_id = s.id AND x.sponsor_id = _f.sponsor_id
                          AND x.status IN ('pending_payment', 'active', 'paused'))
     LIMIT 1;

    IF _c.id IS NOT NULL THEN
      PERFORM public.notify(_f.sponsor_id, 'other',
        'طفلٌ ينتظر كافلاً',
        'إن أردت أن يستمرّ عطاؤك: ' || _c.display_name || ' ينتظر من يكفله، والمتبقّي من احتياجه الشهري '
          || trim(to_char(_c.gap, 'FM999999990.##')) || ' ' || _c.currency
          || '. لا التزام عليك؛ اختر متى شئت.',
        '/orphans/' || _c.id, 'orphan', _c.id);
    ELSE
      PERFORM public.notify(_f.sponsor_id, 'other',
        'أطفالٌ ينتظرون كافلاً',
        'إن أردت أن يستمرّ عطاؤك، في الدليل ملفاتٌ معتمدة تنتظر. لا التزام عليك؛ اختر متى شئت.',
        '/orphans', NULL, NULL);
    END IF;
    UPDATE public.sponsor_exit_followups SET sent_at = now(), suggested_orphan = _c.id
     WHERE sponsorship_id = _f.sponsorship_id;
    _n := _n + 1;
    _c := NULL;
  END LOOP;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.send_due_exit_followups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_due_exit_followups() TO service_role;


-- ---------------------------------------------------------------------
-- ٥) إخراج طفلٍ غير مقفول — للإدارة، بسبب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_archive_child(_orphan UUID, _reason TEXT, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o public.orphans%ROWTYPE; _n TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NOT (COALESCE(_reason, '') = ANY (public.child_exit_reasons())) THEN
    RAISE EXCEPTION 'admin_archive_child: unknown exit reason %', _reason USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(_n, '')) > 500 THEN
    RAISE EXCEPTION 'admin_archive_child: note too long' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _orphan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_archive_child: no orphan' USING ERRCODE = 'P0002'; END IF;
  IF _o.status = 'archived' THEN RAISE EXCEPTION 'admin_archive_child: already archived' USING ERRCODE = '55000'; END IF;
  -- المقفول (مكفولٌ أو مدعوم) يُخرَج بطلبٍ بموافقتين، لا من هنا.
  IF public.orphan_is_locked(_orphan) THEN
    RAISE EXCEPTION 'orphan_locked' USING ERRCODE = '42501',
      HINT = 'طفلٌ مكفول يُخرَج بطلب أرشفةٍ رسمي يحمل السبب.';
  END IF;
  UPDATE public.orphans SET status = 'archived', exit_reason = _reason, exit_note = _n WHERE id = _orphan;
  PERFORM public.write_audit('orphan.exited', 'orphan', _orphan,
    jsonb_build_object('reason', _reason, 'note', _n, 'from', _o.status));
  RETURN jsonb_build_object('ok', true);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_archive_child(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_child(UUID, TEXT, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٦) صندوق القرارات: بنود المال (منها خروج الطفل)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'orphan_edit', o.id, o.display_name,
               'تعديلٌ على ملفٍّ منشور · ' || o.code,
               COALESCE(pe.updated_at,
                        (SELECT min(n.created_at) FROM public.orphan_needs n
                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
          FROM public.orphans o
          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
         WHERE o.status IN ('approved', 'fully_sponsored')
           AND (pe.orphan_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.orphan_needs n
                            WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'transfer', s.id, o.display_name,
               'تحويل بنكي · ' || s.amount::text || ' ' || s.currency
                 || ' · مرجع ' || upper(left(s.id::text, 8)),
               s.created_at
          FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.status = 'pending_payment' AND public.awaits_manual_transfer(s.id)
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'circle_role', r.id, o.display_name,
               'دورٌ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, ''),
               r.assigned_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'pending' AND r.ended_at IS NULL
        UNION ALL
        SELECT 'circle_role_renewal', r.id, o.display_name,
               'تجديد دورٍ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, '')
                 || CASE WHEN r.expires_at <= now() THEN ' · انقضى' ELSE ' · ينقضي قريباً' END,
               r.expires_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'approved' AND r.ended_at IS NULL AND r.person_id IS NOT NULL
           AND r.expires_at < now() + public.circle_role_renewal_window()
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
        UNION ALL
        SELECT 'unlock', r.id, o.display_name,
               'طلب فكّ · ' || r.op || ' · ' || cardinality(r.approvals) || '/' || public.unlock_quorum(),
               r.created_at
          FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'pending' AND r.requested_by <> auth.uid() AND auth.uid() <> ALL (r.approvals)
        UNION ALL
        SELECT 'discrepancy', d.id, o.display_name, 'اختلافٌ من ' || COALESCE(d.source, 'المصدر'), d.created_at
          FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open'
        UNION ALL
        -- بنود المال: ما لم يُقيَّد صامتاً، وخروج طفلٍ وما أنهاه من كفالات.
        SELECT 'money_issue', m.id, COALESCE(o.display_name, 'دفعة'),
               CASE m.kind
                 WHEN 'child_exit' THEN 'خروج طفل · ' || public.child_exit_label(m.detail->>'reason')
                   || ' · أُنهيت ' || COALESCE(m.detail->>'ended', '0') || ' كفالة — تحقّق من إيقاف التحصيل'
                 WHEN 'charge_after_end' THEN 'تحصيلٌ بعد انتهاء الكفالة · '
                   || COALESCE(m.amount::text || ' ' || m.currency, '') || ' — يُردّ للكافل'
                 WHEN 'currency_mismatch' THEN 'تحصيلٌ بعملةٍ مخالفة · '
                   || COALESCE(m.amount::text || ' ' || m.currency, '') || ' بدل ' || COALESCE(m.detail->>'expected_currency', '')
                 WHEN 'amount_mismatch' THEN 'مبلغٌ غير المتّفق عليه · '
                   || COALESCE(m.amount::text || ' ' || m.currency, '') || ' بدل ' || COALESCE(m.detail->>'expected_amount', '')
                 ELSE 'تعذّر إلغاء الاشتراك لدى المزوّد — أُلغِه من لوحته'
               END,
               m.created_at
          FROM public.money_issues m LEFT JOIN public.orphans o ON o.id = m.orphan_id
         WHERE m.status = 'open'
      ) i), '[]'::jsonb);
END $fn$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108110000', 'child_exit_stops_money');

-- >>> migration 20261108120000 currency_totals
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261108120000') THEN
    RAISE EXCEPTION 'الهجرة 20261108120000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261108120000', 'currency_totals');

COMMIT;
