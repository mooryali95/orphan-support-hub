-- =====================================================================
-- الخطوة ٢.٥ يوم النشر — التعبئة الأولية لألبانيا (يُشغَّل مرّةً، وتكراره آمن)
-- ---------------------------------------------------------------------
-- يُنشئ مكتب ألبانيا الوطني إن لم يوجد. لا يُنشئ أعضاءً ولا يربط جهة:
-- ذلك قرارٌ من الإدارة عبر الواجهة (الإدارة ← الناس ← المكاتب والجهات،
-- والإدارة ← المنصّة ← التكامل ← ربط الرواد بجهتها).
-- =====================================================================
BEGIN;

INSERT INTO public.countries (code, name_ar, name_local, status, sort_order)
VALUES ('AL', 'ألبانيا', 'Shqipëri', 'active', 1)
ON CONFLICT (code) DO UPDATE SET status = 'active';

INSERT INTO public.offices (name, country_code, region)
SELECT 'مكتب ألبانيا', 'AL', NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.offices WHERE country_code = 'AL' AND region IS NULL);

-- الحالة بعد التعبئة
SELECT (SELECT status FROM public.countries WHERE code = 'AL') AS albania,
       (SELECT count(*) FROM public.offices WHERE country_code = 'AL') AS offices,
       (SELECT org_id IS NOT NULL FROM public.operating_platforms WHERE key = 'rowad-albania') AS rowad_linked_to_org;

COMMIT;
