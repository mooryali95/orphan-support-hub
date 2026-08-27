CREATE SEQUENCE IF NOT EXISTS public.orphan_code_seq START 1001;
REVOKE ALL ON SEQUENCE public.orphan_code_seq FROM PUBLIC, anon;
GRANT USAGE ON SEQUENCE public.orphan_code_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_orphan_code()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $fn$
  SELECT 'IOCO-' || LPAD(nextval('public.orphan_code_seq')::text, 6, '0');
$fn$;
REVOKE ALL ON FUNCTION public.next_orphan_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_orphan_code() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalc_orphan_monthly_need()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _orphan UUID := COALESCE(NEW.orphan_id, OLD.orphan_id);
  _total NUMERIC(12,2);
  _count INTEGER;
BEGIN
  SELECT COALESCE(SUM(monthly_amount), 0), count(*)
    INTO _total, _count
    FROM public.orphan_needs
   WHERE orphan_id = _orphan;

  IF _count > 0 THEN
    UPDATE public.orphans SET monthly_need = _total, updated_at = now()
     WHERE id = _orphan AND monthly_need IS DISTINCT FROM _total;
  END IF;

  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.recalc_orphan_monthly_need() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recalc_monthly_need ON public.orphan_needs;
CREATE TRIGGER trg_recalc_monthly_need
AFTER INSERT OR UPDATE OR DELETE ON public.orphan_needs
FOR EACH ROW EXECUTE FUNCTION public.recalc_orphan_monthly_need();

CREATE OR REPLACE FUNCTION public.guard_monthly_need()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _total NUMERIC(12,2); _count INTEGER;
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.monthly_need IS NOT DISTINCT FROM OLD.monthly_need THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(monthly_amount), 0), count(*) INTO _total, _count
    FROM public.orphan_needs WHERE orphan_id = NEW.id;

  IF _count > 0 AND NEW.monthly_need IS DISTINCT FROM _total THEN
    RAISE EXCEPTION 'orphan: monthly_need is derived from need items (expected %)', _total
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_monthly_need() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_monthly_need ON public.orphans;
CREATE TRIGGER trg_guard_monthly_need
BEFORE UPDATE OF monthly_need ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_need();

