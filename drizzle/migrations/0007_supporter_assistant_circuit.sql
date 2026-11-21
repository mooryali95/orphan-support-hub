CREATE TABLE public.supporter_assistant_state (id boolean PRIMARY KEY DEFAULT true CHECK (id), status integer NOT NULL CHECK (status IN (402,403)), message text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.supporter_assistant_state TO service_role;
REVOKE ALL ON public.supporter_assistant_state FROM anon, authenticated;
ALTER TABLE public.supporter_assistant_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.supporter_assistant_state IS 'Server-only durable AI access/credit circuit breaker. Stores no conversations or child information.';