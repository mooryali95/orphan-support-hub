-- =====================================================================
-- المرحلة صفر — الثقة بجهة الرعاية ومساءلة الإدارة (المجموعة DB-B)
-- ---------------------------------------------------------------------
-- ستّة أبوابٍ وجدها التدقيق، كلٌّ منها مُثبَتٌ بفحصٍ يفشل قبل هذه الهجرة
-- ويمرّ بعدها (`supabase/tests/trust-accountability-verification.sql`):
--
--   ١) CP-01 + DB-02  الجهة (أو الوليّ) تُدخل أيّ حسابٍ دائرةَ الطفل —
--             الاسم الحقيقي والصورة والصحّة والأسرة — بلا قرارٍ من الإدارة
--             ولا أجلٍ ولا أثر، وتجعل أيّ حسابٍ «وليّاً» له.
--   ٢) CP-02 + DB-01  الجهة تنقض سحبَ الوليّ لموافقة الصورة، وتكتب من
--             وافق (`photo_consent_by`) ومن راجع (`reviewed_by`) بنفسها.
--   ٣) CP-06  ملفٌّ بلا وثيقةٍ موثَّقة واحدة يُعتمد ويُنشر — والأسئلة
--             الشائعة تَعِد بشهادة وفاةٍ وإثبات وصايةٍ فتحتهما الإدارة.
--   ٤) DB-07 + CP-10  ما اعتُمد (الاسم والقصّة والمدينة والصورة، والتقرير
--             الدوري) يُعدَّل بعد الاعتماد ويبقى منشوراً بلا مراجعة.
--   ٥) GAP-03  الإدارة تفعّل كفالةً وتسجّل صرفاً بكتابةٍ مباشرة بلا أثر.
--   ٦) DB-05  «إثبات الوصول» ملفٌّ غير موجود، والوثيقة الموثَّقة تُستبدل
--             وتُحذف ويبقى وسمها «موثَّقة».
--
-- كلّ ما هنا `CREATE OR REPLACE` و`DROP ... IF EXISTS` وتحديثاتٌ مشروطة،
-- فتُطبَّق على البثّ كما هي. وتواقيع الدوالّ التي تستدعيها الواجهة باقية.
-- وكلّ دالّةٍ جديدة تُسحب من العموم أولاً ثم تُمنح لمن قُصدت له: صلاحيات
-- Supabase الافتراضية تمنح anon وauthenticated كلَّ ما يُنشأ في public.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) CP-01 + DB-02 — الدائرة تُفتح بقرار الإدارة، لأجلٍ، وبأثر
-- ---------------------------------------------------------------------
-- القاعدة نفسها التي بُني عليها الإذن بالاطّلاع وعلى اعتماد المشرفين:
-- «جهةٌ تأذن في ملفّاتها كجهةٍ تعتمد نفسها». فالجهة تُسنِد، والإدارة
-- تقرّر، والقرار ينقضي (٣٦٥ يوماً حدّاً) ويُسجَّل.
--
--   - دورٌ بلا حساب (اسمٌ موثَّق) لا يفتح شيئاً أصلاً: `not_required`.
--   - المشرف لا يُسنَد إلا معتمَداً من الإدارة (`guard_supervisor_is_certified`)
--     فاعتماده هو القرار، ويُعطى أجلاً كغيره.
--   - ما عدا ذلك بحسابٍ: `pending` حتى تقرّر الإدارة.
ALTER TABLE public.enrollment_roles
  ADD COLUMN IF NOT EXISTS approval TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_note TEXT;

/* حارس الاعتماد كان يفحص كلَّ تحديث، فقرارُ الإدارة على دور مشرفٍ سُحب
   اعتماده لاحقاً كان يسقط. الفحص الآن حين يصير الدورُ دورَ مشرفٍ حيّ:
   إدراجاً، أو تغييرَ صاحبه أو نوعه، أو إحياءَ دورٍ منتهٍ. */
CREATE OR REPLACE FUNCTION public.guard_supervisor_is_certified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.role <> 'supervisor' OR NEW.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = OLD.role
     AND NEW.person_id IS NOT DISTINCT FROM OLD.person_id AND OLD.ended_at IS NULL THEN
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
REVOKE ALL ON FUNCTION public.guard_supervisor_is_certified() FROM PUBLIC, anon, authenticated;

/* الصفوف القائمة: الإسناد الذي سبق هذه الهجرة لم يمرّ بقرار، فيُعلَّق
   كلُّ دورٍ حيٍّ بحسابٍ — إلا المشرف المعتمد — حتى تقرّر الإدارة. ومن
   كان يرى الطفل بدورٍ كهذا يغيب عنه حتى يُعتمد: هذا هو الإصلاح لا أثرٌ
   جانبيّ له. والمنتهي يبقى تاريخاً كما هو. */
UPDATE public.enrollment_roles r SET
  approval = CASE
    WHEN r.person_id IS NULL THEN 'not_required'
    WHEN r.ended_at IS NOT NULL THEN 'approved'
    WHEN r.role = 'supervisor' AND EXISTS (
           SELECT 1 FROM public.supervisor_profiles s
            WHERE s.user_id = r.person_id AND s.active) THEN 'approved'
    ELSE 'pending' END,
  approved_at = CASE
    WHEN r.person_id IS NOT NULL AND (r.ended_at IS NOT NULL OR r.role = 'supervisor')
      THEN COALESCE(r.approved_at, r.assigned_at) END,
  expires_at = CASE
    WHEN r.person_id IS NULL THEN NULL
    WHEN r.ended_at IS NOT NULL THEN COALESCE(r.expires_at, r.ended_at)
    WHEN r.role = 'supervisor' THEN COALESCE(r.expires_at, now() + interval '365 days')
    ELSE r.expires_at END,
  decision_note = CASE
    WHEN r.person_id IS NOT NULL AND r.ended_at IS NULL AND r.role = 'supervisor'
      THEN COALESCE(r.decision_note, 'certified_supervisor') END
WHERE r.approval IS NULL;

ALTER TABLE public.enrollment_roles DROP CONSTRAINT IF EXISTS ck_role_approval;
ALTER TABLE public.enrollment_roles ADD CONSTRAINT ck_role_approval CHECK (
  approval IN ('pending', 'approved', 'rejected', 'not_required')
);
ALTER TABLE public.enrollment_roles DROP CONSTRAINT IF EXISTS ck_role_approval_expires;
ALTER TABLE public.enrollment_roles ADD CONSTRAINT ck_role_approval_expires CHECK (
  approval <> 'approved' OR person_id IS NULL OR expires_at IS NOT NULL
);

/* ما يُدرَج بلا قرارٍ صريح يُكمَّل هنا. والكتابة المباشرة مسحوبةٌ من
   العموم (أدناه)، فلا يصل هذا إلا ما يكتبه الخادم نفسه: دالّة الإسناد
   (تكتب قرارها صراحةً) أو مفتاح الخدمة. */
