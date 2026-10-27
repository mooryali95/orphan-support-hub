-- =====================================================================
-- الخطوة ١ يوم النشر — ما الذي طُبّق فعلاً على القاعدة الحيّة؟
-- قراءةٌ فقط. شغّله في Lovable Cloud ← SQL، وانسخ آخر رقم يظهر.
-- =====================================================================
SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 30;

-- علاماتٌ سريعة: NULL يعني أن الجزء غير مطبّق.
SELECT to_regclass('public.orphan_access_requests')  AS m0905_protection,
       to_regclass('public.orphan_profile_sections') AS m0907_profile,
       to_regclass('public.access_scopes')           AS m0908_scopes,
       to_regclass('public.countries')               AS m0909_mirror,
       to_regclass('public.offices')                 AS m0910_offices,
       to_regprocedure('public.support_catalog(text)') AS m0911_catalog;
