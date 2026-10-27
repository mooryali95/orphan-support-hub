-- =====================================================================
-- كهاتين — المكاتب، أصناف المؤسسات، الجهات المانحة، ولوحاتها
-- ---------------------------------------------------------------------
-- تصحيح: دعم التأهيل يصل المؤسسة أيضاً (مركز، مكتب، مدرسة…)، فيُرفع
-- القيد السابق.
--
-- البنية:
--   المكتب  — مسؤول عن دولة أو منطقة منها، وقد يتبع مكتباً أعلى. أعضاؤه
--             بأدوار من سجلّ (مدير، منسّق، ميداني، مطّلع — أمثلة).
--             يرفع تقارير بصور ومرفقات في خزنةٍ خاصّة بمجلّده.
--   المؤسسة — care_organizations مع صنفٍ من سجلّ institution_kinds.
--   الجهة المانحة — شركة/مؤسسة خيرية تدعم باسمها، وأعضاؤها يرون تعهّداتها.
--
-- كل الأصناف والأدوار صفوف، لا تعدادات: تُضاف دون هجرة.
-- =====================================================================

ALTER TABLE public.support_pledges DROP CONSTRAINT IF EXISTS ck_pledge_kind_target;


-- ---------------------------------------------------------------------
-- 1) أصناف المؤسسات
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_kinds (
  key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active     BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.institution_kinds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ik_read ON public.institution_kinds;
CREATE POLICY ik_read ON public.institution_kinds FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ik_admin ON public.institution_kinds;
CREATE POLICY ik_admin ON public.institution_kinds FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.institution_kinds TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.institution_kinds TO authenticated;

INSERT INTO public.institution_kinds (key, label, sort_order) VALUES
  ('center', 'مركز', 1), ('office', 'مكتب', 2), ('school', 'مدرسة', 3),
  ('association', 'جمعية', 4), ('care_home', 'دار رعاية', 5)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.care_organizations
  ADD COLUMN IF NOT EXISTS kind TEXT REFERENCES public.institution_kinds(key),
  ADD COLUMN IF NOT EXISTS country_code TEXT REFERENCES public.countries(code),
  ADD COLUMN IF NOT EXISTS region TEXT;


-- ---------------------------------------------------------------------
-- 2) المكاتب
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(btrim(name)) >= 2),
  country_code  TEXT NOT NULL REFERENCES public.countries(code),
  region        TEXT,                    -- NULL = الدولة كلّها
  parent_id     UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE TABLE IF NOT EXISTS public.office_roles (
  key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  label      TEXT NOT NULL,
  can_write  BOOLEAN NOT NULL DEFAULT false,   -- يرفع تقارير وبيانات
  can_publish BOOLEAN NOT NULL DEFAULT false,  -- ينشر التقرير للداعمين
  sort_order INTEGER NOT NULL DEFAULT 100
);
INSERT INTO public.office_roles (key, label, can_write, can_publish, sort_order) VALUES
  ('manager', 'مدير المكتب', true, true, 1),
  ('coordinator', 'منسّق', true, false, 2),
  ('field_officer', 'موظّف ميداني', true, false, 3),
  ('viewer', 'مطّلع', false, false, 4)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.office_members (
  office_id  UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL REFERENCES public.office_roles(key),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, user_id)
);

-- عضوية المكتب تسري على ما تحته: مدير مكتب الدولة يرى مكاتب مناطقها.
CREATE OR REPLACE FUNCTION public.office_permission(_office UUID, _need TEXT DEFAULT 'read')
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, 0 AS depth FROM public.offices WHERE id = _office
    UNION ALL
    SELECT o.id, o.parent_id, up.depth + 1 FROM public.offices o
      JOIN up ON o.id = up.parent_id WHERE up.depth < 10
  )
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM up JOIN public.office_members m ON m.office_id = up.id
      JOIN public.office_roles r ON r.key = m.role
     WHERE m.user_id = auth.uid()
       AND CASE _need WHEN 'read' THEN true
                      WHEN 'write' THEN r.can_write
                      WHEN 'publish' THEN r.can_publish
                      ELSE false END);
$fn$;
REVOKE ALL ON FUNCTION public.office_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_permission(UUID, TEXT) TO authenticated;

ALTER TABLE public.offices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offices_read ON public.offices;
CREATE POLICY offices_read ON public.offices FOR SELECT TO authenticated
  USING (public.office_permission(id, 'read'));