CREATE OR REPLACE FUNCTION public.fill_enrollment_role_approval()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.approval IS NULL THEN
    NEW.approval := CASE WHEN NEW.person_id IS NULL THEN 'not_required' ELSE 'approved' END;
  END IF;
  IF NEW.approval = 'approved' AND NEW.person_id IS NOT NULL THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '365 days');
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.fill_enrollment_role_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_enrollment_role_approval ON public.enrollment_roles;
CREATE TRIGGER trg_fill_enrollment_role_approval
BEFORE INSERT ON public.enrollment_roles
FOR EACH ROW EXECUTE FUNCTION public.fill_enrollment_role_approval();

ALTER TABLE public.enrollment_roles ALTER COLUMN approval SET NOT NULL;

/* لا بابَ خلفيّ: سياسة `FOR ALL` كانت تسمح للجهة بإدراج «وليٍّ» لأيّ
   حسابٍ مباشرةً، وبكتابة الإذن (`consent_at`) بنفسها. فالكتابة كلّها
   تمرّ بالدوالّ: الإسناد، وقرار الإدارة، والإنهاء، والإذن. */
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.enrollment_roles FROM anon, authenticated;
DROP POLICY IF EXISTS "enrollment_roles_write" ON public.enrollment_roles;


/* من يحمل دوراً حيّاً معتمَداً لم ينقضِ أجله — وبأيّ الأدوار. */
CREATE OR REPLACE FUNCTION public.holds_live_circle_role(
  _orphan UUID, _roles public.enrollment_role[] DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.enrollment_roles r
      JOIN public.program_enrollments e ON e.id = r.enrollment_id
     WHERE e.orphan_id = _orphan
       AND r.person_id = auth.uid()
       AND r.ended_at IS NULL
       AND r.approval = 'approved'
       AND r.expires_at > now()
       AND (_roles IS NULL OR r.role = ANY(_roles))
  );
$fn$;
REVOKE ALL ON FUNCTION public.holds_live_circle_role(UUID, public.enrollment_role[])
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.in_orphan_circle(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.can_manage_orphan(_orphan)
    OR public.holds_live_circle_role(_orphan, NULL)
  );
$fn$;
REVOKE ALL ON FUNCTION public.in_orphan_circle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_orphan_circle(UUID) TO authenticated;

/* وبوّابة التفصيل كانت تفتح لأيّ دورٍ حيّ بلا قرار — البابُ نفسه من
   طريقٍ آخر. فتمرّ بالشرط نفسه. */
CREATE OR REPLACE FUNCTION public.can_view_orphan_detail(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.can_manage_orphan(_orphan)
    OR public.sponsors_orphan(_orphan)
    OR public.holds_live_circle_role(_orphan, NULL)
    /* أو إذنٌ قائمٌ لم ينقضِ ولم يُسحب. */
    OR EXISTS (
      SELECT 1 FROM public.orphan_access_requests a
       WHERE a.orphan_id = _orphan
         AND a.requester_id = auth.uid()
         AND a.status = 'approved'
         AND a.expires_at > now()
    )
  );
$fn$;
REVOKE ALL ON FUNCTION public.can_view_orphan_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_orphan_detail(UUID) TO authenticated;

/* ونطاق الدائرة بحسب الدور: المرشد والفقيه يرافقان البرنامج، ولا
   يحتاجان الاسمَ الحقيقي والصورة (identity) ولا المكانَ (location) ولا
   التواصل ولا الملفّ العميق (الصحّة والأسرة). ومن يدير الملفّ والوليّ
   والوصيّ والمشرف يملكون النطاقات كلّها كما كانوا. وما زاد على ذلك
   لأحدٍ بعينه فبإذن الاطّلاع من الإدارة. */
