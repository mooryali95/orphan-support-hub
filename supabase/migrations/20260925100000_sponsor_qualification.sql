-- =====================================================================
-- رحلة التأهيل كما يراها الكافل والداعم
-- ---------------------------------------------------------------------
-- الكافل يدفع لبناء أهلية الطفل، فمن حقّه أن يرى ما بُني: البرنامج،
-- والمرحلة، والجلسات التي اجتازها ومتى، ونموّ أبعاد السمات. وهذا دون
-- طلب اطّلاع — بالحدّ الذي لا يكشف الطفل:
--   * لا مخرجات الجلسات ولا ملاحظات المشرف (نطاق «النتائج»).
--   * لا درجات السمات الفردية (نطاق «السمات»، حسّاسيته ٣) — بل متوسّط
--     كل بُعدٍ أوّلاً وأخيراً، ولا يُعرض بُعدٌ قبل قياسين على الأقل.
-- ما فوق ذلك يبقى بطلب الاطّلاع والنطاقات كما هو.
-- =====================================================================

-- من يرى: الكافل بكفالةٍ فعّالة أو منتهية، والداعم بتعهّدٍ مقبول للطفل،
-- ودائرة الطفل، ومن مُنح نطاق «التقدّم».
CREATE OR REPLACE FUNCTION public.can_see_qualification(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.sponsorships s
             WHERE s.orphan_id = _orphan AND s.sponsor_id = auth.uid()
               AND s.status IN ('active', 'paused', 'completed'))
    OR EXISTS (SELECT 1 FROM public.support_pledges p
                WHERE p.orphan_id = _orphan AND p.supporter_id = auth.uid()
                  AND p.status IN ('active', 'fulfilled'))
    OR public.in_orphan_circle(_orphan)
    OR public.has_orphan_scope(_orphan, 'progress'));
$fn$;
REVOKE ALL ON FUNCTION public.can_see_qualification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_qualification(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sponsor_qualification(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.can_see_qualification(_orphan) THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  RETURN jsonb_build_object('allowed', true,
    'programs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'program', pr.title,
               'status', e.status,
               'stage', e.stage::text,
               'started_at', e.started_at,
               'accepted', (SELECT count(*) FROM public.enrollment_units u
                             WHERE u.enrollment_id = e.id AND u.status = 'accepted'),
               'total', (SELECT count(*) FROM public.program_units pu
                          WHERE pu.program_id = e.program_id AND pu.active),
               -- الجلسات بعناوينها ومحاورها، وشهر قبولها — لا مخرجاتها ولا ملاحظاتها.
               'units', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'ordinal', pu.ordinal, 'title', pu.title, 'focus', pu.focus,
                           'status', COALESCE(u.status::text, 'pending'),
                           'accepted_month', CASE WHEN u.status = 'accepted'
                                                  THEN to_char(u.decided_at, 'YYYY-MM') END)
                         ORDER BY pu.ordinal)
                    FROM public.program_units pu
                    LEFT JOIN public.enrollment_units u ON u.unit_id = pu.id AND u.enrollment_id = e.id
                   WHERE pu.program_id = e.program_id AND pu.active), '[]'::jsonb))
             ORDER BY e.created_at DESC)
        FROM public.program_enrollments e
        JOIN public.programs pr ON pr.id = e.program_id
       WHERE e.orphan_id = _orphan AND e.status IN ('funded', 'paused', 'completed')), '[]'::jsonb),
    -- النموّ بالأبعاد: متوسّط أوّل قياسٍ وآخره لكل سمةٍ في البُعد.
    'growth', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'dimension', g.label, 'first', g.first_avg, 'latest', g.latest_avg,
               'observations', g.obs) ORDER BY g.sort_order)
        FROM (
          SELECT d.label_ar AS label, d.sort_order,
                 round(avg(f.pct), 0) AS first_avg, round(avg(l.pct), 0) AS latest_avg,
                 sum(c.n)::int AS obs
            FROM public.trait_dimensions d
            JOIN public.trait_definitions t ON t.dimension_id = d.id AND t.deleted_at IS NULL
            CROSS JOIN LATERAL (SELECT count(*) AS n FROM public.orphan_trait_scores s
                                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL) c
            CROSS JOIN LATERAL (SELECT 100 * s.score / s.scale_max AS pct FROM public.orphan_trait_scores s
                                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                                 ORDER BY s.observed_at ASC LIMIT 1) f
            CROSS JOIN LATERAL (SELECT 100 * s.score / s.scale_max AS pct FROM public.orphan_trait_scores s
                                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                                 ORDER BY s.observed_at DESC LIMIT 1) l
           GROUP BY d.id, d.label_ar, d.sort_order
          HAVING sum(c.n) >= 2
        ) g), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsor_qualification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_qualification(UUID) TO authenticated;
