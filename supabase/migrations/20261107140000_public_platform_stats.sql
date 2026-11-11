-- =====================================================================
-- أرقام الصفحة الأولى بتجميعٍ واحد في القاعدة (PERF-06)
-- =====================================================================
-- كانت getPlatformStats تقرأ صفوف الملفات المنشورة كلّها لتجمع الاحتياج
-- والمغطّى في المتصفّح/الخادم، وPostgREST يقطع الردّ عند max_rows (1000)،
-- فيُنقص المجموع بصمتٍ بعد الألف. هنا رقمٌ واحد من استعلامٍ واحد.
--
-- SECURITY INVOKER: تُقرأ بصلاحيات المتّصل وسياساته، فلا تكشف أكثر ممّا كانت
-- القراءة المباشرة تكشفه (أعمدة الاحتياج والتمويل مقروءة للزائر أصلاً).
-- مجاميع لا صفوف: لا اسم ولا معرّف ولا مكان.
CREATE OR REPLACE FUNCTION public.public_platform_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'total', count(*),
    'fully_sponsored', count(*) FILTER (WHERE o.status = 'fully_sponsored'),
    'monthly_need', COALESCE(sum(o.monthly_need), 0),
    'monthly_funded', COALESCE(sum(o.funded_monthly), 0)
  )
    FROM public.orphans o
   WHERE o.status IN ('approved', 'fully_sponsored');
$fn$;
REVOKE ALL ON FUNCTION public.public_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_platform_stats() TO anon, authenticated;