DROP POLICY IF EXISTS offices_admin ON public.offices;
CREATE POLICY offices_admin ON public.offices FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS oroles_read ON public.office_roles;
CREATE POLICY oroles_read ON public.office_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS oroles_admin ON public.office_roles;
CREATE POLICY oroles_admin ON public.office_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS omembers_read ON public.office_members;
CREATE POLICY omembers_read ON public.office_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.office_permission(office_id, 'publish'));
DROP POLICY IF EXISTS omembers_admin ON public.office_members;
CREATE POLICY omembers_admin ON public.office_members FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices, public.office_roles, public.office_members TO authenticated;


-- ---------------------------------------------------------------------
-- 3) تقارير المكتب ومرفقاته
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.office_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id     UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES auth.users(id),
  title         TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  body          TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  -- مؤشّرات حرّة بأسماء يختارها المكتب: {"visits": 12, "kits": 40}
  metrics       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  -- مسارات داخل خزنة office-media، وكلها في مجلّد المكتب نفسه.
  attachments   TEXT[] NOT NULL DEFAULT '{}',
  period_start  DATE,
  period_end    DATE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'published')),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CHECK (cardinality(attachments) <= 30)
);
CREATE INDEX IF NOT EXISTS idx_office_reports ON public.office_reports(office_id, created_at DESC);
ALTER TABLE public.office_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oreports_read ON public.office_reports;
CREATE POLICY oreports_read ON public.office_reports FOR SELECT TO authenticated
  USING (public.office_permission(office_id, 'read'));
GRANT SELECT ON public.office_reports TO authenticated;
-- الكتابة عبر save_office_report وحدها.

