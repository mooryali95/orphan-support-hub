-- =====================================================================
-- الدفعة ٢ — عمليات الإدارة: مطابقة التحويل قبل التفعيل، وقوائم تتّسع، وتصدير
-- ---------------------------------------------------------------------
--   UX-15   تفعيل كفالة التحويل البنكي ضغطةٌ واحدة بلا مبلغٍ مستلَم ولا تاريخ
--           قيدٍ ولا مرجعٍ بنكي ولا اسم كافل؛ والتحويلات المعلّقة غائبة عن
--           صندوق القرارات. وكان التأكيد يمرّ بمفتاح الخدمة من الخادم: لا
--           أثر في audit_log لمن أكّد ولا بماذا.
--   PRD-13  `admin_overview` يُعيد كلّ يتيمٍ منشور وكلّ كافلٍ ببريده في كتلةٍ
--           واحدة بلا حدّ، والجدول يرسمها كلّها؛ ولا تصدير.
--
-- الآن:
--   • `confirm_manual_transfer` (DEFINER، للإدارة): لا تفعيل بلا المبلغ
--     المستلَم وعملته وتاريخ القيد والمرجع البنكي. العملة المخالفة تُرفض،
--     والمبلغ المخالف لا يمرّ إلا بإقرارٍ صريحٍ وملاحظة. المرجع لا يُستعمل
--     مرّتين. الدفعة المعلّقة نفسها تصير مدفوعة (لا قيدٌ ثانٍ بجانبها)،
--     والمطابقة تُحفظ في `manual_transfer_reconciliations`، والأثر في
--     audit_log، والكافل يُبلَّغ.
--   • التحويلات المعلّقة في صندوق القرارات (`transfer`) بسياقها: الكافل
--     واسمه وبريده، والمبلغ المتوقَّع، والمرجع.
--   • `admin_overview` بتوقيعه: أوّل ١٠٠ صفّ من كلّ قائمة (مرتّبةً بالأرقام لا
--     بالنصّ) ومعها العدد الكلّي؛ و`admin_list` للتصفّح والبحث؛ و`admin_export`
--     لملفّات CSV — بلا بيانات الطفل السرّية، ومسجَّلاً في الأثر.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.manual_transfer_reconciliations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id   UUID NOT NULL REFERENCES public.sponsorships(id) ON DELETE RESTRICT,
  payment_id       UUID NOT NULL REFERENCES public.sponsorship_payments(id) ON DELETE RESTRICT,
  expected_amount  NUMERIC(12,2) NOT NULL,
  received_amount  NUMERIC(12,2) NOT NULL CHECK (received_amount > 0),
  currency         TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  value_date       DATE NOT NULL,
  bank_reference   TEXT NOT NULL CHECK (length(btrim(bank_reference)) BETWEEN 3 AND 120),
  amount_mismatch  BOOLEAN NOT NULL,
  note             TEXT,
  confirmed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_manual_transfer_bank_reference
  ON public.manual_transfer_reconciliations (lower(btrim(bank_reference)));
CREATE INDEX IF NOT EXISTS idx_manual_transfer_sponsorship
  ON public.manual_transfer_reconciliations (sponsorship_id);
ALTER TABLE public.manual_transfer_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_transfer_reconciliations FROM anon, authenticated;
GRANT ALL ON TABLE public.manual_transfer_reconciliations TO service_role;

/* كفالةٌ تنتظر تحويلاً يدوياً: لم تبدأ عند مزوّدٍ إلكتروني. */
CREATE OR REPLACE FUNCTION public.awaits_manual_transfer(_sponsorship UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.sponsorships s
                  WHERE s.id = _sponsorship AND s.status = 'pending_payment')
     AND NOT EXISTS (SELECT 1 FROM public.sponsorship_payments p
                      WHERE p.sponsorship_id = _sponsorship
                        AND COALESCE(p.provider, 'manual') <> 'manual');
