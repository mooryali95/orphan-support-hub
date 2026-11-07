-- ملف نشر كهاتين — كل الهجرات بعد 20261106140000
-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: 2026-11-07T15:06Z
BEGIN;

-- >>> migration 20261107100000 care_org_self_onboarding
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261107100000') THEN
    RAISE EXCEPTION 'الهجرة 20261107100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة ٢ — جهة الرعاية تُسجّل نفسها، وبتحقّقٍ يكفي لتمرير بيانات طفلٍ ومال
-- ---------------------------------------------------------------------
--   UX-03   لا طريق في الواجهة يمنح دور «جهة رعاية»: من سجّل حساباً لا
--           يصل إلى /org ولا إلى نموذج تسجيل الجهة، والأسئلة الشائعة تَعِد
--           بغير ذلك.
--   PRD-16  التسجيل اسمٌ ورقم ترخيصٍ اختياري، والاعتماد ضغطةٌ واحدة بلا
--           وثيقةٍ ولا ممثّلٍ قانوني ولا عنوان.
--
-- الآن:
--   • `register_care_organization` (DEFINER) يُنشئ الجهة «بانتظار الاعتماد»
--     ويمنح صاحبها دور care_org في معاملةٍ واحدة، ويطلب الحدّ الأدنى من
--     «اعرف عميلك»: الاسم القانوني، رقم التسجيل/الترخيص، الدولة (من الدول
--     العاملة)، العنوان، الممثّل القانوني، ووسيلة تواصل.
--   • بيانات التحقّق في `care_org_kyc` ووثائقه في `care_org_documents`:
--     جدولان بلا منحٍ للعموم — لا يقرؤهما إلا صاحب الجهة والإدارة عبر
--     دوالّ. فعمود `care_organizations` مقروءٌ لكلّ مسجَّل في الجهات
--     المعتمدة، والممثّل وعنوانه ليسا بيانات دليل.
--   • الوثائق في خزنةٍ خاصّة `org-documents`، مجلّدها الأوّل معرّف الجهة،
--     ولا تُسجَّل وثيقةٌ لا ملفّ لها في الخزنة.
--   • `review_organization` بالتوقيع نفسه: لا اعتماد بلا بيانات تحقّقٍ
--     كاملة ووثيقة تسجيلٍ أو ترخيص، ولا رفض بلا سبب؛ والرفض يُبقي الدور
--     فتُصحّح الجهة وتُعيد التقديم.
--
-- كلّ ما هنا IF NOT EXISTS و`CREATE OR REPLACE`، وكلّ كائنٍ جديد يُسحب من
-- العموم ثم يُمنح لمن قُصد له.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.care_org_kyc (
  org_id              UUID PRIMARY KEY REFERENCES public.care_organizations(id) ON DELETE CASCADE,
  legal_name          TEXT NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 3 AND 200),
  registration_number TEXT NOT NULL CHECK (length(btrim(registration_number)) BETWEEN 2 AND 80),
  country_code        TEXT NOT NULL REFERENCES public.countries(code),
  address             TEXT NOT NULL CHECK (length(btrim(address)) BETWEEN 5 AND 400),
  legal_rep_name      TEXT NOT NULL CHECK (length(btrim(legal_rep_name)) BETWEEN 3 AND 140),
  legal_rep_title     TEXT CHECK (legal_rep_title IS NULL OR length(legal_rep_title) <= 120),
  contact_email       TEXT CHECK (contact_email IS NULL OR contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone       TEXT CHECK (contact_phone IS NULL OR length(contact_phone) BETWEEN 5 AND 40),
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision_note       TEXT,
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  CONSTRAINT care_org_kyc_contact CHECK (contact_email IS NOT NULL OR contact_phone IS NOT NULL)
);
ALTER TABLE public.care_org_kyc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.care_org_kyc FROM anon, authenticated;
GRANT ALL ON TABLE public.care_org_kyc TO service_role;

CREATE TABLE IF NOT EXISTS public.care_org_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.care_organizations(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('registration_certificate', 'license',
                                             'representative_id', 'other')),
  storage_path TEXT NOT NULL UNIQUE,
  file_name    TEXT,
  mime_type    TEXT,
  size_bytes   INTEGER,
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_org_documents_org ON public.care_org_documents(org_id);
ALTER TABLE public.care_org_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.care_org_documents FROM anon, authenticated;
GRANT ALL ON TABLE public.care_org_documents TO service_role;

-- ---------------------------------------------------------------------
-- الخزنة: مجلّدٌ لكلّ جهة، يكتب فيه صاحبها ويقرؤه هو والإدارة
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-documents', 'org-documents', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

/* صاحب الجهة — بأيّ حال، إلا الموقوفة: `owns_org` تطلب الاعتماد، والوثائق
   تُرفع قبله. */
CREATE OR REPLACE FUNCTION public.owns_org_folder(_path TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  IF _id IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.care_organizations c
                  WHERE c.id = _id AND c.owner_id = auth.uid() AND c.status <> 'suspended');
