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
