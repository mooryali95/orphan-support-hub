CREATE OR REPLACE FUNCTION public.sponsors_orphan(_orphan_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sponsorships s
    WHERE s.orphan_id = _orphan_id AND s.sponsor_id = auth.uid() AND s.status = 'active');
$function$;

CREATE OR REPLACE FUNCTION public.donor_entity_pledges(_entity uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin() OR (public.is_donor_member(_entity)
          AND EXISTS (SELECT 1 FROM public.donor_entities WHERE id = _entity AND status = 'approved'))) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
             'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
             'country', p.country_code,
             'target', CASE p.target_type
                         WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                         WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                         WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                         WHEN 'region' THEN p.region
                         ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code) END,
             'delivered_at', (SELECT max(d.created_at) FROM public.pledge_deliveries d
                               WHERE d.pledge_id = p.id AND d.stage = 'delivered'))
           ORDER BY p.created_at DESC)
      FROM public.support_pledges p WHERE p.donor_entity_id = _entity), '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.guard_sponsorship_amount()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.amount IS NOT DISTINCT FROM OLD.amount THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount < 5 OR NEW.amount > 100000 THEN
    RAISE EXCEPTION 'sponsorship: amount out of range' USING ERRCODE = '22023';
  END IF;
  IF NEW.type = 'monthly' AND NEW.amount <> trunc(NEW.amount) THEN
    RAISE EXCEPTION 'sponsorship: monthly amount must be whole' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.guard_sponsorship_amount() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_sponsorship_amount ON public.sponsorships;
CREATE TRIGGER trg_guard_sponsorship_amount BEFORE INSERT OR UPDATE OF amount ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.guard_sponsorship_amount();