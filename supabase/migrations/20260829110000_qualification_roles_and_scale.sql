-- =====================================================================
-- الأدوار حول الملتحق، ومقياس السمات
-- ---------------------------------------------------------------------
-- البناء لا يقوم بلا من يحمله. والمنهجية تُسمّي المشرف صراحةً وتشترط له
-- «شهادة استقلالية»؛ والسياق الشرعي لليتيم يضيف ثلاثةً: مرجعيةً تضبط
-- الأصول (الفقيه)، ومن يأذن بمشاركته (الولي أو الوصي).
--
-- وأخطر ما هنا ليس التقنية بل الإذن: **إدخال يتيمٍ في برنامج بلا إذن
-- وليّه أو وصيّه تصرّفٌ في شأن قاصرٍ بغير ولاية.** فالقيد أدناه يمنع
-- تقدّم الالتحاق خطوةً واحدة قبل توثيق الإذن — لا تنبيهاً في الواجهة،
-- بل قاعدةً في القاعدة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) الأدوار
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.enrollment_role AS ENUM (
    'supervisor',  -- المشرف: يرصد ويقوّم ويقيس
    'jurist',      -- الفقيه: يضبط الأصول والمرجعية
    'guardian',    -- الولي: صاحب الولاية الأصلية
    'trustee',     -- الوصي: من أُسندت إليه الوصاية
    'mentor'       -- المرشد: قدوة ومتابعة لصيقة
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.enrollment_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL
    REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  role public.enrollment_role NOT NULL,

  /* صاحب الدور: مستخدمٌ في المنصّة إن كان لديه حساب، وإلا فاسمٌ موثَّق.
     كثيرٌ من الأولياء والفقهاء لا حسابَ لهم، ورفضُ تسجيلهم لذلك يعني
     برنامجاً بلا مرجعية موثَّقة. */
  person_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  person_name TEXT,
  person_contact TEXT,

  /* الإذن: يخصّ الولي والوصي. `consent_document` مسارٌ في مخزن الوثائق. */
  consent_at TIMESTAMPTZ,
  consent_document TEXT,

  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  note TEXT,

  /* دورٌ بلا صاحب لا معنى له. */
  CONSTRAINT ck_role_has_person CHECK (
    person_id IS NOT NULL OR (person_name IS NOT NULL AND length(btrim(person_name)) > 0)
  )
);

/* دورٌ حيّ واحد من كل نوع لكل التحاق: مشرفان في وقتٍ واحد يعني مسؤوليةً
   ضائعة بينهما. والفهرس جزئي على الحيّ، فالتاريخ يبقى محفوظاً. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_role_per_enrollment
  ON public.enrollment_roles(enrollment_id, role)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollment_roles_enrollment
  ON public.enrollment_roles(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_roles_person
  ON public.enrollment_roles(person_id) WHERE person_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.enrollment_roles TO authenticated;
GRANT ALL ON public.enrollment_roles TO service_role;
ALTER TABLE public.enrollment_roles ENABLE ROW LEVEL SECURITY;

/* الأدوار بيانات تشغيلية لا عرضية: لا يراها الزائر. ويراها من يدير
   الملف، ومن هو طرفٌ في الدور نفسه. */
DROP POLICY IF EXISTS "enrollment_roles_read" ON public.enrollment_roles;
CREATE POLICY "enrollment_roles_read" ON public.enrollment_roles
  FOR SELECT TO authenticated USING (
    person_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.program_enrollments e
       WHERE e.id = enrollment_id AND public.can_manage_orphan(e.orphan_id)
    )
  );

DROP POLICY IF EXISTS "enrollment_roles_write" ON public.enrollment_roles;
CREATE POLICY "enrollment_roles_write" ON public.enrollment_roles
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.program_enrollments e
       WHERE e.id = enrollment_id AND public.can_manage_orphan(e.orphan_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.program_enrollments e
       WHERE e.id = enrollment_id AND public.can_manage_orphan(e.orphan_id)
    )
  );


/* هل لهذا الالتحاق إذنٌ موثَّق من وليٍّ أو وصيّ؟ */
CREATE OR REPLACE FUNCTION public.enrollment_has_consent(_enrollment UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollment_roles r
     WHERE r.enrollment_id = _enrollment
       AND r.role IN ('guardian', 'trustee')
       AND r.ended_at IS NULL
       AND r.consent_at IS NOT NULL
  );
$fn$;

