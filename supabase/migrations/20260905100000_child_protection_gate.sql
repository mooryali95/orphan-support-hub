-- =====================================================================
-- حاجب الأطفال — الدليل يعرض بطاقةً، والملفّ يُطلَب ويُؤذَن فيه
-- ---------------------------------------------------------------------
-- اليوم: `authenticated` يملك `SELECT` على **كل أعمدة `orphans`**،
-- وسياسة `orphans_read_auth` تفتح كل صفٍّ منشور. أي أنّ أيّ مستخدمٍ
-- مسجَّل — بحسابٍ مجّاني أنشأه قبل دقيقة — يقرأ بنداء REST واحد:
-- قصّةَ كل طفل، وتاريخَ ميلاده، ومدينته، ومعرّفَ وليّه، ومسارَ وثيقة
-- إذن صورته، وسببَ رفض ملفّه.
--
-- والمفتاح المنشور في المتصفّح يجعل هذا النداء متاحاً لكل من يفتح
-- أدوات المطوّر. فبناء «طلب إذنٍ» فوق هذا **مسرحٌ لا حماية**: الحاجب
-- يُلتفّ عليه لا يُكسر.
--
-- فالبناء هنا من الأساس:
--
--   (١) **تضييق المنح.** يبقى للعموم ما تحتاجه بطاقةٌ ليُقرَّر بها:
--       اسمٌ مستعار، وبلدٌ ومنطقة، وفئةٌ عمرية، ومرحلةٌ دراسية، وحال
--       التمويل. وتُسحب الأعمدة المُعرِّفة: **تاريخ الميلاد الدقيق،
--       والقصّة، والصورة، والمدينة** — ومعها ما لم يكن للعموم أصلاً.
--
--   (٢) **الفئة العمرية لا تاريخ الميلاد.** الفلترة بالعمر مطلوبة،
--       وتاريخ الميلاد الدقيق مُعرِّف. فتُحسب فئةٌ في الخادم ويُحجب
--       التاريخ: يُفلتَر بالعمر ولا يُعرف اليوم.
--
--   (٣) **الطلب والإذن.** من أراد الملفّ كاملاً طلبه **بسبب مكتوب**،
--       فتقرّر الإدارة. والإذن **يَنقضي** — إذنٌ أبديّ نسخةٌ دائمة من
--       ملفّ طفل — و**يُسحَب** متى شاءت الإدارة.
--
--   (٤) **من له علاقة قائمة لا يستأذن.** الجهة الراعية، والوليّ،
--       والمشرف وأصحاب الأدوار، والكافل الحاليّ — هؤلاء علاقتهم هي
--       الإذن. والاستئذان هنا حاجزٌ بلا فائدة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) تضييق المنح — الأساس الذي بدونه الباقي زينة
-- ---------------------------------------------------------------------
REVOKE SELECT ON public.orphans FROM anon, authenticated;

GRANT SELECT (
  id, code, display_name, gender, country, region, education_stage,
  monthly_need, funded_monthly, currency, status, org_id, created_at
) ON public.orphans TO anon, authenticated;

/* وللمسجَّل أعمدةُ إدارةٍ لا تُعرِّف طفلاً: متى اعتُمد، ومتى عُدّل،
   وسببُ الرفض، وحالُ إذن الصورة. أمّا `guardian_id` و`created_by`
   و`reviewed_by` و`photo_consent_by` فتبقى محجوبة — وهي **معرّفات
   بالغين**، وكشفُها يربط شخصاً حقيقياً بطفلٍ بعينه. */
GRANT SELECT (
  approved_at, updated_at, rejection_code, rejection_reason, photo_consent
) ON public.orphans TO authenticated;

/* `UPDATE` تبقى كما هي: سياسة `orphans_update` تحصرها بمن يملك الملفّ،
   والكتابة بلا قراءة لا تكشف شيئاً — و`WHERE` على عمودٍ محجوب يحتاج
   `SELECT` عليه فيُرفض. */


