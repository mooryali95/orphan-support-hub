-- =====================================================================
-- إعادة مهلة الكافل السابق المحدودة بعد drizzle 0008
-- ---------------------------------------------------------------------
-- 0008 جعل `sponsors_orphan` للكفالة الفعّالة وحدها، فأغلق الملفّ فوراً عن
-- كافلٍ أنهى كفالته أو أوقفها — وفقد معه آخر تقريرٍ عن طفله (CP-12، DB-07).
-- هنا تعود المهلة كما صُمّمت في 20261106100000: الفعّالة دائماً، والمنتهية
-- أو الموقوفة لمدّة `sponsor_access_grace()` (60 يوماً) من تغيّر حالتها، ثم
-- يُغلق الملفّ. الملغاة وغيرها لا وصول لها. بقيّة 0008 (حدود المبلغ وفحص
-- اعتماد الجهة المانحة) باقية كما هي.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sponsors_orphan(_orphan_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sponsorships s
    WHERE s.orphan_id = _orphan_id AND s.sponsor_id = auth.uid()
      AND (s.status = 'active'
           OR (s.status IN ('completed', 'paused')
               AND COALESCE(s.status_changed_at, s.ended_at, s.updated_at, s.created_at)
                   > now() - public.sponsor_access_grace())));
$function$;
REVOKE ALL ON FUNCTION public.sponsors_orphan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsors_orphan(uuid) TO authenticated;
