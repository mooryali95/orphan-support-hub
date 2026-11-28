-- =====================================================================
-- مُصرِّف طابور البريد — إثبات
-- ---------------------------------------------------------------------
-- الأخطاء التي تقتل مُصرِّفاً لا تظهر في المسار السعيد: ازدواج الإرسال
-- عند التوازي، ورسالةٌ تُرسل بعد أن ألغى صاحبها اشتراكه، وصفٌّ يعلق
-- محجوزاً إلى الأبد لأن المُصرِّف مات بعد المطالبة. فهذه هي المفحوصة.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'ob-one@example.test', '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000002', 'ob-two@example.test', '{}'::jsonb);

-- الطابور لا يعمل والقفل مرفوع؛ ورفعه هنا موضوع الفحص لا المفحوص.
UPDATE public.platform_settings SET email_on_hold = false WHERE id;


-- ---------------------------------------------------------------------
-- المطالبة تُرجع ما يكفي للإرسال، ولا تُرجع أكثر ممّا طُلب
-- ---------------------------------------------------------------------
DO $$
DECLARE _n INTEGER; _row RECORD;
BEGIN
  PERFORM public.notify('b1000000-0000-4000-8000-000000000001', 'report_published',
                        'تقرير أول', 'متن', '/dashboard');
  PERFORM public.notify('b1000000-0000-4000-8000-000000000001', 'payment_succeeded',
                        'إيصال', NULL, '/dashboard');
  PERFORM public.notify('b1000000-0000-4000-8000-000000000002', 'welcome', 'أهلاً');

  SELECT count(*) INTO _n FROM public.claim_email_batch(10, 300, 5);
  IF _n <> 3 THEN
    RAISE EXCEPTION 'FAIL — المطالبة أعادت % بدل ٣', _n;
  END IF;
  RAISE NOTICE 'PASS — المطالبة تُرجع كل المعلّق الصالح';
END $$;

-- إعادة الحالة للفحص التالي: نُطلق الحجز يدوياً كأن المهلة انقضت.
UPDATE public.notifications SET email_claimed_at = NULL, email_attempts = 0
 WHERE email_state = 'pending';

DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.claim_email_batch(2, 300, 5);
  IF _n <> 2 THEN
    RAISE EXCEPTION 'FAIL — الحدّ لم يُحترَم (% بدل ٢)', _n;
  END IF;
  RAISE NOTICE 'PASS — المطالبة تلتزم الحدّ المطلوب';
END $$;


-- ---------------------------------------------------------------------
-- المطالبة الثانية لا تُعيد ما طُولب به: لا ازدواج إرسال
-- ---------------------------------------------------------------------
-- هذا هو العطب الذي يُرسل رسالتين لنفس الشخص عند تشغيل مُصرِّفَين.
DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.claim_email_batch(10, 300, 5);
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — صفٌّ محجوز عاد للمطالبة (% بدل ١ المتبقّي)', _n;
  END IF;
  RAISE NOTICE 'PASS — المحجوز لا يُطالَب به مرّتين';
END $$;


-- ---------------------------------------------------------------------
-- والمهلة تُنقذ ما علق: مُصرِّفٌ مات بعد المطالبة لا يُجمّد الطابور
-- ---------------------------------------------------------------------
DO $$
DECLARE _n INTEGER;
BEGIN
  -- كأن الحجز وقع قبل ساعة والمهلة خمس دقائق.
  UPDATE public.notifications SET email_claimed_at = now() - INTERVAL '1 hour'
   WHERE email_state = 'pending';

  SELECT count(*) INTO _n FROM public.claim_email_batch(10, 300, 99);
  IF _n = 0 THEN
    RAISE EXCEPTION 'FAIL — انقضاء المهلة لم يُعِد الصفوف للطابور';
  END IF;
  RAISE NOTICE 'PASS — ما انقضت مهلته يعود للطابور (% صفّاً)', _n;
END $$;


-- ---------------------------------------------------------------------
-- إلغاء الاشتراك **بعد** الإنشاء يُطاع أيضاً
-- ---------------------------------------------------------------------
-- الفحص الجوهري: `notify()` تفحص التفضيلات لحظة الإنشاء، لكن المستخدم
-- قد يُلغي بعدها وقبل الإرسال. ولو اكتفينا بذلك الفحص لأرسلنا إليه بعد
-- أن قال «كفى».
DO $$
DECLARE _n INTEGER; _state public.email_state; _reason TEXT;
BEGIN
  UPDATE public.notifications SET email_state = 'sent' WHERE email_state = 'pending';

  PERFORM public.notify('b1000000-0000-4000-8000-000000000002', 'report_published',
                        'بعد الإلغاء');

  -- ثم ألغى اشتراكه — بعد أن دخل الإشعار الطابور معلّقاً.
  UPDATE public.notification_prefs SET email_enabled = false
   WHERE user_id = 'b1000000-0000-4000-8000-000000000002';

  SELECT count(*) INTO _n FROM public.claim_email_batch(10, 300, 5)
   WHERE recipient = 'ob-two@example.test';

  SELECT email_state, email_skip_reason INTO _state, _reason
    FROM public.notifications WHERE title = 'بعد الإلغاء';

  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — طُولب برسالة لمن ألغى اشتراكه';
  END IF;
  IF _state <> 'skipped' OR _reason <> 'user_unsubscribed' THEN
    RAISE EXCEPTION 'FAIL — لم تُكنَس رسالة الملغي (% / %)', _state, _reason;
  END IF;
  RAISE NOTICE 'PASS — الإلغاء بعد الإنشاء يُطاع: تُكنس قبل المطالبة';
