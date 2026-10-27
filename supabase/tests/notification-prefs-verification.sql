-- =====================================================================
-- تفضيلات الإشعارات وإلغاء الاشتراك — إثبات
-- ---------------------------------------------------------------------
-- ثلاث طبقات تمنع البريد، وكلٌّ تُغلق وحدها. فالفحص هنا ليس أن الطبقات
-- موجودة، بل أن كلّاً منها **تكفي بذاتها**، وأن أياً منها لا تُسقط
-- الإشعار داخل التطبيق.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'np-one@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'np-two@example.test', '{}'::jsonb);


-- ---------------------------------------------------------------------
-- القفل الافتراضي: بيئة جديدة لا تُرسل شيئاً
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT (SELECT email_on_hold FROM public.platform_settings WHERE id) THEN
    RAISE EXCEPTION 'FAIL — البريد مفتوح افتراضياً';
  END IF;
  RAISE NOTICE 'PASS — البريد يبدأ مقفولاً، وفتحه فعل متعمَّد';
END $$;

DO $$
DECLARE _state public.email_state; _reason TEXT;
BEGIN
  PERFORM public.notify('a1000000-0000-4000-8000-000000000001', 'welcome', 'ت١');
  SELECT email_state, email_skip_reason INTO _state, _reason
    FROM public.notifications
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001' AND title = 'ت١';

  IF _state <> 'skipped' OR _reason <> 'platform_hold' THEN
    RAISE EXCEPTION 'FAIL — القفل لم يمنع الإدراج في الطابور (% / %)', _state, _reason;
  END IF;
  RAISE NOTICE 'PASS — القفل وحده يكفي: لا شيء يدخل الطابور';
END $$;

-- ورفعه من العميل ممنوع، كما في قفل التحصيل.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    UPDATE public.platform_settings SET email_on_hold = false WHERE id;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — العميل رفع قفل البريد';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — قفل البريد لا يُرفع من العميل';
  END;
END $$;


-- ---------------------------------------------------------------------
-- وبعد رفع القفل من الخادم: الطبقتان الأخريان
-- ---------------------------------------------------------------------
UPDATE public.platform_settings SET email_on_hold = false WHERE id;

DO $$
DECLARE _state public.email_state;
BEGIN
  PERFORM public.notify('a1000000-0000-4000-8000-000000000001', 'report_published', 'ت٢');
  SELECT email_state INTO _state FROM public.notifications
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001' AND title = 'ت٢';

  IF _state <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — رسالة مشروعة لم تدخل الطابور (%)', _state;
  END IF;
  RAISE NOTICE 'PASS — بعد رفع القفل تدخل الرسالة المشروعة الطابور';
END $$;


-- إلغاء الاشتراك الشامل يكفي وحده.
DO $$
DECLARE _state public.email_state; _reason TEXT;
BEGIN
  UPDATE public.notification_prefs SET email_enabled = false
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001';

  PERFORM public.notify('a1000000-0000-4000-8000-000000000001', 'report_published', 'ت٣');
  SELECT email_state, email_skip_reason INTO _state, _reason
    FROM public.notifications
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001' AND title = 'ت٣';

  IF _state <> 'skipped' OR _reason <> 'user_unsubscribed' THEN
    RAISE EXCEPTION 'FAIL — إلغاء الاشتراك لم يُطَع (% / %)', _state, _reason;
  END IF;
  RAISE NOTICE 'PASS — من ألغى اشتراكه لا يصله بريد، بلا استثناء لنوع';

  UPDATE public.notification_prefs SET email_enabled = true
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001';
END $$;


