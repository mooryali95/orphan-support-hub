-- =====================================================================
-- ورش الجلسات — البرنامج وحدةً واحدة لا يُبنى
-- ---------------------------------------------------------------------
-- البرنامج التأهيلي اليوم **وحدةٌ واحدة**: مفهومٌ وسمةٌ ومدخلاتٌ
-- وعمليات، ثم مرحلةٌ يرفعها المشرف. والمنهجية تفصّله **ستّ ورش، ورشة
-- كل ٣–٤ أيام**، لكل واحدةٍ مادةٌ ومهمّةٌ ومخرجاتٌ وتسليم.
--
-- والفرق ليس تفصيلاً إدارياً: بلا الجلسات تكون `stage` **دعوى يكتبها
-- المشرف** — ستّ ضغطاتٍ من «المفهوم» إلى «الأهلية» بلا أثرٍ بينها.
-- والجلسات هي ما يجعل المرحلة **مكسوبة**.
--
-- وثلاثة قرارات:
--
-- (١) **الستّ ليست الستّ.** رحلة التشغيل (المفهوم ← السمة ← النظام ←
--     الأفعال ← القياس ← الأهلية) ستّ مراحل، وورش المستوى التأسيسي ستّ
--     جلسات — وهما شيئان مختلفان تصادف عددهما. فلا تُربط جلسةٌ بمرحلة
--     ربطاً آلياً: الجلسة عملٌ يُسلَّم، والمرحلة حالةٌ تُبلَغ.
--
-- (٢) **الترتيب حكمٌ لا اقتراح.** الجلسة الثانية «تعميق المعادلة»،
--     تُعمّق ما بُني في الأولى. فقبولها قبل قبول ما دونها تناقض —
--     ويمنعه الحارس.
--
-- (٣) **القبول يحتاج أثراً.** جلسةٌ تُقبل بلا مخرَجٍ مسجَّل هي توقيعٌ
--     على بياض. والمنهجية تشترط لكل جلسة مخرجاً (عرضاً أو فيديو أو
--     خريطة) وتسليماً.
--
-- ثم الرابطة الحاملة: **لا تُعلَن الأهلية وفي البرنامج جلسةٌ لم تُقبل.**
-- كان `qualified` يشترط قياساً ختامياً وحده، فيمرّ ملفٌّ قِيسَ ولم يُبنَ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) جلسات البرنامج
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  /* رتبة الجلسة في البرنامج — والترتيب مفروض لا معروض. */
  ordinal SMALLINT NOT NULL CHECK (ordinal > 0),
  title TEXT NOT NULL,
  /* المحور — ما الذي تدور عليه الجلسة. */
  focus TEXT NOT NULL,
  /* المادة العلمية. */
  material TEXT NOT NULL,
  /* المهمّة التطبيقية — الجلسة عملٌ لا استماع. */
  task TEXT NOT NULL,
  /* مخرجات الجلسة — بينيّة، غير مخرجات البرنامج الختامية. */
  outputs TEXT[] NOT NULL CHECK (cardinality(outputs) > 0),
  /* التسليم — أين يُسلَّم المخرَج؛ مخرَجٌ بلا قناةٍ لا يصل. */
  submission TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_program_unit_ordinal UNIQUE (program_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_program_units_program
  ON public.program_units(program_id, ordinal);

GRANT SELECT ON public.program_units TO anon, authenticated;
GRANT ALL ON public.program_units TO service_role;
ALTER TABLE public.program_units ENABLE ROW LEVEL SECURITY;

/* الجلسات منهجٌ معلَن لا سرّ: من حقّ الكافل أن يقرأ ما يُبنى قبل أن
   يدفع. والمعلَن هو الخطّة، لا ما سلّمه طفلٌ بعينه. */
DROP POLICY IF EXISTS "units_public_read" ON public.program_units;
CREATE POLICY "units_public_read" ON public.program_units
  FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS "units_admin_write" ON public.program_units;
CREATE POLICY "units_admin_write" ON public.program_units
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ورش المستوى التأسيسي الست، بمحاورها في المنهجية.
INSERT INTO public.program_units
  (program_id, ordinal, title, focus, material, task, outputs, submission)
SELECT p.id, v.ordinal, v.title, v.focus, v.material, v.task, v.outputs,
       'مجموعة البرنامج ولوحة التسليم المشتركة'
  FROM public.programs p, (VALUES
    (1::SMALLINT, 'معادلة الأهلية — الإطار التأسيسي',
     'المعادلة والمكوّنات الأربعة.',
     'الأهلية = القدرة على تفهّم الخطاب + اكتساب الفعل؛ والنظام والأصول والسمات والمفاهيم.',
     'يصوغ المتدرّب المعادلة بلغته، ويحدّد مكوّناً واحداً يراه أضعف في محيطه.',
     ARRAY['عرض ٥–٨ شرائح','خريطة ذهنية للمكوّنات الأربعة']),

    (2::SMALLINT, 'تعميق المعادلة',
     'تفهّم الخطاب واكتساب الفعل — طرفا المعادلة.',
     'إدراك ما يُراد ومعرفة المسؤولية تجاهه؛ وبناء القدرة على إنتاج أفعالٍ متزايدة مستقرّة.',
     'يرصد المتدرّب موقفاً فهم فيه الخطاب ولم يُنتج فعلاً، ويحلّل أين انقطع.',
     ARRAY['فيديو ٣–٥ دقائق','ورقة تحليل موقف']),

    (3::SMALLINT, 'كيف نشغّل المعادلة',
     'من البناء إلى التشغيل — وأداة تشغيل المفهوم.',
     'المقصد والأصل والسمة والأفعال والنظام: خمسة أسئلة تُحلّل بها أيّ مفهوم قبل إدخاله.',
     'يشغّل المتدرّب مفهوماً واحداً بالأداة الخماسية كاملةً.',
     ARRAY['بطاقة تشغيل مفهوم','عرض ٥–٨ شرائح']),

    (4::SMALLINT, 'المفهوم والسمة',
     'رحلة التشغيل الست ووظائف النظام.',
     'المفهوم وسيلة والسمة غاية؛ ويبدأ التصميم من المفهوم لا من النشاط.',
     'يصمّم المتدرّب مساراً من مفهومٍ إلى سمةٍ إلى أفعالٍ، ويعيّن وظيفة النظام التي تسنده.',
     ARRAY['مسار مصمَّم من المفهوم إلى الفعل','خريطة ذهنية للرحلة الست']),

    (5::SMALLINT, 'مقياس السمات',
     'القياس أداة بناء لا اختبار.',
     'توزيع مئة درجة على السمات؛ والجوهرية أعلاها بشرط ٥٠، والاتصالية أعلى ما بقي بعدها.',
     'يقيس المتدرّب سماته، ويقرأ خريطته قراءة بناءٍ لا حكم.',
     ARRAY['خريطة سمات مقيسة','قراءة مكتوبة للخريطة']),

    (6::SMALLINT, 'مراجعة شاملة وتثبيت',
     'تثبيت البناء، وتمهيدٌ للمستوى التطبيقي.',
     'مراجعة المعادلة والمكوّنات والرحلة والمقياس مجتمعةً.',
     'ينقل المتدرّب ما تعلّمه إلى مجموعةٍ من محيطه المحلّي، ويرصد أثر النقل.',
     ARRAY['جلسة نقل معرفة منفَّذة','تقرير أثر النقل'])
  ) AS v(ordinal, title, focus, material, task, outputs)
 WHERE p.slug = 'ahliyyah-foundational'
ON CONFLICT ON CONSTRAINT uq_program_unit_ordinal DO NOTHING;


-- ---------------------------------------------------------------------
-- 2) ما سلّمه ملفٌّ بعينه
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.unit_progress AS ENUM (
    'pending',    -- لم تبدأ
    'submitted',  -- سُلّم المخرَج وينتظر التقويم
    'returned',   -- أُعيد للمراجعة — والتقويم مستمرّ لا نهائي
    'accepted'    -- قُبل
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.enrollment_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL
    REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.program_units(id) ON DELETE RESTRICT,
  status public.unit_progress NOT NULL DEFAULT 'pending',
  /* المخرَج — رابطه أو وصفه. */
  evidence TEXT,
  /* ملاحظة المشرف — تلزم عند الإعادة: إعادةٌ بلا سببٍ لا تُصلح. */
  note TEXT,
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_enrollment_unit UNIQUE (enrollment_id, unit_id),
  /* تسليمٌ أو قبولٌ بلا مخرَج توقيعٌ على بياض. */
  CONSTRAINT ck_unit_needs_evidence CHECK (
    status NOT IN ('submitted', 'accepted')
    OR (evidence IS NOT NULL AND btrim(evidence) <> '')
  ),
  /* وإعادةٌ بلا سبب. */
  CONSTRAINT ck_return_needs_note CHECK (
    status <> 'returned' OR (note IS NOT NULL AND btrim(note) <> '')
  ),
  /* وقبولٌ بلا من قَبِل ومتى. */
  CONSTRAINT ck_accepted_is_signed CHECK (
    status <> 'accepted' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_enrollment_units_enrollment
  ON public.enrollment_units(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_units_unit
  ON public.enrollment_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_units_decided_by
  ON public.enrollment_units(decided_by) WHERE decided_by IS NOT NULL;

/* تُقرأ ولا تُكتب مباشرةً: الكتابة من الدالّة وحدها، لأن الترتيب
   والصلاحية فيها. */
GRANT SELECT ON public.enrollment_units TO authenticated;
GRANT ALL ON public.enrollment_units TO service_role;
ALTER TABLE public.enrollment_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrollment_units_read" ON public.enrollment_units;
CREATE POLICY "enrollment_units_read" ON public.enrollment_units
  FOR SELECT TO authenticated USING (
    public.enrollment_supervisor(enrollment_id) = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.program_enrollments e
       WHERE e.id = enrollment_id AND public.can_manage_orphan(e.orphan_id)
    )
  );


-- ---------------------------------------------------------------------
-- 3) الحارس — الانتماء والترتيب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_enrollment_unit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _ord SMALLINT; _prog UUID; _eprog UUID; _behind INTEGER;
BEGIN
  SELECT u.ordinal, u.program_id INTO _ord, _prog
    FROM public.program_units u WHERE u.id = NEW.unit_id;

  SELECT e.program_id INTO _eprog
    FROM public.program_enrollments e WHERE e.id = NEW.enrollment_id;

  /* جلسةٌ من برنامجٍ آخر تُعلَّق على ملفّ: تقدّمٌ في غير ما التحق به. */
  IF _prog IS DISTINCT FROM _eprog THEN
    RAISE EXCEPTION 'الجلسة ليست من برنامج هذا الالتحاق'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'accepted' THEN
    SELECT count(*) INTO _behind
      FROM public.program_units u
     WHERE u.program_id = _prog AND u.active AND u.ordinal < _ord
       AND NOT EXISTS (
         SELECT 1 FROM public.enrollment_units eu
          WHERE eu.enrollment_id = NEW.enrollment_id
            AND eu.unit_id = u.id AND eu.status = 'accepted');
    IF _behind > 0 THEN
      RAISE EXCEPTION 'لا تُقبل جلسةٌ قبل قبول ما دونها (% متأخّرة)', _behind
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_enrollment_unit ON public.enrollment_units;
CREATE TRIGGER trg_guard_enrollment_unit
BEFORE INSERT OR UPDATE ON public.enrollment_units
FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_unit();


-- ---------------------------------------------------------------------
-- 4) تسجيل تقدّم جلسة
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` عمداً — الكتابة على الجدول مسحوبة من
-- `authenticated`، والحارس هو الفحص الصريح لا السياسة. والمعرّف من
-- الجلسة لا من الوسائط.
--
-- ودالّةٌ واحدة للتسليم والتقويم لا اثنتان: الطفل لا حساب له على
-- المنصّة، والمشرف هو من يرصد ويسجّل. فبناء مسارٍ ذي طرفين وهْمٌ —
-- والوقتان (`submitted_at` و`decided_at`) يبقيان الفرق مسجّلاً: ما
-- سُلّم وينتظر، وما قُوِّم.
CREATE OR REPLACE FUNCTION public.record_unit_progress(
  _enrollment UUID,
  _unit UUID,
  _status TEXT,
  _evidence TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _sup UUID; _st public.unit_progress; _id UUID; _now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_unit_progress: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  _sup := public.enrollment_supervisor(_enrollment);
  IF NOT public.is_admin() AND (_sup IS NULL OR _sup <> auth.uid()) THEN
    RAISE EXCEPTION 'تقويم الجلسات للمشرف المعتمَد أو الإدارة'
      USING ERRCODE = '42501';
  END IF;

  _st := _status::public.unit_progress;

  INSERT INTO public.enrollment_units AS eu
    (enrollment_id, unit_id, status, evidence, note,
     submitted_at, decided_at, decided_by)
  VALUES (
    _enrollment, _unit, _st, NULLIF(btrim(COALESCE(_evidence, '')), ''),
    NULLIF(btrim(COALESCE(_note, '')), ''),
    CASE WHEN _st IN ('submitted','accepted','returned') THEN _now END,
    CASE WHEN _st IN ('accepted','returned') THEN _now END,
    CASE WHEN _st IN ('accepted','returned') THEN auth.uid() END
  )
  ON CONFLICT ON CONSTRAINT uq_enrollment_unit DO UPDATE SET
    status = EXCLUDED.status,
    /* المخرَج يبقى إن لم يُرسل جديد: التقويم لا يمحو ما سُلّم. */
    evidence = COALESCE(EXCLUDED.evidence, eu.evidence),
    note = COALESCE(EXCLUDED.note, eu.note),
    submitted_at = COALESCE(EXCLUDED.submitted_at, eu.submitted_at),
    decided_at = CASE WHEN EXCLUDED.status IN ('accepted','returned')
                      THEN _now ELSE eu.decided_at END,
    decided_by = CASE WHEN EXCLUDED.status IN ('accepted','returned')
                      THEN auth.uid() ELSE eu.decided_by END
  RETURNING eu.id INTO _id;

  PERFORM public.write_audit('unit.progress', 'enrollment_unit', _id,
    jsonb_build_object('enrollment', _enrollment, 'unit', _unit, 'status', _st));

  RETURN jsonb_build_object('id', _id, 'status', _st);
END $fn$;
REVOKE ALL ON FUNCTION public.record_unit_progress(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_unit_progress(UUID, UUID, TEXT, TEXT, TEXT)
  TO authenticated;


-- ---------------------------------------------------------------------
-- 5) الرابطة الحاملة — لا أهلية وفي البرنامج جلسةٌ لم تُقبل
-- ---------------------------------------------------------------------
-- بدونها تبقى الجلسات زينةً: يُقاس الملفّ قياساً ختامياً فتُعلَن أهليّته
-- وجلستان لم تُبنَيا.
CREATE OR REPLACE FUNCTION public.guard_enrollment_stage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _kind public.program_kind; _open INTEGER;
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

  -- ولا وفي البرنامج جلسةٌ لم تُقبل.
  IF NEW.stage = 'qualified' THEN
    SELECT count(*) INTO _open
      FROM public.program_units u
     WHERE u.program_id = NEW.program_id AND u.active
       AND NOT EXISTS (
         SELECT 1 FROM public.enrollment_units eu
          WHERE eu.enrollment_id = NEW.id AND eu.unit_id = u.id
            AND eu.status = 'accepted');
    IF _open > 0 THEN
      RAISE EXCEPTION 'لا تُعلَن الأهلية وفي البرنامج % جلسةً لم تُقبل', _open
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.stage_changed_at := now();
  RETURN NEW;
END $fn$;


-- ---------------------------------------------------------------------
-- 6) القراءة
-- ---------------------------------------------------------------------
/* لوحة المشرف: الجلسات وما سُلّم منها. `SECURITY INVOKER` عمداً فتبقى
   `enrollment_units_read` هي الحاكمة. */
CREATE OR REPLACE FUNCTION public.enrollment_unit_progress(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'unit_id', u.id,
    'ordinal', u.ordinal,
    'title', u.title,
    'focus', u.focus,
    'material', u.material,
    'task', u.task,
    'outputs', to_jsonb(u.outputs),
    'submission', u.submission,
    'status', COALESCE(eu.status, 'pending'),
    'evidence', eu.evidence,
    'note', eu.note,
    'submitted_at', eu.submitted_at,
    'decided_at', eu.decided_at
  ) ORDER BY u.ordinal), '[]'::jsonb)
  FROM public.program_enrollments e
  JOIN public.program_units u ON u.program_id = e.program_id AND u.active
  LEFT JOIN public.enrollment_units eu
         ON eu.enrollment_id = e.id AND eu.unit_id = u.id
  WHERE e.id = _enrollment;
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_unit_progress(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_unit_progress(UUID) TO authenticated;


/* منهج البرنامج معلَناً — للزائر والكافل قبل أن يدفع. الخطّة لا ما
   سلّمه طفل. */
CREATE OR REPLACE FUNCTION public.program_curriculum(_program UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal', u.ordinal,
    'title', u.title,
    'focus', u.focus,
    'material', u.material,
    'task', u.task,
    'outputs', to_jsonb(u.outputs)
  ) ORDER BY u.ordinal), '[]'::jsonb)
  FROM public.program_units u
  WHERE u.program_id = _program AND u.active;
$fn$;
REVOKE ALL ON FUNCTION public.program_curriculum(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.program_curriculum(UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 7) عدّ الجلسات في الواجهات القائمة
-- ---------------------------------------------------------------------
-- للكافل: **كم قُبل من كم** — تقدّمٌ لا مضمون. وما سلّمه الطفل وملاحظات
-- مشرفه عليه من جنس الدرجات: حكمٌ على طفلٍ لا يُعرض على غريب.
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
    'has_consent', public.enrollment_has_consent(e.id),
    'units_total', (SELECT count(*) FROM public.program_units u
                     WHERE u.program_id = p.id AND u.active),
    'units_accepted', (SELECT count(*) FROM public.program_units u
                        JOIN public.enrollment_units eu
                          ON eu.unit_id = u.id AND eu.enrollment_id = e.id
                       WHERE u.program_id = p.id AND u.active
                         AND eu.status = 'accepted')
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


-- وللمشرف: ما ينتظر تقويمه — فالعمل يُرى من لوحته لا يُبحث عنه.
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
    'units_total', (SELECT count(*) FROM public.program_units u
                     WHERE u.program_id = p.id AND u.active),
    'units_accepted', (SELECT count(*) FROM public.program_units u
                        JOIN public.enrollment_units eu
                          ON eu.unit_id = u.id AND eu.enrollment_id = e.id
                       WHERE u.program_id = p.id AND u.active
                         AND eu.status = 'accepted'),
    'units_awaiting', (SELECT count(*) FROM public.program_units u
                        JOIN public.enrollment_units eu
                          ON eu.unit_id = u.id AND eu.enrollment_id = e.id
                       WHERE u.program_id = p.id AND u.active
                         AND eu.status = 'submitted'),
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


-- وصورة الالتحاق تحمل جلساته.
CREATE OR REPLACE FUNCTION public.enrollment_detail(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'enrollment_id', e.id,
    'orphan_id', e.orphan_id,
    'program', p.title,
    'kind', p.kind,
    'stage', e.stage,
    'stage_order', public.stage_order(e.stage),
    'status', e.status,
    'is_supervisor', public.enrollment_supervisor(e.id) = auth.uid(),
    'roles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'role', r.role,
        'person_name', r.person_name,
        'person_contact', r.person_contact,
        'has_account', r.person_id IS NOT NULL,
        'consent_at', r.consent_at,
        'consent_document', r.consent_document,
        'assigned_at', r.assigned_at
      ) ORDER BY r.role), '[]'::jsonb)
      FROM public.enrollment_roles r
      WHERE r.enrollment_id = e.id AND r.ended_at IS NULL
    ),
    'assessments', public.enrollment_assessments(e.id),
    'units', public.enrollment_unit_progress(e.id)
  )
  FROM public.program_enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.id = _enrollment;
$fn$;


-- ---------------------------------------------------------------------
-- 8) أثرُ المرحلة — والتاريخ يضيع بلا أثر
-- ---------------------------------------------------------------------
-- `stage` عمودٌ يُدهس: من بلغ «القياس» ثم أُعيد إلى «الأفعال» لا يُعرف
-- أنه رجع. والجلسات تُظهر هذا العيب لأنها تُدهس مثله (تسليمٌ فإعادةٌ
-- فقبول)، فيُكتب الأثر في الموضعين.
CREATE OR REPLACE FUNCTION public.set_enrollment_stage(_enrollment UUID, _stage TEXT)
RETURNS public.qualification_stage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _old public.qualification_stage; _new public.qualification_stage;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_enrollment_stage: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  SELECT e.orphan_id, e.stage INTO _orphan, _old
    FROM public.program_enrollments e WHERE e.id = _enrollment;
  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'التحاق غير موجود' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'تقديم المرحلة لمن يدير الملف' USING ERRCODE = '42501';
  END IF;

  _new := _stage::public.qualification_stage;

  IF public.stage_order(_new) < public.stage_order(_old) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'لا نكوص عن مرحلةٍ بُلغت؛ التصحيح من الإدارة'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.program_enrollments SET stage = _new WHERE id = _enrollment;

  IF _new IS DISTINCT FROM _old THEN
    PERFORM public.write_audit('enrollment.stage', 'enrollment', _enrollment,
      jsonb_build_object('from', _old, 'to', _new));
  END IF;

  RETURN _new;
END $fn$;
