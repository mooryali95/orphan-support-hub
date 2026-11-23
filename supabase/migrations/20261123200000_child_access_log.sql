-- =====================================================================
-- سجلّ الاطّلاع على بيانات الأطفال الخاصّة
-- ---------------------------------------------------------------------
-- كلّ مرّةٍ تُعيد فيها orphan_view «التفصيل» (القصّة، المدينة، الاسم الحقيقي،
-- الصورة — بحسب النطاق) لحسابٍ مسجَّل، يُسجَّل من اطّلع، وعلى أيّ طفل،
-- وبأيّ نطاقات، ومتى. التسجيل في القاعدة نفسها: لا يتجاوزه استدعاءٌ مباشر.
--
-- الطريقة: الدالّة القائمة تصير داخليّة (orphan_view_core، لا يستدعيها
-- العميل)، و orphan_view غلافٌ يستدعيها ثم يسجّل. الزائر بلا حساب لا يرى
-- تفصيلاً أصلاً فلا يُسجَّل. وتُدمج الزيارات المتكرّرة للطفل نفسه خلال عشر
-- دقائق في سطرٍ واحد.
-- تنبيه لمن يعدّل لاحقاً: يُعدَّل التفصيل في orphan_view_core، لا هنا.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.child_access_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orphan_id  UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  scopes     TEXT[] NOT NULL DEFAULT '{}',
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_child_access_log_orphan ON public.child_access_log (orphan_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_access_log_viewer ON public.child_access_log (viewer_id, viewed_at DESC);
ALTER TABLE public.child_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.child_access_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.child_access_log TO service_role;

ALTER FUNCTION public.orphan_view(UUID) RENAME TO orphan_view_core;
REVOKE ALL ON FUNCTION public.orphan_view_core(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out JSONB := public.orphan_view_core(_orphan); _scopes TEXT[];
BEGIN
  IF auth.uid() IS NOT NULL AND _out ? 'detail' THEN
    SELECT COALESCE(array_agg(x), '{}') INTO _scopes
      FROM jsonb_array_elements_text(COALESCE(_out->'scopes', '[]'::jsonb)) x;
    IF NOT EXISTS (
      SELECT 1 FROM public.child_access_log l
       WHERE l.viewer_id = auth.uid() AND l.orphan_id = _orphan
         AND l.scopes = _scopes AND l.viewed_at > now() - interval '10 minutes'
    ) THEN
      INSERT INTO public.child_access_log (viewer_id, orphan_id, scopes)
      VALUES (auth.uid(), _orphan, _scopes);
    END IF;
  END IF;
  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_view(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_records(
  _kind TEXT, _q TEXT DEFAULT NULL, _status TEXT DEFAULT NULL,
  _limit INTEGER DEFAULT 50, _offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _lim INTEGER := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  _off INTEGER := GREATEST(COALESCE(_offset, 0), 0);
  _st  TEXT := NULLIF(btrim(COALESCE(_status, '')), '');
  _pat TEXT := CASE WHEN NULLIF(btrim(COALESCE(_q, '')), '') IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(btrim(_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_records: not authorised' USING ERRCODE = '42501';
  END IF;

  IF _kind = 'orphans' THEN
    RETURN (
      WITH base AS (
        SELECT o.id, o.code, o.display_name, o.city, o.status::text AS status, o.country_code,
               co.name AS org, o.monthly_need, o.funded_monthly, o.currency, o.created_at
          FROM public.orphans o
          LEFT JOIN public.care_organizations co ON co.id = o.org_id
         WHERE _pat IS NULL OR o.code ILIKE _pat OR o.display_name ILIKE _pat
               OR co.name ILIKE _pat OR o.city ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'code', b.code, 'name', b.display_name, 'city', b.city,
                    'country', b.country_code, 'status', b.status, 'org', b.org,
                    'need', b.monthly_need, 'funded', b.funded_monthly, 'currency', b.currency,
                    'created_at', b.created_at,
                    'sponsors', (SELECT count(*) FROM public.sponsorships s
                                  WHERE s.orphan_id = b.id AND s.status IN ('active', 'paused')),
                    'verification', public.orphan_verification(b.id))
                    ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'sponsorships' THEN
    RETURN (
      WITH base AS (
        SELECT s.id, s.status::text AS status, s.type::text AS type, s.amount, s.currency,
               s.created_at, s.started_at, o.id AS orphan_id, o.code, o.display_name, u.email
          FROM public.sponsorships s
          JOIN public.orphans o ON o.id = s.orphan_id
          LEFT JOIN auth.users u ON u.id = s.sponsor_id
         WHERE _pat IS NULL OR o.code ILIKE _pat OR o.display_name ILIKE _pat OR u.email ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'status', b.status, 'type', b.type, 'amount', b.amount,
                    'currency', b.currency, 'created_at', b.created_at, 'started_at', b.started_at,
                    'orphan_id', b.orphan_id, 'code', b.code, 'name', b.display_name,
                    'sponsor', b.email) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'pledges' THEN
    RETURN (
      WITH base AS (
        SELECT p.id, p.status, p.kind, p.target_type, p.amount, p.currency, p.created_at,
               p.country_code, p.region, u.email,
               COALESCE(o.display_name, g.name, co.name, p.region, c.name_ar, p.country_code) AS target
          FROM public.support_pledges p
          LEFT JOIN auth.users u ON u.id = p.supporter_id
          LEFT JOIN public.orphans o ON o.id = p.orphan_id
          LEFT JOIN public.mirror_groups g ON g.id = p.group_id
          LEFT JOIN public.care_organizations co ON co.id = p.org_id
          LEFT JOIN public.countries c ON c.code = p.country_code
         WHERE _pat IS NULL OR u.email ILIKE _pat OR o.display_name ILIKE _pat
               OR g.name ILIKE _pat OR p.region ILIKE _pat OR c.name_ar ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'status', b.status, 'kind', b.kind, 'target_type', b.target_type,
                    'target', b.target, 'amount', b.amount, 'currency', b.currency,
                    'country', b.country_code, 'created_at', b.created_at, 'supporter', b.email)
                    ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'orgs' THEN
    RETURN (
      WITH base AS (
        SELECT co.id, co.name, co.status::text AS status, co.city, co.region, co.license_number,
               co.contact_email, co.created_at,
               (SELECT count(*) FROM public.orphans o WHERE o.org_id = co.id) AS children
          FROM public.care_organizations co
         WHERE _pat IS NULL OR co.name ILIKE _pat OR co.city ILIKE _pat
               OR co.contact_email ILIKE _pat OR co.license_number ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'status', b.status, 'city', b.city, 'region', b.region, 'license', b.license_number, 'email', b.contact_email, 'children', b.children, 'created_at', b.created_at) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'offices' THEN
    RETURN (
      WITH base AS (
        SELECT f.id, f.name, f.country_code, f.region, f.created_at,
               CASE WHEN f.active THEN 'active' ELSE 'inactive' END AS status,
               (SELECT count(*) FROM public.office_members m WHERE m.office_id = f.id) AS members,
               (SELECT p.name FROM public.offices p WHERE p.id = f.parent_id) AS parent
          FROM public.offices f
         WHERE _pat IS NULL OR f.name ILIKE _pat OR f.region ILIKE _pat OR f.country_code ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'country', b.country_code, 'region', b.region, 'status', b.status, 'members', b.members, 'parent', b.parent, 'created_at', b.created_at) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'supervisors' THEN
    RETURN (
      WITH base AS (
        SELECT s.user_id AS id, u.email, pr.full_name, s.independence_index, s.certified_at,
               s.note, s.created_at,
               CASE WHEN NOT s.active THEN 'inactive'
                    WHEN s.certified_at IS NULL THEN 'pending' ELSE 'certified' END AS status
          FROM public.supervisor_profiles s
          LEFT JOIN auth.users u ON u.id = s.user_id
          LEFT JOIN public.profiles pr ON pr.id = s.user_id
         WHERE _pat IS NULL OR u.email ILIKE _pat OR pr.full_name ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'email', b.email, 'name', b.full_name, 'status', b.status, 'independence', b.independence_index, 'certified_at', b.certified_at, 'note', b.note, 'created_at', b.created_at) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'documents' THEN
    RETURN (
      WITH base AS (
        SELECT d.id, d.doc_type, d.file_name, d.storage_path, d.created_at, d.verified_at,
               CASE WHEN d.verified THEN 'verified' ELSE 'unverified' END AS status,
               o.id AS orphan_id, o.code, o.display_name
          FROM public.orphan_documents d
          JOIN public.orphans o ON o.id = d.orphan_id
         WHERE _pat IS NULL OR o.code ILIKE _pat OR o.display_name ILIKE _pat
               OR d.file_name ILIKE _pat OR d.doc_type ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'doc_type', b.doc_type, 'file_name', b.file_name, 'path', b.storage_path, 'status', b.status, 'verified_at', b.verified_at, 'orphan_id', b.orphan_id, 'code', b.code, 'name', b.display_name, 'created_at', b.created_at) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'payments' THEN
    RETURN (
      WITH base AS (
        SELECT p.id, p.status::text AS status, p.amount, p.currency, p.provider, p.provider_ref,
               p.paid_at, p.period_start, p.period_end, p.created_at, u.email,
               o.display_name, o.code, s.id AS sponsorship_id
          FROM public.sponsorship_payments p
          JOIN public.sponsorships s ON s.id = p.sponsorship_id
          JOIN public.orphans o ON o.id = s.orphan_id
          LEFT JOIN auth.users u ON u.id = p.sponsor_id
         WHERE _pat IS NULL OR u.email ILIKE _pat OR o.display_name ILIKE _pat
               OR o.code ILIKE _pat OR p.provider_ref ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'amount', b.amount, 'currency', b.currency, 'provider', b.provider, 'ref', b.provider_ref, 'paid_at', b.paid_at, 'period_start', b.period_start, 'period_end', b.period_end, 'sponsor', b.email, 'name', b.display_name, 'code', b.code, 'sponsorship_id', b.sponsorship_id, 'created_at', b.created_at) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));

  ELSIF _kind = 'access_log' THEN
    RETURN (
      WITH base AS (
        SELECT l.id, l.viewed_at AS created_at, l.scopes, u.email,
               o.id AS orphan_id, o.code, o.display_name,
               CASE WHEN public.has_role(l.viewer_id, 'admin') THEN 'admin' ELSE 'other' END AS status
          FROM public.child_access_log l
          JOIN public.orphans o ON o.id = l.orphan_id
          LEFT JOIN auth.users u ON u.id = l.viewer_id
         WHERE _pat IS NULL OR u.email ILIKE _pat OR o.code ILIKE _pat OR o.display_name ILIKE _pat)
      SELECT jsonb_build_object(
        'counts', COALESCE((SELECT jsonb_object_agg(status, n)
                              FROM (SELECT status, count(*) n FROM base GROUP BY status) c), '{}'::jsonb),
        'total', (SELECT count(*) FROM base WHERE _st IS NULL OR status = _st),
        'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'status', b.status, 'viewer', b.email, 'scopes', to_jsonb(b.scopes),
                    'orphan_id', b.orphan_id, 'code', b.code, 'name', b.display_name,
                    'created_at', b.created_at) ORDER BY b.created_at DESC)
                  FROM (SELECT * FROM base WHERE _st IS NULL OR status = _st
                         ORDER BY created_at DESC LIMIT _lim OFFSET _off) b), '[]'::jsonb)));
  END IF;

  RAISE EXCEPTION 'admin_records: unknown kind %', _kind USING ERRCODE = '22023';
END $fn$;
REVOKE ALL ON FUNCTION public.admin_records(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_records(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
