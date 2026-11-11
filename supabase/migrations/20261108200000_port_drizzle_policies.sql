-- =====================================================================
-- ARC-01 — مصدرٌ واحد لمخطط الإنتاج
-- ---------------------------------------------------------------------
-- في 2026-10-30/31 طبّق Lovable ثلاثة ملفّات على البثّ من drizzle/migrations
-- (drizzle-kit على LOVABLE_DB_MIGRATION_URL) لم تدخل هذه السلسلة قطّ. فالقاعدة
-- التي يبنيها CI كانت تنقصها `payment_hold_state()` التي تناديها
-- payments.functions.ts، وتحمل قراءاتٍ أوسع ممّا على البثّ.
--
-- هذه الهجرة تنقل أثرها الفعلي. كلّها CREATE OR REPLACE وDROP … IF EXISTS،
-- فهي على البثّ لا تغيّر شيئاً، وعلى قاعدةٍ نظيفة تبلغ حال البثّ.
--
-- القاعدة من الآن: **مخطط الإنتاج = supabase/migrations وحدها.** drizzle/ ليس
-- طريق هجرة؛ و`scripts/check-types-drift.sh` (يشغّله db-test.sh) يسقط إن ذكر
-- types.ts المولَّد من البثّ ما لا تُنشئه السلسلة، أو ظهر في drizzle/ ملفٌّ جديد.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0000_restrict_platform_settings_read
-- ---------------------------------------------------------------------
-- صفّ إعدادات المنصّة للإدارة وحدها؛ وما يحتاجه غيرها (هل الدفع موقوف؟)
-- يمرّ بدالّةٍ تُعيد العمودين لا الصفّ.
DROP POLICY IF EXISTS "settings_read" ON public.platform_settings;
DROP POLICY IF EXISTS "settings_read_admin" ON public.platform_settings;
CREATE POLICY "settings_read_admin" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.payment_hold_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('payments_on_hold', payments_on_hold, 'payments_hold_reason', payments_hold_reason)
  FROM public.platform_settings WHERE id;
$$;
REVOKE ALL ON FUNCTION public.payment_hold_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_hold_state() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 0001_restrict_public_media_read
-- ---------------------------------------------------------------------
-- الدالّة تُنقل كما هي (types.ts يذكرها). أمّا سياسة "public_media_read" التي
-- بناها drizzle عليها فقد استبدلتها 20261106140000_phase0_review_fixes بأضيق
-- منها (المسجَّل الذي يبلغ مجلّد الطفل وحده؛ الصور صارت في orphan-photos
-- الخاصّة). فلا تُعاد هنا: إعادتها تفتح public-media للزائر من جديد.
-- ولا يحتاجها الزائر بعد ذلك، فتُغلق عليه.
CREATE OR REPLACE FUNCTION public.is_published_orphan_folder(_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  RETURN EXISTS (SELECT 1 FROM public.orphans o
    WHERE o.id = _id AND o.status IN ('approved','fully_sponsored')
      AND o.photo_consent IN ('granted','face_hidden'));
END $$;
REVOKE ALL ON FUNCTION public.is_published_orphan_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_published_orphan_folder(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 0002_restrict_lookup_reads
-- ---------------------------------------------------------------------
-- جداول البحث للمسجَّلين؛ والزائر يبلغ ما يحتاجه منها عبر دوالّ الدليل
-- (trait_model وأخواتها، SECURITY DEFINER).
DROP POLICY IF EXISTS td_read ON public.trait_dimensions;
CREATE POLICY td_read ON public.trait_dimensions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS oroles_read ON public.office_roles;
CREATE POLICY oroles_read ON public.office_roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS ik_read ON public.institution_kinds;
CREATE POLICY ik_read ON public.institution_kinds FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
