-- =====================================================================
-- كهاتين — «رحلتي»، ورسالة الشهر، وفلتر المجموعة في الدليل
-- ---------------------------------------------------------------------
-- 4.1  my_journey_feed: خطٌّ زمنيّ واحد لكل ما يخصّ الداعم — ما نُشر عن
--      من يكفلهم، ووصول كفالاتهم، ومراحل تسليم تعهّداتهم؛ والجلسات
--      والسمات فقط حيث له نطاقها.
-- 4.2  my_monthly_digest: ملخّص الثلاثين يوماً لرسالة الشهر.
-- 4.3  list_orphan_cards(_group): الفلترة بالمجموعة.
-- =====================================================================

DROP FUNCTION IF EXISTS public.list_orphan_cards(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,     -- open | full | any
  _building BOOLEAN DEFAULT NULL, -- برنامجه قائم من عدمه
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',   -- waiting | closest | newest
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0,
  _group UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب هنا لا في العميل: `ILIKE` بنصٍّ خام يجعل «%» تعني
     «كل شيء». و**التهريب لا الحذف**: حذفُ محارف البدل يحوّل بحثاً من
     «%» وحده إلى فراغٍ، والفراغ يعني «بلا فلترة» — فيعيد البحثُ عن
     محرف بدلٍ كلَّ الملفّات، وهو نقيض المقصود. أمّا التهريب فيجعلها
     محرفاً عادياً يُبحث عنه فلا يُطابق شيئاً. */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها. */
           CASE WHEN public.cohort_is_safe(o.id) THEN o.region END AS region,
           CASE WHEN public.cohort_is_safe(o.id) THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           o.status, o.org_id, o.created_at, o.group_id,
           public.age_band_of(o.birth_date) AS age_band,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
               JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building,
           GREATEST(0, (now()::date - COALESCE(o.approved_at, o.created_at)::date))::INTEGER
             AS waiting_days
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       AND (_group IS NULL OR b.group_id = _group)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما: البحث بالمدينة كان يكشف
          ما حجبناه — يُجرَّب اسمُ مدينةٍ فيُعرف من فيها. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN COALESCE(_sort,'waiting') = 'waiting' THEN f.waiting_days END DESC,
          f.id
      ) AS ord
        FROM filtered f
       ORDER BY ord
       LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 60)
      OFFSET GREATEST(COALESCE(_offset, 0), 0)
    ) t;

  RETURN jsonb_build_object('rows', _rows, 'total', _total);
END $fn$;
REVOKE ALL ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.my_journey_feed(_limit INT DEFAULT 40)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.at DESC)
      FROM (
        -- ما كُتب في الخطّ الزمني لمن يكفلهم (نشر تقرير، وصول كفالة…)
        SELECT 'timeline' AS kind, t.event_type AS type, t.created_at AS at,
               o.display_name AS orphan, o.id AS orphan_id, t.detail AS text
          FROM public.timeline_events t
          JOIN public.orphans o ON o.id = t.orphan_id
         WHERE EXISTS (SELECT 1 FROM public.sponsorships s
                        WHERE s.orphan_id = t.orphan_id AND s.sponsor_id = _uid
                          AND s.status IN ('active', 'paused', 'completed'))
        UNION ALL
        -- مراحل تسليم تعهّداته
        SELECT 'pledge', 'pledge.' || d.stage, d.created_at,
               NULL, NULL, NULL
          FROM public.pledge_deliveries d
          JOIN public.support_pledges p ON p.id = d.pledge_id
         WHERE p.supporter_id = _uid
        UNION ALL
        -- الجلسات المقبولة — حيث له نطاق «الرحلة»
        SELECT 'unit', 'unit.accepted', u.decided_at, o.display_name, o.id, pu.title
          FROM public.enrollment_units u
          JOIN public.program_enrollments e ON e.id = u.enrollment_id
          JOIN public.program_units pu ON pu.id = u.unit_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE u.status = 'accepted' AND u.decided_at IS NOT NULL
           AND public.has_orphan_scope(o.id, 'journey')
        UNION ALL
        -- قياسات السمات — حيث له نطاق «السمات»؛ بلا ملاحظة المشرف
        SELECT 'trait', 'trait.measured', s.observed_at, o.display_name, o.id, t.name_ar
          FROM public.orphan_trait_scores s
          JOIN public.trait_definitions t ON t.id = s.trait_id
          JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.deleted_at IS NULL AND public.has_orphan_scope(o.id, 'traits')
         ORDER BY 3 DESC
         LIMIT LEAST(GREATEST(COALESCE(_limit, 40), 1), 200)
      ) f), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.my_journey_feed(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_journey_feed(INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.my_monthly_digest()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _feed JSONB; _since TIMESTAMPTZ := now() - interval '30 days';
BEGIN
  _feed := public.my_journey_feed(200);
  RETURN jsonb_build_object(
    'since', _since,
    'brand', public.brand_name(),
    'paid', (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
              WHERE p.sponsor_id = auth.uid() AND p.status = 'paid' AND p.paid_at >= _since),
    'delivered_months', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                          WHERE x->>'type' = 'disbursement_delivered' AND (x->>'at')::timestamptz >= _since),
    'reports', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                 WHERE x->>'type' = 'report.published' AND (x->>'at')::timestamptz >= _since),
    'units', (SELECT count(*) FROM jsonb_array_elements(_feed) x
               WHERE x->>'type' = 'unit.accepted' AND (x->>'at')::timestamptz >= _since),
    'traits', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                WHERE x->>'type' = 'trait.measured' AND (x->>'at')::timestamptz >= _since),
    'pledges_delivered', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                           WHERE x->>'type' = 'pledge.delivered' AND (x->>'at')::timestamptz >= _since),
    'highlights', COALESCE((SELECT jsonb_agg(x) FROM (
                    SELECT x FROM jsonb_array_elements(_feed) x
                     WHERE (x->>'at')::timestamptz >= _since LIMIT 5) h), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.my_monthly_digest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_monthly_digest() TO authenticated;