$fn$;
REVOKE ALL ON FUNCTION public.awaits_manual_transfer(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_manual_transfer(
  _sponsorship UUID, _received_amount NUMERIC, _currency TEXT, _value_date DATE,
  _bank_reference TEXT, _accept_mismatch BOOLEAN DEFAULT false, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _s        public.sponsorships%ROWTYPE;
  _cur      TEXT := upper(btrim(COALESCE(_currency, '')));
  _ref      TEXT := btrim(COALESCE(_bank_reference, ''));
  _mismatch BOOLEAN;
  _fee_pct  NUMERIC;
  _fee      NUMERIC(12,2);
  _payment  UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'confirm_manual_transfer: not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'confirm_manual_transfer: no sponsorship %', _sponsorship USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.awaits_manual_transfer(_sponsorship) THEN
    RAISE EXCEPTION 'confirm_manual_transfer: sponsorship is not awaiting a bank transfer (%)', _s.status
      USING ERRCODE = '55000';
  END IF;

  -- لا تفعيل بلا ما وصل فعلاً: المبلغ وعملته وتاريخ القيد والمرجع.
  IF _received_amount IS NULL OR _received_amount <= 0 THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the received amount is required' USING ERRCODE = '22023';
  END IF;
  IF _cur !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the received currency is required' USING ERRCODE = '22023';
  END IF;
  IF _value_date IS NULL OR _value_date > current_date
     OR _value_date < (_s.created_at AT TIME ZONE 'UTC')::date - 7 THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the value date must fall between the pledge and today'
      USING ERRCODE = '22023';
  END IF;
  IF length(_ref) < 3 THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the bank reference is required' USING ERRCODE = '22023';
  END IF;
  -- عملةٌ أخرى ليست «فرقاً»: هي تحويلٌ لا يُقيَّد على هذه الكفالة.
  IF _cur <> _s.currency THEN
    RAISE EXCEPTION 'confirm_manual_transfer: received % but the sponsorship is in %', _cur, _s.currency
      USING ERRCODE = '22023';
  END IF;
  _mismatch := _received_amount <> _s.amount;
  IF _mismatch AND (NOT COALESCE(_accept_mismatch, false) OR length(btrim(COALESCE(_note, ''))) < 3) THEN
    RAISE EXCEPTION 'confirm_manual_transfer: received % but expected % — confirm the difference with a note',
      _received_amount, _s.amount USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.manual_transfer_reconciliations
              WHERE lower(btrim(bank_reference)) = lower(_ref)) THEN
    RAISE EXCEPTION 'confirm_manual_transfer: bank reference % is already reconciled', _ref
      USING ERRCODE = '23505';
  END IF;

  SELECT fee_percent INTO _fee_pct FROM public.platform_settings WHERE id;
  _fee := round(_received_amount * COALESCE(_fee_pct, 0) / 100, 2);

  -- الدفعة المعلّقة التي أنشأها «ادفع بتحويل» تصير هي المدفوعة.
  SELECT id INTO _payment FROM public.sponsorship_payments
   WHERE sponsorship_id = _sponsorship AND status = 'pending'
     AND COALESCE(provider, 'manual') = 'manual'
   ORDER BY created_at DESC LIMIT 1;

  IF _payment IS NOT NULL THEN
    UPDATE public.sponsorship_payments
       SET status = 'paid', amount = _received_amount, currency = _cur, provider = 'manual',
           provider_ref = _ref, fee_amount = _fee, net_amount = _received_amount - _fee,
           paid_at = _value_date::timestamptz
     WHERE id = _payment;
  ELSE
    INSERT INTO public.sponsorship_payments
      (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_ref,
       fee_amount, net_amount, paid_at)
    VALUES (_sponsorship, _s.sponsor_id, _received_amount, _cur, 'paid', 'manual', _ref,
            _fee, _received_amount - _fee, _value_date::timestamptz)
    RETURNING id INTO _payment;
  END IF;

  UPDATE public.sponsorships
     SET status = 'active', provider = 'manual', started_at = _value_date::timestamptz
   WHERE id = _sponsorship;

  INSERT INTO public.manual_transfer_reconciliations
    (sponsorship_id, payment_id, expected_amount, received_amount, currency, value_date,
     bank_reference, amount_mismatch, note, confirmed_by)
  VALUES (_sponsorship, _payment, _s.amount, _received_amount, _cur, _value_date, _ref,
          _mismatch, NULLIF(btrim(COALESCE(_note, '')), ''), auth.uid());

  PERFORM public.write_audit('payment.manual_confirmed', 'sponsorship', _sponsorship,
    jsonb_build_object('payment', _payment, 'expected', _s.amount, 'received', _received_amount,
                       'currency', _cur, 'value_date', _value_date, 'bank_reference', _ref,
                       'mismatch', _mismatch, 'note', _note));

  PERFORM public.announce_payment(_sponsorship, true, _received_amount, _cur);

  RETURN jsonb_build_object('payment_id', _payment, 'mismatch', _mismatch);
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_manual_transfer(UUID, NUMERIC, TEXT, DATE, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_manual_transfer(UUID, NUMERIC, TEXT, DATE, TEXT, BOOLEAN, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------
-- صندوق القرارات: التحويلات المعلّقة بندٌ فيه، بسياقها
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ) i), '[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_transfer_context(_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'sponsorship_id', s.id, 'reference', upper(left(s.id::text, 8)),
      'amount', s.amount, 'currency', s.currency, 'type', s.type, 'status', s.status,
      'created_at', s.created_at,
      'person_name', p.full_name, 'person_email', u.email,
      'code', o.code, 'name', o.display_name,
      'awaiting', public.awaits_manual_transfer(s.id))
      FROM public.sponsorships s
      JOIN public.orphans o ON o.id = s.orphan_id
      LEFT JOIN auth.users u ON u.id = s.sponsor_id
      LEFT JOIN public.profiles p ON p.id = s.sponsor_id
     WHERE s.id = _id);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_transfer_context(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_context(UUID) TO authenticated;

-- كما في هجرة الجهات (20261107100000) مع سياق التحويل.
CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind text, _id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN public.admin_care_org_context(_id)
    WHEN 'transfer' THEN public.admin_transfer_context(_id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    WHEN 'orphan_edit' THEN (SELECT jsonb_build_object(
                          'code', o.code, 'name', o.display_name, 'status', o.status,
                          'proposed', pe.changes, 'published', pe.previous,
                          'via', pe.via, 'created_at', COALESCE(pe.updated_at, o.updated_at),
                          'needs_text', (SELECT jsonb_agg(jsonb_build_object(
                                            'category', n.category, 'title', n.title,
                                            'notes', n.notes, 'amount', n.monthly_amount)
                                          ORDER BY n.created_at)
                                           FROM public.orphan_needs n
                                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
                          FROM public.orphans o
                          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
                         WHERE o.id = _id)
    WHEN 'circle_role' THEN public.admin_circle_role_context(_id)
    WHEN 'circle_role_renewal' THEN public.admin_circle_role_context(_id)
    ELSE NULL END;
END $function$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- القوائم: صفحةٌ وبحث، لا كتلةٌ بكلّ شيء
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list(
  _list TEXT, _q TEXT DEFAULT NULL, _limit INTEGER DEFAULT 50, _offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
               min(s.created_at) AS since
          FROM public.sponsorships s
          JOIN auth.users u ON u.id = s.sponsor_id
          LEFT JOIN public.profiles p ON p.id = u.id
         WHERE _pat IS NULL OR u.email ILIKE _pat OR p.full_name ILIKE _pat
         GROUP BY u.id, u.email, p.full_name
      ),
      paid AS (
        SELECT a.*, COALESCE((SELECT SUM(sp.amount) FROM public.sponsorship_payments sp
                               WHERE sp.sponsor_id = a.id AND sp.status = 'paid'), 0) AS paid
          FROM agg a
      )
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM agg),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', x.id, 'email', x.email, 'name', x.full_name,
                    'sponsorships', x.sponsorships, 'active', x.active, 'monthly', x.monthly,
                    'paid', x.paid, 'since', x.since) ORDER BY x.paid DESC, x.email)
                  FROM (SELECT * FROM paid ORDER BY paid DESC, email LIMIT _lim OFFSET _off) x),
                 '[]'::jsonb)));
  END IF;
  RAISE EXCEPTION 'admin_list: unknown list %', _list USING ERRCODE = '22023';
