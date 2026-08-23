-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin','sponsor','care_org','guardian');
CREATE TYPE public.orphan_status AS ENUM ('draft','submitted','under_review','approved','rejected','fully_sponsored','archived');
CREATE TYPE public.org_status AS ENUM ('pending','approved','suspended','rejected');
CREATE TYPE public.sponsorship_type AS ENUM ('monthly','one_time','partial');
CREATE TYPE public.sponsorship_status AS ENUM ('pending_payment','active','paused','cancelled','completed');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded');
CREATE TYPE public.need_category AS ENUM ('education','health','food','housing','clothing','other');
CREATE TYPE public.report_status AS ENUM ('submitted','approved','rejected');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  city TEXT,
  avatar_url TEXT,
  monthly_budget NUMERIC(12,2),
  preferred_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'sponsor')::public.app_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- CARE ORGANIZATIONS
-- =========================
CREATE TABLE public.care_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  license_number TEXT,
  city TEXT,
  region TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  about TEXT,
  logo_url TEXT,
  status public.org_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.care_organizations TO authenticated;
GRANT SELECT ON public.care_organizations TO anon;
GRANT ALL ON public.care_organizations TO service_role;
ALTER TABLE public.care_organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.care_organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.owns_org(_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.care_organizations o WHERE o.id = _org_id AND o.owner_id = auth.uid());
$$;

CREATE POLICY "orgs_public_read_approved" ON public.care_organizations FOR SELECT TO anon USING (status = 'approved');
CREATE POLICY "orgs_read_auth" ON public.care_organizations FOR SELECT TO authenticated USING (status = 'approved' OR owner_id = auth.uid() OR public.is_admin());
CREATE POLICY "orgs_insert_own" ON public.care_organizations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "orgs_update_own" ON public.care_organizations FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.is_admin()) WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- =========================
-- ORPHANS
-- =========================
CREATE TABLE public.orphans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male',
  birth_date DATE,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'SA',
  story TEXT,
  photo_url TEXT,
  education_stage TEXT,
  monthly_need NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  funded_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.orphan_status NOT NULL DEFAULT 'draft',
  org_id UUID REFERENCES public.care_organizations(id) ON DELETE SET NULL,
  guardian_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  external_ref TEXT,
  external_source TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_ref)
);
CREATE INDEX idx_orphans_status ON public.orphans(status);
CREATE INDEX idx_orphans_org ON public.orphans(org_id);
CREATE INDEX idx_orphans_region ON public.orphans(region);
GRANT SELECT, INSERT, UPDATE ON public.orphans TO authenticated;
GRANT SELECT ON public.orphans TO anon;
GRANT ALL ON public.orphans TO service_role;
ALTER TABLE public.orphans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orphans_updated BEFORE UPDATE ON public.orphans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_manage_orphan(_orphan_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orphans o
    WHERE o.id = _orphan_id
      AND (o.created_by = auth.uid() OR o.guardian_id = auth.uid() OR public.owns_org(o.org_id) OR public.is_admin())
  );
$$;

CREATE POLICY "orphans_public_read" ON public.orphans FOR SELECT TO anon USING (status IN ('approved','fully_sponsored'));
CREATE POLICY "orphans_read_auth" ON public.orphans FOR SELECT TO authenticated
  USING (status IN ('approved','fully_sponsored') OR created_by = auth.uid() OR guardian_id = auth.uid() OR public.owns_org(org_id) OR public.is_admin());
CREATE POLICY "orphans_insert" ON public.orphans FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (org_id IS NULL OR public.owns_org(org_id) OR public.is_admin()));
CREATE POLICY "orphans_update" ON public.orphans FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR guardian_id = auth.uid() OR public.owns_org(org_id) OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR guardian_id = auth.uid() OR public.owns_org(org_id) OR public.is_admin());

CREATE TABLE public.orphan_private (
  orphan_id UUID PRIMARY KEY REFERENCES public.orphans(id) ON DELETE CASCADE,
  full_name TEXT,
  national_id TEXT,
  guardian_name TEXT,
  guardian_relation TEXT,
  guardian_phone TEXT,
  address TEXT,
  family_size INT,
  family_income NUMERIC(12,2),
  health_notes TEXT,
  school_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orphan_private TO authenticated;
GRANT ALL ON public.orphan_private TO service_role;
ALTER TABLE public.orphan_private ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orphan_private_updated BEFORE UPDATE ON public.orphan_private FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "orphan_private_manage" ON public.orphan_private FOR ALL TO authenticated
  USING (public.can_manage_orphan(orphan_id)) WITH CHECK (public.can_manage_orphan(orphan_id));

CREATE TABLE public.orphan_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  category public.need_category NOT NULL,
  title TEXT NOT NULL,
  monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_needs_orphan ON public.orphan_needs(orphan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orphan_needs TO authenticated;
GRANT SELECT ON public.orphan_needs TO anon;
GRANT ALL ON public.orphan_needs TO service_role;
ALTER TABLE public.orphan_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "needs_public_read" ON public.orphan_needs FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.orphans o WHERE o.id = orphan_id AND o.status IN ('approved','fully_sponsored')));
CREATE POLICY "needs_read_auth" ON public.orphan_needs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orphans o WHERE o.id = orphan_id AND o.status IN ('approved','fully_sponsored')) OR public.can_manage_orphan(orphan_id));
CREATE POLICY "needs_write" ON public.orphan_needs FOR ALL TO authenticated
  USING (public.can_manage_orphan(orphan_id)) WITH CHECK (public.can_manage_orphan(orphan_id));

