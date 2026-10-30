DROP POLICY IF EXISTS "settings_read" ON public.platform_settings;
CREATE POLICY "settings_read_admin" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.payment_hold_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('payments_on_hold', payments_on_hold, 'payments_hold_reason', payments_hold_reason)
  FROM public.platform_settings WHERE id;
$$;
REVOKE ALL ON FUNCTION public.payment_hold_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_hold_state() TO authenticated, service_role;