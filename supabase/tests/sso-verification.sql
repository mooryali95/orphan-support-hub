-- الدخول من منصّة الندوة: الربط بالمعرّف، ورمزٌ لمرّةٍ واحدة — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('a9a00000-0000-4000-8000-000000000001', 'staff@wamy.example'),
  ('a9a00000-0000-4000-8000-000000000002', 'other@wamy.example');

DO $$
DECLARE _r JSONB; _ok BOOLEAN;
BEGIN
  -- لا يصلها إلا مفتاح الخدمة
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.sso_resolve('wamy', 's1', 'staff@wamy.example');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مستخدمٌ نادى باب الدخول'; END IF;

  -- الرمز لمرّةٍ واحدة
  IF NOT public.sso_claim_jti('wamy:launch-1', now() + interval '2 minutes')
     OR public.sso_claim_jti('wamy:launch-1', now() + interval '2 minutes') THEN
    RAISE EXCEPTION 'FAIL — الرمز استُعمل مرّتين';
  END IF;

  -- أوّل دخولٍ يربط بالبريد، وبعده بالمعرّف ولو تغيّر البريد
  _r := public.sso_resolve('wamy', 's1', 'Staff@Wamy.example');
  IF _r->>'linked' <> 'new' OR (_r->>'user_id')::uuid <> 'a9a00000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL — الربط الأوّل: %', _r;
  END IF;
  _r := public.sso_resolve('wamy', 's1', 'renamed@wamy.example');
  IF _r->>'linked' <> 'existing' OR (_r->>'user_id')::uuid <> 'a9a00000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL — المعرّف لم يُعرف بعد تغيّر البريد: %', _r;
  END IF;

  -- معرّفٌ آخر لا يستولي على حسابٍ مربوط
  IF public.sso_resolve('wamy', 's-attacker', 'staff@wamy.example')->>'code' <> 'subject_taken' THEN
    RAISE EXCEPTION 'FAIL — معرّفٌ ثانٍ استولى على الحساب';
  END IF;
  -- بريدٌ بلا حساب: يُنشئه الخادم
  IF public.sso_resolve('wamy', 's9', 'new@wamy.example')->'user_id' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — بريدٌ جديد';
  END IF;
  RAISE NOTICE 'PASS — الربط بالمعرّف، ولا استيلاء ببريد، والرمز لمرّةٍ واحدة';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الدخول من الندوة اجتازت ──'; END $$;
ROLLBACK;
