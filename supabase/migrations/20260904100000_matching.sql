-- =====================================================================
-- المطابقة — ترتيبٌ يخدم البناء لا سدَّ أكبر ثغرة
-- ---------------------------------------------------------------------
-- `suggest_orphans_for_sponsor` مبنيّةٌ منذ اليوم الأول وممنوحةٌ ولا
-- تُستدعى من مكان. وحين نظرنا فيها لنُفعّلها وجدنا **منطقها هو منطق
-- الرعاية الذي انتقلت المنصّة عنه**:
--
--   ORDER BY (monthly_need - funded_monthly) DESC
--
-- أي: **صاحب أكبر ثغرةٍ أولاً**. وثلاثة عيوب فيه:
--
-- (١) **يُجوّع صغار الثغرات إلى الأبد.** ملفٌّ بقي له عشرون لا يعلو أبداً
--     على ملفٍّ بقي له مئتان، مهما طال انتظاره. والترتيب الذي لا يتغيّر
--     ليس ترتيباً بل سجن.
--
-- (٢) **`_budget * 1.5` يعرض ما لا يُكمَل.** كافلٌ بمئةٍ يُعرض عليه ملفٌّ
--     ثغرته مئةٌ وخمسون: لا هو أكمله ولا هو عرف أنه لن يُكمله.
--
-- (٣) **لا يعرف البناء.** الكفالة صارت اشتراكاً في بناء أهلية، فملفٌّ بلا
--     مشرفٍ معتمَد ولا إذنٍ موثَّق **برنامجه واقف**: المال يدخله ولا
--     يُحرّك شيئاً. والترتيب لا يفرّق بينه وبين ملفٍّ بناؤه قائم.
--
-- فالترتيب هنا: **البناءُ القائم أولاً، ثم ما يُكمله اشتراكك، ثم تفضيلك،
-- ثم الأقدمُ انتظاراً.** والميزانية لا تُقصي أحداً — الكفالة الجزئية
-- مسموحة — بل ترتّب.
--
-- ومع كل ترشيح **سببُه**: ترشيحٌ بلا سببٍ نُخزةٌ لا توصية، والكافل يقرّر
-- على بيّنة أو لا يقرّر.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) تفضيلات الكافل — حقلان ميّتان منذ البداية
-- ---------------------------------------------------------------------
-- `monthly_budget` و`preferred_region` في `profiles` منذ أول هجرة، ولا
-- شاشة تكتبهما. والكتابة تبقى بسياسة `profiles_update_own` — لا دالّة
-- جديدة: الصفّ ملكُ صاحبه، وRLS تكفي.
--
-- والقراءة تحتاج دالّة: المرشِّح `SECURITY DEFINER`، فلو قرأ التفضيلات
-- بنفسه صار يقرأ ملفّ أي أحد. فيقرؤها من `auth.uid()` وحدها.
CREATE OR REPLACE FUNCTION public.my_sponsor_preferences()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'monthly_budget', p.monthly_budget,
       'preferred_region', p.preferred_region,
       'city', p.city,
       'full_name', p.full_name
     ) FROM public.profiles p WHERE p.id = auth.uid()),
    'null'::jsonb
  );
$fn$;
REVOKE ALL ON FUNCTION public.my_sponsor_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sponsor_preferences() TO authenticated;


/* والكتابة `SECURITY INVOKER` عمداً: تبقى `profiles_update_own` هي
   الحاكمة، فلا تُنشئ الدالّة باباً يلتفّ عليها — وإنما تختصر نداءً
   لقراءة المعرّف قبل الكتابة. */
CREATE OR REPLACE FUNCTION public.save_sponsor_preferences(
  _budget NUMERIC DEFAULT NULL,
  _region TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'save_sponsor_preferences: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  IF _budget IS NOT NULL AND _budget < 0 THEN
    RAISE EXCEPTION 'الميزانية لا تكون سالبة' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles
     SET monthly_budget = _budget,
         preferred_region = NULLIF(btrim(COALESCE(_region, '')), '')
   WHERE id = auth.uid();

  RETURN public.my_sponsor_preferences();
END $fn$;
REVOKE ALL ON FUNCTION public.save_sponsor_preferences(NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sponsor_preferences(NUMERIC, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 2) المناطق المتاحة — لا قائمةَ مكتوبةً في الواجهة
-- ---------------------------------------------------------------------
-- قائمةٌ ثابتة في الواجهة تشيخ بصمت: تُضاف منطقةٌ في القاعدة فلا يجدها
-- الكافل في تفضيلاته. فتُقرأ من الملفّات المنشورة نفسها.
CREATE OR REPLACE FUNCTION public.published_regions()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(r ORDER BY r), '[]'::jsonb)
  FROM (
    SELECT DISTINCT o.region AS r
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.region), '') <> ''
  ) s;
