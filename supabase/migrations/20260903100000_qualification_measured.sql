-- =====================================================================
-- «قِيسَ قبل وبعد» — وعدٌ يصير قابلاً للتحقّق
-- ---------------------------------------------------------------------
-- من مخرجات البرنامج المعلنة للكافل: «خريطة سمات مقيسة قبل البرنامج
-- وبعده». وهو وعدٌ لا سبيل له إلى التحقّق منه: الخريطة نفسها محجوبة عنه
-- بحقّ — حكمٌ على طفلٍ لا يُعرض على غريب — فبقي الوعد كلاماً.
--
-- والحلّ ليس كشف الخريطة بل كشف **وقوع القياس**: كما يُعرض وجودُ مشرفٍ
-- وإذنٍ لا هويّةُ صاحبيهما. فالكافل يعرف أنّ ما وُعد به جرى، ولا يعرف
-- ما قالته الأرقام عن الطفل.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.orphan_qualification(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id', e.id,
    'program', p.title,
    'summary', p.summary,
    'level', p.level,
    'concept', c.name,
    'concept_intent', c.intent,
    'target_trait', t.name,
    'target_trait_summary', t.summary,
    'inputs', to_jsonb(p.inputs),
    'processes', to_jsonb(p.processes),
    'deliverables', to_jsonb(p.deliverables),
    'stage', e.stage,
    'stage_order', public.stage_order(e.stage),
    'stage_changed_at', e.stage_changed_at,
    'monthly_price', e.monthly_price,
    'currency', e.currency,
    'status', e.status,
    -- وجودُ الضمانتين يُعرض، لا هويّة صاحبيهما.
    'has_supervisor', public.enrollment_supervisor(e.id) IS NOT NULL,
    'has_consent', public.enrollment_has_consent(e.id),
    'units_total', (SELECT count(*) FROM public.program_units u
                     WHERE u.program_id = p.id AND u.active),
    'units_accepted', (SELECT count(*) FROM public.program_units u
                        JOIN public.enrollment_units eu
                          ON eu.unit_id = u.id AND eu.enrollment_id = e.id
                       WHERE u.program_id = p.id AND u.active
                         AND eu.status = 'accepted'),
    -- وقوعُ القياس لا نتيجته: الوعد يُتحقَّق منه والطفل لا يُكشف.
    'measured_before', EXISTS (SELECT 1 FROM public.trait_assessments a
                                WHERE a.enrollment_id = e.id AND a.phase = 'baseline'),
    'measured_after', EXISTS (SELECT 1 FROM public.trait_assessments a
                               WHERE a.enrollment_id = e.id AND a.phase = 'final')
  ) ORDER BY e.created_at), '[]'::jsonb)
  FROM public.program_enrollments e
  JOIN public.programs p ON p.id = e.program_id AND p.kind = 'qualification'
  LEFT JOIN public.qualification_concepts c ON c.id = p.concept_id
  LEFT JOIN public.qualification_traits t ON t.id = p.target_trait_id
  WHERE e.orphan_id = _orphan
    AND e.status IN ('proposed', 'funded', 'paused', 'completed')
    AND EXISTS (SELECT 1 FROM public.orphans o
                 WHERE o.id = _orphan AND o.status IN ('approved','fully_sponsored'));
$fn$;