-- ---------------------------------------------------------------------
-- 2) الفئة العمرية — يُفلتَر بالعمر ولا يُعرف اليوم
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.age_band AS ENUM
    ('under_6', 'age_6_11', 'age_12_14', 'age_15_17', 'age_18_plus', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.age_band_of(_birth DATE)
RETURNS public.age_band LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN _birth IS NULL THEN 'unknown'
    WHEN _birth > CURRENT_DATE THEN 'unknown'
    ELSE CASE
      WHEN (CURRENT_DATE - _birth) / 365 < 6  THEN 'under_6'
      WHEN (CURRENT_DATE - _birth) / 365 < 12 THEN 'age_6_11'
      WHEN (CURRENT_DATE - _birth) / 365 < 15 THEN 'age_12_14'
      WHEN (CURRENT_DATE - _birth) / 365 < 18 THEN 'age_15_17'
      ELSE 'age_18_plus'
    END
  END::public.age_band;
$fn$;
GRANT EXECUTE ON FUNCTION public.age_band_of(DATE) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) طلبات الاطّلاع
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.access_status AS ENUM
    ('pending', 'approved', 'rejected', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orphan_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /* سببٌ مكتوب: «لماذا تريد ملفّ هذا الطفل؟» سؤالٌ من حقّ الطفل أن
     يُسأل، وجوابُه أثرٌ يُراجَع. */
  reason TEXT NOT NULL,
  status public.access_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  /* الإذن ينقضي: إذنٌ أبديّ نسخةٌ دائمة من ملفّ طفل. */
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_access_reason_written CHECK (length(btrim(reason)) >= 20),
  CONSTRAINT ck_access_decision_signed CHECK (
    status = 'pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT ck_access_approval_expires CHECK (
    status <> 'approved' OR expires_at IS NOT NULL
  )
);

/* طلبٌ حيٌّ واحد لكل (ملفّ، طالب): تكرارُ الطلب ضغطٌ على الإدارة لا حقّ. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_access_request
  ON public.orphan_access_requests(orphan_id, requester_id)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_access_requests_orphan
  ON public.orphan_access_requests(orphan_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester
  ON public.orphan_access_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_pending
  ON public.orphan_access_requests(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_access_requests_decided_by
  ON public.orphan_access_requests(decided_by) WHERE decided_by IS NOT NULL;

GRANT SELECT ON public.orphan_access_requests TO authenticated;
GRANT ALL ON public.orphan_access_requests TO service_role;
ALTER TABLE public.orphan_access_requests ENABLE ROW LEVEL SECURITY;

/* يقرؤها صاحبها والإدارة. ولا يكتبها أحدٌ مباشرةً: الكتابة من الدوالّ
   وحدها، لأن الهوية والقرار فيها. */
DROP POLICY IF EXISTS "access_requests_read" ON public.orphan_access_requests;
CREATE POLICY "access_requests_read" ON public.orphan_access_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());