CREATE OR REPLACE FUNCTION public.save_office_report(
  _office UUID, _title TEXT, _body TEXT, _metrics JSONB DEFAULT '{}'::jsonb,
  _attachments TEXT[] DEFAULT '{}', _period_start DATE DEFAULT NULL,
  _period_end DATE DEFAULT NULL, _status TEXT DEFAULT 'draft', _id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rid UUID; _p TEXT;
BEGIN
  IF NOT public.office_permission(_office, 'write') THEN
    RAISE EXCEPTION 'office_write_denied' USING ERRCODE = '42501';
  END IF;
  IF _status = 'published' AND NOT public.office_permission(_office, 'publish') THEN
    RAISE EXCEPTION 'office_publish_denied' USING ERRCODE = '42501';
  END IF;
  -- مرفقٌ من مجلّد مكتبٍ آخر يُرفض: لا يُستعار ملفّ غيرك.
  FOREACH _p IN ARRAY COALESCE(_attachments, '{}') LOOP
    IF split_part(_p, '/', 1) <> _office::text THEN
      RAISE EXCEPTION 'attachment_outside_office';
    END IF;
  END LOOP;

  IF _id IS NULL THEN
    INSERT INTO public.office_reports
      (office_id, author_id, title, body, metrics, attachments, period_start, period_end, status,
       published_at)
    VALUES (_office, auth.uid(), btrim(_title), COALESCE(_body, ''), COALESCE(_metrics, '{}'),
            COALESCE(_attachments, '{}'), _period_start, _period_end, _status,
            CASE WHEN _status = 'published' THEN now() END)
    RETURNING id INTO _rid;
  ELSE
    UPDATE public.office_reports
       SET title = btrim(_title), body = COALESCE(_body, ''), metrics = COALESCE(_metrics, '{}'),
           attachments = COALESCE(_attachments, '{}'), period_start = _period_start,
           period_end = _period_end, status = _status, updated_at = now(),
           published_at = CASE WHEN _status = 'published' THEN COALESCE(published_at, now()) END
     WHERE id = _id AND office_id = _office
     RETURNING id INTO _rid;
    IF _rid IS NULL THEN RAISE EXCEPTION 'report_not_found'; END IF;
  END IF;
  RETURN _rid;
END $fn$;
REVOKE ALL ON FUNCTION public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID) TO authenticated;


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('office-media', 'office-media', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_reach_office_folder(_path TEXT, _need TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  IF _id IS NULL THEN RETURN false; END IF;
  RETURN public.office_permission(_id, _need);
END $fn$;
REVOKE ALL ON FUNCTION public.can_reach_office_folder(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_reach_office_folder(TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS office_media_read ON storage.objects;
CREATE POLICY office_media_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'office-media' AND public.can_reach_office_folder(name, 'read'));
DROP POLICY IF EXISTS office_media_write ON storage.objects;
CREATE POLICY office_media_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'office-media' AND public.can_reach_office_folder(name, 'write'));
DROP POLICY IF EXISTS office_media_delete ON storage.objects;
CREATE POLICY office_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'office-media' AND public.can_reach_office_folder(name, 'write'));


-- ---------------------------------------------------------------------
-- 4) الجهات المانحة
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donor_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(btrim(name)) >= 2),
  entity_type TEXT NOT NULL DEFAULT 'foundation',  -- شركة، وقف، مؤسسة… نصّ حرّ
  country     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.donor_members (
  entity_id  UUID NOT NULL REFERENCES public.donor_entities(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (entity_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_donor_member(_entity UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.donor_members WHERE entity_id = _entity AND user_id = auth.uid());
$fn$;
REVOKE ALL ON FUNCTION public.is_donor_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_donor_member(UUID) TO authenticated;

ALTER TABLE public.donor_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_members  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS de_read ON public.donor_entities;
CREATE POLICY de_read ON public.donor_entities FOR SELECT TO authenticated
  USING (public.is_donor_member(id) OR public.is_admin());
DROP POLICY IF EXISTS de_admin ON public.donor_entities;
CREATE POLICY de_admin ON public.donor_entities FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS dm_read ON public.donor_members;
CREATE POLICY dm_read ON public.donor_members FOR SELECT TO authenticated
  USING (public.is_donor_member(entity_id) OR public.is_admin());
GRANT SELECT, UPDATE ON public.donor_entities TO authenticated;
GRANT SELECT ON public.donor_members TO authenticated;

-- تسجيل جهة: المنشئ مالكها، وتبقى «قيد المراجعة» حتى تعتمدها الإدارة.
CREATE OR REPLACE FUNCTION public.register_donor_entity(_name TEXT, _type TEXT DEFAULT 'foundation', _country TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.donor_entities (name, entity_type, country, created_by)
  VALUES (btrim(_name), COALESCE(NULLIF(btrim(_type), ''), 'foundation'), NULLIF(btrim(_country), ''), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.donor_members (entity_id, user_id, role) VALUES (_id, auth.uid(), 'owner');
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.register_donor_entity(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_donor_entity(TEXT, TEXT, TEXT) TO authenticated;

ALTER TABLE public.support_pledges
  ADD COLUMN IF NOT EXISTS donor_entity_id UUID REFERENCES public.donor_entities(id) ON DELETE RESTRICT;

DROP POLICY IF EXISTS sp_read ON public.support_pledges;
CREATE POLICY sp_read ON public.support_pledges FOR SELECT TO authenticated
  USING (supporter_id = auth.uid() OR public.is_admin()
         OR (donor_entity_id IS NOT NULL AND public.is_donor_member(donor_entity_id)));

-- التعهّد باسم جهة: عضوٌ في جهةٍ معتمدة فقط.
CREATE OR REPLACE FUNCTION public.set_pledge_entity(_pledge UUID, _entity UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_donor_member(_entity)
     OR NOT EXISTS (SELECT 1 FROM public.donor_entities WHERE id = _entity AND status = 'approved') THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.support_pledges SET donor_entity_id = _entity
   WHERE id = _pledge AND supporter_id = auth.uid() AND donor_entity_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'pledge_not_found'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.set_pledge_entity(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pledge_entity(UUID, UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 5) اللوحات
-- ---------------------------------------------------------------------
-- نطاق المكتب: دولته، ومنطقته إن حُدّدت. يُحسب من المجموعات المرآوية
-- والتعهّدات، لا من نصّ orphans.country الحرّ.
CREATE OR REPLACE FUNCTION public.office_dashboard(_office UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o public.offices;
BEGIN
  IF NOT public.office_permission(_office, 'read') THEN
    RAISE EXCEPTION 'office_read_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.offices WHERE id = _office;
  RETURN jsonb_build_object(
    'office', jsonb_build_object('id', _o.id, 'name', _o.name, 'country', _o.country_code, 'region', _o.region),
    'groups', (SELECT count(*) FROM public.mirror_groups g
                WHERE g.deleted_at IS NULL AND g.country_code = _o.country_code
                  AND (_o.region IS NULL OR g.region = _o.region)),
    'orphans', (SELECT count(*) FROM public.orphans o JOIN public.mirror_groups g ON g.id = o.group_id
                 WHERE o.status = 'approved' AND g.deleted_at IS NULL
                   AND g.country_code = _o.country_code
                   AND (_o.region IS NULL OR g.region = _o.region)),
    'pledges', COALESCE((
      SELECT jsonb_object_agg(k.kind, k.v) FROM (
        SELECT p.kind, jsonb_build_object('count', count(*), 'amount', sum(p.amount)) AS v
          FROM public.support_pledges p
          LEFT JOIN public.mirror_groups g ON g.id = p.group_id
          LEFT JOIN public.orphans o ON o.id = p.orphan_id
          LEFT JOIN public.mirror_groups og ON og.id = o.group_id
          LEFT JOIN public.care_organizations c ON c.id = p.org_id
         WHERE p.status IN ('pending', 'active') AND p.country_code = _o.country_code
           AND (_o.region IS NULL
                OR COALESCE(p.region, g.region, og.region, c.region) = _o.region)
         GROUP BY p.kind) k), '{}'::jsonb),
    'reports', jsonb_build_object(
      'draft', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'draft'),
      'submitted', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'submitted'),
      'published', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'published')),
    'can_write', public.office_permission(_office, 'write'),
    'can_publish', public.office_permission(_office, 'publish'));
END $fn$;
REVOKE ALL ON FUNCTION public.office_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_dashboard(UUID) TO authenticated;


-- بوابات المستخدم: ما يملكه من أدوار ليُظهر له الواجهة المناسبة.
CREATE OR REPLACE FUNCTION public.my_workspaces()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'admin', public.is_admin(),
    'offices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role,
                                                             'country', o.country_code, 'region', o.region)
                                          ORDER BY o.name)
                           FROM public.office_members m JOIN public.offices o ON o.id = m.office_id
                          WHERE m.user_id = auth.uid() AND o.active), '[]'::jsonb),
    'donor_entities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
                                                                    'status', e.status, 'role', m.role)
                                                 ORDER BY e.name)
                                  FROM public.donor_members m JOIN public.donor_entities e ON e.id = m.entity_id
                                 WHERE m.user_id = auth.uid()), '[]'::jsonb),
    'care_org', EXISTS (SELECT 1 FROM public.care_organizations WHERE owner_id = auth.uid()),
    'guardian', EXISTS (SELECT 1 FROM public.orphans WHERE guardian_id = auth.uid()),
    'pledges', (SELECT count(*) FROM public.support_pledges WHERE supporter_id = auth.uid()));