END $fn$;
REVOKE ALL ON FUNCTION public.owns_org_folder(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_org_folder(TEXT) TO authenticated;

DROP POLICY IF EXISTS org_docs_read ON storage.objects;
CREATE POLICY org_docs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-documents' AND (public.is_admin() OR public.owns_org_folder(name)));
DROP POLICY IF EXISTS org_docs_write ON storage.objects;
CREATE POLICY org_docs_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-documents' AND public.owns_org_folder(name));

-- ---------------------------------------------------------------------
-- التسجيل الذاتي
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_care_organization(_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid      UUID := auth.uid();
  _name     TEXT := btrim(COALESCE(_payload->>'name', ''));
  _legal    TEXT := btrim(COALESCE(_payload->>'legal_name', ''));
  _reg      TEXT := btrim(COALESCE(_payload->>'registration_number', ''));
  _country  TEXT := upper(btrim(COALESCE(_payload->>'country_code', '')));
  _address  TEXT := btrim(COALESCE(_payload->>'address', ''));
  _rep      TEXT := btrim(COALESCE(_payload->>'legal_rep_name', ''));
  _rep_t    TEXT := NULLIF(btrim(COALESCE(_payload->>'legal_rep_title', '')), '');
  _email    TEXT := NULLIF(lower(btrim(COALESCE(_payload->>'contact_email', ''))), '');
  _phone    TEXT := NULLIF(btrim(COALESCE(_payload->>'contact_phone', '')), '');
  _city     TEXT := NULLIF(btrim(COALESCE(_payload->>'city', '')), '');
  _region   TEXT := NULLIF(btrim(COALESCE(_payload->>'region', '')), '');
  _about    TEXT := NULLIF(btrim(COALESCE(_payload->>'about', '')), '');
  _org      UUID;
  _status   TEXT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'register_care_organization: sign in first' USING ERRCODE = '42501';
  END IF;

  IF length(_name) NOT BETWEEN 3 AND 140 THEN
    RAISE EXCEPTION 'register_care_organization: name is required' USING ERRCODE = '22023';
  END IF;
  IF length(_legal) < 3 OR length(_reg) < 2 OR length(_address) < 5 OR length(_rep) < 3 THEN
    RAISE EXCEPTION 'register_care_organization: legal name, registration number, address and legal representative are required'
      USING ERRCODE = '22023';
  END IF;
  IF _email IS NULL AND _phone IS NULL THEN
    RAISE EXCEPTION 'register_care_organization: a contact email or phone is required'
      USING ERRCODE = '22023';
  END IF;
  IF _email IS NOT NULL AND _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'register_care_organization: invalid contact email' USING ERRCODE = '22023';
  END IF;
  -- دولةٌ تعمل فيها المنصّة — لا «مخطّطة» يُسجَّل فيها ما لا يُراجَع.
  IF NOT EXISTS (SELECT 1 FROM public.countries
                  WHERE code = _country AND status IN ('active', 'emergency')) THEN
    RAISE EXCEPTION 'register_care_organization: country % is not an operating country', _country
      USING ERRCODE = '22023';
  END IF;

  SELECT id, status::text INTO _org, _status
    FROM public.care_organizations WHERE owner_id = _uid;

  IF _org IS NOT NULL AND _status IN ('approved', 'suspended') THEN
    -- بيانات جهةٍ معتمدة لا تُبدَّل من طرفها: تغييرها يمرّ بالإدارة.
    RAISE EXCEPTION 'register_care_organization: you already have a % organisation', _status
      USING ERRCODE = '42501';
  END IF;

  IF _org IS NULL THEN
    INSERT INTO public.care_organizations
      (owner_id, name, license_number, country_code, city, region, contact_email,
       contact_phone, about, status)
    VALUES (_uid, _name, _reg, _country, _city, _region, _email, _phone, _about, 'pending')
    RETURNING id INTO _org;
  ELSE
    -- طلبٌ معلّق يُكمَّل، أو مرفوضٌ يُصحَّح ويعود إلى صندوق الإدارة.
    UPDATE public.care_organizations
       SET name = _name, license_number = _reg, country_code = _country, city = _city,
           region = _region, contact_email = _email, contact_phone = _phone, about = _about,
           status = 'pending', updated_at = now()
     WHERE id = _org;
  END IF;

  INSERT INTO public.care_org_kyc
    (org_id, legal_name, registration_number, country_code, address, legal_rep_name,
     legal_rep_title, contact_email, contact_phone, submitted_at)
  VALUES (_org, _legal, _reg, _country, _address, _rep, _rep_t, _email, _phone, now())
  ON CONFLICT (org_id) DO UPDATE SET
    legal_name = EXCLUDED.legal_name, registration_number = EXCLUDED.registration_number,
    country_code = EXCLUDED.country_code, address = EXCLUDED.address,
    legal_rep_name = EXCLUDED.legal_rep_name, legal_rep_title = EXCLUDED.legal_rep_title,
    contact_email = EXCLUDED.contact_email, contact_phone = EXCLUDED.contact_phone,
    submitted_at = now();

  -- الدور لا يفتح شيئاً في القاعدة بذاته: كلّ كتابةٍ تسأل `owns_org` (معتمدة).
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'care_org')
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit(
    CASE WHEN _status IS NULL THEN 'organization.registered' ELSE 'organization.resubmitted' END,
    'care_organization', _org,
    jsonb_build_object('country', _country, 'previous', _status));

  RETURN jsonb_build_object('id', _org, 'status', 'pending');
END $fn$;
REVOKE ALL ON FUNCTION public.register_care_organization(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_care_organization(JSONB) TO authenticated;

/* وثيقة تحقّق: ملفٌّ في مجلّد الجهة نفسها وموجودٌ فعلاً في الخزنة. */
CREATE OR REPLACE FUNCTION public.attach_care_org_document(
  _org UUID, _kind TEXT, _path TEXT, _file_name TEXT DEFAULT NULL,
  _mime TEXT DEFAULT NULL, _size INTEGER DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.care_organizations
                  WHERE id = _org AND owner_id = auth.uid() AND status IN ('pending', 'rejected')) THEN
    RAISE EXCEPTION 'attach_care_org_document: not your organisation, or not under review'
      USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('registration_certificate', 'license', 'representative_id', 'other') THEN
    RAISE EXCEPTION 'attach_care_org_document: unknown kind %', _kind USING ERRCODE = '22023';
  END IF;
  IF _path IS NULL OR _path NOT LIKE _org::text || '/%' OR _path LIKE '%..%'
     OR (storage.foldername(_path))[1] <> _org::text
     OR array_length(storage.foldername(_path), 1) <> 1 THEN
    RAISE EXCEPTION 'attach_care_org_document: path outside the organisation folder'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'org-documents' AND name = _path) THEN
    RAISE EXCEPTION 'attach_care_org_document: no uploaded file at %', _path USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM public.care_org_documents WHERE org_id = _org) >= 12 THEN
    RAISE EXCEPTION 'attach_care_org_document: too many documents' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.care_org_documents (org_id, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (_org, _kind, _path, left(_file_name, 255), left(_mime, 120), _size, auth.uid())
  ON CONFLICT (storage_path) DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.attach_care_org_document(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_care_org_document(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_care_org_document(_doc UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  DELETE FROM public.care_org_documents d
   USING public.care_organizations c
   WHERE d.id = _doc AND c.id = d.org_id AND c.owner_id = auth.uid()
     AND c.status IN ('pending', 'rejected');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'remove_care_org_document: not yours, or not under review' USING ERRCODE = '42501';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.remove_care_org_document(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_care_org_document(UUID) TO authenticated;

/* ما ينقص الجهة لتُعتمد — يقرؤه صاحبها والإدارة من المصدر نفسه. */
CREATE OR REPLACE FUNCTION public.care_org_kyc_missing(_org UUID)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT array_remove(ARRAY[
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.care_org_kyc k WHERE k.org_id = _org)
         THEN 'kyc' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.care_org_documents d
                           WHERE d.org_id = _org AND d.kind IN ('registration_certificate', 'license'))
         THEN 'registration_document' END], NULL);
$fn$;
REVOKE ALL ON FUNCTION public.care_org_kyc_missing(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_care_org_kyc()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE WHEN c.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(
    'org_id', c.id, 'status', c.status,
    'kyc', (SELECT to_jsonb(k) - 'reviewed_by' FROM public.care_org_kyc k WHERE k.org_id = c.id),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'id', d.id, 'kind', d.kind, 'file_name', d.file_name, 'created_at', d.created_at)
                     ORDER BY d.created_at)
                   FROM public.care_org_documents d WHERE d.org_id = c.id), '[]'::jsonb),
    'missing', to_jsonb(public.care_org_kyc_missing(c.id))) END
    FROM (SELECT NULL::uuid) dummy
    LEFT JOIN public.care_organizations c ON c.owner_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.my_care_org_kyc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_care_org_kyc() TO authenticated;

