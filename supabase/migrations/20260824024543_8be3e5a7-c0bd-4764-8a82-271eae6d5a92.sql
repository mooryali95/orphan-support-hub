-- 1) Storage: private orphan-documents bucket, access joined to orphan management rights
DROP POLICY IF EXISTS "orphan_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "orphan_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "orphan_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "orphan_docs_delete" ON storage.objects;

CREATE POLICY "orphan_docs_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'orphan-documents'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_orphan(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "orphan_docs_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'orphan-documents'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_orphan(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "orphan_docs_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'orphan-documents'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_orphan(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'orphan-documents'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_orphan(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "orphan_docs_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'orphan-documents'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_admin()
);

-- 2) Make the fail-closed intent explicit at the privilege level (no delete path via the API)
REVOKE DELETE ON public.orphans, public.care_organizations, public.sponsorships,
  public.orphan_documents, public.audit_log, public.api_clients, public.api_import_jobs
  FROM anon, authenticated;

REVOKE INSERT, UPDATE ON public.orphans, public.care_organizations, public.sponsorships,
  public.orphan_documents, public.audit_log, public.api_clients, public.api_import_jobs
  FROM anon;

REVOKE SELECT ON public.orphans, public.sponsorships, public.orphan_documents,
  public.audit_log, public.api_clients, public.api_import_jobs FROM anon;

-- 3) Admin/back-office tables must never be writable through the client API
REVOKE INSERT, UPDATE ON public.audit_log, public.api_clients, public.api_import_jobs
  FROM authenticated;

-- api_clients holds hashed API secrets: no anon access at all
REVOKE ALL ON public.api_clients FROM anon;
REVOKE ALL ON public.protected_admins FROM anon, authenticated;

-- 4) audit writer must not be callable directly by signed-in users (forged audit trail)
REVOKE EXECUTE ON FUNCTION public.write_audit(text, text, uuid, jsonb) FROM authenticated, anon, public;