$fn$;
REVOKE ALL ON FUNCTION public.my_workspaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_workspaces() TO authenticated;


CREATE OR REPLACE FUNCTION public.donor_entity_dashboard(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'entity', (SELECT jsonb_build_object('id', id, 'name', name, 'type', entity_type, 'status', status)
                 FROM public.donor_entities WHERE id = _entity),
    'by_kind', COALESCE((SELECT jsonb_object_agg(kind, total) FROM (
                 SELECT kind, sum(amount) AS total FROM public.support_pledges
                  WHERE donor_entity_id = _entity AND status <> 'cancelled' GROUP BY kind) x), '{}'::jsonb),
    'by_target', COALESCE((SELECT jsonb_object_agg(target_type, n) FROM (
                 SELECT target_type, count(*) AS n FROM public.support_pledges
                  WHERE donor_entity_id = _entity AND status <> 'cancelled' GROUP BY target_type) x), '{}'::jsonb),
    'members', (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity));
END $fn$;
REVOKE ALL ON FUNCTION public.donor_entity_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_entity_dashboard(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 6) أبواب الإدارة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_office_member(_office UUID, _email TEXT, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO _user FROM auth.users u WHERE lower(u.email) = lower(btrim(COALESCE(_email, '')));
  IF _user IS NULL THEN
    RAISE EXCEPTION 'لا حساب بهذا البريد' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.office_members (office_id, user_id, role) VALUES (_office, _user, _role)
  ON CONFLICT (office_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_assign_office_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_office_member(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_offices_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar, 'status', status)
                                            ORDER BY sort_order, code) FROM public.countries), '[]'::jsonb),
    'roles', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', key, 'label', label) ORDER BY sort_order)
                         FROM public.office_roles), '[]'::jsonb),
    'offices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'country', o.country_code, 'region', o.region,
        'parent_id', o.parent_id, 'active', o.active,
        'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) ORDER BY u.email)
                               FROM public.office_members m JOIN auth.users u ON u.id = m.user_id
                              WHERE m.office_id = o.id), '[]'::jsonb))
      ORDER BY o.country_code, o.region NULLS FIRST, o.name) FROM public.offices o), '[]'::jsonb),
    'donor_entities', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'type', e.entity_type, 'status', e.status, 'created_at', e.created_at)
      ORDER BY e.status <> 'pending', e.created_at DESC) FROM public.donor_entities e), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_offices_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_offices_overview() TO authenticated;