-- ---------------------------------------------------------------------
-- القرار: لا اعتماد بلا تحقّق، ولا رفض بلا سبب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_organization(_id uuid, _decision text, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _prev TEXT; _owner UUID; _name TEXT; _missing TEXT[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_organization: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'review_organization: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;

  SELECT status::text, owner_id, name INTO _prev, _owner, _name
    FROM public.care_organizations WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_organization: no organisation %', _id USING ERRCODE = 'P0002';
  END IF;

  IF _decision = 'approved' AND _prev <> 'approved' THEN
    _missing := public.care_org_kyc_missing(_id);
    IF cardinality(_missing) > 0 THEN
      RAISE EXCEPTION 'review_organization: verification incomplete (%)', array_to_string(_missing, ', ')
        USING ERRCODE = '23514';
    END IF;
  END IF;
  -- الجهة المرفوضة تُصحّح ما لا تعرفه إن لم يُقل لها.
  IF _decision IN ('rejected', 'suspended') AND length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'review_organization: a reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.care_organizations
     SET status = _decision::public.org_status, updated_at = now()
   WHERE id = _id;

  UPDATE public.care_org_kyc
     SET decision_note = _reason, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE org_id = _id;

  PERFORM public.notify(_owner,
    CASE WHEN _decision = 'approved' THEN 'organization_approved'::public.notification_kind
         ELSE 'organization_rejected'::public.notification_kind END,
    CASE WHEN _decision = 'approved' THEN 'اعتُمدت جهتك ' || COALESCE(_name, '')
         ELSE 'قرار بشأن جهتك ' || COALESCE(_name, '') END,
    CASE WHEN _decision = 'approved' THEN 'يمكنك الآن رفع ملفات الأيتام.'
         ELSE COALESCE(_reason, 'يُرجى التواصل مع الإدارة.') END,
    '/org', 'care_organization', _id);

  PERFORM public.write_audit('organization.' || _decision, 'care_organization', _id,
    jsonb_build_object('from', _prev, 'to', _decision, 'reason', _reason));
END $function$;
REVOKE ALL ON FUNCTION public.review_organization(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_organization(UUID, TEXT, TEXT) TO authenticated;

/* سياق القرار: بيانات التحقّق ووثائقه وما ينقص — للإدارة وحدها. */
CREATE OR REPLACE FUNCTION public.admin_care_org_context(_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT (to_jsonb(c) - 'owner_id')
           || COALESCE((SELECT jsonb_build_object(
                'legal_name', k.legal_name, 'registration_number', k.registration_number,
                'address', k.address, 'legal_rep_name', k.legal_rep_name,
                'legal_rep_title', k.legal_rep_title, 'kyc_email', k.contact_email,
                'kyc_phone', k.contact_phone, 'submitted_at', k.submitted_at,
                'decision_note', k.decision_note)
                FROM public.care_org_kyc k WHERE k.org_id = c.id), '{}'::jsonb)
           || jsonb_build_object(
                'owner_email', (SELECT u.email FROM auth.users u WHERE u.id = c.owner_id),
                'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                 'id', d.id, 'kind', d.kind, 'file_name', d.file_name,
                                 'storage_path', d.storage_path, 'created_at', d.created_at)
                                 ORDER BY d.created_at)
                               FROM public.care_org_documents d WHERE d.org_id = c.id), '[]'::jsonb),
                'missing', to_jsonb(public.care_org_kyc_missing(c.id)))
      FROM public.care_organizations c WHERE c.id = _id);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_care_org_context(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_care_org_context(UUID) TO authenticated;

-- السياق العامّ للصندوق كما هو، إلا الجهة: تُقرأ من سياقها الكامل.
CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind text, _id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN public.admin_care_org_context(_id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    WHEN 'orphan_edit' THEN (SELECT jsonb_build_object(
                          'code', o.code, 'name', o.display_name, 'status', o.status,
                          'proposed', pe.changes, 'published', pe.previous,
                          'via', pe.via, 'created_at', COALESCE(pe.updated_at, o.updated_at),
                          'needs_text', (SELECT jsonb_agg(jsonb_build_object(
                                            'category', n.category, 'title', n.title,
                                            'notes', n.notes, 'amount', n.monthly_amount)
                                          ORDER BY n.created_at)
                                           FROM public.orphan_needs n
                                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
                          FROM public.orphans o
                          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
                         WHERE o.id = _id)
    WHEN 'circle_role' THEN public.admin_circle_role_context(_id)
    WHEN 'circle_role_renewal' THEN public.admin_circle_role_context(_id)
    ELSE NULL END;
END $function$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261107100000', 'care_org_self_onboarding');

-- >>> migration 20261107110000 intake_drafts_country_region
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261107110000') THEN
    RAISE EXCEPTION 'الهجرة 20261107110000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة ٢ — ملفّ الطفل: مسودّةٌ في الخادم، وتصحيحٌ بعد الرفض، ودولةٌ وعملة
-- ---------------------------------------------------------------------
--   UX-04   الملفّ المرفوض أو المسودّة أو المُقدَّم بلا إجراء: لا «أكمل» ولا
--           «صحّح» ولا عرض. والمسودّة في متصفّحٍ واحد (بلا حقولها السرّية)،
--           فلا تُستأنف من جهازٍ آخر، ولا يُفتح المرفوض بما فيه.
--   UX-10   الدولة لا تُسأل (فيبقى الافتراضي 'SA' لطفلٍ في ألبانيا)، والمنطقة
--           نصٌّ حرّ لا يطابق أسماء الخارطة فيختفي من التفصيل.
--   A11Y-06 العملة «$» ثابتة في نموذج ملفٍّ تجريبه باليورو.
--
-- الآن:
--   • `countries.currency` — عملة الدولة (يورو لألبانيا وكوسوفو)، والمنصّة
--     احتياطٌ لما لا عملة له. ملفّ الطفل يأخذ عملة دولته.
--   • `create_orphan_intake` بتوقيعه: الدولة من الدول العاملة (أو دولة الجهة)،
--     يُكتب اسمها كما يقرؤه الدليل والخارطة ورمزها، والعملة معها. وفي إعادة
--     التقديم تُستبدل الوثائق: غير الموثَّق ممّا لم يعد في الملفّ يُحذف،
--     والموثَّق باقٍ لا يُمسّ.
--   • `save_orphan_draft` — حفظ المسودّة أو المرفوض في القاعدة بمعرّف الملف،
--     كاملةً (والسرّية في `orphan_private` كما عند التقديم)، بلا تغيير حال.
--   • `get_orphan_intake` — الملفّ كما في القاعدة لجهته: يملأ النموذج للتصحيح،
--     ويُعرض للقراءة وهو قيد المراجعة.
-- =====================================================================

ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_currency_check;
ALTER TABLE public.countries
  ADD CONSTRAINT countries_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
-- التجربة باليورو: ألبانيا (الكفالة باليورو لا باللِك) وكوسوفو.
UPDATE public.countries SET currency = 'EUR' WHERE code IN ('AL', 'XK') AND currency IS NULL;

/* الدولة التي يُكتب بها الملفّ: ما اختارته الجهة إن كانت عاملة، وإلا دولة
   الجهة. وعملتها، أو عملة المنصّة. */
CREATE OR REPLACE FUNCTION public.intake_country(_requested TEXT, _org UUID)
RETURNS TABLE (code TEXT, name_ar TEXT, currency TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE _code TEXT := NULLIF(upper(btrim(COALESCE(_requested, ''))), '');
BEGIN
  IF _code IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.countries c
                    WHERE c.code = _code AND c.status IN ('active', 'emergency')) THEN
      RAISE EXCEPTION 'intake: country % is not an operating country', _code USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT co.country_code INTO _code FROM public.care_organizations co WHERE co.id = _org;
  END IF;
  IF _code IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.code, c.name_ar,
           COALESCE(c.currency, (SELECT s.currency FROM public.platform_settings s WHERE s.id))
      FROM public.countries c WHERE c.code = _code;
END $fn$;
REVOKE ALL ON FUNCTION public.intake_country(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_country(TEXT, UUID) TO authenticated;

/* استبدال الوثائق: لا حذف للمسجَّل على `orphan_documents`، فيُحذف هنا
   بصلاحية المالك — لملفٍّ في جهة المستدعي، مسودّةً أو مرفوضاً، وغير
   الموثَّق وحده. */
CREATE OR REPLACE FUNCTION public.prune_intake_documents(_orphan UUID, _org UUID, _keep TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.orphan_in_my_org(_orphan, _org)
     OR NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND status IN ('draft', 'rejected')) THEN
    RAISE EXCEPTION 'intake: file % is not yours or no longer editable', _orphan USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.orphan_documents
   WHERE orphan_id = _orphan AND NOT verified
     AND storage_path <> ALL (COALESCE(_keep, ARRAY[]::text[]));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.prune_intake_documents(UUID, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_intake_documents(UUID, UUID, TEXT[]) TO authenticated;

/* ما يكتبه التقديم والمسودّة معاً: السرّي، والبنود، والوثائق. بصلاحية
   المستدعي (سياسات `can_manage_orphan`)، كما كانت `create_orphan_intake`. */
CREATE OR REPLACE FUNCTION public.intake_write_details(_orphan UUID, _org UUID, _payload JSONB, _replace_docs BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _need JSONB; _doc JSONB; _total NUMERIC(12,2) := 0;
BEGIN
  INSERT INTO public.orphan_private (
    orphan_id, full_name, national_id, guardian_name, guardian_relation,
    guardian_phone, address, family_size, family_income,
    health_notes, school_name, notes
  ) VALUES (
    _orphan,
    NULLIF(_payload->>'full_name', ''),
    NULLIF(_payload->>'national_id', ''),
    NULLIF(_payload->>'guardian_name', ''),
    NULLIF(_payload->>'guardian_relation', ''),
    NULLIF(_payload->>'guardian_phone', ''),
    NULLIF(_payload->>'address', ''),
    NULLIF(_payload->>'family_size', '')::integer,
    NULLIF(_payload->>'family_income', '')::numeric,
    NULLIF(_payload->>'health_notes', ''),
    NULLIF(_payload->>'school_name', ''),
    NULLIF(_payload->>'private_notes', '')
  )
  ON CONFLICT (orphan_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    national_id = EXCLUDED.national_id,
    guardian_name = EXCLUDED.guardian_name,
    guardian_relation = EXCLUDED.guardian_relation,
    guardian_phone = EXCLUDED.guardian_phone,
    address = EXCLUDED.address,
    family_size = EXCLUDED.family_size,
    family_income = EXCLUDED.family_income,
    health_notes = EXCLUDED.health_notes,
    school_name = EXCLUDED.school_name,
    notes = EXCLUDED.notes;

  DELETE FROM public.orphan_needs WHERE orphan_id = _orphan;
  FOR _need IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'needs', '[]'::jsonb))
  LOOP
    INSERT INTO public.orphan_needs (orphan_id, category, title, monthly_amount, notes)
    VALUES (
      _orphan,
      COALESCE(_need->>'category', 'other')::public.need_category,
      COALESCE(NULLIF(_need->>'title', ''), 'بند'),
      COALESCE((_need->>'monthly_amount')::numeric, 0),
      NULLIF(_need->>'note', '')
    );
    _total := _total + COALESCE((_need->>'monthly_amount')::numeric, 0);
  END LOOP;

  IF _total = 0 THEN
    UPDATE public.orphans
       SET monthly_need = COALESCE(NULLIF(_payload->>'monthly_need', '')::numeric, 0)
     WHERE id = _orphan;
  END IF;

  IF _replace_docs THEN
    PERFORM public.prune_intake_documents(_orphan, _org,
      ARRAY(SELECT d->>'storage_path'
              FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb)) d));
  END IF;

  FOR _doc IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb))
  LOOP
    -- المجلّد الأوّل معرّف الملف نفسه: لا يُنسب إليه ملفُّ طفلٍ آخر.
    IF split_part(_doc->>'storage_path', '/', 1) <> _orphan::text THEN
      RAISE EXCEPTION 'intake: document % is outside this file', _doc->>'storage_path'
        USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    VALUES (
      _orphan,
      COALESCE(_doc->>'kind', 'other'),
      COALESCE(_doc->>'kind', 'other')::public.orphan_doc_type,
      _doc->>'storage_path',
      NULLIF(_doc->>'file_name', ''),
      NULLIF(_doc->>'mime_type', ''),
      NULLIF(_doc->>'size_bytes', '')::integer,
      auth.uid()
    )
    ON CONFLICT (storage_path) DO NOTHING;
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.intake_write_details(UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_write_details(UUID, UUID, JSONB, BOOLEAN) TO authenticated;

-- التوقيع كما هو؛ الجديد: الدولة والعملة، واستبدال الوثائق في إعادة التقديم.
CREATE OR REPLACE FUNCTION public.create_orphan_intake(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id UUID := (_payload->>'org_id')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _code TEXT;
  _country RECORD;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'intake: org_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.care_organizations
     WHERE id = _org_id AND owner_id = auth.uid() AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'intake: organisation not yours or not approved'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _country FROM public.intake_country(_payload->>'country', _org_id);

  IF _orphan IS NULL THEN
    _code := public.next_orphan_code();
    INSERT INTO public.orphans (
      code, org_id, created_by, display_name, gender, birth_date,
      city, region, education_stage, story, monthly_need, status,
      country, currency
    ) VALUES (
      _code, _org_id, auth.uid(),
      _payload->>'display_name',
      COALESCE(_payload->>'gender', 'male'),
      NULLIF(_payload->>'birth_date', '')::date,
      NULLIF(_payload->>'city', ''),
      NULLIF(_payload->>'region', ''),
      NULLIF(_payload->>'education_stage', ''),
      NULLIF(_payload->>'story', ''),
      0,
      'submitted',
      COALESCE(_country.name_ar, 'SA'),
      COALESCE(_country.currency, 'USD')
    ) RETURNING id INTO _orphan;
  ELSE
    -- الوثائق تُستبدل قبل أن يغادر الملفّ «المسودّة/المرفوض».
    IF NOT public.orphan_in_my_org(_orphan, _org_id)
       OR NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND status IN ('draft', 'rejected')) THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.prune_intake_documents(_orphan, _org_id,
      ARRAY(SELECT d->>'storage_path'
              FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb)) d));

    UPDATE public.orphans SET
      display_name    = _payload->>'display_name',
      gender          = COALESCE(_payload->>'gender', 'male'),
      birth_date      = NULLIF(_payload->>'birth_date', '')::date,
      city            = NULLIF(_payload->>'city', ''),
      region          = NULLIF(_payload->>'region', ''),
      education_stage = NULLIF(_payload->>'education_stage', ''),
      story           = NULLIF(_payload->>'story', ''),
      country         = COALESCE(_country.name_ar, country),
      currency        = COALESCE(_country.currency, currency),
      status          = 'submitted',
      updated_at      = now()
    WHERE id = _orphan AND public.orphan_in_my_org(id, _org_id)
      AND status IN ('draft', 'rejected');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;

    _code := (SELECT code FROM public.orphans WHERE id = _orphan);
  END IF;

  PERFORM public.intake_write_details(_orphan, _org_id, _payload, false);

  PERFORM public.write_audit('orphan.submitted', 'orphan', _orphan,
    jsonb_build_object('code', _code, 'org_id', _org_id,
                       'needs', jsonb_array_length(COALESCE(_payload->'needs', '[]'::jsonb)),
                       'documents', jsonb_array_length(COALESCE(_payload->'documents', '[]'::jsonb))));

  RETURN jsonb_build_object('id', _orphan, 'code', _code);
END $function$;
REVOKE ALL ON FUNCTION public.create_orphan_intake(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_orphan_intake(JSONB) TO authenticated;

/* المسودّة في القاعدة بمعرّف ملفّها: تُستأنف من أيّ جهاز، ولا تبقى في
   متصفّحٍ مشترك. الحال لا تتغيّر — المرفوض يبقى مرفوضاً حتى يُعاد تقديمه. */
CREATE OR REPLACE FUNCTION public.save_orphan_draft(_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _org_id UUID := NULLIF(_payload->>'org_id', '')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _country RECORD;
  _code TEXT;
BEGIN
  IF _org_id IS NULL OR _orphan IS NULL THEN
    RAISE EXCEPTION 'draft: org_id and orphan_id are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.orphan_in_my_org(_orphan, _org_id)
     OR NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND status IN ('draft', 'rejected')) THEN
    RAISE EXCEPTION 'draft: file % is not yours or no longer editable', _orphan USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _country FROM public.intake_country(_payload->>'country', _org_id);

  UPDATE public.orphans SET
    display_name    = COALESCE(NULLIF(btrim(_payload->>'display_name'), ''), display_name),
    gender          = COALESCE(NULLIF(_payload->>'gender', ''), gender),
    birth_date      = NULLIF(_payload->>'birth_date', '')::date,
    city            = NULLIF(_payload->>'city', ''),
    region          = NULLIF(_payload->>'region', ''),
    education_stage = NULLIF(_payload->>'education_stage', ''),
    story           = NULLIF(_payload->>'story', ''),
    country         = COALESCE(_country.name_ar, country),
    currency        = COALESCE(_country.currency, currency),
    updated_at      = now()
  WHERE id = _orphan
  RETURNING code INTO _code;

  PERFORM public.intake_write_details(_orphan, _org_id, _payload, true);

  RETURN jsonb_build_object('id', _orphan, 'code', _code, 'saved_at', now());
END $fn$;
REVOKE ALL ON FUNCTION public.save_orphan_draft(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_orphan_draft(JSONB) TO authenticated;

/* الملفّ كما في القاعدة، لجهته وحدها — قبل النشر. بعده له البروفايل. */
CREATE OR REPLACE FUNCTION public.get_orphan_intake(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', o.id, 'code', o.code, 'org_id', o.org_id, 'status', o.status,
    'editable', o.status IN ('draft', 'rejected'),
    'rejection_code', o.rejection_code, 'rejection_reason', o.rejection_reason,
    'display_name', o.display_name, 'gender', o.gender, 'birth_date', o.birth_date,
    'city', o.city, 'region', o.region, 'country_code', o.country_code,
    'education_stage', o.education_stage, 'story', o.story,
    'monthly_need', o.monthly_need, 'currency', o.currency, 'updated_at', o.updated_at,
    'private', (SELECT jsonb_build_object(
                  'full_name', p.full_name, 'national_id', p.national_id,
                  'guardian_name', p.guardian_name, 'guardian_relation', p.guardian_relation,
                  'guardian_phone', p.guardian_phone, 'address', p.address,
                  'family_size', p.family_size, 'family_income', p.family_income,
                  'health_notes', p.health_notes, 'school_name', p.school_name,
                  'private_notes', p.notes)
                  FROM public.orphan_private p WHERE p.orphan_id = o.id),
    'needs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'category', n.category, 'title', n.title,
                          'monthly_amount', n.monthly_amount, 'note', n.notes)
                          ORDER BY n.created_at, n.id)
                         FROM public.orphan_needs n WHERE n.orphan_id = o.id), '[]'::jsonb),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                              'id', d.id, 'kind', d.kind, 'storage_path', d.storage_path,
                              'file_name', d.file_name, 'mime_type', d.mime_type,
                              'size_bytes', d.size_bytes, 'verified', d.verified, 'note', d.note)
                              ORDER BY d.created_at)
                             FROM public.orphan_documents d WHERE d.orphan_id = o.id), '[]'::jsonb))
    INTO _out
    FROM public.orphans o
   WHERE o.id = _orphan
     AND o.status IN ('draft', 'submitted', 'under_review', 'rejected')
     AND auth.uid() IS NOT NULL
     AND public.orphan_in_my_org(o.id, o.org_id);
  IF _out IS NULL THEN
    RAISE EXCEPTION 'intake: file % is not yours or not in intake', _orphan USING ERRCODE = '42501';
  END IF;
  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.get_orphan_intake(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orphan_intake(UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261107110000', 'intake_drafts_country_region');

-- >>> migration 20261107120000 admin_reconciliation_and_exports
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261107120000') THEN
    RAISE EXCEPTION 'الهجرة 20261107120000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة ٢ — عمليات الإدارة: مطابقة التحويل قبل التفعيل، وقوائم تتّسع، وتصدير
-- ---------------------------------------------------------------------
--   UX-15   تفعيل كفالة التحويل البنكي ضغطةٌ واحدة بلا مبلغٍ مستلَم ولا تاريخ
--           قيدٍ ولا مرجعٍ بنكي ولا اسم كافل؛ والتحويلات المعلّقة غائبة عن
--           صندوق القرارات. وكان التأكيد يمرّ بمفتاح الخدمة من الخادم: لا
--           أثر في audit_log لمن أكّد ولا بماذا.
--   PRD-13  `admin_overview` يُعيد كلّ يتيمٍ منشور وكلّ كافلٍ ببريده في كتلةٍ
--           واحدة بلا حدّ، والجدول يرسمها كلّها؛ ولا تصدير.
--
-- الآن:
--   • `confirm_manual_transfer` (DEFINER، للإدارة): لا تفعيل بلا المبلغ
--     المستلَم وعملته وتاريخ القيد والمرجع البنكي. العملة المخالفة تُرفض،
--     والمبلغ المخالف لا يمرّ إلا بإقرارٍ صريحٍ وملاحظة. المرجع لا يُستعمل
--     مرّتين. الدفعة المعلّقة نفسها تصير مدفوعة (لا قيدٌ ثانٍ بجانبها)،
--     والمطابقة تُحفظ في `manual_transfer_reconciliations`، والأثر في
--     audit_log، والكافل يُبلَّغ.
--   • التحويلات المعلّقة في صندوق القرارات (`transfer`) بسياقها: الكافل
--     واسمه وبريده، والمبلغ المتوقَّع، والمرجع.
--   • `admin_overview` بتوقيعه: أوّل ١٠٠ صفّ من كلّ قائمة (مرتّبةً بالأرقام لا
--     بالنصّ) ومعها العدد الكلّي؛ و`admin_list` للتصفّح والبحث؛ و`admin_export`
--     لملفّات CSV — بلا بيانات الطفل السرّية، ومسجَّلاً في الأثر.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.manual_transfer_reconciliations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id   UUID NOT NULL REFERENCES public.sponsorships(id) ON DELETE RESTRICT,
  payment_id       UUID NOT NULL REFERENCES public.sponsorship_payments(id) ON DELETE RESTRICT,
  expected_amount  NUMERIC(12,2) NOT NULL,
  received_amount  NUMERIC(12,2) NOT NULL CHECK (received_amount > 0),
  currency         TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  value_date       DATE NOT NULL,
  bank_reference   TEXT NOT NULL CHECK (length(btrim(bank_reference)) BETWEEN 3 AND 120),
  amount_mismatch  BOOLEAN NOT NULL,
  note             TEXT,
  confirmed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_manual_transfer_bank_reference
  ON public.manual_transfer_reconciliations (lower(btrim(bank_reference)));
CREATE INDEX IF NOT EXISTS idx_manual_transfer_sponsorship
  ON public.manual_transfer_reconciliations (sponsorship_id);
ALTER TABLE public.manual_transfer_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_transfer_reconciliations FROM anon, authenticated;
GRANT ALL ON TABLE public.manual_transfer_reconciliations TO service_role;

/* كفالةٌ تنتظر تحويلاً يدوياً: لم تبدأ عند مزوّدٍ إلكتروني. */
CREATE OR REPLACE FUNCTION public.awaits_manual_transfer(_sponsorship UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.sponsorships s
                  WHERE s.id = _sponsorship AND s.status = 'pending_payment')
     AND NOT EXISTS (SELECT 1 FROM public.sponsorship_payments p
                      WHERE p.sponsorship_id = _sponsorship
                        AND COALESCE(p.provider, 'manual') <> 'manual');
$fn$;
REVOKE ALL ON FUNCTION public.awaits_manual_transfer(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_manual_transfer(
  _sponsorship UUID, _received_amount NUMERIC, _currency TEXT, _value_date DATE,
  _bank_reference TEXT, _accept_mismatch BOOLEAN DEFAULT false, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _s        public.sponsorships%ROWTYPE;
  _cur      TEXT := upper(btrim(COALESCE(_currency, '')));
  _ref      TEXT := btrim(COALESCE(_bank_reference, ''));
  _mismatch BOOLEAN;
  _fee_pct  NUMERIC;
  _fee      NUMERIC(12,2);
  _payment  UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'confirm_manual_transfer: not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'confirm_manual_transfer: no sponsorship %', _sponsorship USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.awaits_manual_transfer(_sponsorship) THEN
    RAISE EXCEPTION 'confirm_manual_transfer: sponsorship is not awaiting a bank transfer (%)', _s.status
      USING ERRCODE = '55000';
  END IF;

  -- لا تفعيل بلا ما وصل فعلاً: المبلغ وعملته وتاريخ القيد والمرجع.
  IF _received_amount IS NULL OR _received_amount <= 0 THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the received amount is required' USING ERRCODE = '22023';
  END IF;
  IF _cur !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the received currency is required' USING ERRCODE = '22023';
  END IF;
  IF _value_date IS NULL OR _value_date > current_date
     OR _value_date < (_s.created_at AT TIME ZONE 'UTC')::date - 7 THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the value date must fall between the pledge and today'
      USING ERRCODE = '22023';
  END IF;
  IF length(_ref) < 3 THEN
    RAISE EXCEPTION 'confirm_manual_transfer: the bank reference is required' USING ERRCODE = '22023';
  END IF;
  -- عملةٌ أخرى ليست «فرقاً»: هي تحويلٌ لا يُقيَّد على هذه الكفالة.
  IF _cur <> _s.currency THEN
    RAISE EXCEPTION 'confirm_manual_transfer: received % but the sponsorship is in %', _cur, _s.currency
      USING ERRCODE = '22023';
  END IF;
  _mismatch := _received_amount <> _s.amount;
  IF _mismatch AND (NOT COALESCE(_accept_mismatch, false) OR length(btrim(COALESCE(_note, ''))) < 3) THEN
    RAISE EXCEPTION 'confirm_manual_transfer: received % but expected % — confirm the difference with a note',
      _received_amount, _s.amount USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.manual_transfer_reconciliations
              WHERE lower(btrim(bank_reference)) = lower(_ref)) THEN
    RAISE EXCEPTION 'confirm_manual_transfer: bank reference % is already reconciled', _ref
      USING ERRCODE = '23505';
  END IF;

  SELECT fee_percent INTO _fee_pct FROM public.platform_settings WHERE id;
  _fee := round(_received_amount * COALESCE(_fee_pct, 0) / 100, 2);

  -- الدفعة المعلّقة التي أنشأها «ادفع بتحويل» تصير هي المدفوعة.
  SELECT id INTO _payment FROM public.sponsorship_payments
   WHERE sponsorship_id = _sponsorship AND status = 'pending'
     AND COALESCE(provider, 'manual') = 'manual'
   ORDER BY created_at DESC LIMIT 1;

  IF _payment IS NOT NULL THEN
    UPDATE public.sponsorship_payments
       SET status = 'paid', amount = _received_amount, currency = _cur, provider = 'manual',
           provider_ref = _ref, fee_amount = _fee, net_amount = _received_amount - _fee,
           paid_at = _value_date::timestamptz
     WHERE id = _payment;
  ELSE
    INSERT INTO public.sponsorship_payments
      (sponsorship_id, sponsor_id, amount, currency, status, provider, provider_ref,
       fee_amount, net_amount, paid_at)
    VALUES (_sponsorship, _s.sponsor_id, _received_amount, _cur, 'paid', 'manual', _ref,
            _fee, _received_amount - _fee, _value_date::timestamptz)
    RETURNING id INTO _payment;
  END IF;

  UPDATE public.sponsorships
     SET status = 'active', provider = 'manual', started_at = _value_date::timestamptz
   WHERE id = _sponsorship;

  INSERT INTO public.manual_transfer_reconciliations
    (sponsorship_id, payment_id, expected_amount, received_amount, currency, value_date,
     bank_reference, amount_mismatch, note, confirmed_by)
  VALUES (_sponsorship, _payment, _s.amount, _received_amount, _cur, _value_date, _ref,
          _mismatch, NULLIF(btrim(COALESCE(_note, '')), ''), auth.uid());

  PERFORM public.write_audit('payment.manual_confirmed', 'sponsorship', _sponsorship,
    jsonb_build_object('payment', _payment, 'expected', _s.amount, 'received', _received_amount,
                       'currency', _cur, 'value_date', _value_date, 'bank_reference', _ref,
                       'mismatch', _mismatch, 'note', _note));

  PERFORM public.announce_payment(_sponsorship, true, _received_amount, _cur);

  RETURN jsonb_build_object('payment_id', _payment, 'mismatch', _mismatch);
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_manual_transfer(UUID, NUMERIC, TEXT, DATE, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_manual_transfer(UUID, NUMERIC, TEXT, DATE, TEXT, BOOLEAN, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------
-- صندوق القرارات: التحويلات المعلّقة بندٌ فيه، بسياقها
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'orphan_edit', o.id, o.display_name,
               'تعديلٌ على ملفٍّ منشور · ' || o.code,
               COALESCE(pe.updated_at,
                        (SELECT min(n.created_at) FROM public.orphan_needs n
                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
          FROM public.orphans o
          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
         WHERE o.status IN ('approved', 'fully_sponsored')
           AND (pe.orphan_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.orphan_needs n
                            WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'transfer', s.id, o.display_name,
               'تحويل بنكي · ' || s.amount::text || ' ' || s.currency
                 || ' · مرجع ' || upper(left(s.id::text, 8)),
               s.created_at
          FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.status = 'pending_payment' AND public.awaits_manual_transfer(s.id)
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'circle_role', r.id, o.display_name,
               'دورٌ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, ''),
               r.assigned_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'pending' AND r.ended_at IS NULL
        UNION ALL
        SELECT 'circle_role_renewal', r.id, o.display_name,
               'تجديد دورٍ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, '')
                 || CASE WHEN r.expires_at <= now() THEN ' · انقضى' ELSE ' · ينقضي قريباً' END,
               r.expires_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'approved' AND r.ended_at IS NULL AND r.person_id IS NOT NULL
           AND r.expires_at < now() + public.circle_role_renewal_window()
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
        UNION ALL
        SELECT 'unlock', r.id, o.display_name,
               'طلب فكّ · ' || r.op || ' · ' || cardinality(r.approvals) || '/' || public.unlock_quorum(),
               r.created_at
          FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'pending' AND r.requested_by <> auth.uid() AND auth.uid() <> ALL (r.approvals)
        UNION ALL
        SELECT 'discrepancy', d.id, o.display_name, 'اختلافٌ من ' || COALESCE(d.source, 'المصدر'), d.created_at
          FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open'
      ) i), '[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_transfer_context(_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'sponsorship_id', s.id, 'reference', upper(left(s.id::text, 8)),
      'amount', s.amount, 'currency', s.currency, 'type', s.type, 'status', s.status,
      'created_at', s.created_at,
      'person_name', p.full_name, 'person_email', u.email,
      'code', o.code, 'name', o.display_name,
      'awaiting', public.awaits_manual_transfer(s.id))
      FROM public.sponsorships s
      JOIN public.orphans o ON o.id = s.orphan_id
      LEFT JOIN auth.users u ON u.id = s.sponsor_id
      LEFT JOIN public.profiles p ON p.id = s.sponsor_id
     WHERE s.id = _id);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_transfer_context(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_context(UUID) TO authenticated;

-- كما في هجرة الجهات (20261107100000) مع سياق التحويل.
CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind text, _id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN public.admin_care_org_context(_id)
    WHEN 'transfer' THEN public.admin_transfer_context(_id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    WHEN 'orphan_edit' THEN (SELECT jsonb_build_object(
                          'code', o.code, 'name', o.display_name, 'status', o.status,
                          'proposed', pe.changes, 'published', pe.previous,
                          'via', pe.via, 'created_at', COALESCE(pe.updated_at, o.updated_at),
                          'needs_text', (SELECT jsonb_agg(jsonb_build_object(
                                            'category', n.category, 'title', n.title,
                                            'notes', n.notes, 'amount', n.monthly_amount)
                                          ORDER BY n.created_at)
                                           FROM public.orphan_needs n
                                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
                          FROM public.orphans o
                          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
                         WHERE o.id = _id)
    WHEN 'circle_role' THEN public.admin_circle_role_context(_id)
    WHEN 'circle_role_renewal' THEN public.admin_circle_role_context(_id)
    ELSE NULL END;
END $function$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- القوائم: صفحةٌ وبحث، لا كتلةٌ بكلّ شيء
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list(
  _list TEXT, _q TEXT DEFAULT NULL, _limit INTEGER DEFAULT 50, _offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _lim INTEGER := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  _off INTEGER := GREATEST(COALESCE(_offset, 0), 0);
  _pat TEXT := CASE WHEN NULLIF(btrim(COALESCE(_q, '')), '') IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(btrim(_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_list: not authorised' USING ERRCODE = '42501';
  END IF;

  IF _list = 'orphans' THEN
    RETURN (
      WITH base AS (
        SELECT o.id, o.code, o.display_name, o.city, o.status, co.name AS org,
               o.monthly_need, o.funded_monthly, o.currency
          FROM public.orphans o
          LEFT JOIN public.care_organizations co ON co.id = o.org_id
         WHERE o.status IN ('approved', 'fully_sponsored')
           AND (_pat IS NULL OR o.code ILIKE _pat OR o.display_name ILIKE _pat
                OR co.name ILIKE _pat OR o.city ILIKE _pat)
      )
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM base),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'code', b.code, 'name', b.display_name, 'city', b.city,
                    'status', b.status, 'org', b.org, 'need', b.monthly_need,
                    'funded', b.funded_monthly, 'currency', b.currency,
                    'gap', GREATEST(b.monthly_need - b.funded_monthly, 0),
                    'sponsors', (SELECT count(*) FROM public.sponsorships s
                                  WHERE s.orphan_id = b.id AND s.status IN ('active', 'paused')))
                    ORDER BY GREATEST(b.monthly_need - b.funded_monthly, 0) DESC, b.code)
                  FROM (SELECT * FROM base
                         ORDER BY GREATEST(monthly_need - funded_monthly, 0) DESC, code
                         LIMIT _lim OFFSET _off) b), '[]'::jsonb)));
  ELSIF _list = 'sponsors' THEN
    RETURN (
      WITH agg AS (
        SELECT u.id, u.email, p.full_name,
               count(s.id) AS sponsorships,
               count(s.id) FILTER (WHERE s.status = 'active') AS active,
               COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'active'), 0) AS monthly,
               min(s.created_at) AS since
          FROM public.sponsorships s
          JOIN auth.users u ON u.id = s.sponsor_id
          LEFT JOIN public.profiles p ON p.id = u.id
         WHERE _pat IS NULL OR u.email ILIKE _pat OR p.full_name ILIKE _pat
         GROUP BY u.id, u.email, p.full_name
      ),
      paid AS (
        SELECT a.*, COALESCE((SELECT SUM(sp.amount) FROM public.sponsorship_payments sp
                               WHERE sp.sponsor_id = a.id AND sp.status = 'paid'), 0) AS paid
          FROM agg a
      )
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM agg),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', x.id, 'email', x.email, 'name', x.full_name,
                    'sponsorships', x.sponsorships, 'active', x.active, 'monthly', x.monthly,
                    'paid', x.paid, 'since', x.since) ORDER BY x.paid DESC, x.email)
                  FROM (SELECT * FROM paid ORDER BY paid DESC, email LIMIT _lim OFFSET _off) x),
                 '[]'::jsonb)));
  END IF;
  RAISE EXCEPTION 'admin_list: unknown list %', _list USING ERRCODE = '22023';
