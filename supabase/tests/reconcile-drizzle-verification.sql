-- مصالحة drizzle 0003/0004 مع المرحلة صفر — إثبات
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE _bad TEXT; _cat JSONB;
BEGIN
  -- ١) لا دالّة تسأل النسخة العامّة المحصورة للحساب، إلا هي نفسها.
  SELECT string_agg(p.proname, ', ') INTO _bad FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname NOT IN ('enrollment_supervisor', '_enrollment_supervisor_any')
     AND p.prosrc ~ '(^|[^_a-z])enrollment_supervisor\(';
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL — دوالّ ما زالت تسأل النسخة المحصورة: %', _bad; END IF;
  RAISE NOTICE 'PASS — الحساب يسأل النسخة الداخلية';

  -- ٢) النسخة العامّة محصورة وتشترط الاعتماد؛ والداخلية مغلقة.
  IF pg_get_functiondef('public.enrollment_supervisor(uuid)'::regprocedure) NOT LIKE '%can_see_qualification%'
     OR pg_get_functiondef('public.enrollment_supervisor(uuid)'::regprocedure) NOT LIKE '%approval%'
     OR pg_get_functiondef('public.enrollment_supervisor_standing(uuid)'::regprocedure) NOT LIKE '%approval%' THEN
    RAISE EXCEPTION 'FAIL — المشرف غير محصور أو بلا شرط الاعتماد';
  END IF;
  IF has_function_privilege('anon', 'public._enrollment_supervisor_any(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._enrollment_supervisor_any(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.enrollment_supervisor(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — نسخة المشرف مفتوحة لمن لا يحقّ له';
  END IF;
  RAISE NOTICE 'PASS — المشرف محصورٌ ومعتمَد، والداخلية مغلقة';

  -- ٣) دولة الشبكة تظهر في الكتالوج ويُقبل التعهّد لها.
  INSERT INTO public.countries (code, name_ar, status, in_network) VALUES ('ZZ', 'دولة شبكة', 'planned', true)
    ON CONFLICT (code) DO UPDATE SET in_network = true, status = 'planned';
  _cat := public.support_catalog(NULL);
  IF NOT (_cat->'countries') @> '[{"code":"ZZ"}]' THEN RAISE EXCEPTION 'FAIL — دولة الشبكة غائبة عن الكتالوج'; END IF;
  IF pg_get_functiondef('public.create_support_pledge(text,text,text,numeric,text,text,text,integer)'::regprocedure)
       NOT LIKE '%in_network%' THEN
    RAISE EXCEPTION 'FAIL — التعهّد لا يقبل دولة الشبكة';
  END IF;
  RAISE NOTICE 'PASS — دول الشبكة في الكتالوج والتعهّد';
END $$;
ROLLBACK;
