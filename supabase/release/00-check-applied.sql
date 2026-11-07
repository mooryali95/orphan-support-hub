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
       to_regclass('public.guardian_e_consents')                 AS m0920_guardian,
       to_regprocedure('public.geo_stats()')                      AS m0921_geo,
       to_regclass('public.integrity_log')                        AS m0922_integrity,
       to_regprocedure('public.verify_ledger_receipt(uuid,text,text)') AS m0923_receipts,
       to_regprocedure('public.lookup_payment(text)')             AS m0924_invoices,
       to_regprocedure('public.sponsor_qualification(uuid)')      AS m0925_sponsor_qualification,
       to_regclass('public.ops_runs')                             AS m0926_ops_health,
       to_regclass('public.ui_translations')                      AS m0927_ui_i18n,
       to_regprocedure('public.orphan_progress_reports(uuid)')    AS m1106_child_exposure,
       to_regprocedure('public.decide_enrollment_role(uuid,text,integer,text)') AS m1106_trust,
       to_regprocedure('public.cohort_safety()')                  AS m1106_cohort,
       to_regclass('public.orphan_pending_edits')                 AS m1106_review_fixes,
       to_regclass('public.care_org_kyc')                         AS m1107_org_onboarding,
       to_regprocedure('public.save_orphan_draft(jsonb)')         AS m1107_intake_drafts,
       to_regclass('public.manual_transfer_reconciliations')      AS m1107_admin_ops,
       (SELECT true FROM pg_proc WHERE proname = 'my_workspaces'
           AND prosrc LIKE '%translator_locales%' LIMIT 1)          AS m1107_workspaces;