END $fn$;
REVOKE ALL ON FUNCTION public.admin_list(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- الصورة العامّة كما هي، إلا أنّ القائمتين أوّلُ صفحةٍ منهما ومعهما العدد.
CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _out JSONB; _orphans JSONB; _sponsors JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_overview: not authorised' USING ERRCODE = '42501';
  END IF;

  _orphans := public.admin_list('orphans', NULL, 100, 0);
  _sponsors := public.admin_list('sponsors', NULL, 100, 0);

  SELECT jsonb_build_object(
    'currency', (SELECT currency FROM public.platform_settings WHERE id),

    'orphans', (
      SELECT jsonb_build_object(
        'total', count(*),
        'published', count(*) FILTER (WHERE status IN ('approved','fully_sponsored')),
        'fully_sponsored', count(*) FILTER (WHERE status = 'fully_sponsored'),
        'awaiting_review', count(*) FILTER (WHERE status IN ('submitted','under_review')),
        'monthly_need', COALESCE(SUM(monthly_need) FILTER (WHERE status IN ('approved','fully_sponsored')), 0),
        'monthly_funded', COALESCE(SUM(funded_monthly) FILTER (WHERE status IN ('approved','fully_sponsored')), 0),
        'monthly_gap', GREATEST(COALESCE(SUM(monthly_need - funded_monthly)
                        FILTER (WHERE status = 'approved'), 0), 0)
      ) FROM public.orphans
    ),

    'organizations', (
      SELECT jsonb_build_object(
        'total', count(*),
        'approved', count(*) FILTER (WHERE status = 'approved'),
        'pending', count(*) FILTER (WHERE status = 'pending')
      ) FROM public.care_organizations
    ),

    'sponsors', (
      SELECT jsonb_build_object(
        'total', count(DISTINCT sponsor_id),
        'with_active', count(DISTINCT sponsor_id) FILTER (WHERE status = 'active'),
        'sponsorships', count(*),
        'active', count(*) FILTER (WHERE status = 'active'),
        'awaiting_payment', count(*) FILTER (WHERE status = 'pending_payment'),
        'monthly_committed', COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)
      ) FROM public.sponsorships
    ),

    'money', (
      SELECT jsonb_build_object(
        'collected', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0),
        'fees', COALESCE((SELECT SUM(fee_amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0),
        'pending', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'pending'), 0),
        'failed', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'failed'), 0),
        'disputed', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'disputed'), 0),
        'disbursed', COALESCE((SELECT SUM(amount) FROM public.disbursements), 0),
        'balance', COALESCE((SELECT SUM(amount) FROM public.sponsorship_payments WHERE status = 'paid'), 0)
                 - COALESCE((SELECT SUM(amount) FROM public.disbursements), 0)
      )
    ),

    'orphan_rows', _orphans->'rows',
    'orphan_rows_total', (_orphans->>'total')::integer,
    'sponsor_rows', _sponsors->'rows',
    'sponsor_rows_total', (_sponsors->>'total')::integer,

    'pending_orphans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'name', display_name, 'city', city,
        'region', region, 'need', monthly_need, 'status', status, 'created_at', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM (SELECT * FROM public.orphans WHERE status IN ('submitted','under_review')
             ORDER BY created_at LIMIT 200) q
    ),

    'pending_orgs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'city', city, 'region', region,
        'license', license_number, 'email', contact_email, 'created_at', created_at
      ) ORDER BY created_at), '[]'::jsonb)
      FROM (SELECT * FROM public.care_organizations WHERE status = 'pending'
             ORDER BY created_at LIMIT 200) q
    )
  ) INTO _out;

  RETURN _out;