END $$;


-- والقفل كذلك يُكنَس، فرفعُه ثم إعادته لا يُسرّب ما تراكم.
DO $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.notification_prefs SET email_enabled = true
   WHERE user_id = 'b1000000-0000-4000-8000-000000000002';
  PERFORM public.notify('b1000000-0000-4000-8000-000000000002', 'welcome', 'قبل القفل');

  UPDATE public.platform_settings SET email_on_hold = true WHERE id;
  SELECT count(*) INTO _n FROM public.claim_email_batch(10, 300, 5);

  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — القفل لم يمنع المطالبة (% صفّاً)', _n;
  END IF;
  RAISE NOTICE 'PASS — إعادة القفل تكنس المتراكم ولا تُسرّبه';

  UPDATE public.platform_settings SET email_on_hold = false WHERE id;
END $$;


-- ---------------------------------------------------------------------
-- الوسم: النجاح نهائي، والفشل يُعاد حتى تنفد المحاولات
-- ---------------------------------------------------------------------
DO $$
DECLARE _id UUID; _state public.email_state; _n INTEGER;
BEGIN
  UPDATE public.notifications SET email_state = 'sent' WHERE email_state = 'pending';
  PERFORM public.notify('b1000000-0000-4000-8000-000000000001', 'welcome', 'للوسم');
  SELECT id INTO _id FROM public.notifications WHERE title = 'للوسم';

  -- فشلٌ ومحاولات باقية → يعود معلّقاً
  UPDATE public.notifications SET email_attempts = 1 WHERE id = _id;
  SELECT public.mark_email_failed(_id, 'انقطاع شبكة', 5) INTO _state;
  IF _state <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — فشلٌ ومحاولات باقية لم يعد للطابور (%)', _state;
  END IF;

  -- ونفاد المحاولات → يستقرّ فاشلاً
  UPDATE public.notifications SET email_attempts = 5 WHERE id = _id;
  SELECT public.mark_email_failed(_id, 'رفض المزوّد', 5) INTO _state;
  IF _state <> 'failed' THEN
    RAISE EXCEPTION 'FAIL — نفاد المحاولات لم يُثبّت الفشل (%)', _state;
  END IF;

  SELECT count(*) INTO _n FROM public.notifications
   WHERE id = _id AND email_error = 'رفض المزوّد' AND email_claimed_at IS NULL;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — الفشل لم يحفظ سببه أو لم يُطلق حجزه';
  END IF;
  RAISE NOTICE 'PASS — الفشل يُعاد ثم يستقرّ، ويحفظ سببه ويُطلق حجزه';
END $$;


-- والنجاح لا يُصيب إلا المعلّق: وسمٌ متأخّر لا يُحيي رسالةً كُنست.
DO $$
DECLARE _id UUID; _n INTEGER; _state public.email_state;
BEGIN
  PERFORM public.notify('b1000000-0000-4000-8000-000000000001', 'welcome', 'للكنس');
  SELECT id INTO _id FROM public.notifications WHERE title = 'للكنس';
  UPDATE public.notifications SET email_state = 'skipped', email_skip_reason = 'kind_muted'
   WHERE id = _id;

  SELECT public.mark_email_sent(ARRAY[_id]) INTO _n;
  SELECT email_state INTO _state FROM public.notifications WHERE id = _id;

  IF _n <> 0 OR _state <> 'skipped' THEN
    RAISE EXCEPTION 'FAIL — وسمُ نجاحٍ متأخّر أحيا رسالة مكنوسة (% / %)', _n, _state;
  END IF;
  RAISE NOTICE 'PASS — وسم النجاح لا يصيب إلا المعلّق';
END $$;


-- ---------------------------------------------------------------------
-- والمُصرِّف كله خادميّ: لا يُنادى من العميل
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  BEGIN
    PERFORM public.claim_email_batch(1, 300, 5);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — العميل طالب بالطابور';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — المطالبة بالطابور خادميّة وحدها';
  END;
END $$;

-- ---------------------------------------------------------------------
-- لغة المستلم تصل المُصرِّف: الإنجليزية لمن اختارها، والعربية لغيره
-- ---------------------------------------------------------------------
DO $$
DECLARE _en TEXT; _ar TEXT;
BEGIN
  UPDATE public.notifications SET email_state = 'sent' WHERE email_state = 'pending';
  UPDATE auth.users SET raw_user_meta_data = '{"locale":"en"}'::jsonb
   WHERE id = 'b1000000-0000-4000-8000-000000000001';
  UPDATE auth.users SET raw_user_meta_data = '{"locale":"xx"}'::jsonb
   WHERE id = 'b1000000-0000-4000-8000-000000000002';
  PERFORM public.notify('b1000000-0000-4000-8000-000000000001', 'welcome', 'Welcome');
  PERFORM public.notify('b1000000-0000-4000-8000-000000000002', 'welcome', 'أهلاً');
  SELECT max(locale) FILTER (WHERE recipient = 'ob-one@example.test'),
         max(locale) FILTER (WHERE recipient = 'ob-two@example.test')
    INTO _en, _ar FROM public.claim_email_batch(10, 300, 5);
  IF _en IS DISTINCT FROM 'en' OR _ar IS DISTINCT FROM 'ar' THEN
    RAISE EXCEPTION 'FAIL — لغة المستلم لم تصل (en=%, ar=%)', _en, _ar;
  END IF;
  RAISE NOTICE 'PASS — المطالبة تحمل لغة المستلم، والمجهول عربي';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص مُصرِّف البريد اجتازت ──'; END $$;

ROLLBACK;