-- والكتم انتقائيّ: النوع المكتوم يُمنع وحده، وغيره يمرّ.
DO $$
DECLARE _muted public.email_state; _other public.email_state; _reason TEXT;
BEGIN
  UPDATE public.notification_prefs
     SET muted_kinds = ARRAY['report_published']::public.notification_kind[]
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001';

  PERFORM public.notify('a1000000-0000-4000-8000-000000000001', 'report_published', 'ت٤');
  PERFORM public.notify('a1000000-0000-4000-8000-000000000001', 'payment_succeeded', 'ت٥');

  SELECT email_state, email_skip_reason INTO _muted, _reason FROM public.notifications
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001' AND title = 'ت٤';
  SELECT email_state INTO _other FROM public.notifications
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001' AND title = 'ت٥';

  IF _muted <> 'skipped' OR _reason <> 'kind_muted' THEN
    RAISE EXCEPTION 'FAIL — النوع المكتوم مرّ (% / %)', _muted, _reason;
  END IF;
  IF _other <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — الكتم شامل لا انتقائي (%)', _other;
  END IF;
  RAISE NOTICE 'PASS — الكتم يمنع نوعه وحده ولا يمسّ غيره';
END $$;


-- ---------------------------------------------------------------------
-- الإشعار داخل التطبيق لا يُكتَم أبداً
-- ---------------------------------------------------------------------
-- الفارق جوهري: من أوقف البريد لم يتنازل عن حقّه في معرفة ما يجري في
-- كفالته. لو أسقطنا الصفّ لكان الكتم حجباً للعلم لا للرسالة.
DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.notifications
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001'
     AND title IN ('ت١','ت٢','ت٣','ت٤','ت٥');

  IF _n <> 5 THEN
    RAISE EXCEPTION 'FAIL — أُسقط إشعارٌ داخل التطبيق بسبب تفضيلات البريد (% من ٥)', _n;
  END IF;
  RAISE NOTICE 'PASS — كل الإشعارات مكتوبة: الكتم للبريد لا للعلم';
END $$;


-- ---------------------------------------------------------------------
-- إلغاء الاشتراك بالرمز، بلا جلسة
-- ---------------------------------------------------------------------
DO $$
DECLARE _token UUID; _ok BOOLEAN; _enabled BOOLEAN;
BEGIN
  SELECT unsubscribe_token INTO _token FROM public.notification_prefs
   WHERE user_id = 'a1000000-0000-4000-8000-000000000002';

  IF _token IS NULL THEN
    RAISE EXCEPTION 'FAIL — لا رمز إلغاء لمستخدم مسجَّل';
  END IF;

  -- الزائر: نقرةٌ من صندوق البريد حيث لا جلسة.
  SET LOCAL ROLE anon;
  SELECT public.unsubscribe_by_token(_token) INTO _ok;
  RESET ROLE;

  SELECT email_enabled INTO _enabled FROM public.notification_prefs
   WHERE user_id = 'a1000000-0000-4000-8000-000000000002';

  IF NOT _ok OR _enabled THEN
    RAISE EXCEPTION 'FAIL — الرابط لم يوقف البريد (ok=% enabled=%)', _ok, _enabled;
  END IF;
  RAISE NOTICE 'PASS — رابط الإلغاء يعمل بلا تسجيل دخول';
END $$;

-- ورمزٌ خاطئ لا يفعل شيئاً ولا يكشف شيئاً.
DO $$
DECLARE _ok BOOLEAN;
BEGIN
  SET LOCAL ROLE anon;
  SELECT public.unsubscribe_by_token('00000000-0000-4000-8000-00000000dead') INTO _ok;
  RESET ROLE;

  IF _ok THEN
    RAISE EXCEPTION 'FAIL — رمز مجهول نجح';
  END IF;
  RAISE NOTICE 'PASS — الرمز المجهول يفشل بلا إفصاح';
END $$;


-- ---------------------------------------------------------------------
-- تفضيلات غيرك ليست لك
-- ---------------------------------------------------------------------
-- الرمز مفتاح إيقاف بريد صاحبه؛ لو قُرئ من غيره لصار سلاحاً.
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  SELECT count(*) INTO _n FROM public.notification_prefs
   WHERE user_id = 'a1000000-0000-4000-8000-000000000002';
  RESET ROLE;

  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — مستخدم يقرأ تفضيلات غيره (% صفّاً)', _n;
  END IF;
  RAISE NOTICE 'PASS — التفضيلات ورمزها لا يُقرآن إلا لصاحبهما';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص تفضيلات الإشعارات اجتازت ──'; END $$;

ROLLBACK;