END; $function$;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- ---------------------------------------------------------------------
-- التصدير: ثلاث مجموعات، بلا بيانات الطفل السرّية، ومسجَّلٌ في الأثر
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_export(_dataset TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _cap CONSTANT INTEGER := 10000;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_export: not authorised' USING ERRCODE = '42501';
  END IF;

  IF _dataset = 'orphans' THEN
    -- ما يراه مشرف المنصّة في قائمته: لا اسم كامل ولا هوية ولا عنوان ولا صحّة.
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'code'), '[]'::jsonb) INTO _rows FROM (
      SELECT jsonb_build_object(
        'code', o.code, 'display_name', o.display_name, 'status', o.status,
        'country', o.country_code, 'region', o.region, 'org', co.name,
        'monthly_need', o.monthly_need, 'funded_monthly', o.funded_monthly,
        'currency', o.currency, 'created_at', o.created_at, 'approved_at', o.approved_at) AS r
        FROM public.orphans o LEFT JOIN public.care_organizations co ON co.id = o.org_id
       ORDER BY o.code LIMIT _cap) t;
  ELSIF _dataset = 'sponsorships' THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO _rows FROM (
      SELECT jsonb_build_object(
        'reference', upper(left(s.id::text, 8)), 'sponsor_email', u.email,
        'orphan_code', o.code, 'type', s.type, 'amount', s.amount, 'currency', s.currency,
        'status', s.status, 'provider', s.provider, 'created_at', s.created_at,
        'started_at', s.started_at, 'ended_at', s.ended_at) AS r
        FROM public.sponsorships s
        JOIN public.orphans o ON o.id = s.orphan_id
        LEFT JOIN auth.users u ON u.id = s.sponsor_id
       ORDER BY s.created_at LIMIT _cap) t;
  ELSIF _dataset = 'payments' THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO _rows FROM (
      SELECT jsonb_build_object(
        'invoice_no', p.invoice_no, 'sponsorship_reference', upper(left(p.sponsorship_id::text, 8)),
        'sponsor_email', u.email, 'orphan_code', o.code, 'amount', p.amount,
        'currency', p.currency, 'fee', p.fee_amount, 'net', p.net_amount, 'status', p.status,
        'provider', p.provider, 'provider_ref', p.provider_ref, 'paid_at', p.paid_at,
        'value_date', m.value_date, 'bank_reference', m.bank_reference,
        'expected_amount', m.expected_amount, 'amount_mismatch', m.amount_mismatch,
        'created_at', p.created_at) AS r
        FROM public.sponsorship_payments p
        JOIN public.sponsorships s ON s.id = p.sponsorship_id
        JOIN public.orphans o ON o.id = s.orphan_id
        LEFT JOIN auth.users u ON u.id = p.sponsor_id
        LEFT JOIN public.manual_transfer_reconciliations m ON m.payment_id = p.id
       ORDER BY p.created_at LIMIT _cap) t;
  ELSE
    RAISE EXCEPTION 'admin_export: unknown dataset %', _dataset USING ERRCODE = '22023';
  END IF;

  PERFORM public.write_audit('admin.export', 'export', NULL,
    jsonb_build_object('dataset', _dataset, 'rows', jsonb_array_length(_rows)));
  RETURN _rows;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_export(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export(TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261107120000', 'admin_reconciliation_and_exports');

-- >>> migration 20261107130000 workspace_relations
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261107130000') THEN
    RAISE EXCEPTION 'الهجرة 20261107130000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الدفعة ٢ — بواباتٌ لما يملكه الحساب فعلاً (UX-16)
-- ---------------------------------------------------------------------
-- «الإشراف» يظهر لكلّ حساب ويفتح «لستَ مشرفاً معتمَداً بعد» بلا طريق،
-- والمترجم لا مدخل له إلى /translate إلا من لوحة الإدارة، وعنوان الدور
-- في الرأس «كافل» للمشرف وعضو المكتب والمترجم لأنه يُقرأ من user_roles وحده.
--
-- `my_workspaces` بتوقيعه، ومعه ما ينقص الواجهة لتعرض الأبواب الصحيحة:
--   supervisor        — اعتماد إشرافٍ نشط (كما يفحصه إسناد المشرف)
--   translator_locales — اللغات التي يراجعها الحساب
--   care_org_status   — حال جهته إن كانت له جهة (لا يكفي «له جهة»: المعلّقة
--                       بابها طلب الاعتماد لا الملفات)
-- كلّها عن الحساب نفسه وحده.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.my_workspaces()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'admin', public.is_admin(),
    'offices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role,
                                                             'country', o.country_code, 'region', o.region)
                                          ORDER BY o.name)
                           FROM public.office_members m JOIN public.offices o ON o.id = m.office_id
                          WHERE m.user_id = auth.uid() AND o.active), '[]'::jsonb),
    'donor_entities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
                                                                    'status', e.status, 'role', m.role)
                                                 ORDER BY e.name)
                                  FROM public.donor_members m JOIN public.donor_entities e ON e.id = m.entity_id
                                 WHERE m.user_id = auth.uid()), '[]'::jsonb),
    'care_org', EXISTS (SELECT 1 FROM public.care_organizations WHERE owner_id = auth.uid()),
    'care_org_status', (SELECT status::text FROM public.care_organizations WHERE owner_id = auth.uid()),
    'guardian', EXISTS (SELECT 1 FROM public.orphans WHERE guardian_id = auth.uid()),
    'supervisor', EXISTS (SELECT 1 FROM public.supervisor_profiles s
                           WHERE s.user_id = auth.uid() AND s.active),
    'translator_locales', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name)
                                                     ORDER BY l.code)
                                      FROM public.ui_locale_reviewers r
                                      JOIN public.ui_locales l ON l.code = r.locale
                                     WHERE r.user_id = auth.uid()), '[]'::jsonb),
    'pledges', (SELECT count(*) FROM public.support_pledges WHERE supporter_id = auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.my_workspaces() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_workspaces() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261107130000', 'workspace_relations');

COMMIT;
