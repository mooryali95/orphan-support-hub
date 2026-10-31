-- «ادعم في دقيقتين»: عملة التعهّد وزمنه — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('e1000000-0000-4000-8000-00000000c001', 'pc-sup@example.test', '{}'::jsonb);
UPDATE public.countries SET status = 'active' WHERE code = 'AL';

DO $$
DECLARE _id UUID; _p RECORD; _err TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-00000000c001","role":"authenticated"}';
  -- التوقيع القديم ما زال يعمل: عملةٌ افتراضية EUR وبلا زمن.
  _id := public.create_support_pledge('in_kind', 'country', 'AL', 25);
  RESET ROLE;
  SELECT currency, elapsed_seconds INTO _p FROM public.support_pledges WHERE id = _id;
  IF _p.currency <> 'EUR' OR _p.elapsed_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — الافتراضي خاطئ: %', _p;
  END IF;
  RAISE NOTICE 'PASS — النداء القديم: EUR وبلا زمن';

  SET LOCAL ROLE authenticated;
  _id := public.create_support_pledge('in_kind', 'region', 'Tirana', 470, 'AL', NULL, 'usd', 95);
  RESET ROLE;
  SELECT currency, elapsed_seconds, amount INTO _p FROM public.support_pledges WHERE id = _id;
  IF _p.currency <> 'USD' OR _p.elapsed_seconds <> 95 OR _p.amount <> 470 THEN
    RAISE EXCEPTION 'FAIL — عملة الفجوة أو الزمن لم يُحفظا: %', _p;
  END IF;
  RAISE NOTICE 'PASS — التعهّد يحمل عملة الفجوة وزمن المسار';

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_support_pledge('in_kind', 'country', 'AL', 10, NULL, NULL, 'bitcoin', NULL);
    _err := NULL;
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM;
  END;
  RESET ROLE;
  IF _err IS NULL OR _err NOT LIKE '%invalid_currency%' THEN
    RAISE EXCEPTION 'FAIL — عملةٌ غير صالحة قُبلت: %', _err;
  END IF;
  RAISE NOTICE 'PASS — عملةٌ غير صالحة تُرفض';

  IF has_function_privilege('anon', 'public.create_support_pledge(text,text,text,numeric,text,text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — anon يستطيع تسجيل تعهّد';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'create_support_pledge' AND p.pronargs = 6) THEN
    RAISE EXCEPTION 'FAIL — التوقيع القديم ما زال موجوداً فيلتبس النداء';
  END IF;
  RAISE NOTICE 'PASS — توقيعٌ واحد، وللمسجَّلين فقط';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص عملة التعهّد اجتازت ──'; END $$;
ROLLBACK;