-- ---------------------------------------------------------------------
-- 4) الحاجب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_orphan_detail(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.can_manage_orphan(_orphan)
    OR public.sponsors_orphan(_orphan)
    OR EXISTS (
      SELECT 1 FROM public.orphans o
       WHERE o.id = _orphan AND o.guardian_id = auth.uid()
    )
    /* أصحاب الأدوار حول برنامجه: مشرفٌ ووليٌّ ووصيٌّ وفقيه. */
    OR EXISTS (
      SELECT 1 FROM public.enrollment_roles r
        JOIN public.program_enrollments e ON e.id = r.enrollment_id
       WHERE e.orphan_id = _orphan
         AND r.person_id = auth.uid()
         AND r.ended_at IS NULL
    )
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


-- ---------------------------------------------------------------------
-- 5) الطلب والقرار
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_orphan_access(_orphan UUID, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _published BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'request_orphan_access: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  SELECT true INTO _published FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF _published IS NOT TRUE THEN
    RAISE EXCEPTION 'لا ملفّ منشوراً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  /* من له علاقةٌ قائمة لا يستأذن: حاجزٌ بلا فائدة، وطابورٌ بلا معنى. */
  IF public.can_view_orphan_detail(_orphan) THEN
    RETURN jsonb_build_object('status', 'approved', 'already', true);
  END IF;

  INSERT INTO public.orphan_access_requests (orphan_id, requester_id, reason)
  VALUES (_orphan, auth.uid(), btrim(_reason))
  RETURNING id INTO _id;

  PERFORM public.write_audit('orphan.access_requested', 'orphan', _orphan,
    jsonb_build_object('request', _id));

  RETURN jsonb_build_object('status', 'pending', 'request_id', _id);
END $fn$;
REVOKE ALL ON FUNCTION public.request_orphan_access(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_orphan_access(UUID, TEXT) TO authenticated;


/* القرار للإدارة وحدها — لا لجهة الرعاية: جهةٌ تأذن في ملفّاتها كجهةٍ
   تعتمد نفسها، والقاعدة نفسها التي بُني عليها اعتماد المشرفين. */
CREATE OR REPLACE FUNCTION public.decide_orphan_access(
  _request UUID,
  _decision TEXT,
  _note TEXT DEFAULT NULL,
  _days INTEGER DEFAULT 180
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _st public.access_status; _exp TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'الإذن بالاطّلاع للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'القرار إمّا قبولٌ أو رفض' USING ERRCODE = 'check_violation';
  END IF;

  _st := _decision::public.access_status;
  IF _st = 'approved' THEN
    _exp := now() + make_interval(days => GREATEST(LEAST(COALESCE(_days, 180), 365), 1));
  END IF;

  UPDATE public.orphan_access_requests
     SET status = _st, decided_by = auth.uid(), decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(_note, '')), ''),
         expires_at = _exp
   WHERE id = _request AND status = 'pending'
  RETURNING orphan_id INTO _orphan;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'لا طلبَ معلّقاً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_audit('orphan.access_' || _decision, 'orphan', _orphan,
    jsonb_build_object('request', _request, 'expires_at', _exp));

  RETURN jsonb_build_object('status', _st, 'expires_at', _exp);
END $fn$;
REVOKE ALL ON FUNCTION public.decide_orphan_access(UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_orphan_access(UUID, TEXT, TEXT, INTEGER)
  TO authenticated;


/* والسحب بعد الإذن: إذنٌ لا يُسحب ليس إذناً بل تسليم. */
CREATE OR REPLACE FUNCTION public.revoke_orphan_access(_request UUID, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'سحب الإذن للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orphan_access_requests
     SET status = 'revoked', decided_by = auth.uid(), decided_at = now(),
         decision_note = COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''), decision_note)
   WHERE id = _request AND status = 'approved'
  RETURNING orphan_id INTO _orphan;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'لا إذنَ قائماً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_audit('orphan.access_revoked', 'orphan', _orphan,
    jsonb_build_object('request', _request));

  RETURN jsonb_build_object('revoked', true);
