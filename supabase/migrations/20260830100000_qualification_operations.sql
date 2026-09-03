-- =====================================================================
-- تشغيل بناء الأهلية — إسناد الأدوار، وتوثيق الإذن، وتقدّم المرحلة
-- ---------------------------------------------------------------------
-- النموذج بُني ومُحرِس، ولا بابَ يدخل منه أحد: لا تُسنَد الأدوار ولا
-- يُوثَّق الإذن ولا تتقدّم المرحلة إلا بكتابةٍ مباشرة على الجداول. وهذا
-- يعني عملياً أن الطبقة كلها لا تعمل.
--
-- فهذه الهجرة تفتح الباب **محروساً**: دوالٌّ تفحص الصلاحية بنفسها، ثم
-- تكتب. والمُشغّلات القائمة تبقى الحكم الأخير، فلا تلتفّ عليها هذه
-- الدوال بل تمرّ بها.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) تشديد: إذنٌ بلا وثيقة دعوى
-- ---------------------------------------------------------------------
-- الجهة هي من يوثّق إذن الولي، لا الوليُّ نفسه. وتوقيعُ وقتٍ بلا ما
-- يُثبته إقرارٌ من الجهة على نفسها لا إذنٌ من صاحب الولاية. فيُشترط
-- المستند مع الوقت — وهو ما يجعل الإذن قابلاً للمراجعة والطعن.
UPDATE public.enrollment_roles
   SET consent_document = 'legacy-undocumented'
 WHERE consent_at IS NOT NULL AND consent_document IS NULL;

ALTER TABLE public.enrollment_roles
  DROP CONSTRAINT IF EXISTS ck_consent_needs_document;
ALTER TABLE public.enrollment_roles
  ADD CONSTRAINT ck_consent_needs_document CHECK (
    consent_at IS NULL
    OR (consent_document IS NOT NULL AND length(btrim(consent_document)) > 0)
  );

/* والإذن يخصّ الولي والوصي وحدهما: «إذن المشرف» لا معنى له. */
ALTER TABLE public.enrollment_roles
  DROP CONSTRAINT IF EXISTS ck_consent_role;
ALTER TABLE public.enrollment_roles
  ADD CONSTRAINT ck_consent_role CHECK (
    consent_at IS NULL OR role IN ('guardian', 'trustee')
  );


-- ---------------------------------------------------------------------
-- 2) إسناد دور
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` لأنها تقرأ `auth.users` لتحويل البريد إلى معرّف —
-- وهو ما لا يملكه العميل. والصلاحية مفحوصة صراحةً في أولها.
--
-- ولا يُكشف من `auth.users` شيء: البريد المجهول لا يُفرّق عن المعروف في
-- الردّ، إذ يُسجَّل الاسم في الحالتين. فلا تصلح الدالّة لاستكشاف من
-- يملك حساباً على المنصّة.
CREATE OR REPLACE FUNCTION public.assign_enrollment_role(
  _enrollment UUID,
  _role TEXT,
  _person_name TEXT DEFAULT NULL,
  _person_email TEXT DEFAULT NULL,
  _person_contact TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _person UUID; _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'assign_enrollment_role: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _enrollment;
  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'التحاق غير موجود' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'إسناد الأدوار لمن يدير الملف' USING ERRCODE = '42501';
  END IF;

  IF _person_email IS NOT NULL THEN
    SELECT u.id INTO _person FROM auth.users u
     WHERE lower(u.email) = lower(btrim(_person_email));
  END IF;

  IF _person IS NULL AND (_person_name IS NULL OR btrim(_person_name) = '') THEN
    RAISE EXCEPTION 'الدور يحتاج صاحباً: حساباً معروفاً أو اسماً موثَّقاً'
      USING ERRCODE = 'check_violation';
  END IF;

  -- الدور الحيّ السابق من النوع نفسه يُنهى لا يُحذف: التاريخ يبقى.
  UPDATE public.enrollment_roles
     SET ended_at = now()
   WHERE enrollment_id = _enrollment
     AND role = _role::public.enrollment_role
     AND ended_at IS NULL;

  INSERT INTO public.enrollment_roles
    (enrollment_id, role, person_id, person_name, person_contact, assigned_by, note)
  VALUES (_enrollment, _role::public.enrollment_role, _person,
          NULLIF(btrim(COALESCE(_person_name, '')), ''), _person_contact, auth.uid(), _note)
  RETURNING id INTO _id;

  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.assign_enrollment_role(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_enrollment_role(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;


-- ---------------------------------------------------------------------
-- 3) توثيق الإذن
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_enrollment_consent(
  _role_id UUID, _document TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _role public.enrollment_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_enrollment_consent: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  IF _document IS NULL OR btrim(_document) = '' THEN
    RAISE EXCEPTION 'الإذن يحتاج وثيقةً تُثبته' USING ERRCODE = 'check_violation';
  END IF;

  SELECT e.orphan_id, r.role INTO _orphan, _role
    FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
   WHERE r.id = _role_id;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'دور غير موجود' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'توثيق الإذن لمن يدير الملف' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('guardian', 'trustee') THEN
    RAISE EXCEPTION 'الإذن للولي أو الوصي، لا لدورٍ آخر' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.enrollment_roles
     SET consent_at = now(), consent_document = btrim(_document)
   WHERE id = _role_id AND ended_at IS NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.record_enrollment_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_enrollment_consent(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 4) تقدّم المرحلة
-- ---------------------------------------------------------------------
-- لا تفحص الدالّة شروط الإذن والمشرف بنفسها: المُشغّل يفعل، وتكرارها
-- هنا يعني قاعدتين قد تفترقان. تفحص الصلاحية وحدها ثم تكتب، فيحكم
-- المُشغّل.
--
-- والتراجع ممنوع: مرحلةٌ بُلغت لا يُنكَص عنها بضغطة. تصحيح الخطأ يمرّ
-- بالإدارة، فيبقى له أثر.
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
  RETURN _new;
END $fn$;
REVOKE ALL ON FUNCTION public.set_enrollment_stage(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_enrollment_stage(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 5) صورة الالتحاق للتشغيل — لمن يديره أو يُشرف عليه
-- ---------------------------------------------------------------------
-- `SECURITY INVOKER` فتبقى سياسات القراءة هي الحاكمة على الأدوار
-- والقياسات، ولا تُنشئ الدالّة باباً يلتفّ عليها.
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
    'assessments', public.enrollment_assessments(e.id)
  )
  FROM public.program_enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.id = _enrollment;
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_detail(UUID) TO authenticated;


/* التحاقات ملفٍّ ما — لتعرضها لوحة الجهة. */
CREATE OR REPLACE FUNCTION public.orphan_enrollments(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id', e.id,
    'program', p.title,
    'kind', p.kind,
    'stage', e.stage,
    'status', e.status
  ) ORDER BY e.created_at), '[]'::jsonb)
  FROM public.program_enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.orphan_id = _orphan AND p.kind = 'qualification';
$fn$;
REVOKE ALL ON FUNCTION public.orphan_enrollments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_enrollments(UUID) TO authenticated;