CREATE OR REPLACE FUNCTION public.circle_role_withheld_scopes()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['identity', 'location', 'contact', 'profile_deep']::TEXT[];
$fn$;
REVOKE ALL ON FUNCTION public.circle_role_withheld_scopes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_orphan_scopes(_orphan UUID)
RETURNS TEXT[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _grant TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN '{}'::TEXT[]; END IF;

  IF public.is_admin() OR public.can_manage_orphan(_orphan)
     OR public.holds_live_circle_role(_orphan,
          ARRAY['supervisor', 'guardian', 'trustee']::public.enrollment_role[]) THEN
    RETURN (SELECT COALESCE(array_agg(a.key ORDER BY a.sort_order), '{}'::TEXT[])
              FROM public.access_scopes a WHERE a.active);
  END IF;

  _grant := COALESCE((
    SELECT r.granted_scopes FROM public.orphan_access_requests r
     WHERE r.orphan_id = _orphan AND r.requester_id = auth.uid()
       AND r.status = 'approved' AND r.expires_at > now()
     LIMIT 1), '{}'::TEXT[]);

  IF public.holds_live_circle_role(_orphan, NULL) THEN
    RETURN (SELECT COALESCE(array_agg(a.key ORDER BY a.sort_order), '{}'::TEXT[])
              FROM public.access_scopes a
             WHERE a.active
               AND (a.key <> ALL (public.circle_role_withheld_scopes()) OR a.key = ANY(_grant)));
  END IF;

  RETURN _grant;
END $fn$;
REVOKE ALL ON FUNCTION public.my_orphan_scopes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_orphan_scopes(UUID) TO authenticated;

/* والأقسام الحسّاسة تُقرأ من الجدول مباشرةً أيضاً — فالنطاق يُفرض هنا
   كما في `orphan_profile`، وإلا التفّ المرشد عليه بنداء REST. */
DROP POLICY IF EXISTS "profile_circle_read" ON public.orphan_profile_sections;
CREATE POLICY "profile_circle_read" ON public.orphan_profile_sections
  FOR SELECT TO authenticated USING (
    public.in_orphan_circle(orphan_id)
    AND (NOT public.profile_section_is_sensitive(section)
         OR public.has_orphan_scope(orphan_id, 'profile_deep'))
  );


-- الإسناد: الجهة تُسنِد، والقرار مكتوبٌ في الصفّ، والأثر في السجلّ.
CREATE OR REPLACE FUNCTION public.assign_enrollment_role(
  _enrollment UUID,
  _role TEXT,
  _person_name TEXT DEFAULT NULL,
  _person_email TEXT DEFAULT NULL,
  _person_contact TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _orphan UUID; _person UUID; _id UUID; _kind public.enrollment_role;
  _approval TEXT; _by UUID; _at TIMESTAMPTZ; _exp TIMESTAMPTZ; _why TEXT; _replaced UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'assign_enrollment_role: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  _kind := _role::public.enrollment_role;

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

  IF _person IS NULL THEN
    _approval := 'not_required';
  ELSIF public.is_admin() THEN
    _approval := 'approved'; _by := auth.uid(); _at := now();
    _exp := now() + interval '365 days'; _why := 'assigned_by_admin';
  ELSIF _kind = 'supervisor' THEN
    -- الحارس يرفض غير المعتمَد؛ فاعتماد الإدارة له هو القرار.
    _approval := 'approved'; _at := now();
    _exp := now() + interval '365 days'; _why := 'certified_supervisor';
  ELSE
    _approval := 'pending';
  END IF;

  -- الدور الحيّ السابق من النوع نفسه يُنهى لا يُحذف: التاريخ يبقى.
  WITH ended AS (
    UPDATE public.enrollment_roles
       SET ended_at = now()
     WHERE enrollment_id = _enrollment AND role = _kind AND ended_at IS NULL
    RETURNING id
  ) SELECT array_agg(id) INTO _replaced FROM ended;

  INSERT INTO public.enrollment_roles
    (enrollment_id, role, person_id, person_name, person_contact, assigned_by, note,
     approval, approved_by, approved_at, expires_at, decision_note)
  VALUES (_enrollment, _kind, _person,
          NULLIF(btrim(COALESCE(_person_name, '')), ''), _person_contact, auth.uid(), _note,
          _approval, _by, _at, _exp, _why)
  RETURNING id INTO _id;

  PERFORM public.write_audit('enrollment_role.assigned', 'enrollment_role', _id,
    jsonb_build_object('orphan_id', _orphan, 'enrollment_id', _enrollment, 'role', _kind,
                       'has_account', _person IS NOT NULL, 'approval', _approval,
                       'expires_at', _exp, 'replaced', to_jsonb(_replaced)));

  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.assign_enrollment_role(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_enrollment_role(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;


-- قرار الإدارة: اعتمادٌ لأجلٍ (أو تجديده)، أو رفضٌ يُنهي الدور.
CREATE OR REPLACE FUNCTION public.decide_enrollment_role(
  _role UUID, _decision TEXT, _days INTEGER DEFAULT 365, _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID; _exp TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إدخال أحدٍ دائرةَ الطفل قرارٌ للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'القرار إمّا قبولٌ أو رفض' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role FOR UPDATE;
  IF _r.id IS NULL OR _r.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'لا دورَ حيّاً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;
  IF _r.person_id IS NULL THEN
    RAISE EXCEPTION 'دورٌ بلا حساب لا يفتح شيئاً، فلا قرار فيه' USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _r.enrollment_id;

  IF _decision = 'approved' THEN
    _exp := now() + make_interval(days => GREATEST(LEAST(COALESCE(_days, 365), 365), 1));
    UPDATE public.enrollment_roles
       SET approval = 'approved', approved_by = auth.uid(), approved_at = now(),
           expires_at = _exp, decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _role;
  ELSE
    UPDATE public.enrollment_roles
       SET approval = 'rejected', approved_by = auth.uid(), approved_at = now(),
           ended_at = now(), decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _role;
  END IF;

  PERFORM public.write_audit('enrollment_role.' || _decision, 'enrollment_role', _role,
    jsonb_build_object('orphan_id', _orphan, 'role', _r.role, 'person_id', _r.person_id,
                       'expires_at', _exp, 'note', _note, 'was', _r.approval));

  RETURN jsonb_build_object('approval', _decision, 'expires_at', _exp);
END $fn$;
REVOKE ALL ON FUNCTION public.decide_enrollment_role(UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_enrollment_role(UUID, TEXT, INTEGER, TEXT)
  TO authenticated;


-- الإنهاء: لمن يدير الملفّ، أو للإدارة، أو لصاحب الدور يتنحّى — وبأثر.
CREATE OR REPLACE FUNCTION public.end_enrollment_role(_role UUID, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'end_enrollment_role: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _r.enrollment_id;
  IF _r.id IS NULL
     OR NOT (public.is_admin() OR public.can_manage_orphan(_orphan) OR _r.person_id = auth.uid()) THEN
    RAISE EXCEPTION 'إنهاء الدور لمن يدير الملفّ أو لصاحبه' USING ERRCODE = '42501';
  END IF;
  IF _r.ended_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.enrollment_roles SET ended_at = now() WHERE id = _role;
  PERFORM public.write_audit('enrollment_role.ended', 'enrollment_role', _role,
    jsonb_build_object('orphan_id', _orphan, 'role', _r.role, 'person_id', _r.person_id,
                       'note', NULLIF(btrim(COALESCE(_note, '')), '')));
END $fn$;
REVOKE ALL ON FUNCTION public.end_enrollment_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_enrollment_role(UUID, TEXT) TO authenticated;


/* إذن الالتحاق: الجهة توثّق إذن وليٍّ بلا حساب (ورقةٌ موقّعة). أمّا وليٌّ
   له حساب فيوافق بنفسه (`guardian_consent_enrollment`) — كتابةُ الجهة
   إذنَه نيابةً عنه هي التزوير الذي وجده التدقيق. */
CREATE OR REPLACE FUNCTION public.record_enrollment_consent(
  _role_id UUID, _document TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _r public.enrollment_roles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_enrollment_consent: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  IF _document IS NULL OR btrim(_document) = '' THEN
    RAISE EXCEPTION 'الإذن يحتاج وثيقةً تُثبته' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role_id;
  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _r.enrollment_id;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'دور غير موجود' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'توثيق الإذن لمن يدير الملف' USING ERRCODE = '42501';
  END IF;
  IF _r.role NOT IN ('guardian', 'trustee') THEN
    RAISE EXCEPTION 'الإذن للولي أو الوصي، لا لدورٍ آخر' USING ERRCODE = 'check_violation';
  END IF;
  IF _r.person_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'الوليّ صاحب الحساب يوافق بنفسه من مساحته' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollment_roles
     SET consent_at = now(), consent_document = btrim(_document)
   WHERE id = _role_id AND ended_at IS NULL;

  PERFORM public.write_audit('enrollment_role.consent_recorded', 'enrollment_role', _role_id,
    jsonb_build_object('orphan_id', _orphan, 'role', _r.role, 'document', btrim(_document)));
END $fn$;
REVOKE ALL ON FUNCTION public.record_enrollment_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_enrollment_consent(UUID, TEXT) TO authenticated;


-- وموافقة الوليّ بضغطة: لصاحب دورٍ اعتمدته الإدارة ولم ينقضِ أجله.
CREATE OR REPLACE FUNCTION public.guardian_consent_enrollment(_role UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID; _id UUID;
BEGIN
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  IF _r.id IS NULL OR _r.person_id IS DISTINCT FROM auth.uid() OR _r.role NOT IN ('guardian', 'trustee')
     OR _r.ended_at IS NOT NULL OR _r.approval <> 'approved' OR _r.expires_at <= now() THEN
    RAISE EXCEPTION 'consent_denied' USING ERRCODE = '42501';
  END IF;
  SELECT orphan_id INTO _orphan FROM public.program_enrollments WHERE id = _r.enrollment_id;
  INSERT INTO public.guardian_e_consents (user_id, orphan_id, subject, subject_ref, decision, statement)
  VALUES (auth.uid(), _orphan, 'enrollment', _role, 'granted', public.consent_statement('enrollment', 'granted'))
  RETURNING id INTO _id;
  UPDATE public.enrollment_roles SET consent_at = now(), consent_document = 'e-consent:' || _id
   WHERE id = _role;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.guardian_consent_enrollment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_consent_enrollment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guardian_children_overview()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.display_name, 'code', o.code, 'status', o.status,
    'photo_consent', o.photo_consent,
    'enrollment', (SELECT jsonb_build_object(
                     'program', pr.title, 'stage', e.stage,
                     'accepted', (SELECT count(*) FROM public.enrollment_units u
                                   WHERE u.enrollment_id = e.id AND u.status = 'accepted'),
                     'total', (SELECT count(*) FROM public.program_units pu
                                WHERE pu.program_id = e.program_id AND pu.active),
                     'next', (SELECT pu.title FROM public.program_units pu
                               LEFT JOIN public.enrollment_units u ON u.unit_id = pu.id AND u.enrollment_id = e.id
                              WHERE pu.program_id = e.program_id AND pu.active
                                AND COALESCE(u.status::text, 'pending') <> 'accepted'
                              ORDER BY pu.ordinal LIMIT 1))
                     FROM public.program_enrollments e JOIN public.programs pr ON pr.id = e.program_id
                    WHERE e.orphan_id = o.id AND e.status IN ('proposed', 'funded')
                    ORDER BY e.created_at DESC LIMIT 1),
    'pending_consents', COALESCE((SELECT jsonb_agg(jsonb_build_object('role_id', r.id, 'program', pr.title))
                          FROM public.enrollment_roles r
                          JOIN public.program_enrollments e ON e.id = r.enrollment_id
                          JOIN public.programs pr ON pr.id = e.program_id
                         WHERE e.orphan_id = o.id AND r.role IN ('guardian', 'trustee')
                           AND r.ended_at IS NULL AND r.consent_at IS NULL
                           AND r.approval = 'approved' AND r.expires_at > now()
                           AND r.person_id = auth.uid()), '[]'::jsonb)
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE o.guardian_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.guardian_children_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_children_overview() TO authenticated;


-- وصورة الالتحاق تحمل حال القرار وأجله، فترى الجهة ما ينتظر الإدارة.
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
        'assigned_at', r.assigned_at,
        'approval', r.approval,
        'expires_at', r.expires_at
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
REVOKE ALL ON FUNCTION public.enrollment_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_detail(UUID) TO authenticated;


/* تغيير الوليّ — من أيّ طريق — يُسجَّل بفاعله. والجهة لا تكتبه أصلاً
   (حارس التحديث أدناه)؛ هو للإدارة بقرارٍ يبقى أثره. */
CREATE OR REPLACE FUNCTION public.audit_orphan_guardian_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.guardian_id IS DISTINCT FROM OLD.guardian_id THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'orphan.guardian_changed', 'orphan', NEW.id,
            jsonb_build_object('from', OLD.guardian_id, 'to', NEW.guardian_id,
                               'via', public.request_channel()));
  END IF;
  RETURN NULL;
END $fn$;


-- ---------------------------------------------------------------------
-- قناة الطلب — يحملها كلّ أثرٍ يكتبه مشغّل
-- ---------------------------------------------------------------------
-- `auth.uid()` فارغٌ لمفتاح الخدمة. فالأثر يقول أيضاً من أين جاء:
-- جلسة مستخدم، أو مفتاح الخدمة (الخادم، webhook)، أو القاعدة نفسها.
--
-- و«طلب من مستخدم» يُعرف بالدور الذي ضبطه PostgREST للطلب (`SET LOCAL
-- ROLE authenticated`) لا بـ`current_user`: داخل دالّةٍ `SECURITY DEFINER`
-- يصير `current_user` مالكَها، أمّا إعداد الدور فيبقى دورَ الطلب.
CREATE OR REPLACE FUNCTION public.request_is_client()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(current_setting('role', true), '') IN ('authenticated', 'anon');
$fn$;
REVOKE ALL ON FUNCTION public.request_is_client() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_channel()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT CASE
    WHEN public.request_is_service() THEN 'service'
    WHEN auth.uid() IS NOT NULL THEN 'session'
    ELSE 'database' END;
$fn$;
REVOKE ALL ON FUNCTION public.request_channel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_orphan_guardian_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_orphan_guardian ON public.orphans;
CREATE TRIGGER trg_audit_orphan_guardian
AFTER UPDATE OF guardian_id ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.audit_orphan_guardian_change();


-- ---------------------------------------------------------------------
-- ٢) CP-02 + DB-01 — الموافقة والمراجعة لا تكتبهما الجهة بيدها
-- ---------------------------------------------------------------------
-- حارس التحديث كان لا يرى `photo_consent*` ولا `reviewed_*` ولا
-- `guardian_id`. فصارت الجهة تكتب «وافق الوليّ» و«راجعت الإدارة» بنفسها.
-- الآن: هذه كلّها لا تُكتب مباشرةً من غير الإدارة؛ والموافقة تمرّ بـ
-- `record_photo_consent` (الجهة بوثيقةٍ موثَّقة) أو `guardian_set_photo_consent`
-- (الوليّ نفسه). والصورة من خزنة المنصّة وحدها.

/* الصورة مسارٌ في خزنة الوسائط العامّة داخل مجلّد الطفل نفسه — مساراً
   مجرّداً أو رابطَ Supabase العامّ إليه. رابطٌ من نطاقٍ آخر يتتبّع من
   يفتح صفحة الطفل. */
CREATE OR REPLACE FUNCTION public.photo_url_is_platform(_orphan UUID, _url TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  SELECT _url IS NOT NULL AND position('..' IN _url) = 0 AND (
    _url ~ ('^' || _orphan::text || '/[A-Za-z0-9._-]+$')
    OR _url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/public-media/'
               || _orphan::text || '/[A-Za-z0-9._-]+$')
  );
$fn$;
REVOKE ALL ON FUNCTION public.photo_url_is_platform(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photo_url_is_platform(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_orphan_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  NEW.created_by      := auth.uid();
  NEW.funded_monthly  := 0;
  NEW.approved_at     := NULL;
  NEW.rejection_reason := NULL;
  NEW.rejection_code  := NULL;
  NEW.reviewed_by     := NULL;
  NEW.reviewed_at     := NULL;
  NEW.external_ref    := NULL;
  NEW.external_source := NULL;
  NEW.external_deleted_at := NULL;
  -- الوليّ والموافقة والصورة لا تأتي مع الملفّ: لها طرقها المحروسة.
  NEW.guardian_id       := NULL;
  NEW.photo_consent     := 'none';
  NEW.photo_consent_at  := NULL;
  NEW.photo_consent_by  := NULL;
  NEW.photo_consent_doc := NULL;
  NEW.photo_url         := NULL;

  -- الجهة تنشئ مسودة أو ترسل للمراجعة؛ لا أكثر.
  IF NEW.status NOT IN ('draft', 'submitted') THEN
    NEW.status := 'draft';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_orphan_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_orphan_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- يسمح لـ recalc_orphan_funding() بالمرور (مُشغّل متداخل).
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.funded_monthly IS DISTINCT FROM OLD.funded_monthly THEN
    RAISE EXCEPTION 'orphan: funded_monthly is trigger-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.rejection_code IS DISTINCT FROM OLD.rejection_code
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'orphan: review fields are admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.external_ref IS DISTINCT FROM OLD.external_ref
     OR NEW.external_source IS DISTINCT FROM OLD.external_source
     OR NEW.external_deleted_at IS DISTINCT FROM OLD.external_deleted_at THEN
    RAISE EXCEPTION 'orphan: external reference is integration-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'orphan: identity fields are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.guardian_id IS DISTINCT FROM OLD.guardian_id THEN
    RAISE EXCEPTION 'orphan: the guardian is set by the administration'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.photo_consent IS DISTINCT FROM OLD.photo_consent
     OR NEW.photo_consent_at IS DISTINCT FROM OLD.photo_consent_at
     OR NEW.photo_consent_by IS DISTINCT FROM OLD.photo_consent_by
     OR NEW.photo_consent_doc IS DISTINCT FROM OLD.photo_consent_doc THEN
    RAISE EXCEPTION 'orphan: photo consent is recorded through record_photo_consent'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(NEW.photo_url, '') IS NOT NULL
     AND NEW.photo_url IS DISTINCT FROM OLD.photo_url
     AND NOT public.photo_url_is_platform(NEW.id, NEW.photo_url) THEN
    RAISE EXCEPTION 'orphan: the photo must live in the platform media storage'
      USING ERRCODE = '42501';
  END IF;

  -- الاعتماد والرفض والأرشفة للإدارة وحدها.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('draft', 'rejected') AND NEW.status = 'submitted') THEN
    RAISE EXCEPTION 'orphan: status transition is admin-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_orphan_update() FROM PUBLIC, anon, authenticated;


/* الطريق الوحيد لتسجيل موافقة الصورة من غير الوليّ نفسه.
   - الوثيقة معرّفُ وثيقةٍ في ملفّ الطفل من نوع «إقرار الموافقة على الصورة»
     **وثّقتها الإدارة** — لا نصٌّ حرّ يكتبه من شاء.
   - وسحبُ الوليّ ملزِم: إن كان آخر قرارٍ للوليّ على الصورة سحباً، فلا
     تعيدها الجهة؛ يعيدها الوليّ نفسه بموافقةٍ جديدة، أو الإدارة بقرارٍ
     مسجَّل.
   - والفاعل من الجلسة (`auth.uid()`)، لا من الطلب. */
CREATE OR REPLACE FUNCTION public.record_photo_consent(
  _orphan UUID, _state TEXT, _document UUID DEFAULT NULL, _photo_url TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _admin BOOLEAN := public.is_admin(); _st public.photo_consent_state;
  _last TEXT; _doc public.orphan_documents; _url TEXT := NULLIF(btrim(COALESCE(_photo_url, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (_admin OR public.can_manage_orphan(_orphan)) THEN
    RAISE EXCEPTION 'موافقة الصورة لمن يدير الملفّ' USING ERRCODE = '42501';
  END IF;
  IF _state NOT IN ('none', 'face_hidden', 'granted', 'withdrawn') THEN
    RAISE EXCEPTION 'حالة موافقةٍ غير معروفة' USING ERRCODE = 'check_violation';
  END IF;
  _st := _state::public.photo_consent_state;

  IF _st IN ('granted', 'face_hidden') THEN
    SELECT g.decision INTO _last FROM public.guardian_e_consents g
     WHERE g.orphan_id = _orphan AND g.subject = 'photo'
     ORDER BY g.created_at DESC LIMIT 1;
    IF _last = 'withdrawn' AND NOT _admin THEN
      RAISE EXCEPTION 'سحب الوليّ موافقته؛ لا يعيدها إلا هو أو الإدارة'
        USING ERRCODE = '42501';
    END IF;

    IF _document IS NOT NULL THEN
      SELECT * INTO _doc FROM public.orphan_documents d
       WHERE d.id = _document AND d.orphan_id = _orphan AND d.kind = 'photo_consent';
      IF _doc.id IS NULL OR NOT _doc.verified THEN
        RAISE EXCEPTION 'الوثيقة إقرارُ موافقةٍ في ملفّ هذا الطفل وثّقته الإدارة'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF _st = 'granted' THEN
      RAISE EXCEPTION 'الصورة الكاملة تحتاج إقرار موافقةٍ موثَّقاً' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _url IS NOT NULL THEN
    RAISE EXCEPTION 'لا صورة بلا موافقة' USING ERRCODE = 'check_violation';
  END IF;

  IF _url IS NOT NULL AND NOT public.photo_url_is_platform(_orphan, _url) THEN
    RAISE EXCEPTION 'الصورة من خزنة المنصّة وحدها' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orphans SET
    photo_consent = _st,
    photo_consent_at = CASE WHEN _st = 'none' THEN NULL ELSE now() END,
    photo_consent_by = auth.uid(),
    photo_consent_doc = CASE WHEN _document IS NOT NULL AND _st IN ('granted', 'face_hidden')
                             THEN 'doc:' || _document END,
    photo_url = CASE WHEN _st IN ('none', 'withdrawn') THEN NULL ELSE COALESCE(_url, photo_url) END
  WHERE id = _orphan;

  PERFORM public.write_audit('orphan.photo_consent', 'orphan', _orphan,
    jsonb_build_object('state', _st, 'document', _document, 'photo_changed', _url IS NOT NULL,
                       'over_guardian_withdrawal', COALESCE(_last = 'withdrawn', false)));
END $fn$;
REVOKE ALL ON FUNCTION public.record_photo_consent(UUID, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_photo_consent(UUID, TEXT, UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٣) CP-06 — لا نشر بلا شهادة وفاةٍ وإثبات وصايةٍ وثّقتهما الإدارة
-- ---------------------------------------------------------------------
-- هذا ما تَعِد به الأسئلة الشائعة حرفياً: «كل ملف … معه شهادة وفاة
-- وإثبات وصاية على الأقل، والإدارة تفتح كل وثيقة وتوثّقها قبل النشر».
-- والشرط في القاعدة لا في الزرّ: في `review_orphan`، وفي مُشغّلٍ يحرس
-- الاعتماد المباشر بالجدول من جلسةٍ أو مفتاح خدمة.
CREATE OR REPLACE FUNCTION public.orphan_missing_publication_docs(_orphan UUID)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(k ORDER BY k), '{}'::TEXT[])
    FROM unnest(ARRAY['death_certificate', 'guardianship_proof']) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.orphan_documents d
      WHERE d.orphan_id = _orphan AND d.kind::text = k AND d.verified);
$fn$;
REVOKE ALL ON FUNCTION public.orphan_missing_publication_docs(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_orphan_publication()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _missing TEXT[];
BEGIN
  IF NEW.status NOT IN ('approved', 'fully_sponsored')
     OR (TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'fully_sponsored')) THEN
    RETURN NEW;
  END IF;
  -- طلبٌ من الخارج: جلسة مستخدمٍ (الإدارة بنداء REST) أو مفتاح الخدمة.
  -- وما يكتبه المالك من القاعدة نفسها (هجرة، صيانة) لا يمرّ هنا.
  IF NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;
  _missing := public.orphan_missing_publication_docs(NEW.id);
  IF cardinality(_missing) > 0 THEN
    RAISE EXCEPTION 'orphan: publication requires verified documents (%)', array_to_string(_missing, ', ')
      USING ERRCODE = 'check_violation',
            HINT = 'لا يُنشر ملفٌّ قبل توثيق شهادة الوفاة وإثبات الوصاية.';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_orphan_publication() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_orphan_publication ON public.orphans;
CREATE TRIGGER trg_guard_orphan_publication
BEFORE INSERT OR UPDATE OF status ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.guard_orphan_publication();

CREATE OR REPLACE FUNCTION public.review_orphan(
  _id UUID, _decision TEXT, _code public.rejection_code DEFAULT NULL, _reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev public.orphan_status; _owner UUID; _name TEXT; _missing TEXT[]; _funded BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_orphan: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'under_review') THEN
    RAISE EXCEPTION 'review_orphan: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;
  IF _decision = 'rejected' AND _code IS NULL THEN
    RAISE EXCEPTION 'review_orphan: rejection requires a structured code' USING ERRCODE = '22023';
  END IF;

  SELECT status, display_name, (monthly_need > 0 AND funded_monthly >= monthly_need)
    INTO _prev, _name, _funded
    FROM public.orphans WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_orphan: no orphan %', _id USING ERRCODE = 'P0002';
  END IF;

  IF _decision = 'approved' THEN
    _missing := public.orphan_missing_publication_docs(_id);
    IF cardinality(_missing) > 0 THEN
      RAISE EXCEPTION 'review_orphan: documents not verified (%)', array_to_string(_missing, ', ')
        USING ERRCODE = 'check_violation',
              HINT = 'وثّق شهادة الوفاة وإثبات الوصاية قبل الاعتماد.';
    END IF;
  END IF;

  /* والطفل الذي اكتمل تمويله وأُعيد للمراجعة بعد تعديلٍ يعود «مكفولاً
     بالكامل» لا «معتمَداً» — دالّة التمويل لا تمسّ حالةً خارج النشر. */
  UPDATE public.orphans SET
    status = CASE WHEN _decision = 'approved' AND COALESCE(_funded, false)
                  THEN 'fully_sponsored'::public.orphan_status
                  ELSE _decision::public.orphan_status END,
    approved_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END,
    rejection_code = CASE WHEN _decision = 'rejected' THEN _code ELSE NULL END,
    rejection_reason = CASE WHEN _decision = 'rejected' THEN _reason ELSE NULL END,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = _id;

  SELECT co.owner_id INTO _owner
    FROM public.orphans o JOIN public.care_organizations co ON co.id = o.org_id
   WHERE o.id = _id;

  IF _decision = 'approved' THEN
    PERFORM public.write_timeline(_id, 'orphan.approved', NULL);
    PERFORM public.notify(_owner, 'orphan_approved',
      'اعتُمد ملف ' || COALESCE(_name, ''),
      'صار الملف منشوراً وقابلاً للكفالة.', '/org', 'orphan', _id);
  ELSIF _decision = 'rejected' THEN
    PERFORM public.write_timeline(_id, 'orphan.rejected', _code::text);
    PERFORM public.notify(_owner, 'orphan_rejected',
      'أُعيد ملف ' || COALESCE(_name, ''),
      COALESCE(_reason, 'يُرجى مراجعة سبب الرفض في مساحة الجهة.'),
      '/org', 'orphan', _id);
  END IF;

  PERFORM public.write_audit('orphan.' || _decision, 'orphan', _id,
    jsonb_build_object('from', _prev, 'to', _decision, 'code', _code, 'reason', _reason));
END $fn$;
REVOKE ALL ON FUNCTION public.review_orphan(UUID, TEXT, public.rejection_code, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_orphan(UUID, TEXT, public.rejection_code, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٤) DB-07 + CP-10 — ما عُدِّل بعد الاعتماد يعود للمراجعة ويغيب عن العموم
-- ---------------------------------------------------------------------
-- اختير «الإعادة للمراجعة» لا «المنع»: الجهة تصحّح خطأً حقيقياً في قصّةٍ
-- أو مدينة، فلا يُغلق عليها الباب — لكنّ النصّ الجديد لا يصل أحداً قبل أن
-- تراه الإدارة. والملفّ يغيب عن الدليل والصفحة والكفالة الجديدة حتى يُعاد
-- اعتماده؛ والكفالات القائمة باقيةٌ كما هي.
--
-- يسري على جلسات المستخدمين (الجهة والوليّ) وعلى مفتاح الخدمة (المرآة)،
-- لا على الإدارة. والطفل المقفول (المكفول) يمسك حارسُه هويتَه أصلاً؛ وما
-- تبقّى (القصّة والمدينة والصورة) يعود للمراجعة هنا.
-- وحذف الطفل في المصدر (`external_deleted_at`) كذلك: يُسحب من النشر حتى
-- تقرّر الإدارة، لا يبقى معروضاً قابلاً للكفالة.
CREATE OR REPLACE FUNCTION public.resubmit_on_public_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changed TEXT[] := '{}';
BEGIN
  IF pg_trigger_depth() > 1 OR OLD.status NOT IN ('approved', 'fully_sponsored')
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() OR NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;

  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN _changed := _changed || 'display_name'::TEXT; END IF;
  IF NEW.story IS DISTINCT FROM OLD.story THEN _changed := _changed || 'story'::TEXT; END IF;
  IF NEW.city IS DISTINCT FROM OLD.city THEN _changed := _changed || 'city'::TEXT; END IF;
  IF NEW.region IS DISTINCT FROM OLD.region THEN _changed := _changed || 'region'::TEXT; END IF;
  IF NEW.country IS DISTINCT FROM OLD.country THEN _changed := _changed || 'country'::TEXT; END IF;
  IF NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN _changed := _changed || 'birth_date'::TEXT; END IF;
  IF NEW.gender IS DISTINCT FROM OLD.gender THEN _changed := _changed || 'gender'::TEXT; END IF;
  -- إزالة الصورة تقليلٌ لا يحتاج مراجعة؛ صورةٌ جديدة تحتاجها.
  IF NULLIF(NEW.photo_url, '') IS NOT NULL AND NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    _changed := _changed || 'photo_url'::TEXT;
  END IF;
  IF OLD.external_deleted_at IS NULL AND NEW.external_deleted_at IS NOT NULL THEN
    _changed := _changed || 'external_deleted_at'::TEXT;
  END IF;

  IF cardinality(_changed) = 0 THEN RETURN NEW; END IF;

  NEW.status := 'submitted';
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'orphan.sent_back_to_review', 'orphan', NEW.id,
          jsonb_build_object('fields', to_jsonb(_changed), 'from', OLD.status,
                             'via', public.request_channel()));
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.resubmit_on_public_edit() FROM PUBLIC, anon, authenticated;

-- الاسم يرتّبه بعد حارسَي القفل والتحديث (`guard_locked_orphan`،
-- `trg_guard_orphan_update`): يُفحص طلب المستخدم أولاً كما أرسله.
DROP TRIGGER IF EXISTS trg_resubmit_on_public_edit ON public.orphans;
CREATE TRIGGER trg_resubmit_on_public_edit
BEFORE UPDATE ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.resubmit_on_public_edit();


/* والتقرير الدوري: تعديل تقريرٍ معتمد يعيده «مرفوعاً» ويُسقط نشره، فلا
   يصل الكافلَ نصٌّ لم تره الإدارة. */
CREATE OR REPLACE FUNCTION public.guard_report_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by  := auth.uid();
    NEW.status      := 'submitted';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.published_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'report: review decision is admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'report: review fields are admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.orphan_id IS DISTINCT FROM OLD.orphan_id THEN
    RAISE EXCEPTION 'report: orphan_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'approved'
     AND (NEW.summary IS DISTINCT FROM OLD.summary
          OR NEW.education_note IS DISTINCT FROM OLD.education_note
          OR NEW.health_note IS DISTINCT FROM OLD.health_note
          OR NEW.living_note IS DISTINCT FROM OLD.living_note
          OR NEW.period IS DISTINCT FROM OLD.period
          OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
          OR NEW.attachments IS DISTINCT FROM OLD.attachments) THEN
    NEW.status := 'submitted';
    NEW.published_at := NULL;
    PERFORM public.write_audit('report.sent_back_to_review', 'progress_report', NEW.id,
      jsonb_build_object('orphan_id', NEW.orphan_id, 'period', NEW.period));
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_report_write() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٥) GAP-03 — المال الذي تحرّكه الإدارة يترك أثراً
-- ---------------------------------------------------------------------
-- المصادقة الثنائية للإدارة إعدادٌ في المنصّة لا في القاعدة (موثَّقٌ في
-- تقرير المرحلة). وهنا الجزء الذي في القاعدة: تفعيلُ كفالةٍ أو تغييرُ
-- حالها، وإنشاءُ صرفٍ أو تعديلُه أو حذفُه — من أيّ طريقٍ جاء (نداء REST
-- من الإدارة، دالّة، مفتاح الخدمة) — يُكتب في `audit_log` بفاعله وقناته.
-- مُشغّلٌ لا دالّة: الكتابة المباشرة هي بالضبط ما كان بلا أثر.
CREATE OR REPLACE FUNCTION public.audit_sponsorship_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_payment' THEN RETURN NULL; END IF;
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'sponsorship.created', 'sponsorship', NEW.id,
            jsonb_build_object('status', NEW.status, 'orphan_id', NEW.orphan_id,
                               'amount', NEW.amount, 'currency', NEW.currency,
                               'as_admin', public.is_admin(), 'via', public.request_channel()));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'sponsorship.status_changed', 'sponsorship', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'orphan_id', NEW.orphan_id,
                               'amount', NEW.amount, 'currency', NEW.currency,
                               'as_admin', public.is_admin(), 'via', public.request_channel()));
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.audit_sponsorship_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_sponsorship_status ON public.sponsorships;
CREATE TRIGGER trg_audit_sponsorship_status
AFTER INSERT OR UPDATE OF status ON public.sponsorships
FOR EACH ROW EXECUTE FUNCTION public.audit_sponsorship_status();

CREATE OR REPLACE FUNCTION public.audit_disbursement_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changes JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'disbursement.created', 'disbursement', NEW.id,
            jsonb_build_object('row', to_jsonb(NEW), 'as_admin', public.is_admin(),
                               'via', public.request_channel()));
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'disbursement.deleted', 'disbursement', OLD.id,
            jsonb_build_object('row', to_jsonb(OLD), 'as_admin', public.is_admin(),
                               'via', public.request_channel()));
    RETURN NULL;
  END IF;

  SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    INTO _changes
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
   WHERE n.value IS DISTINCT FROM o.value;
  IF _changes IS NOT NULL THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'disbursement.updated', 'disbursement', NEW.id,
            jsonb_build_object('changes', _changes, 'orphan_id', NEW.orphan_id,
                               'as_admin', public.is_admin(), 'via', public.request_channel()));
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.audit_disbursement_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_disbursement_write ON public.disbursements;
CREATE TRIGGER trg_audit_disbursement_write
AFTER INSERT OR UPDATE OR DELETE ON public.disbursements
FOR EACH ROW EXECUTE FUNCTION public.audit_disbursement_write();


-- ---------------------------------------------------------------------
-- ٦) DB-05 — الإثبات ملفٌّ موجود، وما وُثِّق لا يُستبدل ولا يُحذف
-- ---------------------------------------------------------------------
-- الجهة التي تؤكّد الوصول هي التي توصِل، فالإثبات إقرارٌ منها بطبيعته
-- (ولا يدّعي هذا الإصلاح غير ذلك). لكن إقراراً بملفٍّ غير موجود ليس
-- إقراراً، وإثباتاً يُبدَّل بعد أن رآه الكافل والمدقّق ليس إثباتاً. فـ:
--   - التأكيد يشترط وجود الملفّ في الخزنة، ويحفظ بصمته (eTag).
--   - والملفّ بعد التأكيد مجمَّد في الخزنة، ومثله كلّ وثيقةٍ وثّقتها
--     الإدارة ومرفقات التقرير المعتمد: لا استبدال ولا نقل ولا حذف.
--   - والوثيقة الموثَّقة لا يتغيّر مسارها ولا اسمها ولا نوعها؛ ومن أراد
--     تغييرها فالإدارة تُلغي توثيقها أولاً (`verify_document` بأثر).
ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS delivery_proof_object UUID,
  ADD COLUMN IF NOT EXISTS delivery_proof_etag TEXT;

CREATE OR REPLACE FUNCTION public.confirm_disbursement_delivery(
  _disbursement UUID, _proof_path TEXT, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.disbursements; _u UUID; _obj UUID; _etag TEXT;
BEGIN
  SELECT * INTO _d FROM public.disbursements WHERE id = _disbursement;
  IF _d.id IS NULL OR NOT (public.is_admin() OR public.owns_org(_d.org_id)) THEN
    RAISE EXCEPTION 'delivery_denied' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(_proof_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'proof_required';
  END IF;
  -- المستند في مجلّد الطفل نفسه داخل الخزنة الخاصة.
  IF split_part(_proof_path, '/', 1) <> _d.orphan_id::text THEN
    RAISE EXCEPTION 'proof_outside_orphan';
  END IF;
  IF _d.status = 'delivered' THEN RETURN; END IF;

  -- والمستند موجودٌ فعلاً — لا مسارٌ يُكتب ولا ملفّ وراءه.
  SELECT o.id, o.metadata->>'eTag' INTO _obj, _etag
    FROM storage.objects o
   WHERE o.bucket_id = 'orphan-documents' AND o.name = _proof_path;
  IF _obj IS NULL THEN
    RAISE EXCEPTION 'proof_missing' USING ERRCODE = 'no_data_found',
      HINT = 'ارفع مستند الوصول أولاً ثم أكّد.';
  END IF;

  UPDATE public.disbursements
     SET status = 'delivered', delivered_at = now(),
         delivery_proof_path = _proof_path, delivery_note = NULLIF(btrim(_note), ''),
         delivery_proof_object = _obj, delivery_proof_etag = _etag
   WHERE id = _disbursement;

  PERFORM public.write_timeline(_d.orphan_id, 'disbursement_delivered',
    to_char(COALESCE(_d.period_start, now()::date), 'YYYY-MM'));
  FOR _u IN SELECT public.orphan_sponsor_ids(_d.orphan_id) LOOP
    PERFORM public.notify(_u, 'other', 'وصلت كفالة الشهر',
      'أكّدت جهة الرعاية وصول دعم ' || to_char(COALESCE(_d.period_start, now()::date), 'YYYY-MM') || ' بمستندٍ موثّق.',
      '/dashboard', 'disbursement', _d.id);
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_disbursement_delivery(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_disbursement_delivery(UUID, TEXT, TEXT) TO authenticated;

/* هل هذا الملفّ في الخزنة شاهدٌ لا يُمسّ؟ */
CREATE OR REPLACE FUNCTION public.orphan_object_is_frozen(_bucket TEXT, _name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT _bucket = 'orphan-documents' AND (
    EXISTS (SELECT 1 FROM public.orphan_documents d
             WHERE d.storage_path = _name AND d.verified)
    OR EXISTS (SELECT 1 FROM public.disbursements x
                WHERE x.delivery_proof_path = _name AND x.status = 'delivered')
    OR EXISTS (SELECT 1 FROM public.progress_reports r
                WHERE r.status = 'approved' AND _name = ANY(r.attachments))
  );
$fn$;
REVOKE ALL ON FUNCTION public.orphan_object_is_frozen(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_object_is_frozen(TEXT, TEXT) TO authenticated;

/* سياسة التحديث القديمة (`orphan_docs_update`) كانت تسمح لمن يدير
   الملفّ بالكتابة فوق أيّ ملفّ — والحذف كذلك. الآن ما وُثِّق مجمَّد. */
DROP POLICY IF EXISTS "orphan_docs_update" ON storage.objects;
CREATE POLICY "orphan_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name)
         AND NOT public.orphan_object_is_frozen(bucket_id, name))
  WITH CHECK (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name)
              AND NOT public.orphan_object_is_frozen(bucket_id, name));

DROP POLICY IF EXISTS "orphan_docs_delete" ON storage.objects;
CREATE POLICY "orphan_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name)
         AND NOT public.orphan_object_is_frozen(bucket_id, name));

CREATE OR REPLACE FUNCTION public.guard_document_verification()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  /* الوثيقة الموثَّقة مجمَّدة على الجميع — الإدارة ومفتاح الخدمة أيضاً:
     التغيير يبدأ بإلغاء التوثيق، وهو مسجَّلٌ في الأثر. */
  IF TG_OP = 'UPDATE' AND OLD.verified AND NEW.verified
     AND (NEW.storage_path IS DISTINCT FROM OLD.storage_path
          OR NEW.file_name IS DISTINCT FROM OLD.file_name
          OR NEW.kind IS DISTINCT FROM OLD.kind
          OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
          OR NEW.orphan_id IS DISTINCT FROM OLD.orphan_id
          OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
          OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes) THEN
    RAISE EXCEPTION 'document: a verified document is frozen; un-verify it first'
      USING ERRCODE = '42501';
  END IF;

  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified THEN
      RAISE EXCEPTION 'document: verification is admin-only' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'document: verification is admin-only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_document_verification() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٧) صندوق قرارات الإدارة — الأدوار المعلّقة بنداً فيه
-- ---------------------------------------------------------------------
-- قرارٌ لا يصل الإدارة يعني أدواراً معلّقةً إلى الأبد. فتظهر في الصندوق
-- مع ما يكفي للحكم: الطفل والبرنامج والدور وصاحبه ومن أسنده.
CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'circle_role', r.id, o.display_name,
               'دورٌ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, ''),
               r.assigned_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'pending' AND r.ended_at IS NULL
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
        UNION ALL
        SELECT 'unlock', r.id, o.display_name,
               'طلب فكّ · ' || r.op || ' · ' || cardinality(r.approvals) || '/' || public.unlock_quorum(),
               r.created_at
          FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'pending' AND r.requested_by <> auth.uid() AND auth.uid() <> ALL (r.approvals)
        UNION ALL
        SELECT 'discrepancy', d.id, o.display_name, 'اختلافٌ من ' || COALESCE(d.source, 'المصدر'), d.created_at
          FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open'
      ) i), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind TEXT, _id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN (SELECT to_jsonb(c) - 'owner_id' FROM public.care_organizations c WHERE c.id = _id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    WHEN 'circle_role' THEN (SELECT jsonb_build_object(
                          'role', r.role, 'person_name', r.person_name,
                          'person_email', u.email, 'person_contact', r.person_contact,
                          'code', o.code, 'name', o.display_name, 'program', p.title,
                          'org', c.name, 'assigned_by_email', ab.email,
                          'note', r.note, 'approval', r.approval, 'created_at', r.assigned_at)
                          FROM public.enrollment_roles r
                          JOIN public.program_enrollments e ON e.id = r.enrollment_id
                          JOIN public.programs p ON p.id = e.program_id
                          JOIN public.orphans o ON o.id = e.orphan_id
                          LEFT JOIN public.care_organizations c ON c.id = o.org_id
                          LEFT JOIN auth.users u ON u.id = r.person_id
                          LEFT JOIN auth.users ab ON ab.id = r.assigned_by
                         WHERE r.id = _id)
    ELSE NULL END;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;
