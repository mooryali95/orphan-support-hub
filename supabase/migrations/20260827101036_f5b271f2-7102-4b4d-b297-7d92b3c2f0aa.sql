CREATE OR REPLACE FUNCTION public.can_reach_orphan_folder(_path TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF _id IS NULL THEN RETURN false; END IF;
  RETURN public.can_manage_orphan(_id);
END $fn$;
REVOKE ALL ON FUNCTION public.can_reach_orphan_folder(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_reach_orphan_folder(TEXT) TO authenticated;

DROP POLICY IF EXISTS "orphan_docs_read" ON storage.objects;
CREATE POLICY "orphan_docs_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "orphan_docs_write" ON storage.objects;
CREATE POLICY "orphan_docs_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "orphan_docs_delete" ON storage.objects;
CREATE POLICY "orphan_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-media');

DROP POLICY IF EXISTS "public_media_write" ON storage.objects;
CREATE POLICY "public_media_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public-media' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "public_media_delete" ON storage.objects;
CREATE POLICY "public_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'public-media' AND public.can_reach_orphan_folder(name));

DO $$ BEGIN
  CREATE TYPE public.photo_consent_state AS ENUM ('none', 'face_hidden', 'granted', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS photo_consent public.photo_consent_state NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS photo_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_consent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_consent_doc TEXT;

CREATE OR REPLACE FUNCTION public.guard_photo_consent()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.photo_url IS NULL OR NEW.photo_url = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.photo_consent NOT IN ('granted', 'face_hidden') THEN
    RAISE EXCEPTION 'orphan: photo requires documented consent (photo_consent=%)', NEW.photo_consent
      USING ERRCODE = '42501';
  END IF;

  IF NEW.photo_consent = 'granted' AND COALESCE(NEW.photo_consent_doc, '') = '' THEN
    RAISE EXCEPTION 'orphan: full photo consent requires a consent document'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_photo_consent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_photo_consent ON public.orphans;
CREATE TRIGGER trg_guard_photo_consent
BEFORE INSERT OR UPDATE OF photo_url, photo_consent, photo_consent_doc ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.guard_photo_consent();

CREATE OR REPLACE FUNCTION public.clear_photo_on_withdrawal()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.photo_consent = 'withdrawn' AND COALESCE(NEW.photo_url, '') <> '' THEN
    NEW.photo_url := NULL;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.clear_photo_on_withdrawal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clear_photo_on_withdrawal ON public.orphans;
CREATE TRIGGER trg_clear_photo_on_withdrawal
BEFORE UPDATE OF photo_consent ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.clear_photo_on_withdrawal();

DO $$ BEGIN
  CREATE TYPE public.orphan_doc_type AS ENUM (
    'death_certificate', 'birth_certificate', 'guardianship_proof',
    'orphan_id', 'guardian_id', 'income_proof', 'school_record',
    'medical_report', 'photo_consent', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orphan_documents
  ADD COLUMN IF NOT EXISTS kind public.orphan_doc_type NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orphan_doc_path
  ON public.orphan_documents(storage_path);

CREATE OR REPLACE FUNCTION public.guard_document_verification()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified THEN
      RAISE EXCEPTION 'document: verification is admin-only' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'document: verification is admin-only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_document_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_document_verification ON public.orphan_documents;
CREATE TRIGGER trg_guard_document_verification
BEFORE INSERT OR UPDATE ON public.orphan_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_document_verification();

DROP POLICY IF EXISTS "docs_admin_read" ON public.orphan_documents;
CREATE POLICY "docs_admin_read" ON public.orphan_documents FOR SELECT TO authenticated
  USING (public.is_admin());