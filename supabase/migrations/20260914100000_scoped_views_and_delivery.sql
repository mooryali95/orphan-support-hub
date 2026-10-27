-- =====================================================================
-- كهاتين — أبواب النطاقات، ومسار تسليم التعهّدات، ورمز البلد
-- ---------------------------------------------------------------------
-- 1.3  رحلة الطفل وتقدّمه ونتائجه، وتقاريره — كلٌّ بنطاقه.
-- 1.6  تقارير المكاتب المنشورة تصل من له نطاق «التقارير» في منطقتها.
-- 1.4  orphans.country_code: رمزٌ من سجلّ الدول بدل الاعتماد على نصٍّ حرّ.
-- 1.7  التعهّد العيني/التأهيلي: تجهيز ← تسليم بمستند ← إشعار الداعم.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1.4) رمز البلد
-- ---------------------------------------------------------------------
ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS country_code TEXT REFERENCES public.countries(code);

CREATE OR REPLACE FUNCTION public.resolve_country_code(_text TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT code FROM public.countries
   WHERE code = upper(btrim(COALESCE(_text, '')))
      OR name_ar = btrim(COALESCE(_text, ''))
      OR lower(name_local) = lower(btrim(COALESCE(_text, '')))
   LIMIT 1;
$fn$;

-- المجموعة المرآوية أصدق من النصّ: إن وُجدت فدولتها هي الدولة.
CREATE OR REPLACE FUNCTION public.sync_orphan_country_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.country_code := COALESCE(
    (SELECT g.country_code FROM public.mirror_groups g WHERE g.id = NEW.group_id),
    public.resolve_country_code(NEW.country),
    NEW.country_code);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_sync_orphan_country_code ON public.orphans;
CREATE TRIGGER trg_sync_orphan_country_code
  BEFORE INSERT OR UPDATE OF country, group_id ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.sync_orphan_country_code();

UPDATE public.orphans o
   SET country_code = COALESCE(
     (SELECT g.country_code FROM public.mirror_groups g WHERE g.id = o.group_id),
     public.resolve_country_code(o.country))
 WHERE o.country_code IS NULL;

GRANT SELECT (country_code) ON public.orphans TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 1.3) الرحلة والتقدّم والنتائج
-- ---------------------------------------------------------------------
-- «journey»: الجلسات ومحاورها وحالتها. «progress»: المرحلة ونسبة المقبول.
-- «results»: المخرَج المسلَّم وتقويم المشرف. يكفي أحدها لفتح الباب،
-- وكلٌّ يُضيف حقوله وحده.
CREATE OR REPLACE FUNCTION public.orphan_journey(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _j BOOLEAN; _p BOOLEAN; _r BOOLEAN;
BEGIN
  _j := public.has_orphan_scope(_orphan, 'journey');
  _p := public.has_orphan_scope(_orphan, 'progress');
  _r := public.has_orphan_scope(_orphan, 'results');
  IF NOT (_j OR _p OR _r) THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  RETURN jsonb_build_object('allowed', true,
    'scopes', jsonb_build_object('journey', _j, 'progress', _p, 'results', _r),
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'program', pr.title,
               'status', e.status,
               'started_at', e.started_at,
               'stage', CASE WHEN _p THEN e.stage::text END,
               'accepted', CASE WHEN _p THEN (SELECT count(*) FROM public.enrollment_units u
                                               WHERE u.enrollment_id = e.id AND u.status = 'accepted') END,
               'total', CASE WHEN _p THEN (SELECT count(*) FROM public.program_units pu
                                            WHERE pu.program_id = e.program_id AND pu.active) END,
               'units', CASE WHEN _j OR _r THEN COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'ordinal', pu.ordinal, 'title', pu.title, 'focus', pu.focus,
                           'status', COALESCE(u.status::text, 'pending'),
                           'evidence', CASE WHEN _r THEN u.evidence END,
                           'note', CASE WHEN _r THEN u.note END,
                           'decided_at', CASE WHEN _r THEN u.decided_at END)
                         ORDER BY pu.ordinal)
                    FROM public.program_units pu
                    LEFT JOIN public.enrollment_units u
                      ON u.unit_id = pu.id AND u.enrollment_id = e.id
                   WHERE pu.program_id = e.program_id AND pu.active), '[]'::jsonb) END)
             ORDER BY e.created_at DESC)
        FROM public.program_enrollments e
        JOIN public.programs pr ON pr.id = e.program_id
       WHERE e.orphan_id = _orphan AND e.status IN ('proposed', 'funded', 'paused', 'completed')
    ), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_journey(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_journey(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 1.3 + 1.6) التقارير: تقارير الجهة المعتمدة + تقارير المكتب المنشورة
-- ---------------------------------------------------------------------
-- ملاحظة الصحّة لا تمرّ هنا: هي من «profile_deep». ومرفقات تقارير المكتب
-- تُعدّ ولا تُعطى مساراتها: قد تُظهر أطفالاً بلا موافقة صورة.
CREATE OR REPLACE FUNCTION public.orphan_reports(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _cc TEXT; _region TEXT;
BEGIN
  IF NOT public.has_orphan_scope(_orphan, 'reports') THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  SELECT COALESCE(g.country_code, o.country_code), COALESCE(g.region, o.region)
    INTO _cc, _region
    FROM public.orphans o LEFT JOIN public.mirror_groups g ON g.id = o.group_id
   WHERE o.id = _orphan;

  RETURN jsonb_build_object('allowed', true,
    'progress', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'period', r.period, 'summary', r.summary,
               'education', r.education_note, 'living', r.living_note,
               'published_at', COALESCE(r.published_at, r.updated_at))
             ORDER BY r.period DESC)
        FROM public.progress_reports r
       WHERE r.orphan_id = _orphan AND r.status = 'approved'), '[]'::jsonb),
    'field', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'office', f.name, 'title', rp.title, 'body', rp.body, 'metrics', rp.metrics,
               'period_start', rp.period_start, 'period_end', rp.period_end,
               'published_at', rp.published_at, 'attachments', cardinality(rp.attachments))
             ORDER BY rp.published_at DESC)
        FROM public.office_reports rp
        JOIN public.offices f ON f.id = rp.office_id
       WHERE rp.status = 'published' AND _cc IS NOT NULL
         AND f.country_code = _cc AND (f.region IS NULL OR f.region = _region)), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_reports(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_reports(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 1.7) مسار تسليم التعهّد
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pledge_deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id   UUID NOT NULL REFERENCES public.support_pledges(id) ON DELETE CASCADE,
  office_id   UUID NOT NULL REFERENCES public.offices(id),
  stage       TEXT NOT NULL CHECK (stage IN ('preparing', 'delivered')),
  proof_path  TEXT,
  note        TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_pledge_delivered_proof CHECK (stage <> 'delivered' OR proof_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pledge_deliveries ON public.pledge_deliveries(pledge_id, created_at);
ALTER TABLE public.pledge_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pd_read ON public.pledge_deliveries;
CREATE POLICY pd_read ON public.pledge_deliveries FOR SELECT TO authenticated
  USING (public.is_admin() OR public.office_permission(office_id, 'read'));
GRANT SELECT ON public.pledge_deliveries TO authenticated;

-- هل يقع التعهّد في نطاق المكتب؟ دولته، ومنطقته إن كان للمكتب منطقة.
CREATE OR REPLACE FUNCTION public.pledge_in_office(_pledge UUID, _office UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.support_pledges p
      JOIN public.offices f ON f.id = _office
      LEFT JOIN public.mirror_groups g ON g.id = p.group_id
      LEFT JOIN public.orphans o ON o.id = p.orphan_id
      LEFT JOIN public.mirror_groups og ON og.id = o.group_id
      LEFT JOIN public.care_organizations c ON c.id = p.org_id
     WHERE p.id = _pledge AND p.country_code = f.country_code
       AND (f.region IS NULL OR COALESCE(p.region, g.region, og.region, c.region, o.region) = f.region));
$fn$;

CREATE OR REPLACE FUNCTION public.record_pledge_delivery(
  _pledge UUID, _office UUID, _stage TEXT, _proof_path TEXT DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.support_pledges;
BEGIN
  IF NOT public.office_permission(_office, 'write') OR NOT public.pledge_in_office(_pledge, _office) THEN
    RAISE EXCEPTION 'delivery_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _p FROM public.support_pledges WHERE id = _pledge;
  IF _p.status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'pledge_not_open';
  END IF;
  IF _stage = 'delivered' THEN
    IF NULLIF(btrim(COALESCE(_proof_path, '')), '') IS NULL THEN RAISE EXCEPTION 'proof_required'; END IF;
    IF split_part(_proof_path, '/', 1) <> _office::text THEN RAISE EXCEPTION 'proof_outside_office'; END IF;
  END IF;

  INSERT INTO public.pledge_deliveries (pledge_id, office_id, stage, proof_path, note, created_by)
  VALUES (_pledge, _office, _stage, NULLIF(btrim(_proof_path), ''), NULLIF(btrim(_note), ''), auth.uid());

  IF _stage = 'delivered' THEN
    UPDATE public.support_pledges SET status = 'fulfilled' WHERE id = _pledge;
    PERFORM public.notify(_p.supporter_id, 'other', 'وصل دعمك',
      'أكّد المكتب تسليم دعمك بمستندٍ موثّق.', '/dashboard', 'pledge', _pledge);
  ELSE
    PERFORM public.notify(_p.supporter_id, 'other', 'يُجهَّز دعمك',
      'بدأ المكتب تجهيز دعمك للتسليم.', '/dashboard', 'pledge', _pledge);
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.record_pledge_delivery(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pledge_delivery(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ما ينتظر المكتب من التعهّدات المفتوحة في نطاقه.
CREATE OR REPLACE FUNCTION public.office_open_pledges(_office UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.office_permission(_office, 'read') THEN
    RAISE EXCEPTION 'office_read_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
             'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
             'target', CASE p.target_type
                         WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                         WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                         WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                         WHEN 'region' THEN p.region
                         ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code) END,
             'last_stage', (SELECT d.stage FROM public.pledge_deliveries d
                             WHERE d.pledge_id = p.id ORDER BY d.created_at DESC LIMIT 1))
           ORDER BY p.created_at)
      FROM public.support_pledges p
     WHERE p.status IN ('pending', 'active') AND public.pledge_in_office(p.id, _office)), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.office_open_pledges(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_open_pledges(UUID) TO authenticated;

-- تعهّداتي بمراحل تسليمها (بلا مسارات المستندات).
CREATE OR REPLACE FUNCTION public.my_pledges()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
           'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
           'target', CASE p.target_type
                       WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                       WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                       WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                       WHEN 'region' THEN p.region
                       ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code)
                     END,
           'deliveries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'stage', d.stage, 'at', d.created_at, 'documented', d.proof_path IS NOT NULL)
                           ORDER BY d.created_at)
                             FROM public.pledge_deliveries d WHERE d.pledge_id = p.id), '[]'::jsonb))
         ORDER BY p.created_at DESC), '[]'::jsonb)
    FROM public.support_pledges p
   WHERE p.supporter_id = auth.uid();
$fn$;

-- الإدارة تفتح التعهّد حين يصل المال (تحويلاً أو نقداً) إلى حين التحصيل الإلكتروني.
CREATE OR REPLACE FUNCTION public.admin_set_pledge_status(_pledge UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.support_pledges SET status = _status WHERE id = _pledge;
  IF NOT FOUND THEN RAISE EXCEPTION 'pledge_not_found'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_pledge_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pledge_status(UUID, TEXT) TO authenticated;
