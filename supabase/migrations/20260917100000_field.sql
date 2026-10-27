-- =====================================================================
-- كهاتين — الميدان: مهام المشرف اليومية، وإقرار الصور في تقارير المكاتب
-- ---------------------------------------------------------------------
-- 6.3  my_supervisor_today: ما ينتظر المشرف اليوم — مخرجاتٌ مسلَّمة تنتظر
--      قراره، قياسٌ أوّلي أو ختاميّ ناقص، موافقةٌ غائبة.
-- 6.5  صور تقارير المكاتب: لا تُحفظ إلا بإقرار رافعها أنها لا تُظهر وجه
--      طفلٍ بلا موافقة موثّقة؛ والإقرار محفوظٌ مع التقرير.
-- =====================================================================

ALTER TABLE public.office_reports
  ADD COLUMN IF NOT EXISTS attachments_consent BOOLEAN NOT NULL DEFAULT false;
-- التقارير القائمة بصورٍ قبل هذا القيد تبقى، ويُطلب الإقرار عند أول تعديل.

DROP FUNCTION IF EXISTS public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.save_office_report(
  _office UUID, _title TEXT, _body TEXT, _metrics JSONB DEFAULT '{}'::jsonb,
  _attachments TEXT[] DEFAULT '{}', _period_start DATE DEFAULT NULL,
  _period_end DATE DEFAULT NULL, _status TEXT DEFAULT 'draft', _id UUID DEFAULT NULL,
  _consent BOOLEAN DEFAULT false)
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
  -- صورٌ بلا إقرارٍ بأنها لا تُظهر وجه طفلٍ دون موافقةٍ موثّقة لا تُحفظ.
  IF cardinality(COALESCE(_attachments, '{}')) > 0 AND NOT COALESCE(_consent, false) THEN
    RAISE EXCEPTION 'photo_consent_required';
  END IF;
  FOREACH _p IN ARRAY COALESCE(_attachments, '{}') LOOP
    IF split_part(_p, '/', 1) <> _office::text THEN
      RAISE EXCEPTION 'attachment_outside_office';
    END IF;
  END LOOP;

  IF _id IS NULL THEN
    INSERT INTO public.office_reports
      (office_id, author_id, title, body, metrics, attachments, period_start, period_end, status,
       published_at, attachments_consent)
    VALUES (_office, auth.uid(), btrim(_title), COALESCE(_body, ''), COALESCE(_metrics, '{}'),
            COALESCE(_attachments, '{}'), _period_start, _period_end, _status,
            CASE WHEN _status = 'published' THEN now() END, COALESCE(_consent, false))
    RETURNING id INTO _rid;
  ELSE
    UPDATE public.office_reports
       SET title = btrim(_title), body = COALESCE(_body, ''), metrics = COALESCE(_metrics, '{}'),
           attachments = COALESCE(_attachments, '{}'), period_start = _period_start,
           period_end = _period_end, status = _status, updated_at = now(),
           attachments_consent = COALESCE(_consent, false),
           published_at = CASE WHEN _status = 'published' THEN COALESCE(published_at, now()) END
     WHERE id = _id AND office_id = _office
     RETURNING id INTO _rid;
    IF _rid IS NULL THEN RAISE EXCEPTION 'report_not_found'; END IF;
  END IF;
  RETURN _rid;
END $fn$;
REVOKE ALL ON FUNCTION public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID, BOOLEAN) TO authenticated;


CREATE OR REPLACE FUNCTION public.my_supervisor_today()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH mine AS (
    SELECT e.id, e.stage, o.id AS orphan_id, o.display_name, p.title AS program
      FROM public.enrollment_roles r
      JOIN public.program_enrollments e ON e.id = r.enrollment_id
      JOIN public.programs p ON p.id = e.program_id
      JOIN public.orphans o ON o.id = e.orphan_id
     WHERE r.role = 'supervisor' AND r.ended_at IS NULL AND r.person_id = auth.uid()
       AND auth.uid() IS NOT NULL AND e.status IN ('proposed', 'funded')
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority, t.since), '[]'::jsonb)
    FROM (
      SELECT 1 AS priority, 'review_unit' AS task, m.id AS enrollment_id, m.display_name AS orphan,
             pu.title AS detail, u.submitted_at AS since
        FROM mine m
        JOIN public.enrollment_units u ON u.enrollment_id = m.id AND u.status = 'submitted'
        JOIN public.program_units pu ON pu.id = u.unit_id
      UNION ALL
      SELECT 2, 'consent_missing', m.id, m.display_name, m.program, NULL
        FROM mine m WHERE NOT public.enrollment_has_consent(m.id)
      UNION ALL
      SELECT 3, 'baseline_missing', m.id, m.display_name, m.program, NULL
        FROM mine m
       WHERE NOT EXISTS (SELECT 1 FROM public.trait_assessments a
                          WHERE a.enrollment_id = m.id AND a.phase = 'baseline')
      UNION ALL
      SELECT 4, 'final_missing', m.id, m.display_name, m.program, NULL
        FROM mine m
       WHERE m.stage IN ('measurement', 'qualified')
         AND NOT EXISTS (SELECT 1 FROM public.trait_assessments a
                          WHERE a.enrollment_id = m.id AND a.phase = 'final')
    ) t;
$fn$;
REVOKE ALL ON FUNCTION public.my_supervisor_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_supervisor_today() TO authenticated;
