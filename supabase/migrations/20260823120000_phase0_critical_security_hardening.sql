-- =====================================================================
-- المرحلة 0 — إغلاق الثغرات الحرجة
-- =====================================================================
-- تعالج هذه الهجرة الثغرات C1–C5 و H1–H4 الموثّقة في
-- docs/analysis-and-roadmap.ar.md
--
-- المبدأ الحاكم: مفتاح publishable منشور في حزمة المتصفّح بحكم التصميم،
-- أي أن أي مستخدم مسجَّل يخاطب REST API مباشرةً متجاوزاً واجهة التطبيق.
-- لذلك لا يكفي التحقّق في دوال الخادم — كل قيد يجب أن يُفرض في القاعدة.
--
-- نمط الحرّاس أدناه:
--   * الدوال SECURITY INVOKER عمداً (لا DEFINER) كي يبقى current_user
--     هو 'authenticated'؛ فـ SECURITY DEFINER يبدّله إلى مالك الدالة
--     ويُعطّل الحارس بالكامل.
--   * pg_trigger_depth() > 1 يسمح للمُشغّلات المتداخلة (مثل
--     recalc_orphan_funding) بالمرور — ولا يمكن للعميل انتحاله.
--   * current_user NOT IN ('authenticated','anon') يسمح لـ service_role
--     ولاتصالات الهجرات بالمرور، وهو ما تحتاجه webhooks المرحلة 3.
-- =====================================================================


-- =====================================================================
-- C1 — تصعيد صلاحيات إلى «مدير النظام» عند التسجيل
-- ---------------------------------------------------------------------
-- كان الدور يُقرأ حرفياً من raw_user_meta_data وهو تحت سيطرة العميل،
-- فيمنح signUp({ data: { role: 'admin' } }) صلاحيات كاملة.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requested TEXT;
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- الأدوار القابلة للإسناد الذاتي عند التسجيل فقط.
  -- 'admin' و'guardian' يُسندان يدوياً عبر service_role — انظر docs/runbook.ar.md
  _requested := NULLIF(NEW.raw_user_meta_data->>'role', '');
  _role := CASE
             WHEN _requested IN ('sponsor', 'care_org') THEN _requested::public.app_role
             ELSE 'sponsor'::public.app_role
           END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- C2 — الكافل يُفعّل كفالته بنفسه دون دفع
-- ---------------------------------------------------------------------
-- كانت سياسة UPDATE تسمح للكافل بتعديل أي عمود، فيضبط status='active'
-- ويستدعي مُشغّل التمويل الذي يرفع funded_monthly بلا أي دفعة.
-- =====================================================================

-- الحالة والحقول المالية تُضبط من الخادم عند الإنشاء، لا من العميل.
CREATE OR REPLACE FUNCTION public.guard_sponsorship_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _currency TEXT;
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  -- لا تُنشأ كفالة إلا على ملف منشور فعلياً.
  SELECT o.currency INTO _currency
  FROM public.orphans o
  WHERE o.id = NEW.orphan_id AND o.status IN ('approved', 'fully_sponsored');

  IF _currency IS NULL THEN
    RAISE EXCEPTION 'sponsorship: orphan is not open for sponsorship'
      USING ERRCODE = '42501';
  END IF;

  NEW.sponsor_id              := auth.uid();
  NEW.currency                := _currency;
  NEW.status                  := 'pending_payment';
  NEW.started_at              := NULL;
  NEW.ended_at                := NULL;
  NEW.next_charge_at          := NULL;
  NEW.provider                := NULL;
  NEW.provider_subscription_id := NULL;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_sponsorship_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id
     OR NEW.orphan_id IS DISTINCT FROM OLD.orphan_id THEN
    RAISE EXCEPTION 'sponsorship: sponsor_id and orphan_id are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'sponsorship: financial fields are server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_subscription_id IS DISTINCT FROM OLD.provider_subscription_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.next_charge_at IS DISTINCT FROM OLD.next_charge_at THEN
    RAISE EXCEPTION 'sponsorship: payment provider fields are server-managed'
      USING ERRCODE = '42501';
  END IF;

  -- الكافل يلغي فقط؛ التفعيل يأتي من webhook بوابة الدفع عبر service_role.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'sponsorship: status transition is server-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_sponsorship_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_sponsorship_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_sponsorship_insert ON public.sponsorships;