$fn$;
REVOKE ALL ON FUNCTION public.published_regions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_regions() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) المرشِّح
-- ---------------------------------------------------------------------
-- الأعمدة المُعادة هي **نفس الأعمدة الممنوحة لـ`anon`** على الجدول: هذه
-- الدالّة `SECURITY DEFINER`، فلو أعادت `SETOF orphans` لالتفّت على منح
-- الأعمدة الذي بُني في المرحلة 0 — وهي لا تفعل، ولا ينبغي أن تفعل.
-- التوقيع نفسه والأعمدة تتغيّر، وPostgres لا يبدّل نوع الإرجاع بـ
-- `REPLACE`. والإسقاط هنا آمن: الدالّة غير مستدعاة من أي مكان اليوم.
DROP FUNCTION IF EXISTS public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT);

CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _limit INT DEFAULT 12
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, gender TEXT, birth_date DATE,
  city TEXT, region TEXT, story TEXT, photo_url TEXT, education_stage TEXT,
  monthly_need NUMERIC, funded_monthly NUMERIC, currency TEXT,
  status public.orphan_status, org_id UUID, created_at TIMESTAMPTZ,
  /* ما يُبنى عليه الترتيب — يُعاد ليُعرض سببُه لا ليُخفى */
  gap NUMERIC, building BOOLEAN, completes BOOLEAN, in_region BOOLEAN,
  waiting_days INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT COALESCE(_budget, p.monthly_budget) AS budget,
           COALESCE(NULLIF(btrim(COALESCE(_region, '')), ''), p.preferred_region) AS region
      FROM (SELECT NULL::UUID) z
      LEFT JOIN public.profiles p ON p.id = auth.uid()
  ),
  cand AS (
    SELECT o.*,
           (o.monthly_need - o.funded_monthly) AS gap,
           /* البناء قائم: برنامج أهليةٍ حيّ له مشرفٌ معتمَد وإذنٌ موثَّق.
              وبدونهما المال يدخل ولا يُحرّك شيئاً. */
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
              JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id
                AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building
      FROM public.orphans o
     WHERE o.status = 'approved'
       AND (o.monthly_need - o.funded_monthly) > 0
       /* ما يكفله المرء لا يُرشَّح له ثانيةً. */
       AND NOT EXISTS (
         SELECT 1 FROM public.sponsorships s
          WHERE s.orphan_id = o.id
            AND s.sponsor_id = auth.uid()
            AND s.status IN ('pending_payment', 'active', 'paused')
       )
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.birth_date, c.city, c.region,
         c.story, c.photo_url, c.education_stage, c.monthly_need, c.funded_monthly,
         c.currency, c.status, c.org_id, c.created_at,
         c.gap,
         c.building,
         (me.budget IS NOT NULL AND c.gap <= me.budget) AS completes,
         (me.region IS NOT NULL AND c.region = me.region) AS in_region,
         GREATEST(0, (now()::date - COALESCE(c.approved_at, c.created_at)::date))::INTEGER
           AS waiting_days
    FROM cand c CROSS JOIN me
   ORDER BY
     /* البناء القائم أولاً: الكفالة اشتراكٌ في بناءٍ لا سدُّ ثغرة. */
     c.building DESC,
     /* ثم ما يُكمله اشتراكك — لا «قريبٌ من ميزانيتك» بمعامل. */
     (me.budget IS NOT NULL AND c.gap <= me.budget) DESC,
     /* ثم تفضيلك — ترجيحاً لا إقصاءً: تصفيةٌ بالمنطقة تُخفي محتاجاً. */
     (me.region IS NOT NULL AND c.region = me.region) DESC,
     /* ثم الأقدمُ انتظاراً — وهو ما يمنع سجن «أكبر ثغرة أولاً». */
     COALESCE(c.approved_at, c.created_at) ASC,
     /* وقطعُ التعادل ثابت: ترتيبٌ يختلف بين نداءين يُقرأ عشوائيةً. */
     c.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 48);
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  FROM PUBLIC, anon;
-- **لـ`authenticated` وحدها، لا للزائر.** تدقيق Supabase الأمني في
-- 20260823110111 سحب هذه الدالّة من الجميع، وفحص `H2h` يحرس السحب عن
-- `anon` ويكتب المقصود نصّاً: «عند تفعيل المطابقة في المرحلة 5 يجب منح
-- EXECUTE لـ authenticated صراحةً». وهو الصواب لسببٍ فوق الأمن:
-- الترشيح **شخصيّ** — يقرأ ميزانيةَ صاحبه ومنطقته وما يكفله أصلاً —
-- فترشيحٌ لزائرٍ بلا جلسة ليس ترشيحاً بل ترتيبٌ عامّ. والدليل العامّ
-- (`/orphans`) هو باب الزائر، وهو مفتوح.
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  TO authenticated;