CREATE OR REPLACE FUNCTION public.start_orphan_draft(_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $fn$
DECLARE _orphan UUID; _code TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.care_organizations
     WHERE id = _org_id AND owner_id = auth.uid() AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'draft: organisation not yours or not approved' USING ERRCODE = '42501';
  END IF;

  _code := public.next_orphan_code();

  INSERT INTO public.orphans (code, org_id, created_by, display_name, monthly_need, status)
  VALUES (_code, _org_id, auth.uid(), 'مسودّة', 0, 'draft')
  RETURNING id INTO _orphan;

  INSERT INTO public.orphan_private (orphan_id) VALUES (_orphan);

  RETURN jsonb_build_object('id', _orphan, 'code', _code);
END $fn$;
REVOKE ALL ON FUNCTION public.start_orphan_draft(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_orphan_draft(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_orphan_intake(_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  _org_id UUID := (_payload->>'org_id')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _code TEXT;
  _need JSONB;
  _doc JSONB;
  _needs_total NUMERIC(12,2) := 0;
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

  IF _orphan IS NULL THEN
    _code := public.next_orphan_code();
    INSERT INTO public.orphans (
      code, org_id, created_by, display_name, gender, birth_date,
      city, region, education_stage, story, monthly_need, status
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
      'submitted'
    ) RETURNING id INTO _orphan;
  ELSE
    UPDATE public.orphans SET
      display_name    = _payload->>'display_name',
      gender          = COALESCE(_payload->>'gender', 'male'),
      birth_date      = NULLIF(_payload->>'birth_date', '')::date,
      city            = NULLIF(_payload->>'city', ''),
      region          = NULLIF(_payload->>'region', ''),
      education_stage = NULLIF(_payload->>'education_stage', ''),
      story           = NULLIF(_payload->>'story', ''),
      status          = 'submitted',
      updated_at      = now()
    WHERE id = _orphan AND org_id = _org_id AND status IN ('draft', 'rejected');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;

    _code := (SELECT code FROM public.orphans WHERE id = _orphan);
    DELETE FROM public.orphan_needs WHERE orphan_id = _orphan;
  END IF;

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
    _needs_total := _needs_total + COALESCE((_need->>'monthly_amount')::numeric, 0);
  END LOOP;

  IF _needs_total = 0 THEN
    UPDATE public.orphans
       SET monthly_need = COALESCE((_payload->>'monthly_need')::numeric, 0)
     WHERE id = _orphan;
  END IF;

  FOR _doc IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb))
  LOOP
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

  PERFORM public.write_audit('orphan.submitted', 'orphan', _orphan,
    jsonb_build_object('code', _code, 'org_id', _org_id,
                       'needs', jsonb_array_length(COALESCE(_payload->'needs', '[]'::jsonb)),
                       'documents', jsonb_array_length(COALESCE(_payload->'documents', '[]'::jsonb))));

  RETURN jsonb_build_object('id', _orphan, 'code', _code);
END $fn$;
REVOKE ALL ON FUNCTION public.create_orphan_intake(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_orphan_intake(JSONB) TO authenticated;

DO $$ BEGIN
  CREATE TYPE public.rejection_code AS ENUM (
    'documents_missing', 'documents_unclear', 'documents_inconsistent',
    'identity_unverified', 'guardianship_unproven', 'needs_unjustified',
    'duplicate_profile', 'photo_consent_missing', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS rejection_code public.rejection_code,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.review_orphan(
  _id UUID, _decision TEXT, _code public.rejection_code DEFAULT NULL, _reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _prev public.orphan_status;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_orphan: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'under_review') THEN
    RAISE EXCEPTION 'review_orphan: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;
  IF _decision = 'rejected' AND _code IS NULL THEN
    RAISE EXCEPTION 'review_orphan: rejection requires a structured code'
      USING ERRCODE = '22023';
  END IF;

  SELECT status INTO _prev FROM public.orphans WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_orphan: no orphan %', _id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.orphans SET
    status = _decision::public.orphan_status,
    approved_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END,
    rejection_code = CASE WHEN _decision = 'rejected' THEN _code ELSE NULL END,
    rejection_reason = CASE WHEN _decision = 'rejected' THEN _reason ELSE NULL END,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = _id;

  PERFORM public.write_audit('orphan.' || _decision, 'orphan', _id,
    jsonb_build_object('from', _prev, 'to', _decision, 'code', _code, 'reason', _reason));
END $fn$;
REVOKE ALL ON FUNCTION public.review_orphan(UUID, TEXT, public.rejection_code, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_orphan(UUID, TEXT, public.rejection_code, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_organization(_id UUID, _decision TEXT, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_organization: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'review_organization: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;

  SELECT status::text INTO _prev FROM public.care_organizations WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_organization: no organisation %', _id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.care_organizations
     SET status = _decision::public.org_status, updated_at = now()
   WHERE id = _id;

  PERFORM public.write_audit('organization.' || _decision, 'care_organization', _id,
    jsonb_build_object('from', _prev, 'to', _decision, 'reason', _reason));
END $fn$;
REVOKE ALL ON FUNCTION public.review_organization(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_organization(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_document(_id UUID, _verified BOOLEAN, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'verify_document: not authorised' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orphan_documents
     SET verified = _verified,
         verified_by = auth.uid(),
         verified_at = now(),
         note = COALESCE(_note, note)
   WHERE id = _id
   RETURNING orphan_id INTO _orphan;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'verify_document: no document %', _id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit(
    CASE WHEN _verified THEN 'document.verified' ELSE 'document.unverified' END,
    'orphan_document', _id, jsonb_build_object('orphan_id', _orphan, 'note', _note));
END $fn$;
REVOKE ALL ON FUNCTION public.verify_document(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_document(UUID, BOOLEAN, TEXT) TO authenticated;