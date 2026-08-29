CREATE TABLE IF NOT EXISTS public.dispatch_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job TEXT NOT NULL DEFAULT 'notifications.dispatch',
  ok BOOLEAN NOT NULL DEFAULT true,
  schema_ready BOOLEAN NOT NULL DEFAULT true,
  provider TEXT,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatch_runs_created_at_idx ON public.dispatch_runs (created_at DESC);

GRANT SELECT ON public.dispatch_runs TO authenticated;
GRANT ALL ON public.dispatch_runs TO service_role;

ALTER TABLE public.dispatch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read dispatch runs" ON public.dispatch_runs;
CREATE POLICY "admins read dispatch runs"
ON public.dispatch_runs FOR SELECT TO authenticated
USING (public.is_admin());