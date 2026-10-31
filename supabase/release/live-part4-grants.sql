-- =====================================================================
-- إصدار البثّ 2026-10-31 — الجزء ٤: تضييق الصلاحيات على جداول الإصدار
-- ---------------------------------------------------------------------
-- لماذا؟ قاعدة البثّ (Supabase) تحمل «صلاحيات افتراضية» تمنح anon
-- وauthenticated كلَّ شيء على أيّ جدولٍ أو تسلسلٍ أو دالةٍ تُنشأ في public.
-- النسخة المحلّية التي جُرّبت عليها الحزمة لا تحملها، فمرّ فحص الدخان
-- محلّياً وسقط سطران على البثّ (الإدراج المباشر في التعهّدات وتقارير المكاتب).
-- RLS كانت تحجب الكتابة فعلاً (لا سياسة إدراج)، لكن الإصدار يقصد
-- «أقلّ صلاحية» صراحةً. هذا الملف يعيد المنح إلى ما قصدته الهجرات بالضبط.
-- يُطبَّق بعد live-part3-repair.sql. آمنُ الإعادة.
-- =====================================================================
BEGIN;

REVOKE ALL ON TABLE public.countries, public.operating_platforms, public.mirror_sync_state, public.mirror_groups,
  public.trait_dimensions, public.trait_definitions, public.orphan_trait_scores, public.support_pledges,
  public.institution_kinds, public.offices, public.office_roles, public.office_members, public.office_reports,
  public.donor_entities, public.donor_members, public.pledge_deliveries, public.guardian_e_consents
  FROM anon, authenticated;

-- ما قصدته الهجرات 20260909..20260920 حرفياً
GRANT SELECT ON public.countries, public.institution_kinds, public.trait_dimensions, public.trait_definitions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries, public.institution_kinds TO authenticated;          -- سياسة admin FOR ALL
GRANT SELECT, INSERT, UPDATE ON public.operating_platforms TO authenticated;                          -- سياسة admin FOR ALL
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices, public.office_roles, public.office_members TO authenticated;
GRANT SELECT, UPDATE ON public.donor_entities TO authenticated;                                        -- سياسة admin FOR UPDATE
GRANT SELECT ON public.mirror_sync_state, public.mirror_groups, public.orphan_trait_scores, public.support_pledges,
  public.office_reports, public.donor_members, public.pledge_deliveries, public.guardian_e_consents TO authenticated;

-- التسلسلات الجديدة تُستهلك داخل دوال SECURITY DEFINER فقط
REVOKE ALL ON SEQUENCE public.invoice_seq, public.integrity_log_id_seq, public.trait_score_revisions_id_seq,
  public.mirror_batches_id_seq, public.ops_runs_id_seq, public.ui_translation_revisions_id_seq FROM anon, authenticated;

-- رقم الفاتورة يصدره المشغّل issue_invoice وحده
REVOKE ALL ON FUNCTION public.next_invoice_no(timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;
