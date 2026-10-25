-- =====================================================================
-- البروفايل الكامل — يعبّئه من حول الطفل، لا من يدفع
-- ---------------------------------------------------------------------
-- ما عند المنصّة اليوم عن الطفل: اسمٌ مستعار، واحتياجٌ بمبلغ، وقصّةٌ
-- نثرية. وهذا يكفي للكفالة ولا يكفي **للبناء**: المشرف يصمّم مساراً
-- تأهيلياً لطفلٍ لا يعرف صفّه الدراسي ولا من يعيش معه ولا ما يطمح إليه.
--
-- وأربعة قرارات تحكم هذا الجدول:
--
-- (١) **من يكتبه من حول الطفل.** الوليّ والوصيّ والمشرف والفقيه وجهة
--     الرعاية — من له صلةٌ قائمة. لا الكافل، ولا كلُّ مسجَّل. والكتابة
--     عن طفلٍ ليست مساهمةً مفتوحة.
--
-- (٢) **حساسيّتان لا واحدة.** حاجبُ الاطّلاع يفتح القصّة والمدينة،
--     وليس من حقّ من أُذن له أن يقرأ **حالةَ الطفل الصحّية ووضعَه
--     النفسيّ وتركيبةَ أسرته**. فالأقسام قسمان: ما يُفتح بالإذن، وما
--     يبقى في دائرة من حول الطفل وحدها.
--
-- (٣) **كلُّ قسمٍ يحمل كاتبَه وتاريخه.** بروفايلٌ لم يُحدَّث منذ سنتين
--     يُعرض بوصفه واقعاً هو مسؤوليةٌ لا معلومة. فيُعرض عمرُه، ويُوسَم
--     ما قدُم.
--
-- (٤) **حقولٌ معروفة لا كيسٌ مفتوح.** `JSONB` بلا شكلٍ يصير مكبّاً بعد
--     شهر: مفتاحٌ لا يعرفه النظام يُرفض، فيبقى البروفايل قابلاً للقراءة
--     والبناء عليه.
-- =====================================================================