END $fn$;
REVOKE ALL ON FUNCTION public.revoke_orphan_access(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_orphan_access(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 6) الطبقة الأولى — البطاقة، وما يُفلتَر به
-- ---------------------------------------------------------------------
-- ما يكفي ليقرّر الزائر أن يعرف أكثر، ولا يكفي ليعرف الطفل: اسمٌ مستعار
-- وبلدٌ ومنطقة وفئةٌ عمرية ومرحلةٌ دراسية وحالُ التمويل وحالُ البرنامج.
-- ولا قصّة، ولا صورة، ولا مدينة، ولا تاريخ ميلاد.
CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,     -- open | full | any
  _building BOOLEAN DEFAULT NULL, -- برنامجه قائم من عدمه
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',   -- waiting | closest | newest
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب هنا لا في العميل: `ILIKE` بنصٍّ خام يجعل «%» تعني
     «كل شيء». و**التهريب لا الحذف**: حذفُ محارف البدل يحوّل بحثاً من
     «%» وحده إلى فراغٍ، والفراغ يعني «بلا فلترة» — فيعيد البحثُ عن
     محرف بدلٍ كلَّ الملفّات، وهو نقيض المقصود. أمّا التهريب فيجعلها
     محرفاً عادياً يُبحث عنه فلا يُطابق شيئاً. */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country, o.region,
           o.education_stage, o.monthly_need, o.funded_monthly, o.currency,
           o.status, o.org_id, o.created_at,
           public.age_band_of(o.birth_date) AS age_band,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
               JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building,
           GREATEST(0, (now()::date - COALESCE(o.approved_at, o.created_at)::date))::INTEGER
             AS waiting_days
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما: البحث بالمدينة كان يكشف
          ما حجبناه — يُجرَّب اسمُ مدينةٍ فيُعرف من فيها. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN COALESCE(_sort,'waiting') = 'waiting' THEN f.waiting_days END DESC,
          f.id
      ) AS ord
        FROM filtered f
       ORDER BY ord
       LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 60)
      OFFSET GREATEST(COALESCE(_offset, 0), 0)
    ) t;

  RETURN jsonb_build_object('rows', _rows, 'total', _total);
END $fn$;
REVOKE ALL ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT)
  TO anon, authenticated;


/* خيارات الفلترة تُقرأ من المنشور نفسه لا من قائمةٍ مكتوبة تشيخ بصمت. */
CREATE OR REPLACE FUNCTION public.orphan_filter_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT o.country) FROM public.orphans o
                            WHERE o.status IN ('approved','fully_sponsored')
                              AND COALESCE(btrim(o.country), '') <> ''), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT o.region) FROM public.orphans o
                          WHERE o.status IN ('approved','fully_sponsored')
                            AND COALESCE(btrim(o.region), '') <> ''), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(DISTINCT o.education_stage) FROM public.orphans o
                         WHERE o.status IN ('approved','fully_sponsored')
                           AND COALESCE(btrim(o.education_stage), '') <> ''), '[]'::jsonb)
  );
