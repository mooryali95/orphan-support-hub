-- =====================================================================
-- الخطوة ١ يوم النشر — ما الذي طُبّق فعلاً على القاعدة الحيّة؟
-- قراءةٌ فقط. شغّله في Lovable Cloud ← SQL، وانسخ آخر رقم يظهر.
-- =====================================================================
SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 30;

-- علاماتٌ سريعة: NULL يعني أن الجزء غير مطبّق.
SELECT to_regclass('public.orphan_access_requests')              AS m0905_protection,
       to_regclass('public.orphan_profile_sections')             AS m0907_profile,
       to_regclass('public.access_scopes')                       AS m0908_scopes,
       to_regclass('public.countries')                           AS m0909_mirror,
       to_regclass('public.offices')                             AS m0910_offices,
       to_regprocedure('public.support_catalog(text)')           AS m0911_catalog,
       to_regprocedure('public.sponsorship_ledger(uuid)')        AS m0912_ledger,
       to_regprocedure('public.brand_name()')                    AS m0913_brand,
       to_regprocedure('public.orphan_journey(uuid)')            AS m0914_scoped,
       to_regprocedure('public.my_journey_feed(integer)')        AS m0915_feed,
       to_regprocedure('public.admin_decision_inbox()')          AS m0916_inbox,
       to_regprocedure('public.my_supervisor_today()')           AS m0917_field,
       to_regprocedure('public.donor_entity_pledges(uuid)')      AS m0918_donors,
       to_regprocedure('public.admin_mirror_status()')           AS m0919_mirror_sync,
       to_regclass('public.guardian_e_consents')                 AS m0920_guardian;