/* ومن المشرف الحيّ؟ */
CREATE OR REPLACE FUNCTION public.enrollment_supervisor(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
   LIMIT 1;
$fn$;


-- ---------------------------------------------------------------------
-- 2) لا تقدّم بلا إذن ولا مشرف
-- ---------------------------------------------------------------------
-- المرحلة `concept` هي التمهيد؛ وما بعدها عملٌ على الطفل نفسه. فيُشترط
-- قبل مغادرتها: إذنٌ موثَّق، ومشرفٌ حيّ.
--
-- والمُشغّل يفرضه على **كل** طريق: تحديثٌ من الجهة، أو من الإدارة، أو
-- من دالّة. فلا يُلتفّ عليه بتحديثٍ مباشر.
CREATE OR REPLACE FUNCTION public.guard_enrollment_stage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _kind public.program_kind;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  SELECT p.kind INTO _kind FROM public.programs p WHERE p.id = NEW.program_id;

  -- الخدمات لا رحلة لها؛ الشرط يخصّ بناء الأهلية وحده.
  IF _kind IS DISTINCT FROM 'qualification' THEN
    NEW.stage_changed_at := now();
    RETURN NEW;
  END IF;

  IF public.stage_order(NEW.stage) > public.stage_order(OLD.stage) THEN
    IF NOT public.enrollment_has_consent(NEW.id) THEN
      RAISE EXCEPTION 'لا يتقدّم البرنامج بلا إذن موثَّق من الولي أو الوصي'
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.enrollment_supervisor(NEW.id) IS NULL THEN
      RAISE EXCEPTION 'لا يتقدّم البرنامج بلا مشرف معتمَد'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ولا تُعلَن الأهلية إلا بقياسٍ ختامي.
  IF NEW.stage = 'qualified' AND NOT EXISTS (
       SELECT 1 FROM public.trait_assessments a
        WHERE a.enrollment_id = NEW.id AND a.phase = 'final'
     ) THEN
    RAISE EXCEPTION 'لا تُعلَن الأهلية قبل القياس الختامي'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.stage_changed_at := now();
  RETURN NEW;
END $fn$;


-- ---------------------------------------------------------------------
-- 3) مقياس السمات
-- ---------------------------------------------------------------------
-- «القياس أداة بناء لا اختبار»: مئة درجة تُوزَّع على السمات، فالمجموع
-- مئةٌ دائماً. وخريطةٌ نسبية مجموعها ليس مئة ليست خريطة — فالقيد لازم.
DO $$ BEGIN
  CREATE TYPE public.assessment_phase AS ENUM ('baseline', 'progress', 'final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.trait_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL
    REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  phase public.assessment_phase NOT NULL,

  /* {slug: درجة} — المفاتيح سمات معروفة، والقيم أعداد غير سالبة. */
  scores JSONB NOT NULL,

  /* الثلاثة محسوبة خادمياً لا مُرسلة: قيمةٌ تُرسل من العميل قيمةٌ تُزوَّر،
     وهي هنا حكمٌ على طفل. */
  core_trait_id UUID REFERENCES public.qualification_traits(id) ON DELETE SET NULL,
  relational_trait_id UUID REFERENCES public.qualification_traits(id) ON DELETE SET NULL,
  below_threshold BOOLEAN NOT NULL DEFAULT false,

  assessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_assessments_enrollment
  ON public.trait_assessments(enrollment_id, assessed_at DESC);

/* قياسٌ ختامي واحد لكل التحاق: «أهليّتان» لطفلٍ واحد تناقض. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_final_assessment
  ON public.trait_assessments(enrollment_id) WHERE phase = 'final';

GRANT SELECT ON public.trait_assessments TO authenticated;
GRANT ALL ON public.trait_assessments TO service_role;
ALTER TABLE public.trait_assessments ENABLE ROW LEVEL SECURITY;

/* تُقرأ لمن يدير الملف وللمشرف نفسه. ولا يكتبها أحدٌ مباشرةً: الكتابة
   من الدالّة وحدها، لأن الحساب فيها. */
DROP POLICY IF EXISTS "assessments_read" ON public.trait_assessments;
CREATE POLICY "assessments_read" ON public.trait_assessments
  FOR SELECT TO authenticated USING (
    assessed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.program_enrollments e
       WHERE e.id = enrollment_id AND public.can_manage_orphan(e.orphan_id)
    )
  );


/* التحقّق والحساب — تُستدعى من المُشغّل، فتنطبق على أي طريق كتابة. */
CREATE OR REPLACE FUNCTION public.guard_trait_assessment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _total INTEGER;
  _known INTEGER;
  _given INTEGER;
  _top RECORD;
  _second RECORD;
