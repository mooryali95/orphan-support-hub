-- =====================================================================
-- لوحة البيانات للإدارة — قراءةٌ موحّدة، وإجراءاتٌ مسجَّلة
-- ---------------------------------------------------------------------
-- admin_records: كلّ نوع بياناتٍ بالشكل نفسه — صفوف، وإجمالي، وعدّاد كلّ
-- حالة — فتبني الواجهة جدولاً واحداً لكلّ الأنواع.
--   orphans      كلّ الحالات (لا المنشور وحده)، ومعها قائمة التوثيق.
--   sponsorships الكفالات بحالاتها — قراءة: إيقافها وإلغاؤها في مسار الدفع.
--   pledges      التعهّدات بحالاتها، وتغيير حالتها مسجَّل.
-- التوثيق من بياناتٍ قائمة فقط: مستندٌ موثَّق بنوعه، وموافقة الوليّ،
-- وتقرير متابعة معتمد خلال تسعين يوماً.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.orphan_verification(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'death', EXISTS (SELECT 1 FROM public.orphan_documents d WHERE d.orphan_id = _orphan
                       AND d.verified AND d.doc_type = 'death_certificate'),
    'identity', EXISTS (SELECT 1 FROM public.orphan_documents d WHERE d.orphan_id = _orphan
                       AND d.verified AND d.doc_type IN ('birth_certificate', 'orphan_id')),
    'guardianship', EXISTS (SELECT 1 FROM public.orphan_documents d WHERE d.orphan_id = _orphan
                       AND d.verified AND d.doc_type = 'guardianship_proof'),
    'consent', EXISTS (SELECT 1 FROM public.orphans o WHERE o.id = _orphan
                       AND o.photo_consent IN ('granted', 'face_hidden')),
    'followup', EXISTS (SELECT 1 FROM public.progress_reports r WHERE r.orphan_id = _orphan
                       AND r.status = 'approved' AND r.updated_at > now() - interval '90 days'),
    'documents', (SELECT count(*) FROM public.orphan_documents d WHERE d.orphan_id = _orphan),
    'verified_documents', (SELECT count(*) FROM public.orphan_documents d
                            WHERE d.orphan_id = _orphan AND d.verified));
$fn$;
REVOKE ALL ON FUNCTION public.orphan_verification(UUID) FROM PUBLIC, anon, authenticated;

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
  END IF;

  RAISE EXCEPTION 'admin_records: unknown kind %', _kind USING ERRCODE = '22023';
END $fn$;
REVOKE ALL ON FUNCTION public.admin_records(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_records(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- حالة التعهّد: انتقالاتٌ مسموحة فقط، وكلّ تغييرٍ في سجلّ التدقيق بمن فعله ولماذا.
CREATE OR REPLACE FUNCTION public.admin_set_pledge_status(_pledge UUID, _status TEXT, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _from TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT status INTO _from FROM public.support_pledges WHERE id = _pledge FOR UPDATE;
  IF _from IS NULL THEN RAISE EXCEPTION 'pledge_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF NOT (
       (_from = 'pending' AND _status IN ('active', 'cancelled'))
    OR (_from = 'active' AND _status IN ('fulfilled', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'pledge_transition_not_allowed: % -> %', _from, _status USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_pledges SET status = _status WHERE id = _pledge;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'pledge_status', 'support_pledges', _pledge,
          jsonb_build_object('from', _from, 'to', _status,
                             'reason', NULLIF(btrim(COALESCE(_reason, '')), '')));
END $fn$;
DROP FUNCTION IF EXISTS public.admin_set_pledge_status(UUID, TEXT);
REVOKE ALL ON FUNCTION public.admin_set_pledge_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pledge_status(UUID, TEXT, TEXT) TO authenticated;
