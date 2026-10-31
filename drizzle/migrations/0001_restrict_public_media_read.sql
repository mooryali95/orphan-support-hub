CREATE OR REPLACE FUNCTION public.is_published_orphan_folder(_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  RETURN EXISTS (SELECT 1 FROM public.orphans o
    WHERE o.id = _id AND o.status IN ('approved','fully_sponsored')
      AND o.photo_consent IN ('granted','face_hidden'));
END $$;
REVOKE ALL ON FUNCTION public.is_published_orphan_folder(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_published_orphan_folder(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-media'
         AND (public.is_published_orphan_folder(name) OR public.can_reach_orphan_folder(name)));