DO $$ BEGIN
  CREATE TYPE public.profile_section AS ENUM (
    'education',       -- التعليم
    'health',          -- الصحة
    'family',          -- الأسرة والسكن
    'social',          -- النفسي والاجتماعي
    'aspiration',      -- الطموح والميول
    'supervisor_note'  -- ملاحظة المشرف
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


/* ما يُفتح بإذن الاطّلاع، وما يبقى في الدائرة.
   الصحة والأسرة والنفسي وملاحظة المشرف **لا تُفتح بالإذن**: إذن
   الاطّلاع يُمنح لكافلٍ محتمل، وملفٌّ طبّيٌّ لطفلٍ ليس مما يُطّلع عليه
   ليُتّخذ قرار تبرّع. */
CREATE OR REPLACE FUNCTION public.profile_section_is_sensitive(_s public.profile_section)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  SELECT _s IN ('health', 'family', 'social', 'supervisor_note');
$fn$;
GRANT EXECUTE ON FUNCTION public.profile_section_is_sensitive(public.profile_section)
  TO authenticated;


-- ---------------------------------------------------------------------
-- دائرة من حول الطفل
-- ---------------------------------------------------------------------
-- الجهة الراعية، والوليّ المسجَّل، وأصحاب الأدوار حول برنامجه، والإدارة.
-- وليس منها الكافل: الكفالة مشاركةٌ في البناء لا ولايةٌ على الطفل.
CREATE OR REPLACE FUNCTION public.in_orphan_circle(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.can_manage_orphan(_orphan)
    OR EXISTS (SELECT 1 FROM public.orphans o
                WHERE o.id = _orphan AND o.guardian_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.enrollment_roles r
        JOIN public.program_enrollments e ON e.id = r.enrollment_id
       WHERE e.orphan_id = _orphan AND r.person_id = auth.uid() AND r.ended_at IS NULL
    )
  );
$fn$;
REVOKE ALL ON FUNCTION public.in_orphan_circle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_orphan_circle(UUID) TO authenticated;


CREATE TABLE IF NOT EXISTS public.orphan_profile_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  section public.profile_section NOT NULL,
  /* حقولٌ معروفة — يفرضها الحارس أدناه. */
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  /* وحيث يسكن الحكم: نصٌّ حرّ. */
  note TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  /* بأيّ صفةٍ كتب: وليّاً أم مشرفاً أم جهةً — فالقارئ يزن بها. */
  updated_role TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_profile_section UNIQUE (orphan_id, section),
  /* قسمٌ فارغٌ تماماً لا يُحفظ: صفٌّ بلا محتوى يُعرض «مُحدَّثاً» وهو خالٍ. */
  CONSTRAINT ck_profile_not_empty CHECK (
    data <> '{}'::jsonb OR COALESCE(btrim(note), '') <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_profile_sections_orphan
  ON public.orphan_profile_sections(orphan_id);
CREATE INDEX IF NOT EXISTS idx_profile_sections_updated_by
  ON public.orphan_profile_sections(updated_by) WHERE updated_by IS NOT NULL;

/* تُقرأ بالدوالّ وحدها ولا تُكتب مباشرةً: الصلاحية والحساسية فيهما. */
GRANT SELECT ON public.orphan_profile_sections TO authenticated;
GRANT ALL ON public.orphan_profile_sections TO service_role;
ALTER TABLE public.orphan_profile_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_circle_read" ON public.orphan_profile_sections;
CREATE POLICY "profile_circle_read" ON public.orphan_profile_sections
  FOR SELECT TO authenticated USING (public.in_orphan_circle(orphan_id));


-- ---------------------------------------------------------------------
-- الحقول المعروفة لكل قسم
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_section_fields(_s public.profile_section)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _s
    WHEN 'education' THEN ARRAY[
      'school_name', 'grade', 'performance', 'favourite_subject',
      'challenges', 'support_needed']
    WHEN 'health' THEN ARRAY[
      'general_state', 'chronic_conditions', 'medications',
      'disability', 'last_checkup']
    WHEN 'family' THEN ARRAY[
      'lives_with', 'siblings_count', 'housing_type', 'income_source',
      'caregiver_relation']
    WHEN 'social' THEN ARRAY[
      'peer_relations', 'confidence', 'interests', 'concerns']
    WHEN 'aspiration' THEN ARRAY[
      'wants_to_be', 'skills', 'strengths', 'what_would_help']
    WHEN 'supervisor_note' THEN ARRAY['readiness', 'recommendation']
  END;
$fn$;
GRANT EXECUTE ON FUNCTION public.profile_section_fields(public.profile_section)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.guard_profile_section()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _unknown TEXT;
BEGIN
  IF jsonb_typeof(NEW.data) <> 'object' THEN
    RAISE EXCEPTION 'بيانات القسم كائنٌ من حقلٍ وقيمة' USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(k, '، ') INTO _unknown
    FROM jsonb_object_keys(NEW.data) k
   WHERE k <> ALL(public.profile_section_fields(NEW.section));

  IF _unknown IS NOT NULL THEN
    RAISE EXCEPTION 'حقولٌ لا يعرفها القسم «%»: %', NEW.section, _unknown
      USING ERRCODE = 'check_violation';
  END IF;

  /* التاريخ يتحرّك بالتغيير لا باللمس: إعادةُ حفظٍ بلا تغيير تُظهر
     بروفايلاً قديماً حديثاً — وهو عين الخطر الذي وُضع التاريخ لأجله. */
  IF TG_OP = 'INSERT'
     OR NEW.data IS DISTINCT FROM OLD.data
     OR NEW.note IS DISTINCT FROM OLD.note THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_profile_section ON public.orphan_profile_sections;
CREATE TRIGGER trg_guard_profile_section
BEFORE INSERT OR UPDATE ON public.orphan_profile_sections
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_section();


-- ---------------------------------------------------------------------
-- الكتابة
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` لأن الكتابة المباشرة مسحوبة، والحارس هو الفحص
-- الصريح. والصفة تُحسب من القاعدة لا تُرسل: من يكتب «بصفتي الوليّ»
-- وليس وليّاً يكذب في سجلٍّ عن طفل.
CREATE OR REPLACE FUNCTION public.save_orphan_profile_section(
  _orphan UUID, _section TEXT, _data JSONB DEFAULT '{}'::jsonb, _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _role TEXT; _id UUID; _sec public.profile_section;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'save_orphan_profile_section: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  IF NOT public.in_orphan_circle(_orphan) THEN
    RAISE EXCEPTION 'البروفايل يكتبه من حول الطفل: وليُّه أو وصيُّه أو مشرفه أو جهته'
      USING ERRCODE = '42501';
  END IF;

  _sec := _section::public.profile_section;

  /* الصفة من القاعدة: أدقُّ ما نعرفه عن صلة الكاتب. */
  SELECT r.role::text INTO _role
    FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
   WHERE e.orphan_id = _orphan AND r.person_id = auth.uid() AND r.ended_at IS NULL
   ORDER BY CASE r.role WHEN 'supervisor' THEN 1 WHEN 'guardian' THEN 2
                        WHEN 'trustee' THEN 3 ELSE 4 END
   LIMIT 1;

  IF _role IS NULL THEN
    _role := CASE
      WHEN EXISTS (SELECT 1 FROM public.orphans o
                    WHERE o.id = _orphan AND o.guardian_id = auth.uid()) THEN 'guardian'
      WHEN public.can_manage_orphan(_orphan) THEN 'care_org'
      ELSE 'admin'
    END;
  END IF;

  INSERT INTO public.orphan_profile_sections AS t
    (orphan_id, section, data, note, updated_by, updated_role)
  VALUES (_orphan, _sec, COALESCE(_data, '{}'::jsonb),
          NULLIF(btrim(COALESCE(_note, '')), ''), auth.uid(), _role)
  ON CONFLICT ON CONSTRAINT uq_profile_section DO UPDATE SET
    data = COALESCE(EXCLUDED.data, t.data),
    note = COALESCE(EXCLUDED.note, t.note),
    updated_by = auth.uid(),
    updated_role = _role
  RETURNING t.id INTO _id;

  PERFORM public.write_audit('orphan.profile_saved', 'orphan', _orphan,
    jsonb_build_object('section', _sec, 'role', _role));

  RETURN jsonb_build_object('id', _id, 'section', _sec, 'role', _role);
END $fn$;
REVOKE ALL ON FUNCTION public.save_orphan_profile_section(UUID, TEXT, JSONB, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_orphan_profile_section(UUID, TEXT, JSONB, TEXT)
  TO authenticated;


-- ---------------------------------------------------------------------
-- القراءة — بحسب الصلة
-- ---------------------------------------------------------------------
-- للدائرة: الأقسام كلّها. ولمن أُذن له بالاطّلاع: غير الحسّاسة منها.
-- ولغيرهما: لا شيء. وكلُّ قسمٍ يحمل عمره، فيُعرف ما قدُم.
CREATE OR REPLACE FUNCTION public.orphan_profile(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _circle BOOLEAN; _detail BOOLEAN;
BEGIN
  _circle := public.in_orphan_circle(_orphan);
  _detail := public.can_view_orphan_detail(_orphan);

  IF NOT _circle AND NOT _detail THEN
    RETURN jsonb_build_object('may_read', false, 'sections', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'may_read', true,
    'may_write', _circle,
    /* يُقال صراحةً أنّ ثمّة أقساماً محجوبة، فلا يُظنّ البروفايل ناقصاً. */
    'sees_sensitive', _circle,
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'section', p.section,
        'data', p.data,
        'note', p.note,
        'updated_role', p.updated_role,
        'updated_at', p.updated_at,
        'age_days', (now()::date - p.updated_at::date)
      ) ORDER BY p.section)
      FROM public.orphan_profile_sections p
     WHERE p.orphan_id = _orphan
       AND (_circle OR NOT public.profile_section_is_sensitive(p.section))
    ), '[]'::jsonb),
    'hidden_sections', CASE WHEN _circle THEN 0 ELSE (
      SELECT count(*) FROM public.orphan_profile_sections p
       WHERE p.orphan_id = _orphan AND public.profile_section_is_sensitive(p.section)
    ) END
  );
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_profile(UUID) TO authenticated;


/* وتمامُ البروفايل — لتعرف الجهة ما ينقص بدل أن تبحث عنه. */
CREATE OR REPLACE FUNCTION public.orphan_profile_completeness(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _filled INTEGER; _total INTEGER := 6; _missing TEXT[];
BEGIN
  IF NOT public.in_orphan_circle(_orphan) THEN
    RAISE EXCEPTION 'تمام البروفايل لمن حول الطفل' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _filled FROM public.orphan_profile_sections p
   WHERE p.orphan_id = _orphan;

  SELECT array_agg(s::text ORDER BY s) INTO _missing
    FROM unnest(enum_range(NULL::public.profile_section)) s
   WHERE s NOT IN (SELECT p.section FROM public.orphan_profile_sections p
                    WHERE p.orphan_id = _orphan);

  RETURN jsonb_build_object(
    'filled', _filled, 'total', _total,
    'missing', to_jsonb(COALESCE(_missing, '{}'::text[])));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_profile_completeness(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_profile_completeness(UUID) TO authenticated;
