-- إظهار المبالغ المتنازع عليها في لوحة الإدارة.
--
-- بلا هذا يبقى المبلغ المتنازع عليه غائباً عن اللوحة تماماً: الدفعة تخرج
-- من «المحصَّل» عند وسمها ولا تظهر في أي بند آخر، فيبدو المال كأنه تبخّر.
--
-- الرصيد يبقى مجموع المدفوع وحده ولا يُطرح منه المتنازع عليه: الوسم ينقل
-- حالة الصفّ من `paid` إلى `disputed` فيخرج من مجموع المدفوع أصلاً،
-- وطرحه ثانيةً يحسم مالاً لم يكن ضمنه. (أُمسك هذا بفحص القاعدة لا بالقراءة.)
--
-- نصّ الدالة منسوخ حرفياً من هجرة 20260823160000 ولم يُعدَّل منه إلا كتلة
-- `money`. أُخذ النسخ آلياً من الملف الأصلي لا كتابةً من الذاكرة، لأن
-- إعادة كتابة دالة من مئة سطر لتغيير سطرين تُدخل فروقاً صامتة في بقيّة
-- الكتل — وقد حدث ذلك فعلاً في المحاولة الأولى.

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
        -- المتنازع عليه: مال خرج من الحساب ولم يُحسم النزاع بعد.
        'disputed', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'disputed'), 0),
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

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
