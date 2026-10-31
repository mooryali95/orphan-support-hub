DROP POLICY IF EXISTS td_read ON public.trait_dimensions;
CREATE POLICY td_read ON public.trait_dimensions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS oroles_read ON public.office_roles;
CREATE POLICY oroles_read ON public.office_roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS ik_read ON public.institution_kinds;
CREATE POLICY ik_read ON public.institution_kinds FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);