CREATE TRIGGER trg_guard_sponsorship_insert
BEFORE INSERT ON public.sponsorships FOR EACH ROW
EXECUTE FUNCTION public.guard_sponsorship_insert();

DROP TRIGGER IF EXISTS trg_guard_sponsorship_update ON public.sponsorships;
CREATE TRIGGER trg_guard_sponsorship_update
BEFORE UPDATE ON public.sponsorships FOR EACH ROW
EXECUTE FUNCTION public.guard_sponsorship_update();


-- =====================================================================
-- C3 — تزوير سجلّ المدفوعات من المتصفّح
-- ---------------------------------------------------------------------
-- الدفتر المالي مصدر الحقيقة للصرف على الأيتام؛ يُكتب من webhook المزوّد
-- عبر service_role حصراً. المستخدم يقرأ ولا يكتب.
-- =====================================================================

DROP POLICY IF EXISTS "payments_insert_own" ON public.sponsorship_payments;
REVOKE INSERT ON public.sponsorship_payments FROM authenticated;


-- =====================================================================
-- C4 — جهة الرعاية تعتمد نفسها
-- ---------------------------------------------------------------------
-- كان المالك يضبط status='approved' فتظهر جهته للعامة كـ«جهة معتمدة».
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guard_org_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  NEW.owner_id := auth.uid();
  NEW.status   := 'pending';
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_org_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'organization: approval status is admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'organization: owner_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_org_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_org_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_org_insert ON public.care_organizations;
CREATE TRIGGER trg_guard_org_insert
BEFORE INSERT ON public.care_organizations FOR EACH ROW
EXECUTE FUNCTION public.guard_org_insert();

DROP TRIGGER IF EXISTS trg_guard_org_update ON public.care_organizations;
CREATE TRIGGER trg_guard_org_update
BEFORE UPDATE ON public.care_organizations FOR EACH ROW
EXECUTE FUNCTION public.guard_org_update();

-- مستخدم واحد = جهة واحدة (البيانات التجريبية بلا مالك، وNULL لا يتعارض).
CREATE UNIQUE INDEX IF NOT EXISTS uq_care_org_owner
  ON public.care_organizations(owner_id) WHERE owner_id IS NOT NULL;


-- =====================================================================
-- C5 — أي مستخدم ينشئ ملف يتيم وينشره في الدليل العام
-- ---------------------------------------------------------------------
-- كان الشرط org_id IS NULL يفتح الإنشاء للجميع، ثم يعتمد المُنشئ ملفه
-- بنفسه فيتجاوز طابور المراجعة كلياً.
-- =====================================================================

DROP POLICY IF EXISTS "orphans_insert" ON public.orphans;
CREATE POLICY "orphans_insert" ON public.orphans FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.care_organizations o
        WHERE o.id = org_id
          AND o.owner_id = auth.uid()
          AND o.status = 'approved'
      )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_orphan_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  NEW.created_by      := auth.uid();
  NEW.funded_monthly  := 0;
  NEW.approved_at     := NULL;
  NEW.rejection_reason := NULL;
  NEW.external_ref    := NULL;
  NEW.external_source := NULL;

  -- الجهة تنشئ مسودة أو ترسل للمراجعة؛ لا أكثر.
  IF NEW.status NOT IN ('draft', 'submitted') THEN
    NEW.status := 'draft';
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_orphan_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- يسمح لـ recalc_orphan_funding() بالمرور (مُشغّل متداخل).
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.funded_monthly IS DISTINCT FROM OLD.funded_monthly THEN
    RAISE EXCEPTION 'orphan: funded_monthly is trigger-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'orphan: review fields are admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.external_ref IS DISTINCT FROM OLD.external_ref
     OR NEW.external_source IS DISTINCT FROM OLD.external_source THEN
    RAISE EXCEPTION 'orphan: external reference is integration-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'orphan: identity fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  -- الاعتماد والرفض والأرشفة للإدارة وحدها.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('draft', 'rejected') AND NEW.status = 'submitted') THEN
    RAISE EXCEPTION 'orphan: status transition is admin-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_orphan_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_orphan_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_orphan_insert ON public.orphans;
CREATE TRIGGER trg_guard_orphan_insert
BEFORE INSERT ON public.orphans FOR EACH ROW
EXECUTE FUNCTION public.guard_orphan_insert();

DROP TRIGGER IF EXISTS trg_guard_orphan_update ON public.orphans;
CREATE TRIGGER trg_guard_orphan_update
BEFORE UPDATE ON public.orphans FOR EACH ROW
EXECUTE FUNCTION public.guard_orphan_update();


