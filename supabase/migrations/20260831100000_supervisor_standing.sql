-- =====================================================================
-- المشرف: أهليّته، ومن يُشرف عليهم
-- ---------------------------------------------------------------------
-- ثلاث فجوات يسدّها هذا الملف:
--
-- (١) **المشرف بلا باب.** يُسنَد إليه الدور، ولا سبيل له ليجد من يُشرف
--     عليهم: عليه أن يُعطى معرّف الالتحاق يدوياً. فالدور مُسنَد ولا
--     يُمارَس.
--
-- (٢) **ولا أهلية له.** والمنهجية تشترط للمشرف شهادة استقلالية بمؤشّر
--     استقلال، وتنقله هو نفسه في مستويات (تأسيسي ← تطبيقي ← متقدّم) عبر
--     تدريب المدرّبين. فمشرفٌ بلا اعتماد كطبيبٍ بلا ترخيص.
--
-- (٣) **والكافل يرى مرحلة الطفل ولا يرى من يحمله.** وثقةُ الكافل في
--     البرنامج ثقةٌ في مشرفه قبل أن تكون في المنصّة.
--
-- ومن يعتمد المشرف؟ **الإدارة لا جهة الرعاية.** وهو نفس مبدأ C4: جهةٌ
-- تعتمد مشرفيها كجهةٍ تعتمد ملفّاتها.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) أهلية المشرف
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisor_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  /* مستواه هو في السلّم نفسه الذي يُدرّبه عليه. */
  level public.program_level NOT NULL DEFAULT 'foundational',

  /* مؤشّر الاستقلال — نسبة مئوية. والمنهجية تعقد الاستقلالية عند 85٪. */
  independence_index SMALLINT NOT NULL DEFAULT 0
    CHECK (independence_index BETWEEN 0 AND 100),

  certified_at TIMESTAMPTZ,
  certified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_profiles_active
  ON public.supervisor_profiles(active) WHERE active;

GRANT SELECT ON public.supervisor_profiles TO authenticated;
GRANT ALL ON public.supervisor_profiles TO service_role;
ALTER TABLE public.supervisor_profiles ENABLE ROW LEVEL SECURITY;

/* يقرؤها صاحبها والإدارة. ولا يقرؤها الكافل ولا الجهة: ما يحتاجانه هو
   **الشهادة** لا الملفّ، وتُعرض بدالّة لا بقراءة الجدول. */
DROP POLICY IF EXISTS "supervisor_profile_own" ON public.supervisor_profiles;
CREATE POLICY "supervisor_profile_own" ON public.supervisor_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "supervisor_profile_admin_write" ON public.supervisor_profiles;
CREATE POLICY "supervisor_profile_admin_write" ON public.supervisor_profiles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_supervisor_profiles_updated ON public.supervisor_profiles;
CREATE TRIGGER trg_supervisor_profiles_updated BEFORE UPDATE ON public.supervisor_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


/* عتبة الاستقلالية في موضع واحد، فلا تتفرّق النسخ. */
CREATE OR REPLACE FUNCTION public.supervisor_independence_threshold()
RETURNS SMALLINT LANGUAGE sql IMMUTABLE AS $fn$ SELECT 85::SMALLINT $fn$;


-- ---------------------------------------------------------------------
-- 2) المشرف يحتاج حساباً واعتماداً
-- ---------------------------------------------------------------------
-- خلافاً للولي والفقيه: هذان يُوثَّقان بالاسم لأنهما مرجعيّة لا مُشغِّل.
-- أما المشرف فيرصد ويقيس **داخل المنصّة**، فمشرفٌ بلا حساب لا يستطيع
-- أداء ما أُسند إليه أصلاً — والقياس نفسه يشترط `auth.uid()` مطابقاً.
ALTER TABLE public.enrollment_roles
  DROP CONSTRAINT IF EXISTS ck_supervisor_needs_account;
ALTER TABLE public.enrollment_roles
  ADD CONSTRAINT ck_supervisor_needs_account CHECK (
    role <> 'supervisor' OR person_id IS NOT NULL
  );


/* وأن يكون معتمَداً: مشرفٌ بلا ملفّ اعتماد نشط لا يُسنَد. */
CREATE OR REPLACE FUNCTION public.guard_supervisor_is_certified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.role <> 'supervisor' OR NEW.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.supervisor_profiles s
     WHERE s.user_id = NEW.person_id AND s.active
  ) THEN
    RAISE EXCEPTION 'لا يُسنَد الإشراف إلا لمشرفٍ معتمَد من الإدارة'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_supervisor_certified ON public.enrollment_roles;
CREATE TRIGGER trg_guard_supervisor_certified
BEFORE INSERT OR UPDATE ON public.enrollment_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_supervisor_is_certified();