$fn$;
REVOKE ALL ON FUNCTION public.orphan_filter_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_filter_options() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 7) الطبقة الثانية — الملفّ، خلف الحاجب
-- ---------------------------------------------------------------------
-- تُعيد البطاقة دائماً، والتفاصيل عند الإذن وحده، ومعها **حالُ إذنك**
-- ليعرف الطالب أين طلبه بدل أن يظنّ العطبَ منعاً.
CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o RECORD; _may BOOLEAN; _acc JSONB; _out JSONB;
BEGIN
  SELECT * INTO _o FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  _may := public.can_view_orphan_detail(_orphan);

  SELECT COALESCE(jsonb_build_object(
           'request_id', a.id, 'status', a.status,
           'expires_at', a.expires_at, 'decision_note', a.decision_note,
           'created_at', a.created_at),
         'null'::jsonb)
    INTO _acc
    FROM public.orphan_access_requests a
   WHERE a.orphan_id = _orphan AND a.requester_id = auth.uid()
   ORDER BY a.created_at DESC LIMIT 1;

  _out := jsonb_build_object(
    'id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
    'gender', _o.gender, 'country', _o.country, 'region', _o.region,
    'education_stage', _o.education_stage, 'age_band', public.age_band_of(_o.birth_date),
    'monthly_need', _o.monthly_need, 'funded_monthly', _o.funded_monthly,
    'currency', _o.currency, 'status', _o.status, 'org_id', _o.org_id,
    'created_at', _o.created_at,
    'may_view_detail', _may,
    'access', COALESCE(_acc, 'null'::jsonb)
  );

  IF _may THEN
    _out := _out || jsonb_build_object(
      'detail', jsonb_build_object(
        'birth_date', _o.birth_date,
        'city', _o.city,
        'story', _o.story,
        /* الصورة مشروطةٌ بإذنها الخاصّ: إذنُ الاطّلاع لا يُنشئ إذناً
           بالصورة، وهما إذنان مختلفان لصاحبين مختلفين. والحالتان
           المسموحتان هما ما تقبله `guard_photo_consent` نفسها —
           `granted` و`face_hidden` — فتضييقٌ هنا دونها يُخفي صوراً
           مأذوناً بها بلا سبب.

           وهذه طبقةٌ ثانية لا أولى: الحارس والمُشغّل يمنعان أصلاً
           وجودَ صورةٍ بلا إذن، فلا حالةَ يمكن بلوغها لتُفحص بها هذه
           الحالةُ وحدها. تبقى لأنها تكلّف سطراً وتحمي لو سقط ما قبلها. */
        'photo_url', CASE WHEN _o.photo_consent IN ('granted', 'face_hidden')
                          THEN _o.photo_url END,
        'needs', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'category', n.category, 'title', n.title,
            'monthly_amount', n.monthly_amount) ORDER BY n.monthly_amount DESC)
          FROM public.orphan_needs n WHERE n.orphan_id = _orphan), '[]'::jsonb)
      ));
  END IF;

  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_view(UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 8) طابور الإدارة، وطلباتي
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_access_requests(_status TEXT DEFAULT 'pending')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'طابور الأذونات للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'orphan_id', o.id,
      'orphan_name', o.display_name,
      'orphan_code', o.code,
      'requester_email', u.email,
      'reason', a.reason,
      'status', a.status,
      'created_at', a.created_at,
      'decided_at', a.decided_at,
      'expires_at', a.expires_at,
      /* هل يكفل هذا الطالبُ أحداً؟ سياقٌ يُقرَّر به، لا حكم. */
      'sponsorships', (SELECT count(*) FROM public.sponsorships s
                        WHERE s.sponsor_id = a.requester_id
                          AND s.status IN ('active', 'paused'))
    ) ORDER BY a.created_at)
    FROM public.orphan_access_requests a
    JOIN public.orphans o ON o.id = a.orphan_id
    JOIN auth.users u ON u.id = a.requester_id
   WHERE COALESCE(_status, 'pending') = 'any' OR a.status = _status::public.access_status
  ), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_access_requests(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_access_requests(TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.my_access_requests()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'orphan_id', a.orphan_id, 'status', a.status,
    'reason', a.reason, 'decision_note', a.decision_note,
    'expires_at', a.expires_at, 'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM public.orphan_access_requests a
  WHERE a.requester_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.my_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access_requests() TO authenticated;


-- ---------------------------------------------------------------------
-- 9) سدّ الأبواب الخلفية — كل مُرشِّحٍ كان يُعيد ما حجبناه
-- ---------------------------------------------------------------------
-- حاجبٌ يُغلق البابَ ويترك الشبّاك ليس حاجباً. والمرشِّحان كانا يُعيدان
-- `story` و`photo_url` و`city` و`birth_date` — أي كلَّ ما سُحب للتوّ.
-- والأول `SECURITY DEFINER` فكان يلتفّ على المنح نفسه.

DROP FUNCTION IF EXISTS public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT);
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _limit INT DEFAULT 12
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, gender TEXT,
  country TEXT, region TEXT, education_stage TEXT, age_band public.age_band,
  monthly_need NUMERIC, funded_monthly NUMERIC, currency TEXT,
  status public.orphan_status, org_id UUID, created_at TIMESTAMPTZ,
  gap NUMERIC, building BOOLEAN, completes BOOLEAN, in_region BOOLEAN,
  waiting_days INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT COALESCE(_budget, p.monthly_budget) AS budget,
           COALESCE(NULLIF(btrim(COALESCE(_region, '')), ''), p.preferred_region) AS region
      FROM (SELECT NULL::UUID) z
      LEFT JOIN public.profiles p ON p.id = auth.uid()
  ),
  cand AS (
    SELECT o.*,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
              JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id
                AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building
      FROM public.orphans o
     WHERE o.status = 'approved'
       AND (o.monthly_need - o.funded_monthly) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.sponsorships s
          WHERE s.orphan_id = o.id
            AND s.sponsor_id = auth.uid()
            AND s.status IN ('pending_payment', 'active', 'paused')
       )
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.region,
         c.education_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status, c.org_id,
         c.created_at,
         c.gap,
         c.building,
         (me.budget IS NOT NULL AND c.gap <= me.budget) AS completes,
         (me.region IS NOT NULL AND c.region = me.region) AS in_region,
         GREATEST(0, (now()::date - COALESCE(c.approved_at, c.created_at)::date))::INTEGER
    FROM cand c CROSS JOIN me
   ORDER BY
     c.building DESC,
     (me.budget IS NOT NULL AND c.gap <= me.budget) DESC,
     (me.region IS NOT NULL AND c.region = me.region) DESC,
     COALESCE(c.approved_at, c.created_at) ASC,
     c.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 48);
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  TO authenticated;


