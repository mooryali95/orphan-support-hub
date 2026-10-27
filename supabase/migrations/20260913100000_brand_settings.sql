-- =====================================================================
-- اسم المنصّة في القاعدة — من إعدادٍ واحد لا من نصوصٍ متفرّقة
-- ---------------------------------------------------------------------
-- رسالة الترحيب كانت تقول «أهلاً بك في IOCO» نصاً ثابتاً. صار الاسم
-- يُقرأ من platform_settings.brand_name، ويُحدَّث بهجرةٍ يولّدها
-- `bun run brand:sync` من src/config/brand.json — فيتغيّر هنا مع الواجهة.
--
-- بادئة رموز الملفّات (IOCO-) معرّفٌ ثابت لا علامة: الملفّات القديمة
-- تبقى برموزها. صارت إعداداً (code_prefix) يُغيَّر إن أُريد للجديد فقط.
-- =====================================================================

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS brand_name TEXT NOT NULL DEFAULT 'كهاتين'
    CHECK (length(btrim(brand_name)) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS code_prefix TEXT NOT NULL DEFAULT 'IOCO-'
    CHECK (code_prefix ~ '^[A-Z]{2,8}-$');

CREATE OR REPLACE FUNCTION public.brand_name()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT brand_name FROM public.platform_settings WHERE id), 'كهاتين');
$fn$;
GRANT EXECUTE ON FUNCTION public.brand_name() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.notify(NEW.id, 'welcome', 'أهلاً بك في ' || public.brand_name(),
    'حسابك جاهز. تصفّح الملفات المعتمدة واختر من تكفله.', '/orphans');
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.notify_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_orphan_code()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $fn$
  SELECT COALESCE((SELECT code_prefix FROM public.platform_settings WHERE id), 'IOCO-')
         || LPAD(nextval('public.orphan_code_seq')::text, 6, '0');
$fn$;
