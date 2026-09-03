-- =====================================================================
-- ما يُعرض من الأهلية — وما لا يُعرض
-- ---------------------------------------------------------------------
-- الكافل يدفع، فمن حقّه أن يرى الأثر. لكن **خريطة سمات طفل ليست أثراً
-- يُعرض، بل ملفٌّ نفسيّ عنه.** أرقامٌ تقول «حميّته 70 ورشده 10» توصيفٌ
-- لشخصٍ قاصر أمام غريب، وهو من جنس ما مُنع في سياسة الصور: الكرامة لا
-- تسقط لأن أحداً دفع.
--
-- فالقسمة:
--
--   يُعرض للكافل والزائر — البرنامج ومفهومه وسمته المستهدفة ومدخلاته
--     وعملياته ومخرجاته، والمرحلة التي بلغها، ووجودُ مشرفٍ وإذنٍ من
--     عدمه. أي: **ما اشتُرِي، وأين وصل**.
--
--   لا يُعرض إلا للمشرف ومن يدير الملف والإدارة — الدرجات، والسمة
--     الجوهرية، والاتصالية، ووسم «تحت العتبة». أي: **الحكم على الطفل**.
--
-- ووسم «تحت العتبة» أخطرها: قد يُقرأ رسوباً وهو ليس كذلك — المنهجية
-- تقول إن البناء «لم يستقرّ حول سمة قائدة» بعدُ. فإخفاؤه عن الغريب صونٌ
-- للطفل من حكمٍ لا يملك تفسيره.
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
    -- وجودُ الضمانتين يُعرض، لا هويّة صاحبيهما: الكافل يطمئنّ إلى أن
    -- ثمّة مشرفاً وإذناً، ولا يعرف أسماء أهل الطفل.
    'has_supervisor', public.enrollment_supervisor(e.id) IS NOT NULL,
    'has_consent', public.enrollment_has_consent(e.id)
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
REVOKE ALL ON FUNCTION public.orphan_qualification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_qualification(UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- والقياس — لمن يملك قراءته وحده
-- ---------------------------------------------------------------------
-- `SECURITY INVOKER` عمداً: تبقى سياسة `assessments_read` هي الحاكمة،
-- فلا تُنشئ هذه الدالّة باباً يلتفّ عليها.
CREATE OR REPLACE FUNCTION public.enrollment_assessments(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'phase', a.phase,
    'scores', a.scores,
    'core_trait', ct.name,
    'relational_trait', rt.name,
    'below_threshold', a.below_threshold,
    'assessed_at', a.assessed_at
  ) ORDER BY a.assessed_at), '[]'::jsonb)
  FROM public.trait_assessments a
  LEFT JOIN public.qualification_traits ct ON ct.id = a.core_trait_id
  LEFT JOIN public.qualification_traits rt ON rt.id = a.relational_trait_id
  WHERE a.enrollment_id = _enrollment;
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_assessments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_assessments(UUID) TO authenticated;
