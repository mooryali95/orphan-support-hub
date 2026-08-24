-- The public orphan directory is browsable without signing in; restore read access.
GRANT SELECT ON public.orphans TO anon;