END $fn$;
REVOKE ALL ON FUNCTION public.admin_list(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- الصورة العامّة كما هي، إلا أنّ القائمتين أوّلُ صفحةٍ منهما ومعهما العدد.
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

    'orphan_rows', _orphans->'rows',
    'orphan_rows_total', (_orphans->>'total')::integer,
    'sponsor_rows', _sponsors->'rows',
    'sponsor_rows_total', (_sponsors->>'total')::integer,

    'pending_orphans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'name', display_name, 'city', city,
        'region', region, 'need', monthly_need, 'status', status, 'created_at', created_at
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
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- ---------------------------------------------------------------------
-- التصدير: ثلاث مجموعات، بلا بيانات الطفل السرّية، ومسجَّلٌ في الأثر
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_export(_dataset TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _cap CONSTANT INTEGER := 10000;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_export: not authorised' USING ERRCODE = '42501';
  END IF;

  IF _dataset = 'orphans' THEN
    -- ما يراه مشرف المنصّة في قائمته: لا اسم كامل ولا هوية ولا عنوان ولا صحّة.
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'code'), '[]'::jsonb) INTO _rows FROM (
      SELECT jsonb_build_object(
        'code', o.code, 'display_name', o.display_name, 'status', o.status,
        'country', o.country_code, 'region', o.region, 'org', co.name,
        'monthly_need', o.monthly_need, 'funded_monthly', o.funded_monthly,
        'currency', o.currency, 'created_at', o.created_at, 'approved_at', o.approved_at) AS r
        FROM public.orphans o LEFT JOIN public.care_organizations co ON co.id = o.org_id
       ORDER BY o.code LIMIT _cap) t;
  ELSIF _dataset = 'sponsorships' THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO _rows FROM (
      SELECT jsonb_build_object(
        'reference', upper(left(s.id::text, 8)), 'sponsor_email', u.email,
        'orphan_code', o.code, 'type', s.type, 'amount', s.amount, 'currency', s.currency,
        'status', s.status, 'provider', s.provider, 'created_at', s.created_at,
        'started_at', s.started_at, 'ended_at', s.ended_at) AS r
        FROM public.sponsorships s
        JOIN public.orphans o ON o.id = s.orphan_id
        LEFT JOIN auth.users u ON u.id = s.sponsor_id
       ORDER BY s.created_at LIMIT _cap) t;
  ELSIF _dataset = 'payments' THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO _rows FROM (
      SELECT jsonb_build_object(
        'invoice_no', p.invoice_no, 'sponsorship_reference', upper(left(p.sponsorship_id::text, 8)),
        'sponsor_email', u.email, 'orphan_code', o.code, 'amount', p.amount,
        'currency', p.currency, 'fee', p.fee_amount, 'net', p.net_amount, 'status', p.status,
        'provider', p.provider, 'provider_ref', p.provider_ref, 'paid_at', p.paid_at,
        'value_date', m.value_date, 'bank_reference', m.bank_reference,
        'expected_amount', m.expected_amount, 'amount_mismatch', m.amount_mismatch,
        'created_at', p.created_at) AS r
        FROM public.sponsorship_payments p
        JOIN public.sponsorships s ON s.id = p.sponsorship_id
        JOIN public.orphans o ON o.id = s.orphan_id
        LEFT JOIN auth.users u ON u.id = p.sponsor_id
        LEFT JOIN public.manual_transfer_reconciliations m ON m.payment_id = p.id
       ORDER BY p.created_at LIMIT _cap) t;
  ELSE
    RAISE EXCEPTION 'admin_export: unknown dataset %', _dataset USING ERRCODE = '22023';
  END IF;

  PERFORM public.write_audit('admin.export', 'export', NULL,
    jsonb_build_object('dataset', _dataset, 'rows', jsonb_array_length(_rows)));
  RETURN _rows;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_export(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export(TEXT) TO authenticated;