BEGIN
  IF jsonb_typeof(NEW.scores) <> 'object' THEN
    RAISE EXCEPTION 'المقياس كائنٌ من سمةٍ ودرجة' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _given FROM jsonb_object_keys(NEW.scores);
  IF _given = 0 THEN
    RAISE EXCEPTION 'المقياس فارغ' USING ERRCODE = 'check_violation';
  END IF;

  -- كل مفتاح سمةٌ معروفة نشطة: مفتاحٌ مجهول يعني خريطةً لسمةٍ لا وجود لها.
  SELECT count(*) INTO _known
    FROM jsonb_object_keys(NEW.scores) k
    JOIN public.qualification_traits t ON t.slug = k AND t.active;
  IF _known <> _given THEN
    RAISE EXCEPTION 'المقياس يحوي سمةً غير معروفة' USING ERRCODE = 'check_violation';
  END IF;

  -- القيم أعدادٌ صحيحة غير سالبة.
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW.scores) e
     WHERE jsonb_typeof(e.value) <> 'number'
        OR (e.value)::numeric < 0
        OR (e.value)::numeric <> trunc((e.value)::numeric)
  ) THEN
    RAISE EXCEPTION 'درجات السمات أعدادٌ صحيحة غير سالبة'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum((e.value)::numeric), 0)::INTEGER INTO _total
    FROM jsonb_each(NEW.scores) e;
  IF _total <> 100 THEN
    RAISE EXCEPTION 'مجموع درجات السمات % لا 100 — الخريطة نسبية', _total
      USING ERRCODE = 'check_violation';
  END IF;

  -- الأعلى. والتعادل يُحسم بترتيب السمة، فيبقى الحساب قابلاً للتكرار.
  SELECT t.id, (NEW.scores ->> t.slug)::INTEGER AS score, t.sort_order
    INTO _top
    FROM public.qualification_traits t
   WHERE NEW.scores ? t.slug
   ORDER BY (NEW.scores ->> t.slug)::INTEGER DESC, t.sort_order ASC
   LIMIT 1;

  -- السمة الجوهرية: الأعلى **بشرط ≥ 50**. ودونها لا جوهرية — وهذا ليس
  -- رسوباً بل أن البناء لم يستقرّ بعدُ حول سمةٍ قائدة.
  IF _top.score >= 50 THEN
    NEW.core_trait_id := _top.id;
    NEW.below_threshold := false;
  ELSE
    NEW.core_trait_id := NULL;
    NEW.below_threshold := true;
  END IF;

  -- السمة الاتصالية: الأعلى بعد استبعاد صاحبة المرتبة الأولى. لا تشترط
  -- 50، وتُحسب في الحالتين: هي تصف كيف تتحوّل القوّة إلى أثرٍ في الفريق،
  -- وذلك مفيدٌ حتى قبل استقرار الجوهرية.
  SELECT t.id INTO _second
    FROM public.qualification_traits t
   WHERE NEW.scores ? t.slug AND t.id <> _top.id
   ORDER BY (NEW.scores ->> t.slug)::INTEGER DESC, t.sort_order ASC
   LIMIT 1;
  NEW.relational_trait_id := _second.id;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_trait_assessment ON public.trait_assessments;
CREATE TRIGGER trg_guard_trait_assessment
BEFORE INSERT OR UPDATE ON public.trait_assessments
FOR EACH ROW EXECUTE FUNCTION public.guard_trait_assessment();

DROP TRIGGER IF EXISTS trg_guard_enrollment_stage ON public.program_enrollments;
CREATE TRIGGER trg_guard_enrollment_stage
BEFORE UPDATE ON public.program_enrollments
FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_stage();


-- ---------------------------------------------------------------------
-- 4) تسجيل قياس — والصلاحية فيه لا في السياسة
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` لا INVOKER عمداً: الكتابة المباشرة على الجدول مسحوبة
-- من `authenticated`، فدالّةٌ بحقوق المستدعي لن تستطيع الكتابة أصلاً —
-- وهو الفخّ نفسه الذي وقع فيه `write_audit`.
--
-- والحارس هنا ليس RLS بل الفحص الصريح في أول الدالّة: القياس حكمٌ على
-- طفل، فلا يكتبه إلا مشرفه المعتمَد أو الإدارة — لا الكافل، ولا كلّ من
-- يدير الملف. والمعرّف يُقرأ من الجلسة لا من الوسائط، فلا يُنتحَل.
CREATE OR REPLACE FUNCTION public.record_trait_assessment(
  _enrollment UUID, _scores JSONB, _phase TEXT DEFAULT 'progress', _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _sup UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_trait_assessment: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  _sup := public.enrollment_supervisor(_enrollment);
  IF NOT public.is_admin() AND (_sup IS NULL OR _sup <> auth.uid()) THEN
    RAISE EXCEPTION 'القياس للمشرف المعتمَد أو الإدارة' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.trait_assessments (enrollment_id, phase, scores, assessed_by, note)
  VALUES (_enrollment, _phase::public.assessment_phase, _scores, auth.uid(), _note)
  RETURNING id INTO _id;

  RETURN (
    SELECT jsonb_build_object(
      'id', a.id,
      'phase', a.phase,
      'scores', a.scores,
      'core_trait', ct.name,
      'relational_trait', rt.name,
      'below_threshold', a.below_threshold
    )
    FROM public.trait_assessments a
    LEFT JOIN public.qualification_traits ct ON ct.id = a.core_trait_id
    LEFT JOIN public.qualification_traits rt ON rt.id = a.relational_trait_id
    WHERE a.id = _id
  );
END $fn$;
REVOKE ALL ON FUNCTION public.record_trait_assessment(UUID, JSONB, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trait_assessment(UUID, JSONB, TEXT, TEXT)
  TO authenticated;

-- الكتابة المباشرة ممنوعة، فالمسار الوحيد هو الدالّة أعلاه.
REVOKE INSERT, UPDATE, DELETE ON public.trait_assessments FROM authenticated;

REVOKE ALL ON FUNCTION public.enrollment_has_consent(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_has_consent(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enrollment_supervisor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_supervisor(UUID) TO authenticated, service_role;