DROP FUNCTION IF EXISTS public.suggest_orphans_for_amount(NUMERIC, UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_amount(
  _amount NUMERIC, _exclude UUID DEFAULT NULL, _limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, country TEXT, region TEXT,
  education_stage TEXT, currency TEXT,
  monthly_need NUMERIC, funded_monthly NUMERIC, gap NUMERIC
)
/* تبقى `SECURITY INVOKER` كما بُنيت، ولذلك **بلا فئةٍ عمرية**:
   حسابُها يقرأ `birth_date` وقد حُجب، ودالّةٌ بحقوق المستدعي لا تقرؤه.
   وتحويلها إلى `DEFINER` لأجل حقلٍ لا يحتاجه اقتراحُ فائضٍ من ثلاثة
   أسطر توسيعُ صلاحيةٍ بلا داعٍ. */
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT o.id, o.code, o.display_name, o.country, o.region,
         o.education_stage, o.currency,
         o.monthly_need, o.funded_monthly,
         (o.monthly_need - o.funded_monthly) AS gap
    FROM public.orphans o
   WHERE o.status = 'approved'
     AND o.monthly_need > o.funded_monthly
     AND (_exclude IS NULL OR o.id <> _exclude)
   ORDER BY abs((o.monthly_need - o.funded_monthly) - _amount), o.created_at
   LIMIT LEAST(GREATEST(_limit, 1), 10);
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_amount(NUMERIC, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_amount(NUMERIC, UUID, INTEGER)
  TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 10) شاشات من يملك الملفّ — تمرّ بدالّة لا بمنحٍ عريض
-- ---------------------------------------------------------------------
-- منحُ الأعمدة دورٌ كامل لا صفٌّ بعينه، فلا يُقال «للجهة قصّةُ ملفّاتها
-- وحدها» بالمنح. فتمرّ بدالّةٍ تفحص الصلة صفّاً صفّاً.
CREATE OR REPLACE FUNCTION public.guardian_orphans()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'code', o.code, 'display_name', o.display_name,
    'city', o.city, 'country', o.country, 'region', o.region,
    'status', o.status, 'monthly_need', o.monthly_need,
    'funded_monthly', o.funded_monthly, 'currency', o.currency,
    'photo_consent', o.photo_consent, 'created_at', o.created_at
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE o.guardian_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.guardian_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_orphans() TO authenticated;


CREATE OR REPLACE FUNCTION public.org_orphans()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'code', o.code, 'display_name', o.display_name,
    'city', o.city, 'country', o.country, 'region', o.region,
    'status', o.status, 'monthly_need', o.monthly_need,
    'funded_monthly', o.funded_monthly, 'currency', o.currency,
    'created_at', o.created_at, 'rejection_code', o.rejection_code,
    'rejection_reason', o.rejection_reason, 'photo_consent', o.photo_consent
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE auth.uid() IS NOT NULL AND public.owns_org(o.org_id);
$fn$;
REVOKE ALL ON FUNCTION public.org_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_orphans() TO authenticated;
