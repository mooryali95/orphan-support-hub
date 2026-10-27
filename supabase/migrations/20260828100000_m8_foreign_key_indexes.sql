-- =====================================================================
-- M8 — فهارس المفاتيح الأجنبية
-- ---------------------------------------------------------------------
-- جردٌ فعلي على القاعدة (لا اعتماداً على قائمة مكتوبة) كشف سبعة عشر
-- مفتاحاً أجنبياً بلا فهرس يبدأ بعموده. والقائمة في خارطة الطريق كانت
-- قديمة: الأعمدة الثلاثة المذكورة فيها مفهرسة أصلاً.
--
-- والفهرس ليس مجّانياً — يُبطئ كل إدراج ويأكل مساحة — فلا تُفهرَس
-- المفاتيح جملةً. المعيار هنا دليلان:
--
--   (١) العمود يظهر في سياسة RLS، فالفهرس يخدم **كل** استعلام على
--       الجدول لا استعلاماً بعينه.
--   (٢) أو الحذف من الأب يمسح الابن: `CASCADE` و`SET NULL` يفرضان مسحاً
--       تسلسلياً على كل جدول ابن عند حذف صفٍّ واحد من الأب.
--
-- وما لم يستوفِ أحدهما تُرك عمداً، وسببه مذكور في آخر الملف.
-- =====================================================================

-- ── (١) أعمدة في سياسات RLS ──────────────────────────────────────────

-- كلاهما في سياسات `orphans`: كل قراءة لولي أمر أو منشئ تمرّ بهما،
-- و`guardian_id` مستعمَل في `src/lib` أيضاً.
CREATE INDEX IF NOT EXISTS idx_orphans_guardian ON public.orphans(guardian_id)
  WHERE guardian_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orphans_created_by ON public.orphans(created_by)
  WHERE created_by IS NOT NULL;

-- ── (٢) أعمدة يمسحها الحذف من الأب ───────────────────────────────────

-- الأهمّ في الملف: `ON DELETE CASCADE` من `orphans`. حذف ملفٍّ واحد
-- يمسح الخطّ الزمني كله بلا هذا الفهرس. وهو في سياسة RLS أيضاً.
CREATE INDEX IF NOT EXISTS idx_timeline_orphan ON public.timeline_events(orphan_id);

-- الجدولان الأسرع نمواً في النظام — يكبران بكل حدث وكل قرار إداري، لا
-- بعدد الأيتام. وحذف مستخدم (حقّ المحو) يمسحهما بحثاً عن `SET NULL`.
CREATE INDEX IF NOT EXISTS idx_timeline_actor ON public.timeline_events(actor_id)
  WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id)
  WHERE actor_id IS NOT NULL;

-- التسوية مع المزوّد تبحث عن أحداث دفعةٍ بعينها، والحذف يمسح كذلك.
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON public.payment_events(payment_id)
  WHERE payment_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- ما تُرك عمداً — وسببه
-- ---------------------------------------------------------------------
-- أحد عشر مفتاحاً بقي بلا فهرس، وكلها `SET NULL` نحو `auth.users` أو
-- `care_organizations`:
--
--   orphans.reviewed_by / photo_consent_by
--   orphan_documents.uploaded_by / verified_by
--   progress_reports.created_by / reviewed_by
--   program_enrollments.created_by
--   disbursements.created_by
--   api_clients.org_id
--   api_import_jobs.client_id
--   programs.provider_org_id
--
-- ثلاثة أسباب:
--   • بيانات تدقيق تُكتب ولا يُبحث بها: لا سياسة RLS تذكرها ولا استعلام
--     في `src/` يرشّح عليها.
--   • جداولها محدودة بعدد الأيتام أو الجهات لا بعدد الأحداث، فالمسح
--     التسلسلي عليها يبقى رخيصاً حتى مع النمو.
--   • و`programs` و`api_clients` جداول عشرات الصفوف؛ الفهرس عليها كلفة
--     بلا عائد — يقرأ المخطِّط الجدول كاملاً وهو أسرع.
--
-- فإن صار محو المستخدمين عمليةً متكرّرة، أو بدأت المرحلة 6 فكبر
-- `api_import_jobs`، يُعاد النظر في هذه القائمة بقياسٍ لا بتقدير.