CREATE TABLE public.orphan_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_orphan ON public.orphan_documents(orphan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orphan_documents TO authenticated;
GRANT ALL ON public.orphan_documents TO service_role;
ALTER TABLE public.orphan_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs_manage" ON public.orphan_documents FOR ALL TO authenticated
  USING (public.can_manage_orphan(orphan_id)) WITH CHECK (public.can_manage_orphan(orphan_id));

-- =========================
-- SPONSORSHIPS
-- =========================
CREATE TABLE public.sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  type public.sponsorship_type NOT NULL DEFAULT 'monthly',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.sponsorship_status NOT NULL DEFAULT 'pending_payment',
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  message TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  provider TEXT,
  provider_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsorships_sponsor ON public.sponsorships(sponsor_id);
CREATE INDEX idx_sponsorships_orphan ON public.sponsorships(orphan_id);
GRANT SELECT, INSERT, UPDATE ON public.sponsorships TO authenticated;
GRANT ALL ON public.sponsorships TO service_role;
ALTER TABLE public.sponsorships ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sponsorships_updated BEFORE UPDATE ON public.sponsorships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sponsors_orphan(_orphan_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sponsorships s
    WHERE s.orphan_id = _orphan_id AND s.sponsor_id = auth.uid() AND s.status IN ('active','completed','paused')
  );
$$;

CREATE POLICY "sponsorships_read" ON public.sponsorships FOR SELECT TO authenticated
  USING (sponsor_id = auth.uid() OR public.can_manage_orphan(orphan_id) OR public.is_admin());
CREATE POLICY "sponsorships_insert_own" ON public.sponsorships FOR INSERT TO authenticated WITH CHECK (sponsor_id = auth.uid());
CREATE POLICY "sponsorships_update" ON public.sponsorships FOR UPDATE TO authenticated
  USING (sponsor_id = auth.uid() OR public.is_admin()) WITH CHECK (sponsor_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.recalc_orphan_funding()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _orphan UUID; _sum NUMERIC(12,2); _need NUMERIC(12,2);
BEGIN
  _orphan := COALESCE(NEW.orphan_id, OLD.orphan_id);
  SELECT COALESCE(SUM(amount),0) INTO _sum FROM public.sponsorships
    WHERE orphan_id = _orphan AND type IN ('monthly','partial') AND status IN ('active','paused');
  SELECT monthly_need INTO _need FROM public.orphans WHERE id = _orphan;
  UPDATE public.orphans SET funded_monthly = _sum,
    status = CASE WHEN status IN ('approved','fully_sponsored')
                  THEN (CASE WHEN _need > 0 AND _sum >= _need THEN 'fully_sponsored' ELSE 'approved' END)::public.orphan_status
                  ELSE status END
  WHERE id = _orphan;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_sponsorship_funding AFTER INSERT OR UPDATE OR DELETE ON public.sponsorships
FOR EACH ROW EXECUTE FUNCTION public.recalc_orphan_funding();

CREATE TABLE public.sponsorship_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id UUID NOT NULL REFERENCES public.sponsorships(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.payment_status NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_ref TEXT,
  receipt_url TEXT,
  paid_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_sponsorship ON public.sponsorship_payments(sponsorship_id);
GRANT SELECT, INSERT ON public.sponsorship_payments TO authenticated;
GRANT ALL ON public.sponsorship_payments TO service_role;
ALTER TABLE public.sponsorship_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read" ON public.sponsorship_payments FOR SELECT TO authenticated
  USING (sponsor_id = auth.uid() OR public.is_admin());
CREATE POLICY "payments_insert_own" ON public.sponsorship_payments FOR INSERT TO authenticated WITH CHECK (sponsor_id = auth.uid());

CREATE TABLE public.disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.care_organizations(id) ON DELETE SET NULL,
  orphan_id UUID REFERENCES public.orphans(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  period_start DATE,
  period_end DATE,
  reference TEXT,
  proof_url TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.disbursements TO authenticated;
GRANT ALL ON public.disbursements TO service_role;
ALTER TABLE public.disbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disb_read" ON public.disbursements FOR SELECT TO authenticated
  USING (public.is_admin() OR public.owns_org(org_id) OR public.sponsors_orphan(orphan_id));
CREATE POLICY "disb_write_admin" ON public.disbursements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.care_organizations(id) ON DELETE SET NULL,
  period TEXT NOT NULL,
  education_note TEXT,
  health_note TEXT,
  living_note TEXT,
  summary TEXT,
  attachment_url TEXT,
  status public.report_status NOT NULL DEFAULT 'submitted',
  review_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_orphan ON public.progress_reports(orphan_id);
GRANT SELECT, INSERT, UPDATE ON public.progress_reports TO authenticated;
GRANT ALL ON public.progress_reports TO service_role;
ALTER TABLE public.progress_reports ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.progress_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "reports_read" ON public.progress_reports FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR (status = 'approved' AND public.sponsors_orphan(orphan_id)) OR public.is_admin());
CREATE POLICY "reports_write" ON public.progress_reports FOR ALL TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin()) WITH CHECK (public.can_manage_orphan(orphan_id) OR public.is_admin());

CREATE TABLE public.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID REFERENCES public.orphans(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.timeline_events TO authenticated;
GRANT ALL ON public.timeline_events TO service_role;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline_read" ON public.timeline_events FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.sponsors_orphan(orphan_id) OR public.is_admin());
CREATE POLICY "timeline_insert" ON public.timeline_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_read_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_admin" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE public.api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_key TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  org_id UUID REFERENCES public.care_organizations(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_clients_admin" ON public.api_clients FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE public.api_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.api_clients(id) ON DELETE SET NULL,
  source TEXT,
  received_count INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_import_jobs TO authenticated;
GRANT ALL ON public.api_import_jobs TO service_role;
ALTER TABLE public.api_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_jobs_admin" ON public.api_import_jobs FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(_budget NUMERIC DEFAULT NULL, _region TEXT DEFAULT NULL, _limit INT DEFAULT 12)
RETURNS SETOF public.orphans LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.* FROM public.orphans o
  WHERE o.status = 'approved'
    AND (o.monthly_need - o.funded_monthly) > 0
    AND (_region IS NULL OR o.region = _region)
    AND (_budget IS NULL OR (o.monthly_need - o.funded_monthly) <= _budget * 1.5)
  ORDER BY (o.monthly_need - o.funded_monthly) DESC, o.created_at ASC
  LIMIT COALESCE(_limit, 12);
$$;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT) TO anon, authenticated;

-- =========================
-- DEMO DATA
-- =========================
INSERT INTO public.care_organizations (id, name, license_number, city, region, contact_email, about, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'جمعية بناء لرعاية الأيتام', 'LIC-1024', 'الرياض', 'الرياض', 'care@bina.example', 'جمعية أهلية مرخّصة ترعى الأيتام وأسرهم منذ 2005.', 'approved'),
  ('22222222-2222-4222-8222-222222222222', 'دار الرحمة للرعاية الاجتماعية', 'LIC-2087', 'جدة', 'مكة المكرمة', 'info@rahma.example', 'دار رعاية اجتماعية تُعنى بالأيتام والأسر المحتاجة.', 'approved');

INSERT INTO public.orphans (code, display_name, gender, birth_date, city, region, story, education_stage, monthly_need, funded_monthly, status, org_id, approved_at)
VALUES
  ('ORP-1001', 'محمد . أ', 'male', '2015-04-12', 'الرياض', 'الرياض', 'فقد والده قبل ثلاث سنوات، متفوق دراسياً ويحب الرياضيات. يحتاج دعماً لمصاريف الدراسة والمعيشة.', 'ابتدائي', 120, 40, 'approved', '11111111-1111-4111-8111-111111111111', now()),
  ('ORP-1002', 'ريم . س', 'female', '2013-09-03', 'جدة', 'مكة المكرمة', 'تعيش مع والدتها وأخوين، تحتاج دعماً للعلاج الدوري ومصاريف المدرسة.', 'متوسط', 150, 0, 'approved', '22222222-2222-4222-8222-222222222222', now()),
  ('ORP-1003', 'عبدالله . م', 'male', '2011-01-22', 'الدمام', 'الشرقية', 'طالب في المرحلة المتوسطة، يبرع في الحاسب ويحتاج جهاز دراسة ودعماً شهرياً.', 'متوسط', 100, 100, 'fully_sponsored', '11111111-1111-4111-8111-111111111111', now()),
  ('ORP-1004', 'سارة . ن', 'female', '2017-06-30', 'الرياض', 'الرياض', 'طفلة في الروضة، والدتها تعمل بدوام جزئي والأسرة بحاجة لدعم الغذاء والملبس.', 'روضة', 90, 30, 'approved', '11111111-1111-4111-8111-111111111111', now()),
  ('ORP-1005', 'يوسف . ح', 'male', '2009-11-17', 'المدينة المنورة', 'المدينة المنورة', 'طالب ثانوي يطمح لدراسة الهندسة، يحتاج دعماً للدروس والمواصلات.', 'ثانوي', 180, 60, 'approved', '22222222-2222-4222-8222-222222222222', now());

INSERT INTO public.orphan_needs (orphan_id, category, title, monthly_amount)
SELECT o.id, 'education'::public.need_category, 'مصاريف دراسية وقرطاسية', ROUND(o.monthly_need * 0.4, 2) FROM public.orphans o
UNION ALL
SELECT o.id, 'food'::public.need_category, 'سلة غذائية شهرية', ROUND(o.monthly_need * 0.35, 2) FROM public.orphans o
UNION ALL
SELECT o.id, 'health'::public.need_category, 'رعاية صحية ومتابعة', ROUND(o.monthly_need * 0.25, 2) FROM public.orphans o;