-- =====================================================================
-- H1 — جهة الرعاية تعتمد تقاريرها الدورية بنفسها
-- ---------------------------------------------------------------------
-- كانت سياسة FOR ALL تسمح بضبط status='approved' وreview_note في نفس
-- الطلب، فيصل التقرير للكافل بلا أي مراجعة.
-- =====================================================================

DROP POLICY IF EXISTS "reports_write" ON public.progress_reports;

DROP POLICY IF EXISTS "reports_insert" ON public.progress_reports;
CREATE POLICY "reports_insert" ON public.progress_reports FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_orphan(orphan_id) OR public.is_admin());

DROP POLICY IF EXISTS "reports_update" ON public.progress_reports;
CREATE POLICY "reports_update" ON public.progress_reports FOR UPDATE TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin())
  WITH CHECK (public.can_manage_orphan(orphan_id) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.guard_report_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by  := auth.uid();
    NEW.status      := 'submitted';
    NEW.review_note := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'report: review decision is admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_note IS DISTINCT FROM OLD.review_note THEN
    RAISE EXCEPTION 'report: review_note is admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.orphan_id IS DISTINCT FROM OLD.orphan_id THEN
    RAISE EXCEPTION 'report: orphan_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_report_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_report_write ON public.progress_reports;
CREATE TRIGGER trg_guard_report_write
BEFORE INSERT OR UPDATE ON public.progress_reports FOR EACH ROW
EXECUTE FUNCTION public.guard_report_write();


-- =====================================================================
-- H2 — تسريب أعمدة داخلية عبر REST المباشر
-- ---------------------------------------------------------------------
-- كان GRANT SELECT على مستوى الجدول يكشف guardian_id و created_by و
-- external_ref و rejection_reason للزوّار، مهما اختارت دوال الخادم.
-- الأعمدة أدناه هي بالضبط PUBLIC_COLUMNS في src/lib/orphans.functions.ts
-- (وتشمل ما تحتاجه سياسات RLS وشروط WHERE/ORDER BY).
-- =====================================================================

REVOKE SELECT ON public.orphans FROM anon;
GRANT SELECT (
  id, code, display_name, gender, birth_date, city, region, story,
  photo_url, education_stage, monthly_need, funded_monthly, currency,
  status, org_id, created_at
) ON public.orphans TO anon;

REVOKE SELECT ON public.care_organizations FROM anon;
GRANT SELECT (
  id, name, city, region, about, logo_url, status
) ON public.care_organizations TO anon;

-- دالة الترشيح كانت RETURNS SETOF public.orphans، أي تُعيد كل الأعمدة
-- الداخلية لـ anon متجاوزةً RLS بحكم SECURITY DEFINER.
DROP FUNCTION IF EXISTS public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT);

CREATE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _limit INT DEFAULT 12
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  display_name TEXT,
  gender TEXT,
  birth_date DATE,
  city TEXT,
  region TEXT,
  story TEXT,
  photo_url TEXT,
  education_stage TEXT,
  monthly_need NUMERIC,
  funded_monthly NUMERIC,
  currency TEXT,
  status public.orphan_status,
  org_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.code, o.display_name, o.gender, o.birth_date, o.city, o.region,
         o.story, o.photo_url, o.education_stage, o.monthly_need, o.funded_monthly,
         o.currency, o.status, o.org_id, o.created_at
  FROM public.orphans o
  WHERE o.status = 'approved'
    AND (o.monthly_need - o.funded_monthly) > 0
    AND (_region IS NULL OR o.region = _region)
    AND (_budget IS NULL OR (o.monthly_need - o.funded_monthly) <= _budget * 1.5)
  ORDER BY (o.monthly_need - o.funded_monthly) DESC, o.created_at ASC
  LIMIT COALESCE(_limit, 12);
$$;

REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT) TO anon, authenticated;


-- =====================================================================
-- H4 — حقن أحداث في الخط الزمني لأي يتيم
-- ---------------------------------------------------------------------
-- كان الشرط الوحيد actor_id = auth.uid() بلا أي علاقة بـ orphan_id.
-- الخط الزمني سجلّ موثوق يقرؤه الكفلاء والإدارة — يُكتب من الخادم فقط.
-- =====================================================================

DROP POLICY IF EXISTS "timeline_insert" ON public.timeline_events;
REVOKE INSERT ON public.timeline_events FROM authenticated;
