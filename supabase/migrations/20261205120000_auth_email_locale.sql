-- =====================================================================
-- لغة رسائل المصادقة لمن لم يحمل رابطه لغة
-- الخطر: استعادة كلمة المرور من لوحة المصادقة، أو دعوةٌ بلا `lang` في عنوان العودة،
-- تصل عربيةً إلى من اختار الإنجليزية. خطاف البريد يسأل هنا عن لغة الحساب المخزّنة
-- (raw_user_meta_data.locale، كما في claim_email_batch) قبل العودة إلى العربية.
-- للخادم وحده (service_role): لا يُسأل عن بريدٍ من المتصفّح فيُعرف أنّ له حساباً.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.auth_email_locale(_email TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE WHEN u.raw_user_meta_data->>'locale' = 'en' THEN 'en' ELSE 'ar' END
    FROM auth.users u
   WHERE lower(u.email) = lower(trim(_email))
   LIMIT 1
$fn$;

REVOKE ALL ON FUNCTION public.auth_email_locale(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_locale(TEXT) TO service_role;
