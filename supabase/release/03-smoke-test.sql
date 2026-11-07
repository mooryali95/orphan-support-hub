-- =====================================================================
-- الخطوة ٢.٣ يوم النشر — فحصٌ أمنيّ سريع بعد التطبيق (قراءة فقط)
-- ---------------------------------------------------------------------
-- كل سطرٍ يجب أن يكون ok = true. أيّ false: لا تنشر، وأرسل النتيجة.
-- =====================================================================
WITH checks(name, ok) AS (VALUES
  -- الأبواب الخلفية مغلقة على الزائر
  ('anon لا يقرأ جدول الأيتام كاملاً',
     NOT has_column_privilege('anon', 'public.orphans', 'story', 'SELECT')),
  ('anon لا يقرأ تاريخ الميلاد',
     NOT has_column_privilege('anon', 'public.orphans', 'birth_date', 'SELECT')),
  ('anon لا ينادي orphan_traits',
     NOT has_function_privilege('anon', 'public.orphan_traits(uuid)', 'EXECUTE')),
  ('anon لا ينادي orphan_journey',
     NOT has_function_privilege('anon', 'public.orphan_journey(uuid)', 'EXECUTE')),
  ('لا أحد غير service_role ينادي mirror_apply',
     NOT has_function_privilege('authenticated', 'public.mirror_apply(uuid,text,jsonb,text[],timestamptz,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.mirror_apply(uuid,text,jsonb,text[],timestamptz,text)', 'EXECUTE')),
  ('لا إدراج مباشر في التعهّدات',
     NOT has_table_privilege('authenticated', 'public.support_pledges', 'INSERT')),
  ('لا إدراج مباشر في تقارير المكاتب',
     NOT has_table_privilege('authenticated', 'public.office_reports', 'INSERT')),
  -- RLS مفعّلة على كل الجداول الجديدة
  ('RLS مفعّلة على الجداول الجديدة',
     (SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname IN (
         'countries','operating_platforms','mirror_sync_state','mirror_groups','trait_dimensions',
         'trait_definitions','orphan_trait_scores','support_pledges','institution_kinds','offices',
         'office_roles','office_members','office_reports','donor_entities','donor_members',
         'pledge_deliveries','guardian_e_consents'))),
  -- الخزنة الخاصّة غير عامّة
  ('خزنة المكاتب خاصّة',
     (SELECT NOT public FROM storage.buckets WHERE id = 'office-media')),
  ('حماية الحشد مفعّلة (الحدّ ≥ 5)', public.cohort_min() >= 5),
  ('الدولة المفعّلة موجودة', EXISTS (SELECT 1 FROM public.countries WHERE status = 'active')),
  -- سلامة الحقيقة
  ('anon لا يقرأ سجلّ السلامة', NOT has_table_privilege('anon', 'public.integrity_log', 'SELECT')),
  ('سجلّ السلامة إلحاقٌ فقط', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'integrity_log_frozen')),
  ('المكفول لا يُحذف ولا تتغيّر هويته', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_locked_orphan')),
  ('الفكّ يحتاج موافقتين على الأقل', public.unlock_quorum() >= 2),
  ('الفاتورة المدفوعة مجمّدة', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'freeze_invoiced_payment')),
  ('معاملةٌ واحدة = فاتورةٌ واحدة', EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_payments_provider_payment')),
  ('كل دفعةٍ مدفوعة لها فاتورة', NOT EXISTS (SELECT 1 FROM public.sponsorship_payments
                                           WHERE status = 'paid' AND invoice_no IS NULL)),
  -- صحّة التشغيل
  ('الفحص الدوري للخادم وحده', NOT has_function_privilege('authenticated', 'public.ops_record_run()', 'EXECUTE')),
  ('سجلّ التشغيلات إلحاقٌ فقط', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_runs_frozen')),
  -- لغات الواجهة
  ('الزائر لا يقرأ جدول الترجمات', NOT has_table_privilege('anon', 'public.ui_translations', 'SELECT')),
  ('النشر للإدارة وحدها', has_function_privilege('authenticated', 'public.ui_translation_publish(text,text[])', 'EXECUTE')
                           AND NOT has_function_privilege('anon', 'public.ui_translation_publish(text,text[])', 'EXECUTE')),
  ('سجلّ مراجعات الترجمة إلحاقٌ فقط', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'uitr_frozen')),
  -- المرحلة صفر (bundle-after-20261001100000). قبل تطبيقها تظهر هذه false
  -- بلا خطأ: الدوالّ والجداول تُبحث بـ to_regprocedure/to_regclass أولاً.
  ('anon لا يكتب في أيّ جدولٍ في public',
     NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'p')
                    AND has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE'))),
  ('لا أحد يقرأ جهة الطفل مباشرةً (orphans.org_id)',
     NOT has_column_privilege('anon', 'public.orphans', 'org_id', 'SELECT')
     AND NOT has_column_privilege('authenticated', 'public.orphans', 'org_id', 'SELECT')),
  ('anon لا يقرأ المنطقة مباشرةً', NOT has_column_privilege('anon', 'public.orphans', 'region', 'SELECT')),
  ('anon لا يقرأ نصوص الاحتياج', NOT has_table_privilege('anon', 'public.orphan_needs', 'SELECT')),
  ('تقارير الطفل للكافل بدالّةٍ تختار الأعمدة',
     COALESCE(has_function_privilege('authenticated', to_regprocedure('public.orphan_progress_reports(uuid)'), 'EXECUTE')
              AND NOT has_function_privilege('anon', to_regprocedure('public.orphan_progress_reports(uuid)'), 'EXECUTE'), false)),
  ('موافقة الصورة بدالّتها وحدها',
     COALESCE(has_function_privilege('authenticated', to_regprocedure('public.record_photo_consent(uuid,text,uuid,text)'), 'EXECUTE')
              AND NOT has_function_privilege('anon', to_regprocedure('public.record_photo_consent(uuid,text,uuid,text)'), 'EXECUTE'), false)),
  ('خزنة صور الأطفال خاصّة', COALESCE((SELECT NOT public FROM storage.buckets WHERE id = 'orphan-photos'), false)),
  ('التعديل على ملفٍّ منشور يُمسَك للمراجعة',
     EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hold_public_edit')
     AND COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.orphan_pending_edits')), false)),
  ('لا نشر بلا وثيقتين موثَّقتين', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_require_publication_documents')),
  ('تفعيل الكفالة والصرف يُسجَّلان',
     EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_sponsorship_status')
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_disbursement_write'))
)
SELECT name, ok FROM checks ORDER BY ok, name;
