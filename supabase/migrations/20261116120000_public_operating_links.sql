-- =====================================================================
-- الدول المتّصلة فعلاً بمنصّة تشغيل — لمنصة الرؤية والتوجهات
-- =====================================================================
-- دولةٌ «حقيقية» في /vision حين تكون لها منصّة تشغيل مفعّلة جرت مزامنتها
-- فعلاً (آخر تشغيلٍ موجود) بلا خطأٍ معلّق. ما سواها يبقى افتراضياً.
--
-- مجاميع لا صفوف: الدولة، واسم المنصّة، ووقت آخر مزامنة، وعدد المجموعات
-- والأيتام المرتبطين بها — بلا اسمٍ ولا معرّفٍ ولا مكان. SECURITY DEFINER
-- لأنّ جداول المرآة مقصورةٌ على المسؤول، والناتج مجمَّع فقط.
CREATE OR REPLACE FUNCTION public.public_operating_links()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'country', p.country_code,
           'platform', p.name,
           'synced_at', s.last_run,
           'groups', (SELECT count(*) FROM public.mirror_groups g
                       WHERE g.source = p.key AND g.deleted_at IS NULL),
           'orphans', (SELECT count(*) FROM public.orphans o
                         JOIN public.mirror_groups g ON g.id = o.group_id
                        WHERE g.source = p.key AND g.deleted_at IS NULL)
         ) ORDER BY p.country_code), '[]'::jsonb)
    FROM public.operating_platforms p
    JOIN LATERAL (
      SELECT max(m.last_run_at) AS last_run,
             bool_or(m.last_error IS NOT NULL) AS failing
        FROM public.mirror_sync_state m
       WHERE m.source = p.key
    ) s ON true
   WHERE p.active
     AND s.last_run IS NOT NULL
     AND NOT COALESCE(s.failing, false);
$fn$;
REVOKE ALL ON FUNCTION public.public_operating_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_operating_links() TO anon, authenticated;