-- ---------------------------------------------------------------------
-- 3) اعتماد المشرف — من الإدارة وحدها
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.certify_supervisor(
  _user UUID,
  _level TEXT DEFAULT 'foundational',
  -- `INTEGER` لا `SMALLINT`: حلُّ التواقيع في Postgres لا يضيّق
  -- `integer` إلى `smallint`، وPostgREST يرسل الأعداد صحيحةً — فتوقيعٌ
  -- بـ`SMALLINT` لا يُنادى من الـAPI أصلاً.
  _independence INTEGER DEFAULT 0,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _row public.supervisor_profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'اعتماد المشرفين للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.supervisor_profiles
    (user_id, level, independence_index, certified_at, certified_by, note, active)
  VALUES (_user, _level::public.program_level, _independence::SMALLINT,
          now(), auth.uid(), _note, true)
  ON CONFLICT (user_id) DO UPDATE
    SET level = EXCLUDED.level,
        independence_index = EXCLUDED.independence_index,
        certified_at = now(),
        certified_by = auth.uid(),
        note = EXCLUDED.note,
        active = true
  RETURNING * INTO _row;

  RETURN jsonb_build_object(
    'user_id', _row.user_id,
    'level', _row.level,
    'independence_index', _row.independence_index,
    'independent', _row.independence_index >= public.supervisor_independence_threshold(),
    'certified_at', _row.certified_at
  );
END $fn$;
REVOKE ALL ON FUNCTION public.certify_supervisor(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.certify_supervisor(UUID, TEXT, INTEGER, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 4) شهادة المشرف كما تُعرض — بلا هوية
-- ---------------------------------------------------------------------
-- الكافل يحتاج أن يطمئنّ إلى أن من يحمل الطفل **مؤهَّل**، لا أن يعرف من
-- هو. والاسم لا يزيده اطمئناناً ويكشف شخصاً ثالثاً لم يتعاقد معه.
--
-- والرقم كذلك لا يُعرض: مؤشّر الاستقلال حكمٌ مهنيّ على شخص، وقد أخفينا
-- درجات الطفل للسبب نفسه. فتُعرض **المرتبة** لا الرقم — والاتّساق هنا
-- ليس تجميلاً: قاعدةٌ تُطبَّق على الطفل وتُخرَق على المشرف قاعدةٌ
-- ضعيفة.
CREATE OR REPLACE FUNCTION public.enrollment_supervisor_standing(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'assigned', true,
       'level', s.level,
       'certified', s.certified_at IS NOT NULL,
       'independent', s.independence_index >= public.supervisor_independence_threshold(),
       'since', r.assigned_at
     )
     FROM public.enrollment_roles r
     JOIN public.supervisor_profiles s ON s.user_id = r.person_id
     WHERE r.enrollment_id = _enrollment AND r.role = 'supervisor' AND r.ended_at IS NULL
     LIMIT 1),
    jsonb_build_object('assigned', false)
  );
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_supervisor_standing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor_standing(UUID) TO anon, authenticated;


/* ويُضاف إلى العرض العام، فيرى الزائر والكافل مستوى المشرف مع مرحلة
   الطفل — وهما ما سأله السؤال. */
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
    'has_supervisor', public.enrollment_supervisor(e.id) IS NOT NULL,
    'has_consent', public.enrollment_has_consent(e.id),
    'supervisor', public.enrollment_supervisor_standing(e.id)
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
-- 5) لوحة المشرف — من أُسندوا إليه
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` لأنها تقرأ أسماء الأطفال عبر جدولٍ لا تكشفه سياسة
-- المشرف؛ والحصر بـ`auth.uid()` في الشرط هو الحارس: لا وسيط يقبل معرّف
-- مشرفٍ آخر، فلا سبيل لقراءة قوائم غيره.
CREATE OR REPLACE FUNCTION public.my_supervised_enrollments()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id', e.id,
    'orphan_id', o.id,
    'orphan_name', o.display_name,
    'orphan_code', o.code,
    'program', p.title,
    'stage', e.stage,
    'stage_order', public.stage_order(e.stage),
    'status', e.status,
    'has_consent', public.enrollment_has_consent(e.id),
    'assessments', (SELECT count(*) FROM public.trait_assessments a
                     WHERE a.enrollment_id = e.id),
    'has_final', EXISTS (SELECT 1 FROM public.trait_assessments a
                          WHERE a.enrollment_id = e.id AND a.phase = 'final'),
    'has_baseline', EXISTS (SELECT 1 FROM public.trait_assessments a
                             WHERE a.enrollment_id = e.id AND a.phase = 'baseline'),
    'since', r.assigned_at
  ) ORDER BY o.display_name), '[]'::jsonb)
  FROM public.enrollment_roles r
  JOIN public.program_enrollments e ON e.id = r.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.orphans o ON o.id = e.orphan_id
  WHERE r.role = 'supervisor'
    AND r.ended_at IS NULL
    AND r.person_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.my_supervised_enrollments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_supervised_enrollments() TO authenticated;


/* وأهليّته هو، ليراها في لوحته. */
CREATE OR REPLACE FUNCTION public.my_supervisor_profile()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'level', s.level,
       -- الرقم يراه صاحبه: هو أهليّته لا حكمٌ عليه من غيره.
       'independence_index', s.independence_index,
       'independent', s.independence_index >= public.supervisor_independence_threshold(),
       'threshold', public.supervisor_independence_threshold(),
       'certified_at', s.certified_at,
       'active', s.active
     ) FROM public.supervisor_profiles s WHERE s.user_id = auth.uid()),
    'null'::jsonb
  );
$fn$;
REVOKE ALL ON FUNCTION public.my_supervisor_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_supervisor_profile() TO authenticated;
