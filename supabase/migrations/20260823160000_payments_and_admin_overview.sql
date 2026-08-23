-- =====================================================================
-- المرحلة 3 — أساس الدفع، ولوحة الإدارة
-- =====================================================================
-- تُجهّز كل ما لا يعتمد على واجهة المزوّد: سجلّ أحداث موثوق، ومفاتيح
-- منع التكرار، وإعدادات المنصة، ودالة تجميع للوحة الإدارة.
--
-- لا شيء هنا يفترض شكل واجهة كريم؛ الحقول الخاصة بالمزوّد نصّية عامة،
-- والربط الفعلي معزول في src/lib/payments/careem.ts.
-- =====================================================================


-- =====================================================================
-- إعدادات المنصة — صفّ واحد
-- ---------------------------------------------------------------------
-- العملة ورسوم التشغيل كانتا قرارين معلّقين في خارطة الطريق. وجودهما
-- كإعداد منذ الآن يمنع نثر قيم ثابتة في الكود يصعب تغييرها لاحقاً.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  currency TEXT NOT NULL DEFAULT 'USD',
  -- نسبة رسوم التشغيل من كل دفعة. صفر حالياً بقرار المالك، وقابلة للتعديل.
  fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
  min_sponsorship NUMERIC(12,2) NOT NULL DEFAULT 5,
  max_sponsorship NUMERIC(12,2) NOT NULL DEFAULT 100000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

DROP POLICY IF EXISTS "settings_read" ON public.platform_settings;
CREATE POLICY "settings_read" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);
-- الكتابة عبر service_role فقط؛ لا سياسة كتابة عمداً.


-- =====================================================================
-- سجلّ أحداث المزوّد — مصدر الحقيقة ومنع التكرار
-- ---------------------------------------------------------------------
-- بوابات الدفع تُعيد إرسال الـwebhook عند أي شكّ في التسليم. بلا مفتاح
-- تفرّد، الدفعة الواحدة تُسجَّل مرّتين ويُحتسب تمويل غير موجود.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  -- معرّف الحدث لدى المزوّد. التفرّد عليه هو ما يجعل إعادة الإرسال آمنة.
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sponsorship_id UUID REFERENCES public.sponsorships(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.sponsorship_payments(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_events_sponsorship ON public.payment_events(sponsorship_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON public.payment_events(created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

DROP POLICY IF EXISTS "payment_events_admin_read" ON public.payment_events;
CREATE POLICY "payment_events_admin_read" ON public.payment_events
  FOR SELECT TO authenticated USING (public.is_admin());


-- =====================================================================
-- حقول المزوّد على سجلّ المدفوعات
-- =====================================================================
ALTER TABLE public.sponsorship_payments
  ADD COLUMN IF NOT EXISTS provider_checkout_id TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2);

-- مفتاح منع التكرار: محاولة دفع واحدة لكل (كفالة، فترة).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_idempotency
  ON public.sponsorship_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_sponsor ON public.sponsorship_payments(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.sponsorship_payments(status);
CREATE INDEX IF NOT EXISTS idx_disbursements_org ON public.disbursements(org_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_orphan ON public.disbursements(orphan_id);
CREATE INDEX IF NOT EXISTS idx_reports_org ON public.progress_reports(org_id);


-- =====================================================================
-- منع الكفالات المكرّرة (M5)
-- ---------------------------------------------------------------------
-- كافل واحد لا يفتح كفالتين جاريتين على نفس الملف؛ يعدّل القائمة بدلها.
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_sponsorship_active_per_sponsor
  ON public.sponsorships(sponsor_id, orphan_id)
  WHERE status IN ('pending_payment', 'active', 'paused');


-- =====================================================================
-- سجلّ التدقيق (M7) — يُكتب من الخادم
-- =====================================================================
CREATE OR REPLACE FUNCTION public.write_audit(
  _action TEXT, _entity TEXT, _entity_id UUID, _meta JSONB DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), _action, _entity, _entity_id, _meta);
END; $fn$;
REVOKE ALL ON FUNCTION public.write_audit(TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_audit(TEXT, TEXT, UUID, JSONB) TO authenticated;


-- =====================================================================
-- لوحة الإدارة — تجميع في استعلام واحد
-- ---------------------------------------------------------------------
-- تُرجع صورة النظام كاملة: الأيتام والكفلاء وكم كُفل وكم تبقّى.
-- SECURITY DEFINER لأنها تقرأ auth.users وتجمع عبر كل الجداول، وتفحص
-- الدور بنفسها في أول سطر فلا تتسرّب لغير الإدارة.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_overview: not authorised' USING ERRCODE = '42501';
  END IF;

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
        'disbursed', COALESCE((SELECT SUM(amount) FROM public.disbursements), 0),
        'balance', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0)
                 - COALESCE((SELECT SUM(amount) FROM public.disbursements), 0)
      )
    ),

    -- كل يتيم منشور: كم يحتاج، كم كُفل، كم تبقّى، وكم كافلاً
    'orphan_rows', (
      SELECT COALESCE(jsonb_agg(r ORDER BY r->>'gap' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', o.id, 'code', o.code, 'name', o.display_name,
          'city', o.city, 'status', o.status,
          'org', co.name,
          'need', o.monthly_need,
          'funded', o.funded_monthly,
          'gap', GREATEST(o.monthly_need - o.funded_monthly, 0),
          'sponsors', (SELECT count(*) FROM public.sponsorships s
                       WHERE s.orphan_id = o.id AND s.status IN ('active','paused'))
        ) AS r
        FROM public.orphans o
        LEFT JOIN public.care_organizations co ON co.id = o.org_id
        WHERE o.status IN ('approved','fully_sponsored')
      ) t
    ),

    -- كل كافل: كم يكفل، والتزامه الشهري، وما سدّده فعلاً
    'sponsor_rows', (
      SELECT COALESCE(jsonb_agg(r ORDER BY r->>'paid' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', u.id,
          'email', u.email,
          'name', p.full_name,
          'sponsorships', count(s.id),
          'active', count(s.id) FILTER (WHERE s.status = 'active'),
          'monthly', COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'active'), 0),
          'paid', COALESCE((SELECT SUM(sp.amount) FROM public.sponsorship_payments sp
                            WHERE sp.sponsor_id = u.id AND sp.status = 'paid'), 0),
          'since', min(s.created_at)
        ) AS r
        FROM public.sponsorships s
        JOIN auth.users u ON u.id = s.sponsor_id
        LEFT JOIN public.profiles p ON p.id = u.id
        GROUP BY u.id, u.email, p.full_name
      ) t
    ),

    'pending_orphans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'name', display_name, 'city', city,
        'region', region, 'need', monthly_need, 'status', status, 'created_at', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM public.orphans WHERE status IN ('submitted','under_review')
    ),

    'pending_orgs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'city', city, 'region', region,
        'license', license_number, 'email', contact_email, 'created_at', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM public.care_organizations WHERE status = 'pending'
    )
  ) INTO _out;

  RETURN _out;
END; $fn$;

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
