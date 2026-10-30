-- ملف نشر كهاتين — كل الهجرات بعد 20260904100000
-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: 2026-10-30T14:26Z
\set ON_ERROR_STOP on
BEGIN;

-- >>> migration 20260905100000 child_protection_gate
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260905100000') THEN
    RAISE EXCEPTION 'الهجرة 20260905100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260905100000', 'child_protection_gate');

-- >>> migration 20260906100000 integration_api
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260906100000') THEN
    RAISE EXCEPTION 'الهجرة 20260906100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- التكامل مع المنصّات الأخرى — استيرادٌ لا يَنشر، وقراءةٌ لا تلتفّ
-- ---------------------------------------------------------------------
-- `api_clients` في المخطّط منذ أول هجرة ولا يستدعيها سطرٌ واحد، و
-- `external_ref` و`external_source` عمودان لا يكتبهما أحد. أي أنّ
-- التكامل **هيكلٌ بلا جسد** — كما كانت المطابقة قبلها.
--
-- وأربعة قرارات تحكم هذه الطبقة:
--
-- (١) **المستورَد لا يُنشَر.** ملفٌّ يدخل من منصّةٍ أخرى يقف عند
--     `under_review` مهما قال المُرسِل. والاعتماد قرارُ إدارتنا بعد
--     مراجعة وثائقه — وإلا صار بابُ التكامل باباً لنشر ملفّات أطفالٍ
--     لم يرها أحد.
--
-- (٢) **المفتاح لا يلتفّ على حاجب الأطفال.** القراءة من الـAPI تُعيد
--     **البطاقة** كما يراها الزائر: لا قصّة ولا صورة ولا مدينة ولا
--     تاريخ ميلاد. ومفتاحُ شريكٍ ليس إذناً برؤية ملفّ طفل؛ الإذن يُطلَب
--     ويُمنح لشخصٍ بعينه.
--
-- (٣) **السرّ مُجزَّأ لا مخزَّن.** يُخزَّن تجزيءُ السرّ لا السرّ، فتسرُّبُ
--     قاعدتنا لا يُمكّن أحداً من انتحال شريك. والتجزيء في التطبيق لا
--     هنا: مكانٌ واحد للتعمية خيرٌ من اثنين.
--
-- (٤) **الاستيراد لا يُحرّك احتياج ملفٍّ معتمَد.** كافلٌ التزم بمبلغٍ
--     على احتياجٍ معلن، فتغييرُه من منصّةٍ خارجية نقلٌ للمرمى بعد
--     التسديد. تُقبل التعديلات الوصفية ويُردّ الباقي **مع بيان سببه**.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) عميل التكامل
-- ---------------------------------------------------------------------
ALTER TABLE public.api_clients
  /* ملحٌ لكل عميل: تجزيءٌ بلا ملحٍ يُكسر بجداول محسوبة مسبقاً. */
  ADD COLUMN IF NOT EXISTS secret_salt TEXT,
  /* بادئة السرّ تُعرض في القوائم ليُعرف المفتاح دون كشفه. */
  ADD COLUMN IF NOT EXISTS secret_prefix TEXT,
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['orphans:read'],
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_api_clients_org ON public.api_clients(org_id)
  WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_clients_created_by ON public.api_clients(created_by)
  WHERE created_by IS NOT NULL;

/* نطاقٌ غير معروف يُرفض: نطاقٌ مكتوبٌ خطأً يصير صلاحيةً صامتة. */
ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_api_scopes_known;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_api_scopes_known CHECK (
  scopes <@ ARRAY['orphans:read', 'orphans:import']
  AND cardinality(scopes) > 0
);

/* ومن يستورد يحتاج جهةً مسؤولة: ملفٌّ بلا جهةٍ معتمدة لا صاحب له. */
ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_api_import_needs_org;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_api_import_needs_org CHECK (
  NOT ('orphans:import' = ANY(scopes)) OR org_id IS NOT NULL
);


-- ---------------------------------------------------------------------
-- 2) سجلّ الاستيراد — ولا تكرار
-- ---------------------------------------------------------------------
-- الجدول قائمٌ منذ أول هجرة بأعمدة العدّ (`received_count` وأخواتها)،
-- فيُوسَّع ولا يُبنى موازٍ له: جدولان لمعنى واحد يفترقان بعد أسبوع.
ALTER TABLE public.api_import_jobs
  /* مفتاح التكرار: الشبكة تُعيد الإرسال عند أي شكّ، فتُعاد النتيجة
     الأولى بدل إنشاء ملفّاتٍ مكرّرة لأطفالٍ حقيقيين. */
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_digest TEXT,
  ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;

/* الفرادة جزئية: الصفوف القديمة بلا مفتاحِ تكرارٍ تبقى كما هي. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_idempotency
  ON public.api_import_jobs(client_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_jobs_client
  ON public.api_import_jobs(client_id, created_at DESC);


-- ---------------------------------------------------------------------
-- 3) الحارس: المستورَد لا يُنشَر
-- ---------------------------------------------------------------------
-- الاستيراد يمرّ بـ`service_role`، وهي تتجاوز RLS وتتجاوز حرّاس
-- المرحلة 0 (فهي تُعفي ما ليس `authenticated`/`anon`). فلو بقي الشرط
-- في الدالّة وحدها لكان سطراً واحداً يفصل بين «ملفّ للمراجعة» و«ملفّ
-- منشور لطفلٍ لم يره أحد». والحارس هنا **لا يُعفي أحداً**.
CREATE OR REPLACE FUNCTION public.guard_imported_orphan()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF COALESCE(NEW.external_source, '') = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    /* يدخل للمراجعة دائماً، وبلا تمويلٍ ولا اعتماد مهما أرسل المُرسِل. */
    NEW.status := 'under_review';
    NEW.approved_at := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.funded_monthly := 0;
    RETURN NEW;
  END IF;

  /* وعلى التحديث لا يُفرض شيء: دالّة الاستيراد لا تكتب `status` أصلاً،
     والاعتماد يمرّ بمسار المراجعة وحده. وفرضُ الحالة هنا كان يمنع
     الإدارةَ من اعتماد ملفٍّ مستورَد — وهو عين ما نريده أن يحدث. */
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_imported_orphan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_imported_orphan ON public.orphans;
CREATE TRIGGER trg_guard_imported_orphan
BEFORE INSERT OR UPDATE ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.guard_imported_orphan();


-- ---------------------------------------------------------------------
-- 4) الاستيراد
-- ---------------------------------------------------------------------
-- يُنادى من الخادم بـ`service_role` بعد التحقّق من المفتاح. والمفتاح
-- يُمرَّر معرّفَ عميلٍ لا ادّعاءً: الجهة تُقرأ من العميل لا من الحمولة،
-- فلا يكتب شريكٌ في ملفّات شريكٍ آخر.
CREATE OR REPLACE FUNCTION public.import_orphan_record(_client UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _org UUID; _source TEXT; _ref TEXT; _existing public.orphans%ROWTYPE;
  _id UUID; _ignored TEXT[] := '{}'; _action TEXT;
BEGIN
  SELECT c.org_id, COALESCE(NULLIF(btrim(c.client_key), ''), c.id::text)
    INTO _org, _source
    FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL
     AND 'orphans:import' = ANY(c.scopes);

  IF _org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.care_organizations o
                  WHERE o.id = _org AND o.status = 'approved') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'org_not_approved');
  END IF;

  _ref := NULLIF(btrim(COALESCE(_payload->>'external_ref', '')), '');
  IF _ref IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'external_ref_required');
  END IF;

  SELECT * INTO _existing FROM public.orphans o
   WHERE o.org_id = _org AND o.external_source = _source AND o.external_ref = _ref;

  IF _existing.id IS NULL THEN
    /* الاسم والبلد إلزاميان عند الإنشاء. وللعمود قيمةٌ افتراضية
       (`'SA'`)، فلو تُرك لها لظهر طفلٌ أردنيّ تحت السعودية في الفلترة —
       وفلترةٌ تكذب أسوأ من فلترةٍ ناقصة. والمنصّة الشريكة تعرف بلد
       مستفيدها دائماً. */
    IF NULLIF(btrim(COALESCE(_payload->>'display_name', '')), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'display_name_required',
                                'external_ref', _ref);
    END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'country', '')), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'country_required',
                                'external_ref', _ref);
    END IF;

    INSERT INTO public.orphans (
      code, org_id, external_source, external_ref, display_name, gender,
      birth_date, city, country, region, story, education_stage,
      monthly_need, currency, status
    ) VALUES (
      public.next_orphan_code(), _org, _source, _ref,
      _payload->>'display_name',
      COALESCE(_payload->>'gender', 'male'),
      NULLIF(_payload->>'birth_date', '')::date,
      NULLIF(_payload->>'city', ''),
      btrim(_payload->>'country'),
      NULLIF(_payload->>'region', ''),
      NULLIF(_payload->>'story', ''),
      NULLIF(_payload->>'education_stage', ''),
      COALESCE(NULLIF(_payload->>'monthly_need', '')::numeric, 0),
      COALESCE(NULLIF(_payload->>'currency', ''), 'USD'),
      'under_review'
    )
    RETURNING id INTO _id;
    _action := 'created';
  ELSE
    _id := _existing.id;
    _action := 'updated';

    /* ملفٌّ معتمَد: تُقبل الأوصاف ويُردّ الاحتياج — كافلٌ التزم على
       رقمٍ معلن، وتغييرُه من الخارج نقلٌ للمرمى بعد التسديد. */
    IF _existing.status IN ('approved', 'fully_sponsored')
       AND _payload ? 'monthly_need'
       AND COALESCE(NULLIF(_payload->>'monthly_need', '')::numeric, _existing.monthly_need)
           <> _existing.monthly_need THEN
      _ignored := array_append(_ignored, 'monthly_need');
    END IF;

    UPDATE public.orphans o SET
      display_name = COALESCE(NULLIF(_payload->>'display_name', ''), o.display_name),
      gender = COALESCE(NULLIF(_payload->>'gender', ''), o.gender),
      birth_date = COALESCE(NULLIF(_payload->>'birth_date', '')::date, o.birth_date),
      city = COALESCE(NULLIF(_payload->>'city', ''), o.city),
      country = COALESCE(NULLIF(_payload->>'country', ''), o.country),
      region = COALESCE(NULLIF(_payload->>'region', ''), o.region),
      story = COALESCE(NULLIF(_payload->>'story', ''), o.story),
      education_stage = COALESCE(NULLIF(_payload->>'education_stage', ''), o.education_stage),
      monthly_need = CASE
        WHEN 'monthly_need' = ANY(_ignored) THEN o.monthly_need
        ELSE COALESCE(NULLIF(_payload->>'monthly_need', '')::numeric, o.monthly_need)
      END
     WHERE o.id = _id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'action', _action, 'id', _id,
    'external_ref', _ref,
    'status', (SELECT status FROM public.orphans WHERE id = _id),
    'ignored_fields', to_jsonb(_ignored)
  );
END $fn$;
REVOKE ALL ON FUNCTION public.import_orphan_record(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) قراءة الشريك — البطاقة لا الملفّ
-- ---------------------------------------------------------------------
-- تُعيد ما يراه الزائر حرفياً: مفتاحُ شريكٍ ليس إذناً برؤية ملفّ طفل.
CREATE OR REPLACE FUNCTION public.api_orphan_cards(
  _client UUID,
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,
  _limit INT DEFAULT 50,
  _offset INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _ok BOOLEAN;
BEGIN
  SELECT true INTO _ok FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL
     AND 'orphans:read' = ANY(c.scopes);
  IF _ok IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted');
  END IF;

  RETURN jsonb_build_object('ok', true) || public.list_orphan_cards(
    _country => _country, _region => _region, _age_band => _age_band,
    _gender => _gender, _funding => _funding,
    _limit => LEAST(GREATEST(COALESCE(_limit, 50), 1), 60),
    _offset => GREATEST(COALESCE(_offset, 0), 0)
  );
END $fn$;
REVOKE ALL ON FUNCTION public.api_orphan_cards(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT)
  FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6) إدارة المفاتيح — للإدارة وحدها
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_api_clients()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'مفاتيح التكامل للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'client_key', c.client_key,
      'secret_prefix', c.secret_prefix, 'scopes', to_jsonb(c.scopes),
      'org_id', c.org_id, 'org_name', o.name,
      'active', c.active AND c.revoked_at IS NULL,
      'created_at', c.created_at, 'last_used_at', c.last_used_at,
      'last_import_at', c.last_import_at,
      'imports', (SELECT count(*) FROM public.api_import_jobs j WHERE j.client_id = c.id),
      'orphans', (SELECT count(*) FROM public.orphans x
                   WHERE x.external_source = c.client_key AND x.org_id = c.org_id)
    ) ORDER BY c.created_at DESC)
    FROM public.api_clients c
    LEFT JOIN public.care_organizations o ON o.id = c.org_id
  ), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_api_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_api_clients() TO authenticated;


/* الإبطال فوريّ: مفتاحٌ مسرَّب يُبطَل الآن لا بعد انتهاء مدّة. */
CREATE OR REPLACE FUNCTION public.revoke_api_client(_client UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إبطال المفاتيح للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  UPDATE public.api_clients
     SET active = false, revoked_at = now()
   WHERE id = _client AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا مفتاح قائماً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_audit('api_client.revoked', 'api_client', _client, '{}'::jsonb);
  RETURN jsonb_build_object('revoked', true);
END $fn$;
REVOKE ALL ON FUNCTION public.revoke_api_client(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_api_client(UUID) TO authenticated;


/* إصدار مفتاح — تُنادى من جلسة الإدارة، والتعمية في التطبيق فتصل
   مُجزَّأةً. ولا تُعيد السرّ: من أصدره يعرفه، والقاعدة لا تحفظه. */
CREATE OR REPLACE FUNCTION public.create_api_client(
  _name TEXT, _org UUID, _scopes TEXT[], _key TEXT,
  _salt TEXT, _hash TEXT, _prefix TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إصدار المفاتيح للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(_name), '') = '' THEN
    RAISE EXCEPTION 'اسم العميل مطلوب' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.api_clients
    (name, client_key, secret_hash, secret_salt, secret_prefix, org_id, scopes, created_by)
  VALUES (btrim(_name), _key, _hash, _salt, _prefix, _org, _scopes, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.write_audit('api_client.created', 'api_client', _id,
    jsonb_build_object('scopes', to_jsonb(_scopes), 'org', _org));

  RETURN jsonb_build_object('id', _id, 'client_key', _key);
END $fn$;
REVOKE ALL ON FUNCTION public.create_api_client(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_client(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT)
  TO authenticated;


/* وتسجيل الاستعمال: مفتاحٌ لا يُعرف آخر استعماله لا يُعرف متى يُبطَل. */
CREATE OR REPLACE FUNCTION public.touch_api_client(_client UUID, _imported BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.api_clients
     SET last_used_at = now(),
         last_import_at = CASE WHEN _imported THEN now() ELSE last_import_at END
   WHERE id = _client;
$fn$;
REVOKE ALL ON FUNCTION public.touch_api_client(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;


/* الجهات المعتمدة بأسمائها — لاختيار المسؤولة عن مفتاح الاستيراد.
   للإدارة وحدها: قائمةٌ بكل الجهات ليست بياناً عامّاً. */
CREATE OR REPLACE FUNCTION public.admin_approved_orgs()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'قائمة الجهات للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.name)
    FROM public.care_organizations o WHERE o.status = 'approved'
  ), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_approved_orgs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approved_orgs() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260906100000', 'integration_api');

-- >>> migration 20260907100000 orphan_profile
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260907100000') THEN
    RAISE EXCEPTION 'الهجرة 20260907100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260907100000', 'orphan_profile');

-- >>> migration 20260908100000 access_scopes
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260908100000') THEN
    RAISE EXCEPTION 'الهجرة 20260908100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- نطاقات الاطّلاع — إذنٌ مُفصَّل تختاره الإدارة، لا بابٌ واحد
-- ---------------------------------------------------------------------
-- بُني الإذن أوّلاً **ثنائياً**: مقبولٌ فيُفتح الملفّ كلُّه، أو مرفوضٌ
-- فلا شيء. وبُنيت معه قاعدةٌ **مطلقة** تمنع عرض الدرجات والسمات على أيّ
-- داعم.
--
-- وكلاهما خطأ. المالك يريد: داعمٌ يُقدّم طلباً، فتحاوره الإدارة، فتقرّر،
-- **وتختار له هو بعينه** ماذا يرى — اسماً أو مجموعةً أو رحلةً تعليمية أو
-- تقدّماً أو نتائج أو سمات. فالحماية ليست حُرمةً مطلقة بل **قراراً
-- مُدارًا**.
--
-- وثلاثة قرارات في البناء:
--
-- (١) **النطاقات سجلٌّ لا تعداد.** `ENUM` يجعل كلّ نطاقٍ جديد هجرةً،
--     والمالك صرّح أنّ ما سمّاه أمثلة: «تُبنى وتُستقبَل حسب ما هو
--     موجود». فما يأتي من الرواد من رحلاتٍ وتفاعلاتٍ وأنشطة يصير
--     نطاقاً **بإضافة صفّ**.
--
-- (٢) **سجلٌّ لا كيسٌ مفتوح.** والدينامية لا تعني فوضى: النطاق المَمنوح
--     يجب أن يكون **مُعرَّفاً في السجلّ وفاعلاً**، وإلا صار الإذن نصّاً
--     حرّاً لا يُفحص. فالشكل مُعلَن والمحتوى ديناميّ.
--
-- (٣) **حزمٌ لا اختيارٌ حرّ وحده.** ثمانيةُ نطاقاتٍ تُختار يدوياً لكل
--     داعم تُتعب وتُخطئ. فحزمٌ جاهزة تُختار ثمّ تُعدَّل — والقرار يبقى
--     للإدارة في الحالين.
--
-- وقاعدةٌ لا تُخرَق: **الافتراض مغلق.** لا يُفتح نطاقٌ إلا باختيارٍ
-- صريح، ويُسجَّل من فتحه ومتى.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) سجلّ النطاقات
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_scopes (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  /* ١ معلومة · ٢ يُعرِّف الطفل · ٣ حكمٌ عليه.
     ليست حاجزاً بل **تحذيرٌ عند المنح وترتيبٌ عند العرض**: من يمنح
     «السمات» ينبغي أن يرى أنها من الدرجة الثالثة قبل أن يضغط. */
  sensitivity SMALLINT NOT NULL DEFAULT 1 CHECK (sensitivity BETWEEN 1 AND 3),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.access_scopes TO authenticated;
GRANT ALL ON public.access_scopes TO service_role;
ALTER TABLE public.access_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scopes_read" ON public.access_scopes;
CREATE POLICY "scopes_read" ON public.access_scopes
  FOR SELECT TO authenticated USING (active OR public.is_admin());

DROP POLICY IF EXISTS "scopes_admin_write" ON public.access_scopes;
CREATE POLICY "scopes_admin_write" ON public.access_scopes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/* بذرةٌ لا حصر: هذه ما نعرفه اليوم، وما يأتي من الرواد يُضاف صفّاً. */
INSERT INTO public.access_scopes (key, label, description, sensitivity, sort_order) VALUES
  ('identity', 'الاسم والصورة',
   'الاسم الحقيقي وصورة الطفل بدل الاسم المستعار.', 3, 10),
  ('group', 'المجموعة',
   'مجموعته في برنامج الرواد وأعضاؤها ومشرفها الأساسي.', 2, 20),
  ('journey', 'الرحلة التعليمية',
   'الجلسات ومحاورها وما قُبل منها.', 1, 30),
  ('progress', 'التقدّم',
   'المرحلة التي بلغها وما بقي من مساره.', 1, 40),
  ('results', 'النتائج والمخرجات',
   'ما سلّمه في كل جلسة وتقويم مشرفه له.', 2, 50),
  ('traits', 'مقياس السمات',
   'خريطة سماته ودرجاتها، والسمة الجوهرية والاتصالية.', 3, 60),
  ('reports', 'التقارير الدورية',
   'الرصد والتقرير الأسبوعي وتقرير الدورة.', 2, 70),
  ('profile_deep', 'الملفّ العميق',
   'الصحّة والأسرة والسكن والوضع النفسي.', 3, 80),
  ('contact', 'التواصل',
   'قناة تواصلٍ مع المشرف أو جهة الرعاية بشأن الطفل.', 2, 90)
ON CONFLICT (key) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2) الحزم
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_scope_packages (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.access_scope_packages TO authenticated;
GRANT ALL ON public.access_scope_packages TO service_role;
ALTER TABLE public.access_scope_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packages_read" ON public.access_scope_packages;
CREATE POLICY "packages_read" ON public.access_scope_packages
  FOR SELECT TO authenticated USING (active OR public.is_admin());

DROP POLICY IF EXISTS "packages_admin_write" ON public.access_scope_packages;
CREATE POLICY "packages_admin_write" ON public.access_scope_packages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.access_scope_packages (key, label, description, scopes, sort_order) VALUES
  ('follower', 'متابِع',
   'يرى مسار الطفل في البرنامج بلا اسمٍ ولا حكم.',
   ARRAY['journey', 'progress'], 10),
  ('group_supporter', 'داعم مجموعة',
   'يرى المجموعة ومسارها ونتائج جلساتها.',
   ARRAY['group', 'journey', 'progress', 'results'], 20),
  ('committed_sponsor', 'كافل ملتزم',
   'يرى الطفل باسمه ومساره ونتائجه وتقاريره.',
   ARRAY['identity', 'group', 'journey', 'progress', 'results', 'reports'], 30),
  ('full_partner', 'شريك كامل',
   'كلُّ ما في الملفّ — يُمنح لشريكٍ مؤسّسيّ بعقد.',
   ARRAY['identity', 'group', 'journey', 'progress', 'results', 'traits',
         'reports', 'profile_deep', 'contact'], 40)
ON CONFLICT (key) DO NOTHING;


/* حزمةٌ تحمل نطاقاً لا وجود له تصير إذناً لا يُفحص. */
CREATE OR REPLACE FUNCTION public.guard_scope_package()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _unknown TEXT;
BEGIN
  SELECT string_agg(s, '، ') INTO _unknown
    FROM unnest(NEW.scopes) s
   WHERE NOT EXISTS (SELECT 1 FROM public.access_scopes a WHERE a.key = s);
  IF _unknown IS NOT NULL THEN
    RAISE EXCEPTION 'نطاقاتٌ غير معرّفة في السجلّ: %', _unknown
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_scope_package ON public.access_scope_packages;
CREATE TRIGGER trg_guard_scope_package
BEFORE INSERT OR UPDATE ON public.access_scope_packages
FOR EACH ROW EXECUTE FUNCTION public.guard_scope_package();


-- ---------------------------------------------------------------------
-- 3) الطلب يحمل نطاقاته ومحادثته
-- ---------------------------------------------------------------------
ALTER TABLE public.orphan_access_requests
  /* ما طلبه هو — اقتراحٌ لا قرار. */
  ADD COLUMN IF NOT EXISTS requested_package TEXT
    REFERENCES public.access_scope_packages(key) ON DELETE SET NULL,
  /* وما منحته الإدارة — وهو الحاكم. */
  ADD COLUMN IF NOT EXISTS granted_scopes TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_access_requests_package
  ON public.orphan_access_requests(requested_package)
  WHERE requested_package IS NOT NULL;

/* قبولٌ بلا نطاقٍ واحد رفضٌ يلبس ثوب القبول: يَعِد الطالبَ بما لا يصل. */
ALTER TABLE public.orphan_access_requests
  DROP CONSTRAINT IF EXISTS ck_approval_grants_something;
ALTER TABLE public.orphan_access_requests
  ADD CONSTRAINT ck_approval_grants_something CHECK (
    status <> 'approved' OR cardinality(granted_scopes) > 0
  );


/* والمنح لا يتجاوز السجلّ: نطاقٌ مكتوبٌ خطأً يصير صلاحيةً صامتة. */
CREATE OR REPLACE FUNCTION public.guard_granted_scopes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _unknown TEXT;
BEGIN
  IF cardinality(NEW.granted_scopes) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(s, '، ') INTO _unknown
    FROM unnest(NEW.granted_scopes) s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.access_scopes a WHERE a.key = s AND a.active);

  IF _unknown IS NOT NULL THEN
    RAISE EXCEPTION 'نطاقاتٌ غير معرّفة أو معطّلة: %', _unknown
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guard_granted_scopes ON public.orphan_access_requests;
CREATE TRIGGER trg_guard_granted_scopes
BEFORE INSERT OR UPDATE ON public.orphan_access_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_granted_scopes();


-- المحادثة: الإدارة تقرّر عن طفل، فحوارُها مع الطالب **مستند القرار**.
CREATE TABLE IF NOT EXISTS public.access_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL
    REFERENCES public.orphan_access_requests(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_admin BOOLEAN NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_messages_request
  ON public.access_request_messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_access_messages_author
  ON public.access_request_messages(author_id);

GRANT SELECT ON public.access_request_messages TO authenticated;
GRANT ALL ON public.access_request_messages TO service_role;
ALTER TABLE public.access_request_messages ENABLE ROW LEVEL SECURITY;

/* يقرؤها طرفاها وحدهما. */
DROP POLICY IF EXISTS "access_messages_read" ON public.access_request_messages;
CREATE POLICY "access_messages_read" ON public.access_request_messages
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.orphan_access_requests r
                WHERE r.id = request_id AND r.requester_id = auth.uid())
  );


-- ---------------------------------------------------------------------
-- 4) ما يملكه القارئ من نطاقات
-- ---------------------------------------------------------------------
-- دائرة الطفل تملكها كلّها ضمناً: صلتُها هي الإذن. ومن أُذن له يملك
-- ما مُنح له نصّاً. وغيرهما لا شيء.
CREATE OR REPLACE FUNCTION public.my_orphan_scopes(_orphan UUID)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN '{}'::TEXT[]
    WHEN public.in_orphan_circle(_orphan)
      THEN (SELECT COALESCE(array_agg(a.key ORDER BY a.sort_order), '{}'::TEXT[])
              FROM public.access_scopes a WHERE a.active)
    ELSE COALESCE((
      SELECT r.granted_scopes FROM public.orphan_access_requests r
       WHERE r.orphan_id = _orphan AND r.requester_id = auth.uid()
         AND r.status = 'approved' AND r.expires_at > now()
       LIMIT 1), '{}'::TEXT[])
  END;
$fn$;
REVOKE ALL ON FUNCTION public.my_orphan_scopes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_orphan_scopes(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.has_orphan_scope(_orphan UUID, _scope TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT _scope = ANY(public.my_orphan_scopes(_orphan));
$fn$;
REVOKE ALL ON FUNCTION public.has_orphan_scope(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_orphan_scope(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 5) القرار بالنطاقات، والمحادثة
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.decide_orphan_access(UUID, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.decide_orphan_access(
  _request UUID,
  _decision TEXT,
  _scopes TEXT[] DEFAULT NULL,
  _note TEXT DEFAULT NULL,
  _days INTEGER DEFAULT 180
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _st public.access_status; _exp TIMESTAMPTZ; _grant TEXT[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'الإذن بالاطّلاع للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'القرار إمّا قبولٌ أو رفض' USING ERRCODE = 'check_violation';
  END IF;

  _st := _decision::public.access_status;

  IF _st = 'approved' THEN
    _grant := COALESCE(_scopes, '{}'::TEXT[]);
    IF cardinality(_grant) = 0 THEN
      RAISE EXCEPTION 'القبول بلا نطاقٍ واحد رفضٌ يلبس ثوب القبول'
        USING ERRCODE = 'check_violation';
    END IF;
    _exp := now() + make_interval(days => GREATEST(LEAST(COALESCE(_days, 180), 365), 1));
  ELSE
    _grant := '{}'::TEXT[];
  END IF;

  UPDATE public.orphan_access_requests
     SET status = _st, decided_by = auth.uid(), decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(_note, '')), ''),
         granted_scopes = _grant,
         expires_at = _exp
   WHERE id = _request AND status = 'pending'
  RETURNING orphan_id INTO _orphan;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'لا طلبَ معلّقاً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  /* الأثر يحمل ما فُتح: «أُذن له» وحدها لا تكفي للمراجعة بعد سنة. */
  PERFORM public.write_audit('orphan.access_' || _decision, 'orphan', _orphan,
    jsonb_build_object('request', _request, 'scopes', to_jsonb(_grant),
                       'expires_at', _exp));

  RETURN jsonb_build_object('status', _st, 'scopes', to_jsonb(_grant),
                            'expires_at', _exp);
END $fn$;
REVOKE ALL ON FUNCTION public.decide_orphan_access(UUID, TEXT, TEXT[], TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_orphan_access(UUID, TEXT, TEXT[], TEXT, INTEGER)
  TO authenticated;


/* وتعديل ما مُنح بعد القبول: حاجةُ الداعم تتغيّر، وسحبُ الإذن كلِّه
   لتضييق نطاقٍ واحد عقوبةٌ لا تصحيح. */
CREATE OR REPLACE FUNCTION public.amend_orphan_access(
  _request UUID, _scopes TEXT[], _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _old TEXT[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'تعديل النطاقات للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF cardinality(COALESCE(_scopes, '{}'::TEXT[])) = 0 THEN
    RAISE EXCEPTION 'تضييقٌ إلى لا شيء سحبٌ — استعمل revoke_orphan_access'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT granted_scopes INTO _old FROM public.orphan_access_requests
   WHERE id = _request AND status = 'approved';

  UPDATE public.orphan_access_requests
     SET granted_scopes = _scopes,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''), decision_note)
   WHERE id = _request AND status = 'approved'
  RETURNING orphan_id INTO _orphan;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'لا إذنَ قائماً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_audit('orphan.access_amended', 'orphan', _orphan,
    jsonb_build_object('request', _request, 'from', to_jsonb(_old),
                       'to', to_jsonb(_scopes)));

  RETURN jsonb_build_object('scopes', to_jsonb(_scopes));
END $fn$;
REVOKE ALL ON FUNCTION public.amend_orphan_access(UUID, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_orphan_access(UUID, TEXT[], TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.post_access_message(_request UUID, _body TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _mine BOOLEAN; _admin BOOLEAN; _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'post_access_message: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  _admin := public.is_admin();
  SELECT true INTO _mine FROM public.orphan_access_requests r
   WHERE r.id = _request AND r.requester_id = auth.uid();

  IF NOT _admin AND _mine IS NOT TRUE THEN
    RAISE EXCEPTION 'المحادثة بين الإدارة وصاحب الطلب' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.access_request_messages (request_id, author_id, from_admin, body)
  VALUES (_request, auth.uid(), _admin, btrim(_body))
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id);
END $fn$;
REVOKE ALL ON FUNCTION public.post_access_message(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_access_message(UUID, TEXT) TO authenticated;


/* `SECURITY INVOKER` عمداً: تبقى `access_messages_read` هي الحاكمة. */
CREATE OR REPLACE FUNCTION public.access_thread(_request UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id, 'from_admin', m.from_admin, 'body', m.body,
    'mine', m.author_id = auth.uid(), 'created_at', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  FROM public.access_request_messages m
  WHERE m.request_id = _request;
$fn$;
REVOKE ALL ON FUNCTION public.access_thread(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_thread(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 6) كتالوج النطاقات والحزم — لشاشة الإدارة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.access_scope_catalog()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'scopes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', a.key, 'label', a.label, 'description', a.description,
        'sensitivity', a.sensitivity) ORDER BY a.sort_order)
      FROM public.access_scopes a WHERE a.active), '[]'::jsonb),
    'packages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', p.key, 'label', p.label, 'description', p.description,
        'scopes', to_jsonb(p.scopes)) ORDER BY p.sort_order)
      FROM public.access_scope_packages p WHERE p.active), '[]'::jsonb)
  );
$fn$;
REVOKE ALL ON FUNCTION public.access_scope_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_scope_catalog() TO authenticated;


-- ---------------------------------------------------------------------
-- 7) ربط النطاقات بما تفتحه فعلاً
-- ---------------------------------------------------------------------
-- نطاقاتٌ تُمنح ولا تحكم زينةٌ أخطر من عدمها: تُطمئن الإدارة أنها
-- ضيّقت وهي لم تضيّق. فيُعاد بناء القارئَين على النطاقات.
--
-- والقسمة: **القبول** يفتح طبقة التفصيل الأساسية (القصّة والمدينة
-- وتفصيل الاحتياج) — وهي «التفاصيل» التي يطلبها الداعم. و**النطاقات**
-- تفتح ما فوقها: الاسم والصورة، والملفّ العميق، وما يأتي من الرواد.
CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o RECORD; _may BOOLEAN; _acc JSONB; _out JSONB; _scopes TEXT[];
BEGIN
  SELECT * INTO _o FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  _may := public.can_view_orphan_detail(_orphan);
  _scopes := public.my_orphan_scopes(_orphan);

  SELECT COALESCE(jsonb_build_object(
           'request_id', a.id, 'status', a.status,
           'expires_at', a.expires_at, 'decision_note', a.decision_note,
           'granted_scopes', to_jsonb(a.granted_scopes),
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
    /* ما يملكه القارئ — تبني عليه الواجهة ما تعرض بلا تخمين. */
    'scopes', to_jsonb(_scopes),
    'access', COALESCE(_acc, 'null'::jsonb)
  );

  IF _may THEN
    _out := _out || jsonb_build_object(
      'detail', jsonb_build_object(
        'birth_date', _o.birth_date,
        'city', _o.city,
        'story', _o.story,
        /* الاسم الحقيقي والصورة خلف نطاق `identity` — ومعهما إذن
           الصورة الخاصّ، فهما إذنان لصاحبين مختلفين. */
        'real_name', CASE WHEN 'identity' = ANY(_scopes) THEN _o.display_name END,
        'photo_url', CASE
          WHEN 'identity' = ANY(_scopes)
           AND _o.photo_consent IN ('granted', 'face_hidden')
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


-- والملفّ العميق: للدائرة، أو لمن مُنح نطاقه.
CREATE OR REPLACE FUNCTION public.orphan_profile(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _circle BOOLEAN; _detail BOOLEAN; _deep BOOLEAN;
BEGIN
  _circle := public.in_orphan_circle(_orphan);
  _detail := public.can_view_orphan_detail(_orphan);
  /* الدائرة تملك النطاقات كلَّها ضمناً، فهذا يشمله. */
  _deep := public.has_orphan_scope(_orphan, 'profile_deep');

  IF NOT _circle AND NOT _detail THEN
    RETURN jsonb_build_object('may_read', false, 'sections', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'may_read', true,
    'may_write', _circle,
    'sees_sensitive', _deep,
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
       AND (_deep OR NOT public.profile_section_is_sensitive(p.section))
    ), '[]'::jsonb),
    'hidden_sections', CASE WHEN _deep THEN 0 ELSE (
      SELECT count(*) FROM public.orphan_profile_sections p
       WHERE p.orphan_id = _orphan AND public.profile_section_is_sensitive(p.section)
    ) END
  );
END $fn$;


/* وسياسة الجدول **تبقى على الدائرة وحدها** عمداً.
   جرّبتُ توسيعها لتطابق الدالّة، ثمّ تراجعت: الدالّة `SECURITY DEFINER`
   فتخدم المأذون له بلا حاجةٍ إلى فتح الجدول. و**بابٌ واحد** أصحّ من
   بابين متطابقين — فالتطابق يُحفظ اليوم ويُكسر غداً حين يُعدَّل أحدهما
   وحده. والقاعدة هنا: «لا يمسّ هذا الجدولَ إلا من حول الطفل». */

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260908100000', 'access_scopes');

-- >>> migration 20260909100000 kahatayn_mirror
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260909100000') THEN
    RAISE EXCEPTION 'الهجرة 20260909100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — الدول، مرآة منصّات التشغيل، نموذج السمات، وأهداف الدعم
-- ---------------------------------------------------------------------
-- «أنا وكافل اليتيم في الجنة كهاتين».
--
-- المبادئ:
--   1) الدولة صفٌّ لا هجرة: المنصّة ستخدم دولاً كثيرة تدريجياً، والمفعّلة
--      اليوم ألبانيا وحدها لأن الرواد ألبانيا هي منصّة التشغيل الوحيدة.
--   2) المرآة باتجاهٍ واحد: منصّة التشغيل تكتب، وكهاتين تقرأ. كل صفٍّ
--      مرآويّ مفتاحه (source, external_ref)، والحذف علامةٌ deleted_at
--      لا مسح، كي لا يضيع تاريخٌ رآه داعم.
--   3) نموذج السمات سجلٌّ لا تعداد: الأبعاد (المقاصد الخمسة في الرواد
--      مثال) والسمات وعناصرها تُستورد كما هي، فإن أضاف الرواد بُعداً
--      ظهر هنا دون تعديل كود.
--   4) المرآة تصل مغلقة: لا anon ولا authenticated يقرأ الجداول مباشرة؛
--      الأبواب دوالّ تفحص النطاق (traits / group) المصروف لكل طفل.
--   5) هدف الدعم متعدّد الأشكال: التأهيل = يتيم | مجموعة | منطقة | دولة،
--      والعيني يضيف المؤسسة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) الدول ومنصّات التشغيل
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.countries (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name_ar     TEXT NOT NULL,
  name_local  TEXT,
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'active', 'paused')),
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS countries_read ON public.countries;
CREATE POLICY countries_read ON public.countries FOR SELECT TO anon, authenticated
  USING (status <> 'planned' OR public.is_admin());
DROP POLICY IF EXISTS countries_admin ON public.countries;
CREATE POLICY countries_admin ON public.countries FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries TO authenticated;

INSERT INTO public.countries (code, name_ar, name_local, status, sort_order)
VALUES ('AL', 'ألبانيا', 'Shqipëri', 'active', 1)
ON CONFLICT (code) DO NOTHING;


CREATE TABLE IF NOT EXISTS public.operating_platforms (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9-]{2,40}$'),
  name         TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES public.countries(code),
  base_url     TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operating_platforms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS op_admin ON public.operating_platforms;
CREATE POLICY op_admin ON public.operating_platforms FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.operating_platforms TO authenticated;

INSERT INTO public.operating_platforms (key, name, country_code, base_url)
VALUES ('rowad-albania', 'الرواد ألبانيا', 'AL', 'https://rowad-albania.manzoma.sa')
ON CONFLICT (key) DO NOTHING;


-- مؤشّر المزامنة لكل (منصّة، كيان): الدفع (webhook) يوقظ، والسحب يكمل
-- من (cursor_at, cursor_ref)، والمطابقة الدورية تكتب الانحراف.
CREATE TABLE IF NOT EXISTS public.mirror_sync_state (
  source       TEXT NOT NULL REFERENCES public.operating_platforms(key),
  entity       TEXT NOT NULL CHECK (entity ~ '^[a-z_]{2,40}$'),
  cursor_at    TIMESTAMPTZ,
  cursor_ref   TEXT,
  last_run_at  TIMESTAMPTZ,
  last_error   TEXT,
  drift        JSONB,
  PRIMARY KEY (source, entity)
);
ALTER TABLE public.mirror_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mss_admin ON public.mirror_sync_state;
CREATE POLICY mss_admin ON public.mirror_sync_state FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.mirror_sync_state TO authenticated;


-- ---------------------------------------------------------------------
-- 2) المجموعات: لكل يتيم في الرواد مجموعة ومشرف أساسي
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mirror_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source              TEXT NOT NULL REFERENCES public.operating_platforms(key),
  external_ref        TEXT NOT NULL,
  name                TEXT NOT NULL,
  country_code        TEXT NOT NULL REFERENCES public.countries(code),
  region              TEXT,
  institution_ref     TEXT,            -- المدرسة في الرواد
  institution_name    TEXT,
  supervisor_ref      TEXT,            -- المعلّم = المشرف الأساسي
  supervisor_name     TEXT,
  source_updated_at   TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (source, external_ref)
);
ALTER TABLE public.mirror_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mg_admin ON public.mirror_groups;
CREATE POLICY mg_admin ON public.mirror_groups FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.mirror_groups TO authenticated;

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.mirror_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orphans_group ON public.orphans(group_id);


-- ---------------------------------------------------------------------
-- 3) نموذج السمات — سجلٌّ مستورد
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trait_dimensions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL REFERENCES public.operating_platforms(key),
  key           TEXT NOT NULL,            -- DEEN | AQL | NAFS | NASL | MAL … كما يرد
  label_ar      TEXT NOT NULL,
  label_local   TEXT,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  UNIQUE (source, key)
);

CREATE TABLE IF NOT EXISTS public.trait_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL REFERENCES public.operating_platforms(key),
  external_ref      TEXT NOT NULL,
  dimension_id      UUID NOT NULL REFERENCES public.trait_dimensions(id) ON DELETE CASCADE,
  stage_label       TEXT,                 -- مرحلة خارطة الطريق إن وُجدت
  name_ar           TEXT NOT NULL,
  name_local        TEXT,
  definition_ar     TEXT,
  definition_local  TEXT,
  elements          JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(elements) = 'array'),
  sort_order        INTEGER NOT NULL DEFAULT 100,
  deleted_at        TIMESTAMPTZ,
  UNIQUE (source, external_ref)
);

-- القياس: كل تقييم من الرواد صفّ؛ الدرجة كما وردت مع سقفها، فلا نفترض
-- مقياساً واحداً لكل المنصّات.
CREATE TABLE IF NOT EXISTS public.orphan_trait_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL REFERENCES public.operating_platforms(key),
  external_ref   TEXT NOT NULL,
  orphan_id      UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  trait_id       UUID NOT NULL REFERENCES public.trait_definitions(id) ON DELETE CASCADE,
  score          NUMERIC NOT NULL,
  scale_max      NUMERIC NOT NULL DEFAULT 100 CHECK (scale_max > 0),
  observed_at    TIMESTAMPTZ NOT NULL,
  note           TEXT,                    -- ملاحظة المشرف: لا تظهر للداعم
  deleted_at     TIMESTAMPTZ,
  UNIQUE (source, external_ref),
  CHECK (score >= 0 AND score <= scale_max)
);
CREATE INDEX IF NOT EXISTS idx_ots_orphan ON public.orphan_trait_scores(orphan_id, observed_at);

ALTER TABLE public.trait_dimensions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trait_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orphan_trait_scores ENABLE ROW LEVEL SECURITY;
-- النموذج نفسه منهجٌ عامّ يُعرض للجميع؛ الدرجات بابها دالّة.
DROP POLICY IF EXISTS td_read ON public.trait_dimensions;
CREATE POLICY td_read ON public.trait_dimensions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tdef_read ON public.trait_definitions;
CREATE POLICY tdef_read ON public.trait_definitions FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);
DROP POLICY IF EXISTS ots_admin ON public.orphan_trait_scores;
CREATE POLICY ots_admin ON public.orphan_trait_scores FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.trait_dimensions, public.trait_definitions TO anon, authenticated;
GRANT SELECT ON public.orphan_trait_scores TO authenticated;


-- النموذج للعرض العامّ: أبعاد ← سمات ← عناصر.
CREATE OR REPLACE FUNCTION public.trait_model(_source TEXT DEFAULT 'rowad-albania')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'key', d.key, 'label', d.label_ar, 'label_local', d.label_local,
           'description', d.description,
           'traits', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', t.id, 'name', t.name_ar, 'name_local', t.name_local,
                      'definition', t.definition_ar, 'stage', t.stage_label,
                      'elements', t.elements)
                    ORDER BY t.sort_order, t.name_ar)
               FROM public.trait_definitions t
              WHERE t.dimension_id = d.id AND t.deleted_at IS NULL), '[]'::jsonb))
         ORDER BY d.sort_order, d.key), '[]'::jsonb)
    FROM public.trait_dimensions d
   WHERE d.source = _source;
$fn$;
GRANT EXECUTE ON FUNCTION public.trait_model(TEXT) TO anon, authenticated;


-- سمات طفلٍ بعينه: آخر قياس لكل سمة وأوّله، بلا ملاحظة المشرف.
-- الباب نطاق «traits» — دائرة الطفل تملكه ضمناً.
CREATE OR REPLACE FUNCTION public.orphan_traits(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.has_orphan_scope(_orphan, 'traits') THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'traits', COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.dimension_order, x.dimension, x.name)
      FROM (
        SELECT d.key AS dimension, d.label_ar AS dimension_label, d.sort_order AS dimension_order,
               t.id AS trait_id, t.name_ar AS name,
               (SELECT round(100 * s.score / s.scale_max, 1) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                 ORDER BY s.observed_at ASC LIMIT 1) AS first_percent,
               (SELECT round(100 * s.score / s.scale_max, 1) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                 ORDER BY s.observed_at DESC LIMIT 1) AS latest_percent,
               (SELECT count(*) FROM public.orphan_trait_scores s
                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL) AS observations
          FROM public.trait_definitions t
          JOIN public.trait_dimensions d ON d.id = t.dimension_id
         WHERE t.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM public.orphan_trait_scores s
                        WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL)
      ) x), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_traits(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_traits(UUID) TO authenticated;


-- مجموعة الطفل: الاسم والمشرف دائماً لمن يملك «group»، وأسماء الزملاء
-- المستعارة فقط (display_name)، ولا يُعدّ في القائمة إلا المعتمَد.
CREATE OR REPLACE FUNCTION public.orphan_group(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _g public.mirror_groups;
BEGIN
  IF NOT public.has_orphan_scope(_orphan, 'group') THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  SELECT g.* INTO _g FROM public.mirror_groups g
    JOIN public.orphans o ON o.group_id = g.id
   WHERE o.id = _orphan AND g.deleted_at IS NULL;
  IF _g.id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'group', NULL);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'group', jsonb_build_object(
    'name', _g.name, 'country', _g.country_code, 'region', _g.region,
    'institution', _g.institution_name, 'supervisor', _g.supervisor_name,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', o.code, 'name', o.display_name)
                                          ORDER BY o.display_name)
                           FROM public.orphans o
                          WHERE o.group_id = _g.id AND o.status = 'approved'), '[]'::jsonb)));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_group(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 4) أهداف الدعم
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_pledges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('qualification', 'in_kind')),
  target_type    TEXT NOT NULL CHECK (target_type IN ('orphan', 'group', 'region', 'country', 'institution')),
  orphan_id      UUID REFERENCES public.orphans(id) ON DELETE RESTRICT,
  group_id       UUID REFERENCES public.mirror_groups(id) ON DELETE RESTRICT,
  org_id         UUID REFERENCES public.care_organizations(id) ON DELETE RESTRICT,
  country_code   TEXT NOT NULL REFERENCES public.countries(code),
  region         TEXT,
  amount         NUMERIC NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  note           TEXT CHECK (note IS NULL OR length(note) <= 1000),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'fulfilled', 'cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- التأهيل لا يذهب لمؤسسة: هو بناء أهلية طفلٍ أو جماعة أطفال.
  CONSTRAINT ck_pledge_kind_target CHECK (kind = 'in_kind' OR target_type <> 'institution'),
  -- مرجعٌ واحد يطابق النوع، لا أكثر ولا أقل.
  CONSTRAINT ck_pledge_target_shape CHECK (
    (target_type = 'orphan'      AND orphan_id IS NOT NULL AND group_id IS NULL AND org_id IS NULL) OR
    (target_type = 'group'       AND group_id IS NOT NULL AND orphan_id IS NULL AND org_id IS NULL) OR
    (target_type = 'institution' AND org_id IS NOT NULL AND orphan_id IS NULL AND group_id IS NULL) OR
    (target_type = 'region'      AND region IS NOT NULL AND orphan_id IS NULL AND group_id IS NULL AND org_id IS NULL) OR
    (target_type = 'country'     AND region IS NULL AND orphan_id IS NULL AND group_id IS NULL AND org_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_pledges_supporter ON public.support_pledges(supporter_id, created_at DESC);
ALTER TABLE public.support_pledges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_read ON public.support_pledges;
CREATE POLICY sp_read ON public.support_pledges FOR SELECT TO authenticated
  USING (supporter_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.support_pledges TO authenticated;
-- لا INSERT مباشر: الباب create_support_pledge.


CREATE OR REPLACE FUNCTION public.create_support_pledge(
  _kind TEXT, _target_type TEXT, _target TEXT, _amount NUMERIC,
  _country TEXT DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid UUID := auth.uid();
  _id UUID;
  _orphan UUID; _group UUID; _org UUID; _region TEXT; _cc TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;

  IF _target_type = 'orphan' THEN
    -- يتيمٌ معتمدٌ فقط؛ ودولته من مجموعته إن كانت مرآة، وإلا ما مُرّر.
    SELECT o.id, g.country_code INTO _orphan, _cc
      FROM public.orphans o LEFT JOIN public.mirror_groups g ON g.id = o.group_id
     WHERE o.id = _target::UUID AND o.status = 'approved';
    IF _orphan IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := COALESCE(_cc, _country);
  ELSIF _target_type = 'group' THEN
    SELECT g.id, g.country_code INTO _group, _cc FROM public.mirror_groups g
     WHERE g.id = _target::UUID AND g.deleted_at IS NULL;
    IF _group IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  ELSIF _target_type = 'institution' THEN
    SELECT c.id INTO _org FROM public.care_organizations c
     WHERE c.id = _target::UUID AND c.status = 'approved';
    IF _org IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'region' THEN
    _region := NULLIF(btrim(_target), '');
    IF _region IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'country' THEN
    _cc := COALESCE(NULLIF(btrim(_target), ''), _country);
  ELSE
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  -- الدعم لا يُفتح إلا في دولةٍ مفعّلة.
  IF _cc IS NULL OR NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc AND status = 'active') THEN
    RAISE EXCEPTION 'country_not_active';
  END IF;

  INSERT INTO public.support_pledges
    (supporter_id, kind, target_type, orphan_id, group_id, org_id, country_code, region, amount, note)
  VALUES (_uid, _kind, _target_type, _orphan, _group, _org, _cc, _region, _amount, NULLIF(btrim(_note), ''))
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260909100000', 'kahatayn_mirror');

-- >>> migration 20260910100000 offices_portals
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260910100000') THEN
    RAISE EXCEPTION 'الهجرة 20260910100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — المكاتب، أصناف المؤسسات، الجهات المانحة، ولوحاتها
-- ---------------------------------------------------------------------
-- تصحيح: دعم التأهيل يصل المؤسسة أيضاً (مركز، مكتب، مدرسة…)، فيُرفع
-- القيد السابق.
--
-- البنية:
--   المكتب  — مسؤول عن دولة أو منطقة منها، وقد يتبع مكتباً أعلى. أعضاؤه
--             بأدوار من سجلّ (مدير، منسّق، ميداني، مطّلع — أمثلة).
--             يرفع تقارير بصور ومرفقات في خزنةٍ خاصّة بمجلّده.
--   المؤسسة — care_organizations مع صنفٍ من سجلّ institution_kinds.
--   الجهة المانحة — شركة/مؤسسة خيرية تدعم باسمها، وأعضاؤها يرون تعهّداتها.
--
-- كل الأصناف والأدوار صفوف، لا تعدادات: تُضاف دون هجرة.
-- =====================================================================

ALTER TABLE public.support_pledges DROP CONSTRAINT IF EXISTS ck_pledge_kind_target;


-- ---------------------------------------------------------------------
-- 1) أصناف المؤسسات
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_kinds (
  key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active     BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.institution_kinds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ik_read ON public.institution_kinds;
CREATE POLICY ik_read ON public.institution_kinds FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ik_admin ON public.institution_kinds;
CREATE POLICY ik_admin ON public.institution_kinds FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.institution_kinds TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.institution_kinds TO authenticated;

INSERT INTO public.institution_kinds (key, label, sort_order) VALUES
  ('center', 'مركز', 1), ('office', 'مكتب', 2), ('school', 'مدرسة', 3),
  ('association', 'جمعية', 4), ('care_home', 'دار رعاية', 5)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.care_organizations
  ADD COLUMN IF NOT EXISTS kind TEXT REFERENCES public.institution_kinds(key),
  ADD COLUMN IF NOT EXISTS country_code TEXT REFERENCES public.countries(code),
  ADD COLUMN IF NOT EXISTS region TEXT;


-- ---------------------------------------------------------------------
-- 2) المكاتب
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(btrim(name)) >= 2),
  country_code  TEXT NOT NULL REFERENCES public.countries(code),
  region        TEXT,                    -- NULL = الدولة كلّها
  parent_id     UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE TABLE IF NOT EXISTS public.office_roles (
  key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  label      TEXT NOT NULL,
  can_write  BOOLEAN NOT NULL DEFAULT false,   -- يرفع تقارير وبيانات
  can_publish BOOLEAN NOT NULL DEFAULT false,  -- ينشر التقرير للداعمين
  sort_order INTEGER NOT NULL DEFAULT 100
);
INSERT INTO public.office_roles (key, label, can_write, can_publish, sort_order) VALUES
  ('manager', 'مدير المكتب', true, true, 1),
  ('coordinator', 'منسّق', true, false, 2),
  ('field_officer', 'موظّف ميداني', true, false, 3),
  ('viewer', 'مطّلع', false, false, 4)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.office_members (
  office_id  UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL REFERENCES public.office_roles(key),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, user_id)
);

-- عضوية المكتب تسري على ما تحته: مدير مكتب الدولة يرى مكاتب مناطقها.
CREATE OR REPLACE FUNCTION public.office_permission(_office UUID, _need TEXT DEFAULT 'read')
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, 0 AS depth FROM public.offices WHERE id = _office
    UNION ALL
    SELECT o.id, o.parent_id, up.depth + 1 FROM public.offices o
      JOIN up ON o.id = up.parent_id WHERE up.depth < 10
  )
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM up JOIN public.office_members m ON m.office_id = up.id
      JOIN public.office_roles r ON r.key = m.role
     WHERE m.user_id = auth.uid()
       AND CASE _need WHEN 'read' THEN true
                      WHEN 'write' THEN r.can_write
                      WHEN 'publish' THEN r.can_publish
                      ELSE false END);
$fn$;
REVOKE ALL ON FUNCTION public.office_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_permission(UUID, TEXT) TO authenticated;

ALTER TABLE public.offices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offices_read ON public.offices;
CREATE POLICY offices_read ON public.offices FOR SELECT TO authenticated
  USING (public.office_permission(id, 'read'));
DROP POLICY IF EXISTS offices_admin ON public.offices;
CREATE POLICY offices_admin ON public.offices FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS oroles_read ON public.office_roles;
CREATE POLICY oroles_read ON public.office_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS oroles_admin ON public.office_roles;
CREATE POLICY oroles_admin ON public.office_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS omembers_read ON public.office_members;
CREATE POLICY omembers_read ON public.office_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.office_permission(office_id, 'publish'));
DROP POLICY IF EXISTS omembers_admin ON public.office_members;
CREATE POLICY omembers_admin ON public.office_members FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices, public.office_roles, public.office_members TO authenticated;


-- ---------------------------------------------------------------------
-- 3) تقارير المكتب ومرفقاته
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.office_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id     UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES auth.users(id),
  title         TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  body          TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  -- مؤشّرات حرّة بأسماء يختارها المكتب: {"visits": 12, "kits": 40}
  metrics       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  -- مسارات داخل خزنة office-media، وكلها في مجلّد المكتب نفسه.
  attachments   TEXT[] NOT NULL DEFAULT '{}',
  period_start  DATE,
  period_end    DATE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'published')),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CHECK (cardinality(attachments) <= 30)
);
CREATE INDEX IF NOT EXISTS idx_office_reports ON public.office_reports(office_id, created_at DESC);
ALTER TABLE public.office_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oreports_read ON public.office_reports;
CREATE POLICY oreports_read ON public.office_reports FOR SELECT TO authenticated
  USING (public.office_permission(office_id, 'read'));
GRANT SELECT ON public.office_reports TO authenticated;
-- الكتابة عبر save_office_report وحدها.

CREATE OR REPLACE FUNCTION public.save_office_report(
  _office UUID, _title TEXT, _body TEXT, _metrics JSONB DEFAULT '{}'::jsonb,
  _attachments TEXT[] DEFAULT '{}', _period_start DATE DEFAULT NULL,
  _period_end DATE DEFAULT NULL, _status TEXT DEFAULT 'draft', _id UUID DEFAULT NULL)
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
  FOREACH _p IN ARRAY COALESCE(_attachments, '{}') LOOP
    IF split_part(_p, '/', 1) <> _office::text THEN
      RAISE EXCEPTION 'attachment_outside_office';
    END IF;
  END LOOP;

  IF _id IS NULL THEN
    INSERT INTO public.office_reports
      (office_id, author_id, title, body, metrics, attachments, period_start, period_end, status,
       published_at)
    VALUES (_office, auth.uid(), btrim(_title), COALESCE(_body, ''), COALESCE(_metrics, '{}'),
            COALESCE(_attachments, '{}'), _period_start, _period_end, _status,
            CASE WHEN _status = 'published' THEN now() END)
    RETURNING id INTO _rid;
  ELSE
    UPDATE public.office_reports
       SET title = btrim(_title), body = COALESCE(_body, ''), metrics = COALESCE(_metrics, '{}'),
           attachments = COALESCE(_attachments, '{}'), period_start = _period_start,
           period_end = _period_end, status = _status, updated_at = now(),
           published_at = CASE WHEN _status = 'published' THEN COALESCE(published_at, now()) END
     WHERE id = _id AND office_id = _office
     RETURNING id INTO _rid;
    IF _rid IS NULL THEN RAISE EXCEPTION 'report_not_found'; END IF;
  END IF;
  RETURN _rid;
END $fn$;
REVOKE ALL ON FUNCTION public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_office_report(UUID, TEXT, TEXT, JSONB, TEXT[], DATE, DATE, TEXT, UUID) TO authenticated;


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('office-media', 'office-media', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_reach_office_folder(_path TEXT, _need TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  BEGIN
    _id := (storage.foldername(_path))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  IF _id IS NULL THEN RETURN false; END IF;
  RETURN public.office_permission(_id, _need);
END $fn$;
REVOKE ALL ON FUNCTION public.can_reach_office_folder(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_reach_office_folder(TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS office_media_read ON storage.objects;
CREATE POLICY office_media_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'office-media' AND public.can_reach_office_folder(name, 'read'));
DROP POLICY IF EXISTS office_media_write ON storage.objects;
CREATE POLICY office_media_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'office-media' AND public.can_reach_office_folder(name, 'write'));
DROP POLICY IF EXISTS office_media_delete ON storage.objects;
CREATE POLICY office_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'office-media' AND public.can_reach_office_folder(name, 'write'));


-- ---------------------------------------------------------------------
-- 4) الجهات المانحة
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donor_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(btrim(name)) >= 2),
  entity_type TEXT NOT NULL DEFAULT 'foundation',  -- شركة، وقف، مؤسسة… نصّ حرّ
  country     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.donor_members (
  entity_id  UUID NOT NULL REFERENCES public.donor_entities(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (entity_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_donor_member(_entity UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.donor_members WHERE entity_id = _entity AND user_id = auth.uid());
$fn$;
REVOKE ALL ON FUNCTION public.is_donor_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_donor_member(UUID) TO authenticated;

ALTER TABLE public.donor_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_members  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS de_read ON public.donor_entities;
CREATE POLICY de_read ON public.donor_entities FOR SELECT TO authenticated
  USING (public.is_donor_member(id) OR public.is_admin());
DROP POLICY IF EXISTS de_admin ON public.donor_entities;
CREATE POLICY de_admin ON public.donor_entities FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS dm_read ON public.donor_members;
CREATE POLICY dm_read ON public.donor_members FOR SELECT TO authenticated
  USING (public.is_donor_member(entity_id) OR public.is_admin());
GRANT SELECT, UPDATE ON public.donor_entities TO authenticated;
GRANT SELECT ON public.donor_members TO authenticated;

-- تسجيل جهة: المنشئ مالكها، وتبقى «قيد المراجعة» حتى تعتمدها الإدارة.
CREATE OR REPLACE FUNCTION public.register_donor_entity(_name TEXT, _type TEXT DEFAULT 'foundation', _country TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.donor_entities (name, entity_type, country, created_by)
  VALUES (btrim(_name), COALESCE(NULLIF(btrim(_type), ''), 'foundation'), NULLIF(btrim(_country), ''), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.donor_members (entity_id, user_id, role) VALUES (_id, auth.uid(), 'owner');
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.register_donor_entity(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_donor_entity(TEXT, TEXT, TEXT) TO authenticated;

ALTER TABLE public.support_pledges
  ADD COLUMN IF NOT EXISTS donor_entity_id UUID REFERENCES public.donor_entities(id) ON DELETE RESTRICT;

DROP POLICY IF EXISTS sp_read ON public.support_pledges;
CREATE POLICY sp_read ON public.support_pledges FOR SELECT TO authenticated
  USING (supporter_id = auth.uid() OR public.is_admin()
         OR (donor_entity_id IS NOT NULL AND public.is_donor_member(donor_entity_id)));

-- التعهّد باسم جهة: عضوٌ في جهةٍ معتمدة فقط.
CREATE OR REPLACE FUNCTION public.set_pledge_entity(_pledge UUID, _entity UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_donor_member(_entity)
     OR NOT EXISTS (SELECT 1 FROM public.donor_entities WHERE id = _entity AND status = 'approved') THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.support_pledges SET donor_entity_id = _entity
   WHERE id = _pledge AND supporter_id = auth.uid() AND donor_entity_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'pledge_not_found'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.set_pledge_entity(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pledge_entity(UUID, UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 5) اللوحات
-- ---------------------------------------------------------------------
-- نطاق المكتب: دولته، ومنطقته إن حُدّدت. يُحسب من المجموعات المرآوية
-- والتعهّدات، لا من نصّ orphans.country الحرّ.
CREATE OR REPLACE FUNCTION public.office_dashboard(_office UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o public.offices;
BEGIN
  IF NOT public.office_permission(_office, 'read') THEN
    RAISE EXCEPTION 'office_read_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.offices WHERE id = _office;
  RETURN jsonb_build_object(
    'office', jsonb_build_object('id', _o.id, 'name', _o.name, 'country', _o.country_code, 'region', _o.region),
    'groups', (SELECT count(*) FROM public.mirror_groups g
                WHERE g.deleted_at IS NULL AND g.country_code = _o.country_code
                  AND (_o.region IS NULL OR g.region = _o.region)),
    'orphans', (SELECT count(*) FROM public.orphans o JOIN public.mirror_groups g ON g.id = o.group_id
                 WHERE o.status = 'approved' AND g.deleted_at IS NULL
                   AND g.country_code = _o.country_code
                   AND (_o.region IS NULL OR g.region = _o.region)),
    'pledges', COALESCE((
      SELECT jsonb_object_agg(k.kind, k.v) FROM (
        SELECT p.kind, jsonb_build_object('count', count(*), 'amount', sum(p.amount)) AS v
          FROM public.support_pledges p
          LEFT JOIN public.mirror_groups g ON g.id = p.group_id
          LEFT JOIN public.orphans o ON o.id = p.orphan_id
          LEFT JOIN public.mirror_groups og ON og.id = o.group_id
          LEFT JOIN public.care_organizations c ON c.id = p.org_id
         WHERE p.status IN ('pending', 'active') AND p.country_code = _o.country_code
           AND (_o.region IS NULL
                OR COALESCE(p.region, g.region, og.region, c.region) = _o.region)
         GROUP BY p.kind) k), '{}'::jsonb),
    'reports', jsonb_build_object(
      'draft', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'draft'),
      'submitted', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'submitted'),
      'published', (SELECT count(*) FROM public.office_reports WHERE office_id = _office AND status = 'published')),
    'can_write', public.office_permission(_office, 'write'),
    'can_publish', public.office_permission(_office, 'publish'));
END $fn$;
REVOKE ALL ON FUNCTION public.office_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_dashboard(UUID) TO authenticated;


-- بوابات المستخدم: ما يملكه من أدوار ليُظهر له الواجهة المناسبة.
CREATE OR REPLACE FUNCTION public.my_workspaces()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'admin', public.is_admin(),
    'offices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role,
                                                             'country', o.country_code, 'region', o.region)
                                          ORDER BY o.name)
                           FROM public.office_members m JOIN public.offices o ON o.id = m.office_id
                          WHERE m.user_id = auth.uid() AND o.active), '[]'::jsonb),
    'donor_entities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
                                                                    'status', e.status, 'role', m.role)
                                                 ORDER BY e.name)
                                  FROM public.donor_members m JOIN public.donor_entities e ON e.id = m.entity_id
                                 WHERE m.user_id = auth.uid()), '[]'::jsonb),
    'care_org', EXISTS (SELECT 1 FROM public.care_organizations WHERE owner_id = auth.uid()),
    'guardian', EXISTS (SELECT 1 FROM public.orphans WHERE guardian_id = auth.uid()),
    'pledges', (SELECT count(*) FROM public.support_pledges WHERE supporter_id = auth.uid()));
$fn$;
REVOKE ALL ON FUNCTION public.my_workspaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_workspaces() TO authenticated;


CREATE OR REPLACE FUNCTION public.donor_entity_dashboard(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'entity', (SELECT jsonb_build_object('id', id, 'name', name, 'type', entity_type, 'status', status)
                 FROM public.donor_entities WHERE id = _entity),
    'by_kind', COALESCE((SELECT jsonb_object_agg(kind, total) FROM (
                 SELECT kind, sum(amount) AS total FROM public.support_pledges
                  WHERE donor_entity_id = _entity AND status <> 'cancelled' GROUP BY kind) x), '{}'::jsonb),
    'by_target', COALESCE((SELECT jsonb_object_agg(target_type, n) FROM (
                 SELECT target_type, count(*) AS n FROM public.support_pledges
                  WHERE donor_entity_id = _entity AND status <> 'cancelled' GROUP BY target_type) x), '{}'::jsonb),
    'members', (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity));
END $fn$;
REVOKE ALL ON FUNCTION public.donor_entity_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_entity_dashboard(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 6) أبواب الإدارة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_office_member(_office UUID, _email TEXT, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO _user FROM auth.users u WHERE lower(u.email) = lower(btrim(COALESCE(_email, '')));
  IF _user IS NULL THEN
    RAISE EXCEPTION 'لا حساب بهذا البريد' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.office_members (office_id, user_id, role) VALUES (_office, _user, _role)
  ON CONFLICT (office_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_assign_office_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_office_member(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_offices_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar, 'status', status)
                                            ORDER BY sort_order, code) FROM public.countries), '[]'::jsonb),
    'roles', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', key, 'label', label) ORDER BY sort_order)
                         FROM public.office_roles), '[]'::jsonb),
    'offices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'country', o.country_code, 'region', o.region,
        'parent_id', o.parent_id, 'active', o.active,
        'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) ORDER BY u.email)
                               FROM public.office_members m JOIN auth.users u ON u.id = m.user_id
                              WHERE m.office_id = o.id), '[]'::jsonb))
      ORDER BY o.country_code, o.region NULLS FIRST, o.name) FROM public.offices o), '[]'::jsonb),
    'donor_entities', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'type', e.entity_type, 'status', e.status, 'created_at', e.created_at)
      ORDER BY e.status <> 'pending', e.created_at DESC) FROM public.donor_entities e), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_offices_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_offices_overview() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260910100000', 'offices_portals');

-- >>> migration 20260911100000 support_catalog
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260911100000') THEN
    RAISE EXCEPTION 'الهجرة 20260911100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — كتالوج أهداف الدعم وتعهّداتي
-- ---------------------------------------------------------------------
-- مسار الدعم يحتاج أن يعرض للداعم ما يمكنه اختياره دون أن يفتح جداول
-- المرآة: المجموعة تظهر باسمها ومنطقتها وعدد أطفالها فقط — لا أسماء
-- ولا مشرف (ذلك نطاق «group» بإذن الإدارة).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.support_catalog(_country TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH c AS (
    SELECT code, name_ar FROM public.countries
     WHERE status = 'active' AND (_country IS NULL OR code = _country)
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar) ORDER BY name_ar)
                             FROM c), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('country', r.country, 'name', r.region))
                           FROM (SELECT g.country_code AS country, g.region FROM public.mirror_groups g
                                  WHERE g.deleted_at IS NULL AND g.region IS NOT NULL
                                 UNION
                                 SELECT o.country_code, o.region FROM public.offices o
                                  WHERE o.active AND o.region IS NOT NULL) r
                          WHERE r.country IN (SELECT code FROM c)), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', g.id, 'name', g.name, 'country', g.country_code, 'region', g.region,
                          'children', (SELECT count(*) FROM public.orphans o
                                        WHERE o.group_id = g.id AND o.status = 'approved'))
                        ORDER BY g.region NULLS LAST, g.name)
                          FROM public.mirror_groups g
                         WHERE g.deleted_at IS NULL AND g.country_code IN (SELECT code FROM c)), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'name', o.name, 'kind', k.label, 'country', o.country_code,
                          'region', o.region)
                        ORDER BY o.name)
                          FROM public.care_organizations o
                          LEFT JOIN public.institution_kinds k ON k.key = o.kind
                         WHERE o.status = 'approved' AND o.country_code IN (SELECT code FROM c)), '[]'::jsonb));
$fn$;
GRANT EXECUTE ON FUNCTION public.support_catalog(TEXT) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.my_pledges()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
           'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
           'target', CASE p.target_type
                       WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                       WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                       WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                       WHEN 'region' THEN p.region
                       ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code)
                     END)
         ORDER BY p.created_at DESC), '[]'::jsonb)
    FROM public.support_pledges p
   WHERE p.supporter_id = auth.uid();
$fn$;
REVOKE ALL ON FUNCTION public.my_pledges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pledges() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260911100000', 'support_catalog');

-- >>> migration 20260912100000 sponsorship_ledger
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260912100000') THEN
    RAISE EXCEPTION 'الهجرة 20260912100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — سجلّ الكفالة، وإصلاحات حماية صفحة الطفل
-- ---------------------------------------------------------------------
-- ١) نطاق «identity» كان يعيد الاسم المستعار نفسه: الاسم الحقيقي في
--    orphan_private.full_name، فلم يكن النطاق يكشف شيئاً.
-- ٢) رسالة الكافل للطفل كانت تُحفظ ولا يقرؤها أحد — ولو قُرئت لوصلت
--    طفلاً من غريبٍ بلا مراجعة. صارت تمرّ على دائرة الطفل أولاً.
-- ٣) تقاطع الصفات (بلد، منطقة، جنس، فئة عمرية) في حشدٍ صغير يدلّ على
--    الطفل بعينه: دون خمسة تُحجب المنطقة والمرحلة الدراسية.
-- ٤) سجلّ الكفالة: لكل شهرٍ مستحَقّ — دُفع؟ حُوِّل للجهة؟ وصل الطفل؟
--    والوصول يُثبَت بمستندٍ ويُبلَّغ به الكافل.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ٣) حماية الحشد
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_min()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$ SELECT 5 $fn$;

CREATE OR REPLACE FUNCTION public.cohort_is_safe(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT (
    SELECT count(*) FROM public.orphans x, public.orphans o
     WHERE o.id = _orphan
       AND x.status IN ('approved', 'fully_sponsored')
       AND x.country IS NOT DISTINCT FROM o.country
       AND x.region IS NOT DISTINCT FROM o.region
       AND x.gender IS NOT DISTINCT FROM o.gender
       AND public.age_band_of(x.birth_date) = public.age_band_of(o.birth_date)
  ) >= public.cohort_min();
$fn$;
REVOKE ALL ON FUNCTION public.cohort_is_safe(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cohort_is_safe(UUID) TO anon, authenticated;

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
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها. */
           CASE WHEN public.cohort_is_safe(o.id) THEN o.region END AS region,
           CASE WHEN public.cohort_is_safe(o.id) THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
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


-- خيارات المنطقة لا تُدرج منطقةً لا يظهر فيها أحد: كانت تُنبئ بوجودها.
CREATE OR REPLACE FUNCTION public.orphan_filter_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT o.country) FROM public.orphans o
                            WHERE o.status IN ('approved','fully_sponsored')
                              AND COALESCE(btrim(o.country), '') <> ''), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT o.region) FROM public.orphans o
                          WHERE o.status IN ('approved','fully_sponsored')
                            AND COALESCE(btrim(o.region), '') <> ''
                            AND public.cohort_is_safe(o.id)), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(DISTINCT o.education_stage) FROM public.orphans o
                         WHERE o.status IN ('approved','fully_sponsored')
                           AND COALESCE(btrim(o.education_stage), '') <> ''
                           AND public.cohort_is_safe(o.id)), '[]'::jsonb));
$fn$;


-- ---------------------------------------------------------------------
-- ١) الهوية + ٣) الحشد في صفحة الطفل
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o RECORD; _may BOOLEAN; _acc JSONB; _out JSONB; _scopes TEXT[]; _safe BOOLEAN;
BEGIN
  SELECT * INTO _o FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  _may := public.can_view_orphan_detail(_orphan);
  _scopes := public.my_orphan_scopes(_orphan);
  _safe := _may OR public.cohort_is_safe(_orphan);

  SELECT COALESCE(jsonb_build_object(
           'request_id', a.id, 'status', a.status,
           'expires_at', a.expires_at, 'decision_note', a.decision_note,
           'granted_scopes', to_jsonb(a.granted_scopes),
           'created_at', a.created_at),
         'null'::jsonb)
    INTO _acc
    FROM public.orphan_access_requests a
   WHERE a.orphan_id = _orphan AND a.requester_id = auth.uid()
   ORDER BY a.created_at DESC LIMIT 1;

  _out := jsonb_build_object(
    'id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
    'gender', _o.gender, 'country', _o.country,
    'region', CASE WHEN _safe THEN _o.region END,
    'education_stage', CASE WHEN _safe THEN _o.education_stage END,
    /* الواجهة تُخفي مدينة الجهة أيضاً حين يكون الحشد صغيراً. */
    'cohort_small', NOT public.cohort_is_safe(_orphan),
    'age_band', public.age_band_of(_o.birth_date),
    'monthly_need', _o.monthly_need, 'funded_monthly', _o.funded_monthly,
    'currency', _o.currency, 'status', _o.status, 'org_id', _o.org_id,
    'created_at', _o.created_at,
    'may_view_detail', _may,
    /* ما يملكه القارئ — تبني عليه الواجهة ما تعرض بلا تخمين. */
    'scopes', to_jsonb(_scopes),
    'access', COALESCE(_acc, 'null'::jsonb)
  );

  IF _may THEN
    _out := _out || jsonb_build_object(
      'detail', jsonb_build_object(
        'birth_date', _o.birth_date,
        'city', _o.city,
        'story', _o.story,
        /* الاسم الحقيقي والصورة خلف نطاق `identity` — ومعهما إذن
           الصورة الخاصّ، فهما إذنان لصاحبين مختلفين. */
        'real_name', CASE WHEN 'identity' = ANY(_scopes)
          THEN (SELECT p.full_name FROM public.orphan_private p WHERE p.orphan_id = _orphan) END,
        'photo_url', CASE
          WHEN 'identity' = ANY(_scopes)
           AND _o.photo_consent IN ('granted', 'face_hidden')
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


-- ---------------------------------------------------------------------
-- ٢) رسالة الكافل تمرّ على دائرة الطفل
-- ---------------------------------------------------------------------
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS message_status TEXT NOT NULL DEFAULT 'none'
    CHECK (message_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS message_reviewed_at TIMESTAMPTZ;

-- الرسائل القائمة لم يراجعها أحد: تُعلَّق لا تُعتمد.
UPDATE public.sponsorships SET message_status = 'pending'
 WHERE message IS NOT NULL AND btrim(message) <> '' AND message_status = 'none';

CREATE OR REPLACE FUNCTION public.guard_sponsor_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF COALESCE(current_setting('kahatayn.moderating', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- كل رسالةٍ جديدة أو معدَّلة تعود إلى المراجعة، والحالة لا تُكتب من الخارج.
  IF TG_OP = 'INSERT' OR NEW.message IS DISTINCT FROM OLD.message THEN
    NEW.message_status := CASE WHEN NULLIF(btrim(COALESCE(NEW.message, '')), '') IS NULL
                               THEN 'none' ELSE 'pending' END;
    NEW.message_reviewed_at := NULL;
  ELSE
    NEW.message_status := OLD.message_status;
    NEW.message_reviewed_at := OLD.message_reviewed_at;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_guard_sponsor_message ON public.sponsorships;
CREATE TRIGGER trg_guard_sponsor_message BEFORE INSERT OR UPDATE ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.guard_sponsor_message();

-- ما ينتظر مراجعة من يدير الطفل (الجهة، الولي، الإدارة).
CREATE OR REPLACE FUNCTION public.sponsor_messages_for_review()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'sponsorship_id', s.id, 'orphan_id', o.id, 'orphan', o.display_name,
           'message', s.message, 'created_at', s.created_at)
         ORDER BY s.created_at), '[]'::jsonb)
    FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
   WHERE s.message_status = 'pending' AND public.can_manage_orphan(o.id);
$fn$;
REVOKE ALL ON FUNCTION public.sponsor_messages_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_messages_for_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_sponsor_message(_sponsorship UUID, _approve BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT public.can_manage_orphan(_s.orphan_id) THEN
    RAISE EXCEPTION 'moderation_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('kahatayn.moderating', 'on', true);
  UPDATE public.sponsorships
     SET message_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         message_reviewed_at = now()
   WHERE id = _sponsorship AND message_status = 'pending';
  PERFORM set_config('kahatayn.moderating', '', true);
END $fn$;
REVOKE ALL ON FUNCTION public.moderate_sponsor_message(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_sponsor_message(UUID, BOOLEAN) TO authenticated;

-- ما يصل الطفل وأسرته: المعتمَد فقط، وبلا اسم الكافل.
CREATE OR REPLACE FUNCTION public.orphan_messages(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'messages_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('message', s.message, 'at', s.message_reviewed_at)
                                    ORDER BY s.message_reviewed_at DESC)
                     FROM public.sponsorships s
                    WHERE s.orphan_id = _orphan AND s.message_status = 'approved'), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_messages(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_messages(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- ٤) سجلّ الكفالة: مستحَقّ ← مدفوع ← محوَّل ← واصل
-- ---------------------------------------------------------------------
ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'transferred'
    CHECK (status IN ('scheduled', 'transferred', 'delivered')),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_proof_path TEXT,
  ADD COLUMN IF NOT EXISTS delivery_note TEXT CHECK (delivery_note IS NULL OR length(delivery_note) <= 1000),
  ADD CONSTRAINT ck_delivered_has_proof
    CHECK (status <> 'delivered' OR (delivered_at IS NOT NULL AND delivery_proof_path IS NOT NULL));

-- الجهة تُثبت الوصول بمستند، والكفلاء يُبلَّغون. لا وصول بلا إثبات.
CREATE OR REPLACE FUNCTION public.confirm_disbursement_delivery(
  _disbursement UUID, _proof_path TEXT, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.disbursements; _u UUID;
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

  UPDATE public.disbursements
     SET status = 'delivered', delivered_at = now(),
         delivery_proof_path = _proof_path, delivery_note = NULLIF(btrim(_note), '')
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

-- ما ينتظر الجهة: تحويلاتٌ وصلتها ولم تُثبت وصولها بعد.
CREATE OR REPLACE FUNCTION public.org_pending_deliveries()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'orphan_id', d.orphan_id, 'orphan', o.display_name,
           'amount', d.amount, 'currency', d.currency,
           'period_start', d.period_start, 'period_end', d.period_end, 'created_at', d.created_at)
         ORDER BY d.created_at), '[]'::jsonb)
    FROM public.disbursements d JOIN public.orphans o ON o.id = d.orphan_id
   WHERE d.status = 'transferred' AND public.owns_org(d.org_id);
$fn$;
REVOKE ALL ON FUNCTION public.org_pending_deliveries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_pending_deliveries() TO authenticated;


-- جدول الكفالة كما يراه صاحبها: شهراً شهراً حتى الشهر القادم.
-- مستند الوصول لا يُعطى للكافل (قد يُظهر الطفل)؛ يرى أنه «موثّق» فقط.
CREATE OR REPLACE FUNCTION public.sponsorship_ledger(_sponsorship UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships; _o public.orphans; _months JSONB; _from DATE; _to DATE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT (_s.sponsor_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'ledger_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _s.orphan_id;

  _from := date_trunc('month', COALESCE(_s.started_at, _s.created_at))::date;
  _to := CASE WHEN _s.status IN ('cancelled', 'completed')
              THEN date_trunc('month', COALESCE(_s.ended_at, now()))::date
              ELSE (date_trunc('month', now()) + interval '1 month')::date END;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.month DESC), '[]'::jsonb) INTO _months
    FROM (
      SELECT to_char(g.m, 'YYYY-MM') AS month,
             g.m > date_trunc('month', now()) AS upcoming,
             _s.amount AS due,
             (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id AND p.status = 'paid'
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date)) = g.m) AS paid,
             (SELECT p.status::text FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date, p.created_at::date)) = g.m
               ORDER BY (p.status = 'paid') DESC, p.created_at DESC LIMIT 1) AS payment_status,
             (SELECT d.status FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY (d.status = 'delivered') DESC, d.created_at DESC LIMIT 1) AS delivery_status,
             (SELECT d.delivered_at FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id AND d.status = 'delivered'
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY d.delivered_at DESC LIMIT 1) AS delivered_at
        FROM generate_series(_from, _to, interval '1 month') AS g(m)
    ) m;

  RETURN jsonb_build_object(
    'sponsorship', jsonb_build_object(
      'id', _s.id, 'amount', _s.amount, 'currency', _s.currency, 'status', _s.status,
      'type', _s.type, 'started_at', _s.started_at, 'next_charge_at', _s.next_charge_at,
      'is_anonymous', _s.is_anonymous, 'message', _s.message, 'message_status', _s.message_status,
      'created_at', _s.created_at),
    'orphan', jsonb_build_object('id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
      'country', _o.country, 'age_band', public.age_band_of(_o.birth_date)),
    'months', _months,
    'totals', jsonb_build_object(
      'paid', (SELECT COALESCE(sum(amount), 0) FROM public.sponsorship_payments
                WHERE sponsorship_id = _s.id AND status = 'paid'),
      'months_paid', (SELECT count(*) FROM jsonb_array_elements(_months) x WHERE (x->>'paid')::numeric > 0),
      'months_delivered', (SELECT count(*) FROM jsonb_array_elements(_months) x
                            WHERE x->>'delivery_status' = 'delivered')));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsorship_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsorship_ledger(UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260912100000', 'sponsorship_ledger');

-- >>> migration 20260913100000 brand_settings
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913100000') THEN
    RAISE EXCEPTION 'الهجرة 20260913100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- اسم المنصّة في القاعدة — من إعدادٍ واحد لا من نصوصٍ متفرّقة
-- ---------------------------------------------------------------------
-- رسالة الترحيب كانت تقول «أهلاً بك في IOCO» نصاً ثابتاً. صار الاسم
-- يُقرأ من platform_settings.brand_name، ويُحدَّث بهجرةٍ يولّدها
-- `bun run brand:sync` من src/config/brand.json — فيتغيّر هنا مع الواجهة.
--
-- بادئة رموز الملفّات (IOCO-) معرّفٌ ثابت لا علامة: الملفّات القديمة
-- تبقى برموزها. صارت إعداداً (code_prefix) يُغيَّر إن أُريد للجديد فقط.
-- =====================================================================

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS brand_name TEXT NOT NULL DEFAULT 'كهاتين'
    CHECK (length(btrim(brand_name)) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS code_prefix TEXT NOT NULL DEFAULT 'IOCO-'
    CHECK (code_prefix ~ '^[A-Z]{2,8}-$');

CREATE OR REPLACE FUNCTION public.brand_name()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT brand_name FROM public.platform_settings WHERE id), 'كهاتين');
$fn$;
GRANT EXECUTE ON FUNCTION public.brand_name() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.notify(NEW.id, 'welcome', 'أهلاً بك في ' || public.brand_name(),
    'حسابك جاهز. تصفّح الملفات المعتمدة واختر من تكفله.', '/orphans');
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.notify_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_orphan_code()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $fn$
  SELECT COALESCE((SELECT code_prefix FROM public.platform_settings WHERE id), 'IOCO-')
         || LPAD(nextval('public.orphan_code_seq')::text, 6, '0');
$fn$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260913100000', 'brand_settings');

-- >>> migration 20260914100000 scoped_views_and_delivery
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260914100000') THEN
    RAISE EXCEPTION 'الهجرة 20260914100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — أبواب النطاقات، ومسار تسليم التعهّدات، ورمز البلد
-- ---------------------------------------------------------------------
-- 1.3  رحلة الطفل وتقدّمه ونتائجه، وتقاريره — كلٌّ بنطاقه.
-- 1.6  تقارير المكاتب المنشورة تصل من له نطاق «التقارير» في منطقتها.
-- 1.4  orphans.country_code: رمزٌ من سجلّ الدول بدل الاعتماد على نصٍّ حرّ.
-- 1.7  التعهّد العيني/التأهيلي: تجهيز ← تسليم بمستند ← إشعار الداعم.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1.4) رمز البلد
-- ---------------------------------------------------------------------
ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS country_code TEXT REFERENCES public.countries(code);

CREATE OR REPLACE FUNCTION public.resolve_country_code(_text TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT code FROM public.countries
   WHERE code = upper(btrim(COALESCE(_text, '')))
      OR name_ar = btrim(COALESCE(_text, ''))
      OR lower(name_local) = lower(btrim(COALESCE(_text, '')))
   LIMIT 1;
$fn$;

-- المجموعة المرآوية أصدق من النصّ: إن وُجدت فدولتها هي الدولة.
CREATE OR REPLACE FUNCTION public.sync_orphan_country_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.country_code := COALESCE(
    (SELECT g.country_code FROM public.mirror_groups g WHERE g.id = NEW.group_id),
    public.resolve_country_code(NEW.country),
    NEW.country_code);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_sync_orphan_country_code ON public.orphans;
CREATE TRIGGER trg_sync_orphan_country_code
  BEFORE INSERT OR UPDATE OF country, group_id ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.sync_orphan_country_code();

UPDATE public.orphans o
   SET country_code = COALESCE(
     (SELECT g.country_code FROM public.mirror_groups g WHERE g.id = o.group_id),
     public.resolve_country_code(o.country))
 WHERE o.country_code IS NULL;

GRANT SELECT (country_code) ON public.orphans TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 1.3) الرحلة والتقدّم والنتائج
-- ---------------------------------------------------------------------
-- «journey»: الجلسات ومحاورها وحالتها. «progress»: المرحلة ونسبة المقبول.
-- «results»: المخرَج المسلَّم وتقويم المشرف. يكفي أحدها لفتح الباب،
-- وكلٌّ يُضيف حقوله وحده.
CREATE OR REPLACE FUNCTION public.orphan_journey(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _j BOOLEAN; _p BOOLEAN; _r BOOLEAN;
BEGIN
  _j := public.has_orphan_scope(_orphan, 'journey');
  _p := public.has_orphan_scope(_orphan, 'progress');
  _r := public.has_orphan_scope(_orphan, 'results');
  IF NOT (_j OR _p OR _r) THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  RETURN jsonb_build_object('allowed', true,
    'scopes', jsonb_build_object('journey', _j, 'progress', _p, 'results', _r),
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'program', pr.title,
               'status', e.status,
               'started_at', e.started_at,
               'stage', CASE WHEN _p THEN e.stage::text END,
               'accepted', CASE WHEN _p THEN (SELECT count(*) FROM public.enrollment_units u
                                               WHERE u.enrollment_id = e.id AND u.status = 'accepted') END,
               'total', CASE WHEN _p THEN (SELECT count(*) FROM public.program_units pu
                                            WHERE pu.program_id = e.program_id AND pu.active) END,
               'units', CASE WHEN _j OR _r THEN COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'ordinal', pu.ordinal, 'title', pu.title, 'focus', pu.focus,
                           'status', COALESCE(u.status::text, 'pending'),
                           'evidence', CASE WHEN _r THEN u.evidence END,
                           'note', CASE WHEN _r THEN u.note END,
                           'decided_at', CASE WHEN _r THEN u.decided_at END)
                         ORDER BY pu.ordinal)
                    FROM public.program_units pu
                    LEFT JOIN public.enrollment_units u
                      ON u.unit_id = pu.id AND u.enrollment_id = e.id
                   WHERE pu.program_id = e.program_id AND pu.active), '[]'::jsonb) END)
             ORDER BY e.created_at DESC)
        FROM public.program_enrollments e
        JOIN public.programs pr ON pr.id = e.program_id
       WHERE e.orphan_id = _orphan AND e.status IN ('proposed', 'funded', 'paused', 'completed')
    ), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_journey(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_journey(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 1.3 + 1.6) التقارير: تقارير الجهة المعتمدة + تقارير المكتب المنشورة
-- ---------------------------------------------------------------------
-- ملاحظة الصحّة لا تمرّ هنا: هي من «profile_deep». ومرفقات تقارير المكتب
-- تُعدّ ولا تُعطى مساراتها: قد تُظهر أطفالاً بلا موافقة صورة.
CREATE OR REPLACE FUNCTION public.orphan_reports(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _cc TEXT; _region TEXT;
BEGIN
  IF NOT public.has_orphan_scope(_orphan, 'reports') THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  SELECT COALESCE(g.country_code, o.country_code), COALESCE(g.region, o.region)
    INTO _cc, _region
    FROM public.orphans o LEFT JOIN public.mirror_groups g ON g.id = o.group_id
   WHERE o.id = _orphan;

  RETURN jsonb_build_object('allowed', true,
    'progress', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'period', r.period, 'summary', r.summary,
               'education', r.education_note, 'living', r.living_note,
               'published_at', COALESCE(r.published_at, r.updated_at))
             ORDER BY r.period DESC)
        FROM public.progress_reports r
       WHERE r.orphan_id = _orphan AND r.status = 'approved'), '[]'::jsonb),
    'field', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'office', f.name, 'title', rp.title, 'body', rp.body, 'metrics', rp.metrics,
               'period_start', rp.period_start, 'period_end', rp.period_end,
               'published_at', rp.published_at, 'attachments', cardinality(rp.attachments))
             ORDER BY rp.published_at DESC)
        FROM public.office_reports rp
        JOIN public.offices f ON f.id = rp.office_id
       WHERE rp.status = 'published' AND _cc IS NOT NULL
         AND f.country_code = _cc AND (f.region IS NULL OR f.region = _region)), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_reports(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_reports(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 1.7) مسار تسليم التعهّد
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pledge_deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id   UUID NOT NULL REFERENCES public.support_pledges(id) ON DELETE CASCADE,
  office_id   UUID NOT NULL REFERENCES public.offices(id),
  stage       TEXT NOT NULL CHECK (stage IN ('preparing', 'delivered')),
  proof_path  TEXT,
  note        TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_pledge_delivered_proof CHECK (stage <> 'delivered' OR proof_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pledge_deliveries ON public.pledge_deliveries(pledge_id, created_at);
ALTER TABLE public.pledge_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pd_read ON public.pledge_deliveries;
CREATE POLICY pd_read ON public.pledge_deliveries FOR SELECT TO authenticated
  USING (public.is_admin() OR public.office_permission(office_id, 'read'));
GRANT SELECT ON public.pledge_deliveries TO authenticated;

-- هل يقع التعهّد في نطاق المكتب؟ دولته، ومنطقته إن كان للمكتب منطقة.
CREATE OR REPLACE FUNCTION public.pledge_in_office(_pledge UUID, _office UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.support_pledges p
      JOIN public.offices f ON f.id = _office
      LEFT JOIN public.mirror_groups g ON g.id = p.group_id
      LEFT JOIN public.orphans o ON o.id = p.orphan_id
      LEFT JOIN public.mirror_groups og ON og.id = o.group_id
      LEFT JOIN public.care_organizations c ON c.id = p.org_id
     WHERE p.id = _pledge AND p.country_code = f.country_code
       AND (f.region IS NULL OR COALESCE(p.region, g.region, og.region, c.region, o.region) = f.region));
$fn$;

CREATE OR REPLACE FUNCTION public.record_pledge_delivery(
  _pledge UUID, _office UUID, _stage TEXT, _proof_path TEXT DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.support_pledges;
BEGIN
  IF NOT public.office_permission(_office, 'write') OR NOT public.pledge_in_office(_pledge, _office) THEN
    RAISE EXCEPTION 'delivery_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _p FROM public.support_pledges WHERE id = _pledge;
  IF _p.status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'pledge_not_open';
  END IF;
  IF _stage = 'delivered' THEN
    IF NULLIF(btrim(COALESCE(_proof_path, '')), '') IS NULL THEN RAISE EXCEPTION 'proof_required'; END IF;
    IF split_part(_proof_path, '/', 1) <> _office::text THEN RAISE EXCEPTION 'proof_outside_office'; END IF;
  END IF;

  INSERT INTO public.pledge_deliveries (pledge_id, office_id, stage, proof_path, note, created_by)
  VALUES (_pledge, _office, _stage, NULLIF(btrim(_proof_path), ''), NULLIF(btrim(_note), ''), auth.uid());

  IF _stage = 'delivered' THEN
    UPDATE public.support_pledges SET status = 'fulfilled' WHERE id = _pledge;
    PERFORM public.notify(_p.supporter_id, 'other', 'وصل دعمك',
      'أكّد المكتب تسليم دعمك بمستندٍ موثّق.', '/dashboard', 'pledge', _pledge);
  ELSE
    PERFORM public.notify(_p.supporter_id, 'other', 'يُجهَّز دعمك',
      'بدأ المكتب تجهيز دعمك للتسليم.', '/dashboard', 'pledge', _pledge);
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.record_pledge_delivery(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pledge_delivery(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ما ينتظر المكتب من التعهّدات المفتوحة في نطاقه.
CREATE OR REPLACE FUNCTION public.office_open_pledges(_office UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.office_permission(_office, 'read') THEN
    RAISE EXCEPTION 'office_read_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
             'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
             'target', CASE p.target_type
                         WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                         WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                         WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                         WHEN 'region' THEN p.region
                         ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code) END,
             'last_stage', (SELECT d.stage FROM public.pledge_deliveries d
                             WHERE d.pledge_id = p.id ORDER BY d.created_at DESC LIMIT 1))
           ORDER BY p.created_at)
      FROM public.support_pledges p
     WHERE p.status IN ('pending', 'active') AND public.pledge_in_office(p.id, _office)), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.office_open_pledges(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_open_pledges(UUID) TO authenticated;

-- تعهّداتي بمراحل تسليمها (بلا مسارات المستندات).
CREATE OR REPLACE FUNCTION public.my_pledges()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
           'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
           'target', CASE p.target_type
                       WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                       WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                       WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                       WHEN 'region' THEN p.region
                       ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code)
                     END,
           'deliveries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'stage', d.stage, 'at', d.created_at, 'documented', d.proof_path IS NOT NULL)
                           ORDER BY d.created_at)
                             FROM public.pledge_deliveries d WHERE d.pledge_id = p.id), '[]'::jsonb))
         ORDER BY p.created_at DESC), '[]'::jsonb)
    FROM public.support_pledges p
   WHERE p.supporter_id = auth.uid();
$fn$;

-- الإدارة تفتح التعهّد حين يصل المال (تحويلاً أو نقداً) إلى حين التحصيل الإلكتروني.
CREATE OR REPLACE FUNCTION public.admin_set_pledge_status(_pledge UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.support_pledges SET status = _status WHERE id = _pledge;
  IF NOT FOUND THEN RAISE EXCEPTION 'pledge_not_found'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_pledge_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pledge_status(UUID, TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260914100000', 'scoped_views_and_delivery');

-- >>> migration 20260915100000 supporter_feed
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260915100000') THEN
    RAISE EXCEPTION 'الهجرة 20260915100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — «رحلتي»، ورسالة الشهر، وفلتر المجموعة في الدليل
-- ---------------------------------------------------------------------
-- 4.1  my_journey_feed: خطٌّ زمنيّ واحد لكل ما يخصّ الداعم — ما نُشر عن
--      من يكفلهم، ووصول كفالاتهم، ومراحل تسليم تعهّداتهم؛ والجلسات
--      والسمات فقط حيث له نطاقها.
-- 4.2  my_monthly_digest: ملخّص الثلاثين يوماً لرسالة الشهر.
-- 4.3  list_orphan_cards(_group): الفلترة بالمجموعة.
-- =====================================================================

DROP FUNCTION IF EXISTS public.list_orphan_cards(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT);

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
  _offset INT DEFAULT 0,
  _group UUID DEFAULT NULL
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
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها. */
           CASE WHEN public.cohort_is_safe(o.id) THEN o.region END AS region,
           CASE WHEN public.cohort_is_safe(o.id) THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           o.status, o.org_id, o.created_at, o.group_id,
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
       AND (_group IS NULL OR b.group_id = _group)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما: البحث بالمدينة كان يكشف
          ما حجبناه — يُجرَّب اسمُ مدينةٍ فيُعرف من فيها. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' ORDER BY t.ord), '[]'::jsonb),
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
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.my_journey_feed(_limit INT DEFAULT 40)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.at DESC)
      FROM (
        -- ما كُتب في الخطّ الزمني لمن يكفلهم (نشر تقرير، وصول كفالة…)
        SELECT 'timeline' AS kind, t.event_type AS type, t.created_at AS at,
               o.display_name AS orphan, o.id AS orphan_id, t.detail AS text
          FROM public.timeline_events t
          JOIN public.orphans o ON o.id = t.orphan_id
         WHERE EXISTS (SELECT 1 FROM public.sponsorships s
                        WHERE s.orphan_id = t.orphan_id AND s.sponsor_id = _uid
                          AND s.status IN ('active', 'paused', 'completed'))
        UNION ALL
        -- مراحل تسليم تعهّداته
        SELECT 'pledge', 'pledge.' || d.stage, d.created_at,
               NULL, NULL, NULL
          FROM public.pledge_deliveries d
          JOIN public.support_pledges p ON p.id = d.pledge_id
         WHERE p.supporter_id = _uid
        UNION ALL
        -- الجلسات المقبولة — حيث له نطاق «الرحلة»
        SELECT 'unit', 'unit.accepted', u.decided_at, o.display_name, o.id, pu.title
          FROM public.enrollment_units u
          JOIN public.program_enrollments e ON e.id = u.enrollment_id
          JOIN public.program_units pu ON pu.id = u.unit_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE u.status = 'accepted' AND u.decided_at IS NOT NULL
           AND public.has_orphan_scope(o.id, 'journey')
        UNION ALL
        -- قياسات السمات — حيث له نطاق «السمات»؛ بلا ملاحظة المشرف
        SELECT 'trait', 'trait.measured', s.observed_at, o.display_name, o.id, t.name_ar
          FROM public.orphan_trait_scores s
          JOIN public.trait_definitions t ON t.id = s.trait_id
          JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.deleted_at IS NULL AND public.has_orphan_scope(o.id, 'traits')
         ORDER BY 3 DESC
         LIMIT LEAST(GREATEST(COALESCE(_limit, 40), 1), 200)
      ) f), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.my_journey_feed(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_journey_feed(INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.my_monthly_digest()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _feed JSONB; _since TIMESTAMPTZ := now() - interval '30 days';
BEGIN
  _feed := public.my_journey_feed(200);
  RETURN jsonb_build_object(
    'since', _since,
    'brand', public.brand_name(),
    'paid', (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
              WHERE p.sponsor_id = auth.uid() AND p.status = 'paid' AND p.paid_at >= _since),
    'delivered_months', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                          WHERE x->>'type' = 'disbursement_delivered' AND (x->>'at')::timestamptz >= _since),
    'reports', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                 WHERE x->>'type' = 'report.published' AND (x->>'at')::timestamptz >= _since),
    'units', (SELECT count(*) FROM jsonb_array_elements(_feed) x
               WHERE x->>'type' = 'unit.accepted' AND (x->>'at')::timestamptz >= _since),
    'traits', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                WHERE x->>'type' = 'trait.measured' AND (x->>'at')::timestamptz >= _since),
    'pledges_delivered', (SELECT count(*) FROM jsonb_array_elements(_feed) x
                           WHERE x->>'type' = 'pledge.delivered' AND (x->>'at')::timestamptz >= _since),
    'highlights', COALESCE((SELECT jsonb_agg(x) FROM (
                    SELECT x FROM jsonb_array_elements(_feed) x
                     WHERE (x->>'at')::timestamptz >= _since LIMIT 5) h), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.my_monthly_digest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_monthly_digest() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260915100000', 'supporter_feed');

-- >>> migration 20260916100000 admin_inbox
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260916100000') THEN
    RAISE EXCEPTION 'الهجرة 20260916100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — صندوق قرارات الإدارة
-- ---------------------------------------------------------------------
-- كل ما ينتظر قرار الإدارة في قائمةٍ واحدة مرتّبة بالأقدم: ملفّات،
-- جهات رعاية، طلبات اطّلاع، جهات مانحة، تقارير جهات، تقارير مكاتب،
-- تعهّدات تنتظر فتحها. لكل بندٍ نوعه ومعرّفه وما يكفي ليُقرأ في سطر.
-- =====================================================================

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
      ) i), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;


-- نشر تقرير مكتبٍ مرفوع أو إعادته مسودّة — من الصندوق مباشرة.
CREATE OR REPLACE FUNCTION public.admin_review_office_report(_report UUID, _publish BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.office_reports
     SET status = CASE WHEN _publish THEN 'published' ELSE 'draft' END,
         published_at = CASE WHEN _publish THEN now() END,
         updated_at = now()
   WHERE id = _report AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_submitted'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_review_office_report(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_office_report(UUID, BOOLEAN) TO authenticated;


-- السياق الكامل لبندٍ واحد في اللوح الجانبي.
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
    ELSE NULL END;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260916100000', 'admin_inbox');

-- >>> migration 20260917100000 field
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260917100000') THEN
    RAISE EXCEPTION 'الهجرة 20260917100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917100000', 'field');

-- >>> migration 20260918100000 donors_and_major_supporters
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260918100000') THEN
    RAISE EXCEPTION 'الهجرة 20260918100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — الداعم الكبير والجهات المانحة
-- ---------------------------------------------------------------------
-- 7.1  طلب الاطّلاع يحمل الحزمة المطلوبة، فتُعرض للإدارة مختارةً سلفاً.
-- 7.3  «من أتابعهم»: أذوناتي الممنوحة بنطاقاتها ومدّتها.
-- 7.4  أعضاء الجهة المانحة: يدعوهم المالك بأدوار (مالك، مالي، مطّلع).
-- 7.5  تعهّدات الجهة بمراحل تسليمها لتقرير الأثر.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 7.1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_orphan_access(_orphan UUID, _reason TEXT, _package TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _res JSONB;
BEGIN
  IF _package IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.access_scope_packages WHERE key = _package AND active) THEN
    RAISE EXCEPTION 'unknown_package';
  END IF;
  _res := public.request_orphan_access(_orphan, _reason);
  IF _res ? 'request_id' THEN
    UPDATE public.orphan_access_requests SET requested_package = _package
     WHERE id = (_res->>'request_id')::uuid AND requester_id = auth.uid();
  END IF;
  RETURN _res;
END $fn$;
REVOKE ALL ON FUNCTION public.request_orphan_access(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_orphan_access(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_access_requests(_status TEXT DEFAULT 'pending')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'طابور الأذونات للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'orphan_id', o.id, 'orphan_name', o.display_name, 'orphan_code', o.code,
      'requester_email', u.email, 'reason', a.reason, 'status', a.status,
      'created_at', a.created_at, 'decided_at', a.decided_at, 'expires_at', a.expires_at,
      'requested_package', a.requested_package,
      'package_scopes', (SELECT to_jsonb(p.scopes) FROM public.access_scope_packages p
                          WHERE p.key = a.requested_package),
      'granted_scopes', to_jsonb(a.granted_scopes),
      'sponsorships', (SELECT count(*) FROM public.sponsorships s
                        WHERE s.sponsor_id = a.requester_id AND s.status IN ('active', 'paused'))
    ) ORDER BY a.created_at)
    FROM public.orphan_access_requests a
    JOIN public.orphans o ON o.id = a.orphan_id
    JOIN auth.users u ON u.id = a.requester_id
   WHERE COALESCE(_status, 'pending') = 'any' OR a.status = _status::public.access_status
  ), '[]'::jsonb);
END $fn$;


-- ---------------------------------------------------------------------
-- 7.3
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_access_requests()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'orphan_id', a.orphan_id, 'orphan', o.display_name, 'code', o.code,
    'status', a.status, 'reason', a.reason, 'decision_note', a.decision_note,
    'requested_package', a.requested_package,
    'granted_scopes', CASE WHEN a.status = 'approved' THEN to_jsonb(a.granted_scopes) END,
    'expires_at', a.expires_at, 'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM public.orphan_access_requests a
  JOIN public.orphans o ON o.id = a.orphan_id
  WHERE a.requester_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;


-- ---------------------------------------------------------------------
-- 7.4  أعضاء الجهة المانحة
-- ---------------------------------------------------------------------
ALTER TABLE public.donor_members DROP CONSTRAINT IF EXISTS donor_members_role_check;
ALTER TABLE public.donor_members
  ADD CONSTRAINT donor_members_role_check CHECK (role IN ('owner', 'finance', 'member'));

CREATE OR REPLACE FUNCTION public.is_donor_owner(_entity UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.donor_members
                  WHERE entity_id = _entity AND user_id = auth.uid() AND role = 'owner');
$fn$;

CREATE OR REPLACE FUNCTION public.donor_set_member(_entity UUID, _email TEXT, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID;
BEGIN
  IF NOT (public.is_donor_owner(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_owner_only' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO _user FROM auth.users u WHERE lower(u.email) = lower(btrim(COALESCE(_email, '')));
  IF _user IS NULL THEN RAISE EXCEPTION 'لا حساب بهذا البريد' USING ERRCODE = 'no_data_found'; END IF;
  IF _role = 'remove' THEN
    -- لا تُترك الجهة بلا مالك.
    IF (SELECT role FROM public.donor_members WHERE entity_id = _entity AND user_id = _user) = 'owner'
       AND (SELECT count(*) FROM public.donor_members WHERE entity_id = _entity AND role = 'owner') = 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
    DELETE FROM public.donor_members WHERE entity_id = _entity AND user_id = _user;
  ELSE
    INSERT INTO public.donor_members (entity_id, user_id, role) VALUES (_entity, _user, _role)
    ON CONFLICT (entity_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_set_member(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.donor_members_list(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) ORDER BY m.role, u.email)
                     FROM public.donor_members m JOIN auth.users u ON u.id = m.user_id
                    WHERE m.entity_id = _entity), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.donor_members_list(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_members_list(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 7.5  تعهّدات الجهة بمراحلها — لتقرير الأثر
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.donor_entity_pledges(_entity UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.is_donor_member(_entity) OR public.is_admin()) THEN
    RAISE EXCEPTION 'donor_entity_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'target_type', p.target_type, 'amount', p.amount,
             'currency', p.currency, 'status', p.status, 'created_at', p.created_at,
             'country', p.country_code,
             'target', CASE p.target_type
                         WHEN 'orphan' THEN (SELECT display_name FROM public.orphans WHERE id = p.orphan_id)
                         WHEN 'group' THEN (SELECT name FROM public.mirror_groups WHERE id = p.group_id)
                         WHEN 'institution' THEN (SELECT name FROM public.care_organizations WHERE id = p.org_id)
                         WHEN 'region' THEN p.region
                         ELSE (SELECT name_ar FROM public.countries WHERE code = p.country_code) END,
             'delivered_at', (SELECT max(d.created_at) FROM public.pledge_deliveries d
                               WHERE d.pledge_id = p.id AND d.stage = 'delivered'))
           ORDER BY p.created_at DESC)
      FROM public.support_pledges p WHERE p.donor_entity_id = _entity), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.donor_entity_pledges(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donor_entity_pledges(UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260918100000', 'donors_and_major_supporters');

-- >>> migration 20260919100000 mirror_sync
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260919100000') THEN
    RAISE EXCEPTION 'الهجرة 20260919100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — مزامنة المرآة مع منصّة التشغيل (الرواد)
-- ---------------------------------------------------------------------
-- اتجاهٌ واحد: الرواد تكتب، وكهاتين تقرأ. تدفع الرواد دفعاتٍ لكل كيان
-- (مجموعات، طلاب، أبعاد، سمات، درجات) بمؤشّر (cursor_at, cursor_ref)
-- يُحفظ هنا لتعرف من أين تستأنف. المحذوف هناك علامةٌ هنا لا مسح.
-- والمطابقة الدورية تُرسل كل المعرّفات فيُكتب الانحراف للإدارة.
--
-- الحماية:
--   • الباب mirror_apply لـ service_role وحده (البوّابة بعد فحص المفتاح).
--   • المفتاح يحمل نطاق mirror:write ومرتبطٌ بمنصّةٍ واحدة لا يكتب لغيرها.
--   • الطالب المستورَد يقف «قيد المراجعة» (الحارس القائم)، فلا يُنشر طفلٌ
--     بمفتاحٍ مسرَّب.
-- =====================================================================

ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_api_scopes_known;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_api_scopes_known CHECK (
  scopes <@ ARRAY['orphans:read', 'orphans:import', 'mirror:write'] AND cardinality(scopes) > 0);
ALTER TABLE public.api_clients
  ADD COLUMN IF NOT EXISTS source TEXT REFERENCES public.operating_platforms(key);
ALTER TABLE public.api_clients DROP CONSTRAINT IF EXISTS ck_mirror_needs_source;
ALTER TABLE public.api_clients ADD CONSTRAINT ck_mirror_needs_source
  CHECK (NOT ('mirror:write' = ANY(scopes)) OR source IS NOT NULL);

-- الجهة المسؤولة عن أطفال منصّة التشغيل في كهاتين.
ALTER TABLE public.operating_platforms
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.care_organizations(id);

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS external_deleted_at TIMESTAMPTZ;


CREATE OR REPLACE FUNCTION public.mirror_apply(
  _client UUID, _entity TEXT, _records JSONB, _deleted TEXT[] DEFAULT '{}',
  _cursor_at TIMESTAMPTZ DEFAULT NULL, _cursor_ref TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _src TEXT; _p public.operating_platforms; _r JSONB; _n INTEGER := 0; _skipped JSONB := '[]'::jsonb;
  _dim UUID; _trait UUID; _orphan UUID; _group UUID; _cname TEXT;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted'); END IF;
  SELECT * INTO _p FROM public.operating_platforms WHERE key = _src AND active;
  IF _p.key IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'platform_inactive'); END IF;
  IF jsonb_typeof(COALESCE(_records, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(_records, '[]')) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_batch');
  END IF;
  SELECT name_ar INTO _cname FROM public.countries WHERE code = _p.country_code;

  FOR _r IN SELECT * FROM jsonb_array_elements(COALESCE(_records, '[]'::jsonb)) LOOP
    IF NULLIF(btrim(COALESCE(_r->>'external_ref', _r->>'key', '')), '') IS NULL THEN
      _skipped := _skipped || jsonb_build_object('reason', 'external_ref_required');
      CONTINUE;
    END IF;

    IF _entity = 'groups' THEN
      INSERT INTO public.mirror_groups AS g (source, external_ref, name, country_code, region,
             institution_ref, institution_name, supervisor_ref, supervisor_name, source_updated_at, synced_at, deleted_at)
      VALUES (_src, _r->>'external_ref', COALESCE(NULLIF(_r->>'name', ''), 'مجموعة'), _p.country_code,
              NULLIF(_r->>'region', ''), NULLIF(_r->>'institution_ref', ''), NULLIF(_r->>'institution_name', ''),
              NULLIF(_r->>'supervisor_ref', ''), NULLIF(_r->>'supervisor_name', ''),
              NULLIF(_r->>'updated_at', '')::timestamptz, now(), NULL)
      ON CONFLICT (source, external_ref) DO UPDATE SET
        name = EXCLUDED.name, region = EXCLUDED.region, institution_ref = EXCLUDED.institution_ref,
        institution_name = EXCLUDED.institution_name, supervisor_ref = EXCLUDED.supervisor_ref,
        supervisor_name = EXCLUDED.supervisor_name, source_updated_at = EXCLUDED.source_updated_at,
        synced_at = now(), deleted_at = NULL;

    ELSIF _entity = 'students' THEN
      IF _p.org_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'platform_org_missing'); END IF;
      SELECT id INTO _group FROM public.mirror_groups
       WHERE source = _src AND external_ref = NULLIF(_r->>'group_ref', '');
      SELECT id INTO _orphan FROM public.orphans
       WHERE external_source = _src AND external_ref = _r->>'external_ref';
      IF _orphan IS NULL THEN
        IF NULLIF(btrim(COALESCE(_r->>'display_name', '')), '') IS NULL THEN
          _skipped := _skipped || jsonb_build_object('ref', _r->>'external_ref', 'reason', 'display_name_required');
          CONTINUE;
        END IF;
        -- العمر عددٌ في الرواد؛ يُحوَّل لتاريخٍ تقريبيّ (أول السنة) تكفي منه الفئة العمرية.
        INSERT INTO public.orphans (code, org_id, external_source, external_ref, display_name, gender,
               birth_date, country, region, education_stage, monthly_need, currency, status, group_id)
        VALUES (public.next_orphan_code(), _p.org_id, _src, _r->>'external_ref', btrim(_r->>'display_name'),
                CASE WHEN _r->>'gender' = 'female' THEN 'female' ELSE 'male' END,
                CASE WHEN NULLIF(_r->>'age', '') IS NOT NULL
                     THEN make_date(extract(year FROM now())::int - (_r->>'age')::int, 1, 1) END,
                COALESCE(_cname, _p.country_code), NULLIF(_r->>'region', ''),
                NULLIF(_r->>'education_stage', ''), 0, 'EUR', 'under_review', _group);
      ELSE
        UPDATE public.orphans o SET
          display_name = COALESCE(NULLIF(btrim(_r->>'display_name'), ''), o.display_name),
          region = COALESCE(NULLIF(_r->>'region', ''), o.region),
          education_stage = COALESCE(NULLIF(_r->>'education_stage', ''), o.education_stage),
          group_id = COALESCE(_group, o.group_id),
          external_deleted_at = NULL
         WHERE o.id = _orphan;
      END IF;

    ELSIF _entity = 'trait_dimensions' THEN
      INSERT INTO public.trait_dimensions AS d (source, key, label_ar, label_local, description, sort_order)
      VALUES (_src, COALESCE(_r->>'key', _r->>'external_ref'), COALESCE(NULLIF(_r->>'label_ar', ''), _r->>'key'),
              NULLIF(_r->>'label_local', ''), NULLIF(_r->>'description', ''),
              COALESCE(NULLIF(_r->>'sort_order', '')::int, 100))
      ON CONFLICT (source, key) DO UPDATE SET label_ar = EXCLUDED.label_ar,
        label_local = EXCLUDED.label_local, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

    ELSIF _entity = 'traits' THEN
      SELECT id INTO _dim FROM public.trait_dimensions WHERE source = _src AND key = _r->>'dimension_key';
      IF _dim IS NULL THEN
        _skipped := _skipped || jsonb_build_object('ref', _r->>'external_ref', 'reason', 'unknown_dimension');
        CONTINUE;
      END IF;
      INSERT INTO public.trait_definitions AS t (source, external_ref, dimension_id, stage_label, name_ar,
             name_local, definition_ar, definition_local, elements, sort_order, deleted_at)
      VALUES (_src, _r->>'external_ref', _dim, NULLIF(_r->>'stage_label', ''),
              COALESCE(NULLIF(_r->>'name_ar', ''), _r->>'external_ref'), NULLIF(_r->>'name_local', ''),
              NULLIF(_r->>'definition_ar', ''), NULLIF(_r->>'definition_local', ''),
              CASE WHEN jsonb_typeof(_r->'elements') = 'array' THEN _r->'elements' ELSE '[]'::jsonb END,
              COALESCE(NULLIF(_r->>'sort_order', '')::int, 100), NULL)
      ON CONFLICT (source, external_ref) DO UPDATE SET dimension_id = EXCLUDED.dimension_id,
        stage_label = EXCLUDED.stage_label, name_ar = EXCLUDED.name_ar, name_local = EXCLUDED.name_local,
        definition_ar = EXCLUDED.definition_ar, definition_local = EXCLUDED.definition_local,
        elements = EXCLUDED.elements, sort_order = EXCLUDED.sort_order, deleted_at = NULL;

    ELSIF _entity = 'trait_scores' THEN
      SELECT id INTO _orphan FROM public.orphans WHERE external_source = _src AND external_ref = _r->>'student_ref';
      SELECT id INTO _trait FROM public.trait_definitions WHERE source = _src AND external_ref = _r->>'trait_ref';
      IF _orphan IS NULL OR _trait IS NULL
         OR NULLIF(_r->>'score', '') IS NULL OR NULLIF(_r->>'observed_at', '') IS NULL THEN
        _skipped := _skipped || jsonb_build_object('ref', _r->>'external_ref', 'reason', 'unresolved_reference');
        CONTINUE;
      END IF;
      INSERT INTO public.orphan_trait_scores AS s (source, external_ref, orphan_id, trait_id, score, scale_max, observed_at, note, deleted_at)
      VALUES (_src, _r->>'external_ref', _orphan, _trait, (_r->>'score')::numeric,
              COALESCE(NULLIF(_r->>'scale_max', '')::numeric, 100), (_r->>'observed_at')::timestamptz,
              NULLIF(_r->>'note', ''), NULL)
      ON CONFLICT (source, external_ref) DO UPDATE SET score = EXCLUDED.score, scale_max = EXCLUDED.scale_max,
        observed_at = EXCLUDED.observed_at, note = EXCLUDED.note, deleted_at = NULL;
    ELSE
      RETURN jsonb_build_object('ok', false, 'code', 'unknown_entity');
    END IF;
    _n := _n + 1;
  END LOOP;

  -- علامات الحذف
  IF cardinality(COALESCE(_deleted, '{}')) > 0 THEN
    CASE _entity
      WHEN 'groups' THEN UPDATE public.mirror_groups SET deleted_at = now()
                          WHERE source = _src AND external_ref = ANY(_deleted);
      WHEN 'students' THEN UPDATE public.orphans SET external_deleted_at = now()
                            WHERE external_source = _src AND external_ref = ANY(_deleted);
      WHEN 'traits' THEN UPDATE public.trait_definitions SET deleted_at = now()
                          WHERE source = _src AND external_ref = ANY(_deleted);
      WHEN 'trait_scores' THEN UPDATE public.orphan_trait_scores SET deleted_at = now()
                                WHERE source = _src AND external_ref = ANY(_deleted);
      ELSE NULL;
    END CASE;
  END IF;

  INSERT INTO public.mirror_sync_state AS m (source, entity, cursor_at, cursor_ref, last_run_at, last_error)
  VALUES (_src, _entity, _cursor_at, _cursor_ref, now(), NULL)
  ON CONFLICT (source, entity) DO UPDATE SET
    cursor_at = COALESCE(EXCLUDED.cursor_at, m.cursor_at),
    cursor_ref = COALESCE(EXCLUDED.cursor_ref, m.cursor_ref),
    last_run_at = now(), last_error = NULL;

  RETURN jsonb_build_object('ok', true, 'applied', _n, 'deleted', cardinality(COALESCE(_deleted, '{}')),
                            'skipped', _skipped);
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_apply(UUID, TEXT, JSONB, TEXT[], TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_apply(UUID, TEXT, JSONB, TEXT[], TIMESTAMPTZ, TEXT) TO service_role;


-- المطابقة: الرواد ترسل كل معرّفات الكيان؛ يُكتب ما ينقص هنا وما زاد.
CREATE OR REPLACE FUNCTION public.mirror_reconcile(_client UUID, _entity TEXT, _refs TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _src TEXT; _ours TEXT[]; _drift JSONB;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'client_not_permitted'); END IF;
  _ours := CASE _entity
    WHEN 'groups' THEN ARRAY(SELECT external_ref FROM public.mirror_groups WHERE source = _src AND deleted_at IS NULL)
    WHEN 'students' THEN ARRAY(SELECT external_ref FROM public.orphans
                                WHERE external_source = _src AND external_deleted_at IS NULL)
    WHEN 'traits' THEN ARRAY(SELECT external_ref FROM public.trait_definitions WHERE source = _src AND deleted_at IS NULL)
    WHEN 'trait_scores' THEN ARRAY(SELECT external_ref FROM public.orphan_trait_scores WHERE source = _src AND deleted_at IS NULL)
    ELSE NULL END;
  IF _ours IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'unknown_entity'); END IF;
  _drift := jsonb_build_object(
    'checked_at', now(),
    'upstream', cardinality(COALESCE(_refs, '{}')),
    'here', cardinality(_ours),
    'missing_here', to_jsonb(ARRAY(SELECT unnest(COALESCE(_refs, '{}')) EXCEPT SELECT unnest(_ours) LIMIT 200)),
    'missing_upstream', to_jsonb(ARRAY(SELECT unnest(_ours) EXCEPT SELECT unnest(COALESCE(_refs, '{}')) LIMIT 200)));
  INSERT INTO public.mirror_sync_state AS m (source, entity, last_run_at, drift)
  VALUES (_src, _entity, now(), _drift)
  ON CONFLICT (source, entity) DO UPDATE SET drift = EXCLUDED.drift, last_run_at = now();
  RETURN jsonb_build_object('ok', true, 'drift', _drift);
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_reconcile(UUID, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_reconcile(UUID, TEXT, TEXT[]) TO service_role;


CREATE OR REPLACE FUNCTION public.admin_mirror_status()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'platforms', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name,
                     'country', p.country_code, 'active', p.active, 'org_id', p.org_id)) FROM public.operating_platforms p), '[]'::jsonb),
    'state', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', m.source, 'entity', m.entity,
                 'cursor_at', m.cursor_at, 'last_run_at', m.last_run_at, 'last_error', m.last_error,
                 'drift', m.drift) ORDER BY m.source, m.entity) FROM public.mirror_sync_state m), '[]'::jsonb),
    'counts', jsonb_build_object(
      'groups', (SELECT count(*) FROM public.mirror_groups WHERE deleted_at IS NULL),
      'students', (SELECT count(*) FROM public.orphans WHERE external_source IS NOT NULL AND external_deleted_at IS NULL),
      'students_deleted_upstream', (SELECT count(*) FROM public.orphans WHERE external_deleted_at IS NOT NULL),
      'traits', (SELECT count(*) FROM public.trait_definitions WHERE deleted_at IS NULL),
      'scores', (SELECT count(*) FROM public.orphan_trait_scores WHERE deleted_at IS NULL)));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_mirror_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mirror_status() TO authenticated;

-- ربط منصّة التشغيل بجهتها — للإدارة.
CREATE OR REPLACE FUNCTION public.admin_set_platform_org(_platform TEXT, _org UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.operating_platforms SET org_id = _org WHERE key = _platform;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_platform_org(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_org(TEXT, UUID) TO authenticated;


-- إصدار مفتاح مزامنةٍ مرتبطٍ بمنصّة تشغيل.
CREATE OR REPLACE FUNCTION public.create_api_client(
  _name TEXT, _org UUID, _scopes TEXT[], _key TEXT,
  _salt TEXT, _hash TEXT, _prefix TEXT, _source TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إصدار المفاتيح للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(_name), '') = '' THEN
    RAISE EXCEPTION 'اسم العميل مطلوب' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.api_clients
    (name, client_key, secret_hash, secret_salt, secret_prefix, org_id, scopes, created_by, source)
  VALUES (btrim(_name), _key, _hash, _salt, _prefix, _org, _scopes, auth.uid(), NULLIF(_source, ''))
  RETURNING id INTO _id;
  PERFORM public.write_audit('api_client.created', 'api_client', _id,
    jsonb_build_object('scopes', to_jsonb(_scopes), 'org', _org, 'source', _source));
  RETURN jsonb_build_object('id', _id, 'client_key', _key);
END $fn$;
REVOKE ALL ON FUNCTION public.create_api_client(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_client(TEXT, UUID, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260919100000', 'mirror_sync');

-- >>> migration 20260920100000 guardian_consents
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260920100000') THEN
    RAISE EXCEPTION 'الهجرة 20260920100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- كهاتين — مساحة الوليّ: أين وصل طفله، وما المطلوب منه، والموافقة بضغطة
-- ---------------------------------------------------------------------
-- الموافقة «بضغطة» ليست موافقةً بلا وثيقة: كل ضغطةٍ تكتب سجلّ موافقةٍ
-- إلكترونية (من، متى، على أيّ نصّ بالحرف) يصير هو الوثيقة. والقيود
-- القائمة (موافقة الصورة الكاملة تحتاج وثيقة، والموافقة للوليّ والوصي
-- وحدهما) تبقى كما هي — والسجلّ يحقّقها.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.guardian_e_consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  orphan_id   UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL CHECK (subject IN ('enrollment', 'photo')),
  subject_ref UUID,
  decision    TEXT NOT NULL,
  statement   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guardian_e_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gec_read ON public.guardian_e_consents;
CREATE POLICY gec_read ON public.guardian_e_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_orphan(orphan_id));
GRANT SELECT ON public.guardian_e_consents TO authenticated;

CREATE OR REPLACE FUNCTION public.consent_statement(_subject TEXT, _decision TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _subject || ':' || _decision
    WHEN 'enrollment:granted' THEN 'أوافق بصفتي وليّاً على التحاق الطفل ببرنامج بناء الأهلية، وعلى أن يُقاس تقدّمه وتُرصد سماته، ويُعرض ذلك لمن تأذن له الإدارة.'
    WHEN 'photo:face_hidden' THEN 'أوافق على نشر صورٍ للطفل لا يظهر فيها وجهه.'
    WHEN 'photo:granted' THEN 'أوافق على نشر صورٍ للطفل يظهر فيها وجهه، وأعلم أنني أستطيع سحب الموافقة متى شئت فتُحذف الصورة.'
    WHEN 'photo:withdrawn' THEN 'أسحب موافقتي على نشر صور الطفل.'
    ELSE NULL END;
$fn$;


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
                           AND r.person_id = auth.uid()), '[]'::jsonb)
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE o.guardian_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.guardian_children_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_children_overview() TO authenticated;


CREATE OR REPLACE FUNCTION public.guardian_consent_enrollment(_role UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID; _id UUID;
BEGIN
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  IF _r.id IS NULL OR _r.person_id IS DISTINCT FROM auth.uid() OR _r.role NOT IN ('guardian', 'trustee')
     OR _r.ended_at IS NOT NULL THEN
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


CREATE OR REPLACE FUNCTION public.guardian_set_photo_consent(_orphan UUID, _state TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND guardian_id = auth.uid()) THEN
    RAISE EXCEPTION 'consent_denied' USING ERRCODE = '42501';
  END IF;
  IF public.consent_statement('photo', _state) IS NULL THEN RAISE EXCEPTION 'invalid_state'; END IF;
  INSERT INTO public.guardian_e_consents (user_id, orphan_id, subject, decision, statement)
  VALUES (auth.uid(), _orphan, 'photo', _state, public.consent_statement('photo', _state))
  RETURNING id INTO _id;
  UPDATE public.orphans
     SET photo_consent = _state::public.photo_consent_state,
         photo_consent_at = now(), photo_consent_by = auth.uid(),
         photo_consent_doc = 'e-consent:' || _id
   WHERE id = _orphan;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.guardian_set_photo_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_set_photo_consent(UUID, TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260920100000', 'guardian_consents');

-- >>> migration 20260921100000 geo_stats
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260921100000') THEN
    RAISE EXCEPTION 'الهجرة 20260921100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- مصدرٌ واحد للجغرافيا: كم يتيماً في كل دولة وكل منطقة
-- ---------------------------------------------------------------------
-- الخارطة، وقائمتا البلد والمنطقة في الدليل، والصفحات التي تسأل «أين؟»
-- تقرأ كلّها من هذه الدالّة — فلا تُظهر الخارطة دولةً لا يجدها الدليل،
-- ولا العكس.
--
-- الحماية في القاعدة لا في الواجهة: ما دون حدّ الحشد (cohort_min) يُعاد
-- «صغيراً» بلا رقم، وتقسيم «مكفول/ينتظر» يُحجب إن صغر أحد شقّيه — فلا
-- يُستنتج من الخارطة أن طفلاً بعينه في قريةٍ بعينها بلا كافل.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.geo_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pub AS (
    SELECT btrim(o.country) AS country,
           NULLIF(btrim(o.region), '') AS region,
           (o.status = 'fully_sponsored') AS sponsored
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.country), '') <> ''
  ),
  reg AS (
    SELECT country, region, count(*) AS total, count(*) FILTER (WHERE sponsored) AS spon
      FROM pub WHERE region IS NOT NULL GROUP BY country, region
  ),
  cty AS (
    SELECT country, count(*) AS total, count(*) FILTER (WHERE sponsored) AS spon
      FROM pub GROUP BY country
  ),
  shaped AS (
    SELECT c.country,
           c.total, c.spon,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'region', r.region,
                      'small', r.total < public.cohort_min(),
                      'total', CASE WHEN r.total < public.cohort_min() THEN NULL ELSE r.total END,
                      'sponsored', CASE WHEN r.total < public.cohort_min()
                                          OR r.spon < public.cohort_min()
                                          OR r.total - r.spon < public.cohort_min()
                                        THEN NULL ELSE r.spon END)
                    ORDER BY r.total DESC, r.region)
               FROM reg r WHERE r.country = c.country), '[]'::jsonb) AS regions
      FROM cty c
  )
  SELECT jsonb_build_object(
    'countries', COALESCE(jsonb_agg(jsonb_build_object(
        'country', s.country,
        'small', s.total < public.cohort_min(),
        'total', CASE WHEN s.total < public.cohort_min() THEN NULL ELSE s.total END,
        'sponsored', CASE WHEN s.total < public.cohort_min()
                            OR s.spon < public.cohort_min()
                            OR s.total - s.spon < public.cohort_min()
                          THEN NULL ELSE s.spon END,
        'regions', s.regions)
      ORDER BY s.total DESC, s.country), '[]'::jsonb)
  ) FROM shaped s;
$fn$;
REVOKE ALL ON FUNCTION public.geo_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.geo_stats() TO anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260921100000', 'geo_stats');

-- >>> migration 20260922100000 integrity
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922100000') THEN
    RAISE EXCEPTION 'الهجرة 20260922100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- سلامة الحقيقة: تثبيت الطفل المكفول، والفكّ بموافقتين، وسجلٌّ لا يُمحى
-- ---------------------------------------------------------------------
-- العقد: docs/integration/kahatayn-rowad.ar.md (البنود ٢، ٥، ٦، وك١–ك٧).
--
-- ١) سجلّ السلامة `integrity_log`: كل حدثٍ مهمّ يُكتب ببصمة سابقه، فلا
--    يُعدَّل سطرٌ ولا يُحذف دون أن تنكسر السلسلة — والجدول يرفض التعديل
--    والحذف أصلاً، حتى من صاحب القاعدة.
-- ٢) الأقفال `orphan_locks`: أوّل كفالةٍ فعّالة أو دعمٍ مقبول أو صرفٍ
--    باسم الطفل يقفل ملفّه. المقفول لا يُحذف، ولا تتغيّر هويته.
-- ٣) ما يأتي من المرآة على مقفولٍ يُمسَك ولا يُطبَّق صامتاً: يبقى القديم،
--    ويُكتب «اختلافٌ» في صندوق الإدارة.
-- ٤) الفكّ بطلبٍ رسمي: سببٌ ومستند، وموافقة مسؤولَين غير الطالب، ونافذة
--    ١٥ دقيقة، ويُستعمل مرّة.
-- ٥) المصادر: حالة كل منصّة تشغيل، ووضع الطوارئ للدولة، وسلسلة دفعات
--    المزامنة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) سجلّ السلامة — إلحاقٌ فقط، وكل سطرٍ ببصمة سابقه
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrity_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      UUID,
  kind       TEXT NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  orphan_id  UUID,
  source     TEXT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash  TEXT NOT NULL DEFAULT '',
  hash       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_integrity_orphan ON public.integrity_log(orphan_id, id);
ALTER TABLE public.integrity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS il_admin ON public.integrity_log;
CREATE POLICY il_admin ON public.integrity_log FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.integrity_log FROM anon, authenticated;
GRANT SELECT ON public.integrity_log TO authenticated;

CREATE OR REPLACE FUNCTION public.integrity_row_hash(
  _prev TEXT, _at TIMESTAMPTZ, _actor UUID, _kind TEXT, _orphan UUID, _source TEXT, _detail JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT encode(sha256(convert_to(concat_ws('|', _prev, to_char(_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
         COALESCE(_actor::text, ''), _kind, COALESCE(_orphan::text, ''), COALESCE(_source, ''),
         _detail::text), 'UTF8')), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public.integrity_log_chain()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- سلسلةٌ واحدة: إدراجٌ واحد في كل لحظة، فلا يتشعّب «السابق».
  PERFORM pg_advisory_xact_lock(hashtext('integrity_log'));
  NEW.at := clock_timestamp();
  NEW.actor := COALESCE(NEW.actor, auth.uid());
  NEW.prev_hash := COALESCE((SELECT hash FROM public.integrity_log ORDER BY id DESC LIMIT 1), 'genesis');
  NEW.hash := public.integrity_row_hash(NEW.prev_hash, NEW.at, NEW.actor, NEW.kind, NEW.orphan_id,
                                        NEW.source, NEW.detail);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS integrity_log_chain ON public.integrity_log;
CREATE TRIGGER integrity_log_chain BEFORE INSERT ON public.integrity_log
  FOR EACH ROW EXECUTE FUNCTION public.integrity_log_chain();

CREATE OR REPLACE FUNCTION public.append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '%_append_only', TG_TABLE_NAME USING ERRCODE = '42501';
END $fn$;
DROP TRIGGER IF EXISTS integrity_log_frozen ON public.integrity_log;
CREATE TRIGGER integrity_log_frozen BEFORE UPDATE OR DELETE ON public.integrity_log
  FOR EACH ROW EXECUTE FUNCTION public.append_only();
DROP TRIGGER IF EXISTS integrity_log_no_truncate ON public.integrity_log;
CREATE TRIGGER integrity_log_no_truncate BEFORE TRUNCATE ON public.integrity_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.append_only();

CREATE OR REPLACE FUNCTION public.log_integrity(
  _kind TEXT, _orphan UUID DEFAULT NULL, _detail JSONB DEFAULT '{}'::jsonb, _source TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public.integrity_log (kind, orphan_id, detail, source) VALUES (_kind, _orphan, _detail, _source);
$fn$;
REVOKE ALL ON FUNCTION public.log_integrity(TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- التحقّق: يعيد حساب السلسلة كاملة، ويذكر أوّل سطرٍ انكسر عنده.
CREATE OR REPLACE FUNCTION public.integrity_verify()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.integrity_log; _prev TEXT := 'genesis'; _n BIGINT := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  FOR _r IN SELECT * FROM public.integrity_log ORDER BY id LOOP
    IF _r.prev_hash <> _prev OR _r.hash <> public.integrity_row_hash(_r.prev_hash, _r.at, _r.actor,
         _r.kind, _r.orphan_id, _r.source, _r.detail) THEN
      RETURN jsonb_build_object('ok', false, 'checked', _n, 'broken_at', _r.id);
    END IF;
    _prev := _r.hash; _n := _n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'checked', _n, 'head', _prev);
END $fn$;
REVOKE ALL ON FUNCTION public.integrity_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integrity_verify() TO authenticated;


-- ---------------------------------------------------------------------
-- ٢) الأقفال
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orphan_locks (
  orphan_id  UUID PRIMARY KEY REFERENCES public.orphans(id) ON DELETE RESTRICT,
  reason     TEXT NOT NULL CHECK (reason IN ('sponsored', 'supported', 'disbursed', 'manual')),
  source_ref UUID,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orphan_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ol_admin ON public.orphan_locks;
CREATE POLICY ol_admin ON public.orphan_locks FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.orphan_locks FROM anon, authenticated;
GRANT SELECT ON public.orphan_locks TO authenticated;

CREATE OR REPLACE FUNCTION public.orphan_is_locked(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.orphan_locks WHERE orphan_id = _orphan);
$fn$;

CREATE OR REPLACE FUNCTION public.lock_orphan(_orphan UUID, _reason TEXT, _ref UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF _orphan IS NULL THEN RETURN; END IF;
  INSERT INTO public.orphan_locks (orphan_id, reason, source_ref) VALUES (_orphan, _reason, _ref)
  ON CONFLICT (orphan_id) DO NOTHING;
  IF FOUND THEN
    PERFORM public.log_integrity('locked', _orphan, jsonb_build_object('reason', _reason, 'ref', _ref));
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.lock_orphan(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- القفل يُرفع بطلب «فكّ» معتمد وحده (البند ٤).
CREATE OR REPLACE FUNCTION public.guard_orphan_locks()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' OR NOT public.unlock_context_allows(OLD.orphan_id, 'unlock') THEN
    RAISE EXCEPTION 'orphan_lock_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $fn$;

-- مُقفِلات: كفالةٌ فعّالة، دعمٌ مقبول لطفلٍ بعينه، صرفٌ باسمه.
CREATE OR REPLACE FUNCTION public.lock_on_sponsorship()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'active' THEN PERFORM public.lock_orphan(NEW.orphan_id, 'sponsored', NEW.id); END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS lock_on_sponsorship ON public.sponsorships;
CREATE TRIGGER lock_on_sponsorship AFTER INSERT OR UPDATE OF status ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.lock_on_sponsorship();

CREATE OR REPLACE FUNCTION public.lock_on_pledge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.orphan_id IS NOT NULL AND NEW.status IN ('active', 'fulfilled') THEN
    PERFORM public.lock_orphan(NEW.orphan_id, 'supported', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS lock_on_pledge ON public.support_pledges;
CREATE TRIGGER lock_on_pledge AFTER INSERT OR UPDATE OF status ON public.support_pledges
  FOR EACH ROW EXECUTE FUNCTION public.lock_on_pledge();

CREATE OR REPLACE FUNCTION public.lock_on_disbursement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.lock_orphan(NEW.orphan_id, 'disbursed', NEW.id);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS lock_on_disbursement ON public.disbursements;
CREATE TRIGGER lock_on_disbursement AFTER INSERT ON public.disbursements
  FOR EACH ROW EXECUTE FUNCTION public.lock_on_disbursement();

-- من كُفل قبل هذه الهجرة يُقفل الآن.
INSERT INTO public.orphan_locks (orphan_id, reason, source_ref)
SELECT DISTINCT ON (s.orphan_id) s.orphan_id, 'sponsored', s.id
  FROM public.sponsorships s WHERE s.status = 'active'
 ORDER BY s.orphan_id, s.started_at NULLS LAST
ON CONFLICT (orphan_id) DO NOTHING;
INSERT INTO public.orphan_locks (orphan_id, reason, source_ref)
SELECT DISTINCT ON (p.orphan_id) p.orphan_id, 'supported', p.id
  FROM public.support_pledges p WHERE p.orphan_id IS NOT NULL AND p.status IN ('active', 'fulfilled')
 ORDER BY p.orphan_id, p.created_at
ON CONFLICT (orphan_id) DO NOTHING;
INSERT INTO public.orphan_locks (orphan_id, reason, source_ref)
SELECT DISTINCT ON (d.orphan_id) d.orphan_id, 'disbursed', d.id
  FROM public.disbursements d WHERE d.orphan_id IS NOT NULL
 ORDER BY d.orphan_id, d.created_at
ON CONFLICT (orphan_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- ٣) طلبات الفكّ — سببٌ ومستند وموافقتان، ونافذة ١٥ دقيقة، ومرّةً واحدة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_quorum()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$ SELECT 2 $fn$;

CREATE TABLE IF NOT EXISTS public.unlock_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id     UUID NOT NULL REFERENCES public.orphans(id) ON DELETE RESTRICT,
  -- edit: تعديل حقولٍ في كهاتين · archive: أرشفة · unlock: رفع القفل
  -- rowad_update / rowad_delete: إذنٌ موقّع يُنفَّذ في منصّة التشغيل
  op            TEXT NOT NULL CHECK (op IN ('edit', 'archive', 'unlock', 'rowad_update', 'rowad_delete')),
  patch         JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason        TEXT NOT NULL CHECK (length(btrim(reason)) >= 10 AND length(reason) <= 2000),
  document      TEXT CHECK (document IS NULL OR length(document) <= 500),
  discrepancy_id UUID,
  requested_by  UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'granted', 'expired')),
  approvals     UUID[] NOT NULL DEFAULT '{}',
  approved_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  decided_by    UUID,
  decision_note TEXT,
  applied_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_unlock_orphan ON public.unlock_requests(orphan_id, created_at DESC);
ALTER TABLE public.unlock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ur_admin ON public.unlock_requests;
CREATE POLICY ur_admin ON public.unlock_requests FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.unlock_requests FROM anon, authenticated;
GRANT SELECT ON public.unlock_requests TO authenticated;

-- الحقول التي يجوز للطلب تعديلها — ما عداها لا يُفتح بطلب.
CREATE OR REPLACE FUNCTION public.unlock_editable_fields()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['display_name', 'gender', 'birth_date', 'country', 'region', 'group_id',
               'external_ref', 'external_source'];
$fn$;

-- هل في هذه المعاملة طلبٌ معتمد يجيز هذه العملية على هذا الطفل؟
CREATE OR REPLACE FUNCTION public.unlock_context_allows(_orphan UUID, _op TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.unlock_requests r
     WHERE r.id::text = NULLIF(current_setting('kahatayn.unlock', true), '')
       AND r.orphan_id = _orphan AND r.op = _op
       AND r.status = 'approved' AND r.expires_at > now());
$fn$;

CREATE OR REPLACE FUNCTION public.admin_request_unlock(
  _orphan UUID, _op TEXT, _patch JSONB, _reason TEXT, _document TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _bad TEXT[];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NOT public.orphan_is_locked(_orphan) THEN RAISE EXCEPTION 'orphan_not_locked'; END IF;
  _patch := COALESCE(_patch, '{}'::jsonb);
  SELECT array_agg(k) INTO _bad FROM jsonb_object_keys(_patch) k WHERE k <> ALL (public.unlock_editable_fields());
  IF _op = 'edit' AND (_patch = '{}'::jsonb OR _bad IS NOT NULL) THEN
    RAISE EXCEPTION 'patch_fields_not_allowed: %', COALESCE(array_to_string(_bad, ','), 'empty');
  END IF;
  IF EXISTS (SELECT 1 FROM public.unlock_requests WHERE orphan_id = _orphan AND status = 'pending' AND op = _op) THEN
    RAISE EXCEPTION 'request_already_pending';
  END IF;
  INSERT INTO public.unlock_requests (orphan_id, op, patch, reason, document, requested_by)
  VALUES (_orphan, _op, _patch, btrim(_reason), NULLIF(btrim(COALESCE(_document, '')), ''), auth.uid())
  RETURNING id INTO _id;
  PERFORM public.log_integrity('unlock_requested', _orphan,
    jsonb_build_object('request', _id, 'op', _op, 'patch', _patch, 'reason', btrim(_reason)));
  RETURN _id;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_approve_unlock(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.unlock_requests; _me UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF _r.requested_by = _me THEN RAISE EXCEPTION 'requester_cannot_approve' USING ERRCODE = '42501'; END IF;
  IF _me = ANY (_r.approvals) THEN RAISE EXCEPTION 'already_approved'; END IF;
  _r.approvals := _r.approvals || _me;
  IF cardinality(_r.approvals) >= public.unlock_quorum() THEN
    UPDATE public.unlock_requests SET approvals = _r.approvals, status = 'approved',
           approved_at = now(), expires_at = now() + interval '15 minutes'
     WHERE id = _request;
  ELSE
    UPDATE public.unlock_requests SET approvals = _r.approvals WHERE id = _request;
  END IF;
  PERFORM public.log_integrity('unlock_approved', _r.orphan_id,
    jsonb_build_object('request', _request, 'approvals', cardinality(_r.approvals)));
  RETURN jsonb_build_object('approvals', cardinality(_r.approvals), 'quorum', public.unlock_quorum());
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_reject_unlock(_request UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.unlock_requests SET status = 'rejected', decided_by = auth.uid(),
         decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
   WHERE id = _request AND status IN ('pending', 'approved') RETURNING orphan_id INTO _o;
  IF _o IS NULL THEN RAISE EXCEPTION 'request_not_open'; END IF;
  PERFORM public.log_integrity('unlock_rejected', _o, jsonb_build_object('request', _request, 'note', _note));
END $fn$;

-- التنفيذ في كهاتين: edit / archive / unlock. يمرّ عبر الحارس نفسه، الذي
-- يجيزه لأن المعاملة تحمل الطلب المعتمد. ثم يُغلق الطلب فلا يُستعمل ثانية.
CREATE OR REPLACE FUNCTION public.admin_apply_unlock(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.unlock_requests; _before JSONB; _after JSONB; _k TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'approved' THEN RAISE EXCEPTION 'request_not_approved'; END IF;
  IF _r.expires_at <= now() THEN
    UPDATE public.unlock_requests SET status = 'expired' WHERE id = _request;
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  IF _r.op NOT IN ('edit', 'archive', 'unlock') THEN RAISE EXCEPTION 'op_applies_in_operating_platform'; END IF;

  SELECT to_jsonb(o) - 'story' - 'photo_url' INTO _before FROM public.orphans o WHERE o.id = _r.orphan_id;
  PERFORM set_config('kahatayn.unlock', _request::text, true);

  IF _r.op = 'edit' THEN
    -- القيم تُحوَّل بأنواع أعمدتها عبر سجلٍّ مُعبّأ، لا بنصٍّ يُلصق في الاستعلام.
    FOR _k IN SELECT jsonb_object_keys(_r.patch) LOOP
      EXECUTE format('UPDATE public.orphans SET %1$I = (jsonb_populate_record(NULL::public.orphans, $1)).%1$I WHERE id = $2', _k)
        USING _r.patch, _r.orphan_id;
    END LOOP;
  ELSIF _r.op = 'archive' THEN
    UPDATE public.orphans SET status = 'archived' WHERE id = _r.orphan_id;
  ELSE
    DELETE FROM public.orphan_locks WHERE orphan_id = _r.orphan_id;
  END IF;

  PERFORM set_config('kahatayn.unlock', '', true);
  UPDATE public.unlock_requests SET status = 'applied', applied_at = now() WHERE id = _request;
  IF _r.discrepancy_id IS NOT NULL THEN
    UPDATE public.integrity_discrepancies SET status = 'accepted', decided_by = auth.uid(), decided_at = now()
     WHERE id = _r.discrepancy_id;
  END IF;
  SELECT to_jsonb(o) - 'story' - 'photo_url' INTO _after FROM public.orphans o WHERE o.id = _r.orphan_id;
  PERFORM public.log_integrity('unlock_applied', _r.orphan_id,
    jsonb_build_object('request', _request, 'op', _r.op,
      'changed', (SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('was', _before->k, 'now', _after->k)), '{}')
                    FROM jsonb_object_keys(_after) k WHERE _before->k IS DISTINCT FROM _after->k)));
  RETURN jsonb_build_object('ok', true);
END $fn$;

-- إذنٌ لمنصّة التشغيل: يُعيد الحمولة التي يوقّعها الخادم (Ed25519)،
-- ويُغلق الطلب «granted». المفتاح الخاصّ لا يدخل القاعدة أبداً.
CREATE OR REPLACE FUNCTION public.admin_grant_payload(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.unlock_requests; _o public.orphans; _country TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.unlock_requests WHERE id = _request FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'approved' OR _r.expires_at <= now() THEN
    RAISE EXCEPTION 'request_not_approved';
  END IF;
  IF _r.op NOT IN ('rowad_update', 'rowad_delete') THEN RAISE EXCEPTION 'op_not_for_operating_platform'; END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _r.orphan_id;
  IF _o.external_source IS NULL OR _o.external_ref IS NULL THEN RAISE EXCEPTION 'orphan_not_linked'; END IF;
  SELECT country_code INTO _country FROM public.operating_platforms WHERE key = _o.external_source;
  UPDATE public.unlock_requests SET status = 'granted', applied_at = now() WHERE id = _request;
  PERFORM public.log_integrity('grant_issued', _r.orphan_id,
    jsonb_build_object('request', _request, 'op', _r.op, 'source', _o.external_source), _o.external_source);
  RETURN jsonb_build_object(
    'iss', 'kahatayn', 'aud', 'rowad:' || COALESCE(_country, '??'),
    'sub', 'students/' || _o.external_ref,
    'op', CASE _r.op WHEN 'rowad_delete' THEN 'delete' ELSE 'update' END,
    'fields', COALESCE((SELECT jsonb_agg(k) FROM jsonb_object_keys(_r.patch) k), '[]'::jsonb),
    'request_id', _request, 'approved_by', to_jsonb(_r.approvals),
    'exp', extract(epoch FROM _r.expires_at)::bigint,
    'jti', gen_random_uuid());
END $fn$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.admin_request_unlock(UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_approve_unlock(UUID) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_reject_unlock(UUID, TEXT) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_apply_unlock(UUID) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.admin_grant_payload(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.admin_request_unlock(UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_approve_unlock(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_reject_unlock(UUID, TEXT) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_apply_unlock(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.admin_grant_payload(UUID) TO authenticated;
END $$;


-- ---------------------------------------------------------------------
-- ٤) الحارس على الطفل المقفول — والاختلافات الممسوكة
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrity_discrepancies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id   UUID NOT NULL REFERENCES public.orphans(id) ON DELETE RESTRICT,
  source      TEXT,
  changes     JSONB NOT NULL,                -- {field: {was, proposed}}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed')),
  decided_by  UUID,
  decided_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_discrepancy_open ON public.integrity_discrepancies(status, created_at);
ALTER TABLE public.integrity_discrepancies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS idc_admin ON public.integrity_discrepancies;
CREATE POLICY idc_admin ON public.integrity_discrepancies FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.integrity_discrepancies FROM anon, authenticated;
GRANT SELECT ON public.integrity_discrepancies TO authenticated;

CREATE OR REPLACE FUNCTION public.request_is_service()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT current_setting('role', true) = 'service_role'
      OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
$fn$;

CREATE OR REPLACE FUNCTION public.guard_locked_orphan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changes JSONB := '{}'::jsonb; _f TEXT; _o JSONB; _n JSONB;
BEGIN
  IF NOT public.orphan_is_locked(OLD.id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'orphan_locked' USING ERRCODE = '42501',
      HINT = 'ملفّ طفلٍ مكفول لا يُحذف. الأرشفة بطلبٍ رسمي.';
  END IF;

  _o := to_jsonb(OLD); _n := to_jsonb(NEW);
  -- الهوية وحدها: المرحلة الدراسية تتقدّم مع الطفل فلا تُجمَّد.
  FOREACH _f IN ARRAY ARRAY['code', 'org_id', 'external_source', 'external_ref', 'display_name', 'gender',
                             'birth_date', 'country', 'region', 'group_id'] LOOP
    IF _o->_f IS DISTINCT FROM _n->_f THEN
      _changes := _changes || jsonb_build_object(_f, jsonb_build_object('was', _o->_f, 'proposed', _n->_f));
    END IF;
  END LOOP;
  IF OLD.external_deleted_at IS NULL AND NEW.external_deleted_at IS NOT NULL THEN
    _changes := _changes || jsonb_build_object('external_deleted_at',
      jsonb_build_object('was', NULL, 'proposed', NEW.external_deleted_at));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('draft', 'submitted', 'under_review', 'rejected', 'archived')
     AND NOT (NEW.status::text = 'archived' AND public.unlock_context_allows(OLD.id, 'archive')) THEN
    _changes := _changes || jsonb_build_object('status',
      jsonb_build_object('was', OLD.status, 'proposed', NEW.status));
  END IF;

  IF _changes = '{}'::jsonb OR public.unlock_context_allows(OLD.id, 'edit') THEN
    RETURN NEW;
  END IF;

  -- المرآة (الخادم بمفتاح الخدمة): يُمسَك التغيير، ويبقى القديم، ويُسجَّل اختلاف.
  IF public.request_is_service() THEN
    INSERT INTO public.integrity_discrepancies (orphan_id, source, changes)
    VALUES (OLD.id, OLD.external_source, _changes);
    PERFORM public.log_integrity('mirror_change_held', OLD.id, _changes, OLD.external_source);
    NEW.code := OLD.code; NEW.org_id := OLD.org_id;
    NEW.external_source := OLD.external_source; NEW.external_ref := OLD.external_ref;
    NEW.display_name := OLD.display_name; NEW.gender := OLD.gender; NEW.birth_date := OLD.birth_date;
    NEW.country := OLD.country; NEW.region := OLD.region; NEW.group_id := OLD.group_id;
    NEW.external_deleted_at := OLD.external_deleted_at;
    IF _changes ? 'status' THEN NEW.status := OLD.status; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'orphan_locked' USING ERRCODE = '42501',
    DETAIL = _changes::text, HINT = 'تعديل هوية طفلٍ مكفول يحتاج طلب فكٍّ بموافقتين.';
END $fn$;
DROP TRIGGER IF EXISTS guard_locked_orphan ON public.orphans;
CREATE TRIGGER guard_locked_orphan BEFORE UPDATE OR DELETE ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_orphan();

DROP TRIGGER IF EXISTS guard_orphan_locks ON public.orphan_locks;
CREATE TRIGGER guard_orphan_locks BEFORE UPDATE OR DELETE ON public.orphan_locks
  FOR EACH ROW EXECUTE FUNCTION public.guard_orphan_locks();

-- درجات السمات لطفلٍ مقفول: لا حذف؛ «الحذف» من المرآة يُمسَك؛ والتصحيح
-- يحفظ الأصل في سجلّ المراجعات قبل أن يُطبَّق.
CREATE TABLE IF NOT EXISTS public.trait_score_revisions (
  id          BIGSERIAL PRIMARY KEY,
  score_id    UUID NOT NULL,
  orphan_id   UUID NOT NULL,
  was_score   NUMERIC NOT NULL,
  was_observed_at TIMESTAMPTZ NOT NULL,
  new_score   NUMERIC NOT NULL,
  revised_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trait_score_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tsr_admin ON public.trait_score_revisions;
CREATE POLICY tsr_admin ON public.trait_score_revisions FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.trait_score_revisions FROM anon, authenticated;
GRANT SELECT ON public.trait_score_revisions TO authenticated;
DROP TRIGGER IF EXISTS tsr_frozen ON public.trait_score_revisions;
CREATE TRIGGER tsr_frozen BEFORE UPDATE OR DELETE ON public.trait_score_revisions
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

CREATE OR REPLACE FUNCTION public.guard_locked_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.orphan_is_locked(OLD.orphan_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'score_locked' USING ERRCODE = '42501';
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.integrity_discrepancies (orphan_id, source, changes)
    VALUES (OLD.orphan_id, OLD.source, jsonb_build_object('trait_score:' || OLD.external_ref,
            jsonb_build_object('was', OLD.score, 'proposed', 'deleted')));
    PERFORM public.log_integrity('score_delete_held', OLD.orphan_id,
      jsonb_build_object('score', OLD.external_ref), OLD.source);
    NEW.deleted_at := NULL;
  END IF;
  IF NEW.score IS DISTINCT FROM OLD.score THEN
    INSERT INTO public.trait_score_revisions (score_id, orphan_id, was_score, was_observed_at, new_score)
    VALUES (OLD.id, OLD.orphan_id, OLD.score, OLD.observed_at, NEW.score);
    PERFORM public.log_integrity('score_revised', OLD.orphan_id,
      jsonb_build_object('score', OLD.external_ref, 'was', OLD.score, 'now', NEW.score), OLD.source);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS guard_locked_scores ON public.orphan_trait_scores;
CREATE TRIGGER guard_locked_scores BEFORE UPDATE OR DELETE ON public.orphan_trait_scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_scores();

-- قبول اختلافٍ = طلب «edit» بالقيم المقترحة، يمرّ بالموافقتين. الرفض يُبقي الحقيقة.
CREATE OR REPLACE FUNCTION public.admin_resolve_discrepancy(_id UUID, _accept BOOLEAN, _reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.integrity_discrepancies; _patch JSONB; _req UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _d FROM public.integrity_discrepancies WHERE id = _id AND status = 'open' FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'discrepancy_not_open'; END IF;
  IF NOT _accept THEN
    UPDATE public.integrity_discrepancies SET status = 'dismissed', decided_by = auth.uid(), decided_at = now()
     WHERE id = _id;
    PERFORM public.log_integrity('discrepancy_dismissed', _d.orphan_id,
      jsonb_build_object('discrepancy', _id, 'reason', _reason), _d.source);
    RETURN NULL;
  END IF;
  SELECT jsonb_object_agg(k, _d.changes->k->'proposed') INTO _patch
    FROM jsonb_object_keys(_d.changes) k WHERE k = ANY (public.unlock_editable_fields());
  IF _patch IS NULL THEN RAISE EXCEPTION 'discrepancy_not_editable'; END IF;
  _req := public.admin_request_unlock(_d.orphan_id, 'edit', _patch, _reason, 'discrepancy:' || _id);
  UPDATE public.unlock_requests SET discrepancy_id = _id WHERE id = _req;
  RETURN _req;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_resolve_discrepancy(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_discrepancy(UUID, BOOLEAN, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٥) المصادر: الحالة، والطوارئ، وسلسلة دفعات المزامنة
-- ---------------------------------------------------------------------
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_status_check;
ALTER TABLE public.countries ADD CONSTRAINT countries_status_check
  CHECK (status IN ('planned', 'active', 'paused', 'emergency'));
ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS emergency_note TEXT;

ALTER TABLE public.operating_platforms
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding', 'trial', 'active', 'paused')),
  ADD COLUMN IF NOT EXISTS regions_mapped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS office_reviewed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reconcile_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.mirror_batches (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL REFERENCES public.operating_platforms(key),
  entity       TEXT NOT NULL,
  records      INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mirror_batches_source ON public.mirror_batches(source, id DESC);
ALTER TABLE public.mirror_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mb_admin ON public.mirror_batches;
CREATE POLICY mb_admin ON public.mirror_batches FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.mirror_batches FROM anon, authenticated;
GRANT SELECT ON public.mirror_batches TO authenticated;
DROP TRIGGER IF EXISTS mirror_batches_frozen ON public.mirror_batches;
CREATE TRIGGER mirror_batches_frozen BEFORE UPDATE OR DELETE ON public.mirror_batches
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

-- يُستدعى بعد كل دفعةٍ مقبولة: بصمة المحتوى (يحسبها الخادم) مربوطةٌ ببصمة
-- الدفعة السابقة من المصدر نفسه.
CREATE OR REPLACE FUNCTION public.mirror_log_batch(
  _client UUID, _entity TEXT, _records INTEGER, _deleted INTEGER, _payload_hash TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _src TEXT; _prev TEXT; _hash TEXT;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RAISE EXCEPTION 'client_not_permitted' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mirror_batches:' || _src));
  SELECT hash INTO _prev FROM public.mirror_batches WHERE source = _src ORDER BY id DESC LIMIT 1;
  _prev := COALESCE(_prev, 'genesis');
  _hash := encode(sha256(convert_to(concat_ws('|', _prev, _src, _entity, _records, _deleted, _payload_hash), 'UTF8')), 'hex');
  INSERT INTO public.mirror_batches (source, entity, records, deleted, payload_hash, prev_hash, hash)
  VALUES (_src, _entity, _records, _deleted, lower(_payload_hash), _prev, _hash);
  RETURN _hash;
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_log_batch(UUID, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_log_batch(UUID, TEXT, INTEGER, INTEGER, TEXT) TO service_role;

-- وضع الطوارئ يوقف الكفالة الجديدة في الدولة (الدعم يوقفه شرط «مفعّلة» القائم).
CREATE OR REPLACE FUNCTION public.block_sponsorship_in_emergency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orphans o JOIN public.countries c
               ON c.code = o.country OR c.name_ar = o.country OR c.name_local = o.country
              WHERE o.id = NEW.orphan_id AND c.status = 'emergency') THEN
    RAISE EXCEPTION 'country_emergency' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS block_sponsorship_in_emergency ON public.sponsorships;
CREATE TRIGGER block_sponsorship_in_emergency BEFORE INSERT ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.block_sponsorship_in_emergency();

CREATE OR REPLACE FUNCTION public.admin_set_country_emergency(_code TEXT, _on BOOLEAN, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _on AND length(btrim(COALESCE(_note, ''))) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;
  UPDATE public.countries SET status = CASE WHEN _on THEN 'emergency' ELSE 'active' END,
         emergency_note = CASE WHEN _on THEN btrim(_note) END
   WHERE code = _code AND status IN ('active', 'emergency');
  IF NOT FOUND THEN RAISE EXCEPTION 'country_not_active'; END IF;
  PERFORM public.log_integrity(CASE WHEN _on THEN 'emergency_on' ELSE 'emergency_off' END, NULL,
    jsonb_build_object('country', _code, 'note', _note));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_country_emergency(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_country_emergency(TEXT, BOOLEAN, TEXT) TO authenticated;

-- حالة المصدر تتقدّم بقائمة التحقّق: لا «مفعّل» قبل مزامنةٍ ومطابقةٍ نظيفة
-- ومراجعة المكتب وربط المناطق.
CREATE OR REPLACE FUNCTION public.source_checklist(_key TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'key_issued', EXISTS (SELECT 1 FROM public.api_clients c WHERE c.source = p.key AND c.active
                           AND c.revoked_at IS NULL AND 'mirror:write' = ANY (c.scopes)),
    'first_sync', EXISTS (SELECT 1 FROM public.mirror_sync_state m WHERE m.source = p.key AND m.last_run_at IS NOT NULL),
    'reconciled', p.last_reconcile_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM public.mirror_sync_state m
                                   WHERE m.source = p.key AND m.drift IS NOT NULL
                                     AND m.drift::text NOT IN ('null', '{}', '[]')),
    'org_linked', p.org_id IS NOT NULL,
    'office_reviewed', p.office_reviewed,
    'regions_mapped', p.regions_mapped)
  FROM public.operating_platforms p WHERE p.key = _key;
$fn$;
REVOKE ALL ON FUNCTION public.source_checklist(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_source(
  _key TEXT, _status TEXT, _office_reviewed BOOLEAN DEFAULT NULL, _regions_mapped BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _c JSONB; _missing TEXT[];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  UPDATE public.operating_platforms SET
    office_reviewed = COALESCE(_office_reviewed, office_reviewed),
    regions_mapped = COALESCE(_regions_mapped, regions_mapped)
   WHERE key = _key;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_not_found'; END IF;
  _c := public.source_checklist(_key);
  IF _status = 'active' THEN
    SELECT array_agg(k) INTO _missing FROM jsonb_each(_c) e(k, v) WHERE v = 'false'::jsonb;
    IF _missing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'checklist_incomplete', 'missing', to_jsonb(_missing));
    END IF;
  END IF;
  IF _status IS NOT NULL THEN
    UPDATE public.operating_platforms SET status = _status, active = (_status <> 'paused') WHERE key = _key;
    PERFORM public.log_integrity('source_status', NULL, jsonb_build_object('status', _status), _key);
  END IF;
  RETURN jsonb_build_object('ok', true, 'checklist', public.source_checklist(_key));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_set_source(TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_source(TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- لوحة المصادر: كل منصّة بدولتها وحالتها وصحّتها وأقفالها واختلافاتها.
CREATE OR REPLACE FUNCTION public.admin_sources_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'key', p.key, 'name', p.name, 'country', p.country_code, 'country_name', c.name_ar,
        'country_status', c.status, 'emergency_note', c.emergency_note,
        'status', p.status, 'base_url', p.base_url,
        'last_sync_at', (SELECT max(m.last_run_at) FROM public.mirror_sync_state m WHERE m.source = p.key),
        'last_error', (SELECT m.last_error FROM public.mirror_sync_state m WHERE m.source = p.key
                        AND m.last_error IS NOT NULL ORDER BY m.last_run_at DESC NULLS LAST LIMIT 1),
        'last_reconcile_at', p.last_reconcile_at,
        'mirrored', (SELECT count(*) FROM public.orphans o WHERE o.external_source = p.key AND o.external_deleted_at IS NULL),
        'locked', (SELECT count(*) FROM public.orphan_locks l JOIN public.orphans o ON o.id = l.orphan_id
                    WHERE o.external_source = p.key),
        'open_discrepancies', (SELECT count(*) FROM public.integrity_discrepancies d
                                WHERE d.source = p.key AND d.status = 'open'),
        'batches', (SELECT count(*) FROM public.mirror_batches b WHERE b.source = p.key),
        'checklist', public.source_checklist(p.key)) ORDER BY c.sort_order, p.key)
      FROM public.operating_platforms p JOIN public.countries c ON c.code = p.country_code), '[]'::jsonb),
    'pending_unlocks', (SELECT count(*) FROM public.unlock_requests WHERE status IN ('pending', 'approved')),
    'open_discrepancies', (SELECT count(*) FROM public.integrity_discrepancies WHERE status = 'open'),
    'locked_total', (SELECT count(*) FROM public.orphan_locks));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_sources_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sources_overview() TO authenticated;

-- طلبات الفكّ والاختلافات مع أسماء الأطفال، لصفحة السلامة.
CREATE OR REPLACE FUNCTION public.admin_integrity_queue()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  -- الطلبات المعتمدة التي انتهت نافذتها تظهر «منتهية» (القراءة لا تكتب).
  RETURN jsonb_build_object(
    'requests', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'orphan_id', r.orphan_id, 'orphan', o.display_name, 'code', o.code,
        'op', r.op, 'patch', r.patch, 'reason', r.reason, 'document', r.document,
        'status', CASE WHEN r.status = 'approved' AND r.expires_at <= now() THEN 'expired' ELSE r.status END,
        'approvals', cardinality(r.approvals), 'quorum', public.unlock_quorum(),
        'mine', r.requested_by = auth.uid(), 'i_approved', auth.uid() = ANY (r.approvals),
        'expires_at', r.expires_at, 'created_at', r.created_at) ORDER BY r.created_at DESC)
      FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
     WHERE r.created_at > now() - interval '90 days'), '[]'::jsonb),
    'discrepancies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'orphan_id', d.orphan_id, 'orphan', o.display_name, 'code', o.code,
        'source', d.source, 'changes', d.changes, 'created_at', d.created_at) ORDER BY d.created_at DESC)
      FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
     WHERE d.status = 'open'), '[]'::jsonb),
    'recent', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'id')::bigint DESC) FROM (
        SELECT jsonb_build_object('id', l.id, 'at', l.at, 'kind', l.kind, 'orphan_id', l.orphan_id,
               'source', l.source, 'hash', left(l.hash, 12)) AS x
          FROM public.integrity_log l ORDER BY l.id DESC LIMIT 30) t), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_integrity_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_integrity_queue() TO authenticated;

-- حالة القفل لملفّ طفل — تُعرض للإدارة في صفحته.
CREATE OR REPLACE FUNCTION public.admin_orphan_lock(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('locked', true, 'reason', l.reason, 'locked_at', l.locked_at)
            FROM public.orphan_locks l WHERE l.orphan_id = _orphan);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_orphan_lock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_orphan_lock(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- ٦) صندوق القرارات: طلبات الفكّ والاختلافات
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- ٧) سجلّ المال لطفلٍ مقفول لا يُحذف — ولا من حذف حساب الكافل
-- ---------------------------------------------------------------------
-- `sponsorships.sponsor_id` يُحذف تسلسلياً مع حساب الكافل؛ فحذف حسابٍ كان
-- يمحو تاريخ كفالةٍ وصلت طفلاً. الحارس يعمل على الحذف المتسلسل أيضاً:
-- يُغلق الحساب أو يُجهَّل، ولا يُمحى أثره المالي.
CREATE OR REPLACE FUNCTION public.guard_locked_money()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.orphan_is_locked(OLD.orphan_id)
     AND (TG_OP = 'DELETE' OR NEW.orphan_id IS DISTINCT FROM OLD.orphan_id) THEN
    RAISE EXCEPTION '%_locked', TG_TABLE_NAME USING ERRCODE = '42501',
      HINT = 'سجلٌّ ماليّ لطفلٍ مكفول لا يُحذف ولا يُنقل.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;
DO $$
DECLARE _t TEXT;
BEGIN
  FOREACH _t IN ARRAY ARRAY['sponsorships', 'disbursements', 'support_pledges'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_locked_money ON public.%I', _t);
    EXECUTE format('CREATE TRIGGER guard_locked_money BEFORE UPDATE OF orphan_id OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.guard_locked_money()', _t);
  END LOOP;
END $$;


-- وقت آخر مطابقة للمصدر — شرطٌ في قائمة التفعيل.
CREATE OR REPLACE FUNCTION public.mirror_mark_reconciled(_client UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _src TEXT;
BEGIN
  SELECT c.source INTO _src FROM public.api_clients c
   WHERE c.id = _client AND c.active AND c.revoked_at IS NULL AND 'mirror:write' = ANY(c.scopes);
  IF _src IS NULL THEN RAISE EXCEPTION 'client_not_permitted' USING ERRCODE = '42501'; END IF;
  UPDATE public.operating_platforms SET last_reconcile_at = now() WHERE key = _src;
END $fn$;
REVOKE ALL ON FUNCTION public.mirror_mark_reconciled(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_mark_reconciled(UUID) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260922100000', 'integrity');

-- >>> migration 20260923100000 ledger_receipts
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923100000') THEN
    RAISE EXCEPTION 'الهجرة 20260923100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- إيصال الكافل (ك٨): لكل شهرٍ مضى رقمٌ يُحسب من حقائقه
-- ---------------------------------------------------------------------
-- الإيصال بصمةٌ قصيرة لـ: الكفالة، الشهر، المدفوع، حالة الدفع، حالة
-- الوصول، وتاريخه. يحفظه الكافل (في تقريره السنوي مثلاً)؛ فإن تغيّرت
-- حقيقةٌ من حقائق ذلك الشهر لاحقاً تغيّر الرقم، وظهر الفرق عند التحقّق.
-- وسجلّ الكفالة يذكر الآن إن كان ملفّ الطفل مثبّتاً.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ledger_receipt(
  _sponsorship UUID, _month TEXT, _paid NUMERIC, _payment TEXT, _delivery TEXT, _delivered_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4))
    FROM (SELECT encode(sha256(convert_to(concat_ws('|', 'receipt-v1', _sponsorship::text, _month,
            trim(to_char(COALESCE(_paid, 0), 'FM999999990.00')), COALESCE(_payment, ''), COALESCE(_delivery, ''),
            COALESCE(to_char(_delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), '')), 'UTF8')), 'hex') AS h) x;
$fn$;

CREATE OR REPLACE FUNCTION public.sponsorship_ledger(_sponsorship UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships; _o public.orphans; _months JSONB; _from DATE; _to DATE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT (_s.sponsor_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'ledger_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _s.orphan_id;

  _from := date_trunc('month', COALESCE(_s.started_at, _s.created_at))::date;
  _to := CASE WHEN _s.status IN ('cancelled', 'completed')
              THEN date_trunc('month', COALESCE(_s.ended_at, now()))::date
              ELSE (date_trunc('month', now()) + interval '1 month')::date END;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb || jsonb_build_object(
           'receipt', CASE WHEN m.upcoming OR (m.paid = 0 AND m.delivery_status IS NULL) THEN NULL
                           ELSE public.ledger_receipt(_s.id, m.month, m.paid, m.payment_status,
                                                      m.delivery_status, m.delivered_at) END)
         ORDER BY m.month DESC), '[]'::jsonb) INTO _months
    FROM (
      SELECT to_char(g.m, 'YYYY-MM') AS month,
             g.m > date_trunc('month', now()) AS upcoming,
             _s.amount AS due,
             (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id AND p.status = 'paid'
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date)) = g.m) AS paid,
             (SELECT p.status::text FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date, p.created_at::date)) = g.m
               ORDER BY (p.status = 'paid') DESC, p.created_at DESC LIMIT 1) AS payment_status,
             (SELECT d.status FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY (d.status = 'delivered') DESC, d.created_at DESC LIMIT 1) AS delivery_status,
             (SELECT d.delivered_at FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id AND d.status = 'delivered'
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY d.delivered_at DESC LIMIT 1) AS delivered_at
        FROM generate_series(_from, _to, interval '1 month') AS g(m)
    ) m;

  RETURN jsonb_build_object(
    'sponsorship', jsonb_build_object(
      'id', _s.id, 'amount', _s.amount, 'currency', _s.currency, 'status', _s.status,
      'type', _s.type, 'started_at', _s.started_at, 'next_charge_at', _s.next_charge_at,
      'is_anonymous', _s.is_anonymous, 'message', _s.message, 'message_status', _s.message_status,
      'created_at', _s.created_at),
    'orphan', jsonb_build_object('id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
      'country', _o.country, 'region', _o.region, 'age_band', public.age_band_of(_o.birth_date),
      'locked', public.orphan_is_locked(_o.id)),
    'months', _months,
    'totals', jsonb_build_object(
      'paid', (SELECT COALESCE(sum(amount), 0) FROM public.sponsorship_payments
                WHERE sponsorship_id = _s.id AND status = 'paid'),
      'months_paid', (SELECT count(*) FROM jsonb_array_elements(_months) x WHERE (x->>'paid')::numeric > 0),
      'months_delivered', (SELECT count(*) FROM jsonb_array_elements(_months) x
                            WHERE x->>'delivery_status' = 'delivered')));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsorship_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsorship_ledger(UUID) TO authenticated;

-- التحقّق من إيصالٍ محفوظ: يطابق حقائق الشهر اليوم؟ للكافل صاحب الكفالة وللإدارة.
CREATE OR REPLACE FUNCTION public.verify_ledger_receipt(_sponsorship UUID, _month TEXT, _receipt TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _l JSONB; _m JSONB;
BEGIN
  _l := public.sponsorship_ledger(_sponsorship);
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  IF _m IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'month_not_found'); END IF;
  RETURN jsonb_build_object('ok', true,
    'match', upper(btrim(_receipt)) = _m->>'receipt',
    'current', _m->>'receipt');
END $fn$;
REVOKE ALL ON FUNCTION public.verify_ledger_receipt(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_ledger_receipt(UUID, TEXT, TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260923100000', 'ledger_receipts');

-- >>> migration 20260924100000 invoices
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260924100000') THEN
    RAISE EXCEPTION 'الهجرة 20260924100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- الفاتورة والدفع الحقيقي: رقمٌ لكل دفعة، مربوطٌ بمعاملة المزوّد
-- ---------------------------------------------------------------------
-- ١) كل دفعةٍ مدفوعة تأخذ رقم فاتورةٍ دائماً (INV-سنة-تسلسل) عند لحظة
--    الدفع، ويُربط برقم المعاملة لدى المزوّد (provider_payment_id) — وهو
--    ما يجده الكافل في كشف بطاقته، وما تجده الإدارة في لوحة المزوّد.
-- ٢) حقائق الدفعة بعد فوترتها لا تتغيّر: المبلغ والعملة والتاريخ والمزوّد
--    ورقم المعاملة والفاتورة. الحالة وحدها تتقدّم (مدفوع ← مُردّ/منازَع)،
--    ولا تُحذف — ولا بحذف حساب الكافل.
-- ٣) كل فاتورةٍ تُكتب في سجلّ السلامة المربوط بالبصمات، فتُثبت لحظتها.
-- ٤) إيصال الشهر (الإصدار ٢) يدخل فيه رقم الفاتورة ورقم المعاملة، فيرتبط
--    الإيصال بالدفع الحقيقي لا بالأرقام وحدها.
-- ٥) البحث برقم الفاتورة أو برقم المعاملة: للكافل في دفعاته، وللإدارة.
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.invoice_seq;

ALTER TABLE public.sponsorship_payments
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_invoice ON public.sponsorship_payments(invoice_no)
  WHERE invoice_no IS NOT NULL;
-- معاملةٌ واحدة لدى المزوّد = دفعةٌ واحدة عندنا. حدثٌ مكرّر لا يصنع فاتورتين.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_provider_payment
  ON public.sponsorship_payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL AND status IN ('paid', 'refunded', 'disputed');

CREATE OR REPLACE FUNCTION public.next_invoice_no(_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql VOLATILE AS $fn$
  SELECT 'INV-' || to_char(COALESCE(_at, now()) AT TIME ZONE 'UTC', 'YYYY') || '-'
         || lpad(nextval('public.invoice_seq')::text, 6, '0');
$fn$;

-- ما قبل هذه الهجرة: فواتير بترتيب تاريخ الدفع، ورقم المعاملة من المرجع القائم.
UPDATE public.sponsorship_payments SET provider_payment_id = provider_ref
 WHERE provider_payment_id IS NULL AND provider_ref IS NOT NULL AND status IN ('paid', 'refunded', 'disputed');
DO $$
DECLARE _r RECORD;
BEGIN
  FOR _r IN SELECT id, paid_at FROM public.sponsorship_payments
             WHERE invoice_no IS NULL AND status IN ('paid', 'refunded', 'disputed')
             ORDER BY paid_at NULLS LAST, created_at LOOP
    UPDATE public.sponsorship_payments SET invoice_no = public.next_invoice_no(_r.paid_at) WHERE id = _r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.issue_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'paid' AND NEW.invoice_no IS NULL THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
    NEW.invoice_no := public.next_invoice_no(NEW.paid_at);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS issue_invoice ON public.sponsorship_payments;
CREATE TRIGGER issue_invoice BEFORE INSERT OR UPDATE OF status ON public.sponsorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.issue_invoice();

CREATE OR REPLACE FUNCTION public.anchor_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID;
BEGIN
  SELECT orphan_id INTO _orphan FROM public.sponsorships WHERE id = NEW.sponsorship_id;
  IF NEW.invoice_no IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.invoice_no IS NULL) THEN
    PERFORM public.log_integrity('payment_invoiced', _orphan, jsonb_build_object(
      'invoice', NEW.invoice_no, 'provider', NEW.provider, 'provider_payment_id', NEW.provider_payment_id,
      'amount', NEW.amount, 'currency', NEW.currency, 'paid_at', NEW.paid_at,
      'sponsorship', NEW.sponsorship_id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.invoice_no IS NOT NULL THEN
    PERFORM public.log_integrity('payment_status', _orphan, jsonb_build_object(
      'invoice', NEW.invoice_no, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS anchor_invoice ON public.sponsorship_payments;
CREATE TRIGGER anchor_invoice AFTER INSERT OR UPDATE ON public.sponsorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.anchor_invoice();

-- الحقائق المفوترة مجمّدة؛ والحالة تتقدّم في مسارٍ معلوم فقط.
CREATE OR REPLACE FUNCTION public.freeze_invoiced_payment()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.invoice_no IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoiced_payment_permanent' USING ERRCODE = '42501',
      HINT = 'دفعةٌ مفوترة سجلٌّ ماليّ دائم: لا تُحذف، ولا بحذف حساب الكافل.';
  END IF;
  IF NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
     OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id
     OR NEW.sponsorship_id IS DISTINCT FROM OLD.sponsorship_id OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id
     OR NEW.period_start IS DISTINCT FROM OLD.period_start THEN
    RAISE EXCEPTION 'invoiced_payment_frozen' USING ERRCODE = '42501',
      HINT = 'حقائق الدفعة المفوترة لا تتغيّر؛ التصحيح ردٌّ ودفعةٌ جديدة.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'paid' AND NEW.status IN ('refunded', 'disputed'))
    OR (OLD.status = 'disputed' AND NEW.status IN ('paid', 'refunded'))) THEN
    RAISE EXCEPTION 'invoiced_payment_bad_transition: % -> %', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS freeze_invoiced_payment ON public.sponsorship_payments;
CREATE TRIGGER freeze_invoiced_payment BEFORE UPDATE OR DELETE ON public.sponsorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.freeze_invoiced_payment();

-- دفعات الشهر كما يراها الكافل: الفاتورة، والمزوّد، ورقم المعاملة، والحالة.
CREATE OR REPLACE FUNCTION public.month_payments(_sponsorship UUID, _month TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'invoice_no', p.invoice_no, 'provider', p.provider,
           'provider_payment_id', p.provider_payment_id,
           'amount', p.amount, 'currency', p.currency, 'status', p.status, 'paid_at', p.paid_at,
           'receipt_url', p.receipt_url) ORDER BY p.paid_at NULLS LAST, p.created_at), '[]'::jsonb)
    FROM public.sponsorship_payments p
   WHERE p.sponsorship_id = _sponsorship AND p.invoice_no IS NOT NULL
     AND to_char(COALESCE(p.period_start, p.paid_at::date), 'YYYY-MM') = _month;
$fn$;
REVOKE ALL ON FUNCTION public.month_payments(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.month_payment_refs(_sponsorship UUID, _month TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(string_agg(concat_ws(':', p.invoice_no, COALESCE(p.provider, ''),
                    COALESCE(p.provider_payment_id, ''), trim(to_char(p.amount, 'FM999999990.00')), p.status::text),
                  ',' ORDER BY p.invoice_no), '')
    FROM public.sponsorship_payments p
   WHERE p.sponsorship_id = _sponsorship AND p.invoice_no IS NOT NULL
     AND to_char(COALESCE(p.period_start, p.paid_at::date), 'YYYY-MM') = _month;
$fn$;
REVOKE ALL ON FUNCTION public.month_payment_refs(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ledger_receipt_v2(
  _sponsorship UUID, _month TEXT, _paid NUMERIC, _payment TEXT, _delivery TEXT, _delivered_at TIMESTAMPTZ,
  _refs TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4))
    FROM (SELECT encode(sha256(convert_to(concat_ws('|', 'receipt-v2', _sponsorship::text, _month,
            trim(to_char(COALESCE(_paid, 0), 'FM999999990.00')), COALESCE(_payment, ''), COALESCE(_delivery, ''),
            COALESCE(to_char(_delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), ''),
            COALESCE(_refs, '')), 'UTF8')), 'hex') AS h) x;
$fn$;

CREATE OR REPLACE FUNCTION public.sponsorship_ledger(_sponsorship UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships; _o public.orphans; _months JSONB; _from DATE; _to DATE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT (_s.sponsor_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'ledger_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _s.orphan_id;

  _from := date_trunc('month', COALESCE(_s.started_at, _s.created_at))::date;
  _to := CASE WHEN _s.status IN ('cancelled', 'completed')
              THEN date_trunc('month', COALESCE(_s.ended_at, now()))::date
              ELSE (date_trunc('month', now()) + interval '1 month')::date END;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb || jsonb_build_object(
           'payments', public.month_payments(_s.id, m.month),
           'receipt', CASE WHEN m.upcoming OR (m.paid = 0 AND m.delivery_status IS NULL) THEN NULL
                           ELSE public.ledger_receipt_v2(_s.id, m.month, m.paid, m.payment_status,
                                                         m.delivery_status, m.delivered_at,
                                                         public.month_payment_refs(_s.id, m.month)) END)
         ORDER BY m.month DESC), '[]'::jsonb) INTO _months
    FROM (
      SELECT to_char(g.m, 'YYYY-MM') AS month,
             g.m > date_trunc('month', now()) AS upcoming,
             _s.amount AS due,
             (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id AND p.status = 'paid'
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date)) = g.m) AS paid,
             (SELECT p.status::text FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date, p.created_at::date)) = g.m
               ORDER BY (p.status = 'paid') DESC, p.created_at DESC LIMIT 1) AS payment_status,
             (SELECT d.status FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY (d.status = 'delivered') DESC, d.created_at DESC LIMIT 1) AS delivery_status,
             (SELECT d.delivered_at FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id AND d.status = 'delivered'
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY d.delivered_at DESC LIMIT 1) AS delivered_at
        FROM generate_series(_from, _to, interval '1 month') AS g(m)
    ) m;

  RETURN jsonb_build_object(
    'sponsorship', jsonb_build_object(
      'id', _s.id, 'amount', _s.amount, 'currency', _s.currency, 'status', _s.status,
      'type', _s.type, 'started_at', _s.started_at, 'next_charge_at', _s.next_charge_at,
      'is_anonymous', _s.is_anonymous, 'message', _s.message, 'message_status', _s.message_status,
      'created_at', _s.created_at),
    'orphan', jsonb_build_object('id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
      'country', _o.country, 'region', _o.region, 'age_band', public.age_band_of(_o.birth_date),
      'locked', public.orphan_is_locked(_o.id)),
    'months', _months,
    'totals', jsonb_build_object(
      'paid', (SELECT COALESCE(sum(amount), 0) FROM public.sponsorship_payments
                WHERE sponsorship_id = _s.id AND status = 'paid'),
      'months_paid', (SELECT count(*) FROM jsonb_array_elements(_months) x WHERE (x->>'paid')::numeric > 0),
      'months_delivered', (SELECT count(*) FROM jsonb_array_elements(_months) x
                            WHERE x->>'delivery_status' = 'delivered')));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsorship_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsorship_ledger(UUID) TO authenticated;

-- البحث برقم الفاتورة أو برقم المعاملة لدى المزوّد. الكافل يجد دفعاته
-- وحدها؛ والإدارة تجد كل شيء. يُعيد الربط كاملاً: الفاتورة ← المعاملة ←
-- الكفالة والشهر ← إيصال الشهر ← بصمة الفاتورة في سجلّ السلامة.
CREATE OR REPLACE FUNCTION public.lookup_payment(_ref TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.sponsorship_payments; _month TEXT; _l JSONB; _m JSONB; _anchor TEXT; _q TEXT := btrim(COALESCE(_ref, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF length(_q) < 6 THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO _p FROM public.sponsorship_payments p
   WHERE p.invoice_no IS NOT NULL
     AND (upper(p.invoice_no) = upper(_q) OR p.provider_payment_id = _q OR p.provider_ref = _q)
     AND (p.sponsor_id = auth.uid() OR public.is_admin())
   ORDER BY p.paid_at DESC LIMIT 1;
  IF _p.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  _month := to_char(COALESCE(_p.period_start, _p.paid_at::date), 'YYYY-MM');
  _l := public.sponsorship_ledger(_p.sponsorship_id);
  SELECT x INTO _m FROM jsonb_array_elements(_l->'months') x WHERE x->>'month' = _month;
  SELECT l.hash INTO _anchor FROM public.integrity_log l
   WHERE l.kind = 'payment_invoiced' AND l.detail->>'invoice' = _p.invoice_no ORDER BY l.id LIMIT 1;
  RETURN jsonb_build_object('found', true,
    'invoice_no', _p.invoice_no, 'provider', _p.provider, 'provider_payment_id', _p.provider_payment_id,
    'amount', _p.amount, 'currency', _p.currency, 'status', _p.status, 'paid_at', _p.paid_at,
    'sponsorship_id', _p.sponsorship_id, 'month', _month,
    'orphan', _l->'orphan'->>'display_name', 'orphan_code', _l->'orphan'->>'code',
    'month_receipt', _m->>'receipt', 'delivery_status', _m->>'delivery_status',
    'anchor', left(_anchor, 16));
END $fn$;
REVOKE ALL ON FUNCTION public.lookup_payment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_payment(TEXT) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260924100000', 'invoices');

-- >>> migration 20260925100000 sponsor_qualification
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260925100000') THEN
    RAISE EXCEPTION 'الهجرة 20260925100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- رحلة التأهيل كما يراها الكافل والداعم
-- ---------------------------------------------------------------------
-- الكافل يدفع لبناء أهلية الطفل، فمن حقّه أن يرى ما بُني: البرنامج،
-- والمرحلة، والجلسات التي اجتازها ومتى، ونموّ أبعاد السمات. وهذا دون
-- طلب اطّلاع — بالحدّ الذي لا يكشف الطفل:
--   * لا مخرجات الجلسات ولا ملاحظات المشرف (نطاق «النتائج»).
--   * لا درجات السمات الفردية (نطاق «السمات»، حسّاسيته ٣) — بل متوسّط
--     كل بُعدٍ أوّلاً وأخيراً، ولا يُعرض بُعدٌ قبل قياسين على الأقل.
-- ما فوق ذلك يبقى بطلب الاطّلاع والنطاقات كما هو.
-- =====================================================================

-- من يرى: الكافل بكفالةٍ فعّالة أو منتهية، والداعم بتعهّدٍ مقبول للطفل،
-- ودائرة الطفل، ومن مُنح نطاق «التقدّم».
CREATE OR REPLACE FUNCTION public.can_see_qualification(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.sponsorships s
             WHERE s.orphan_id = _orphan AND s.sponsor_id = auth.uid()
               AND s.status IN ('active', 'paused', 'completed'))
    OR EXISTS (SELECT 1 FROM public.support_pledges p
                WHERE p.orphan_id = _orphan AND p.supporter_id = auth.uid()
                  AND p.status IN ('active', 'fulfilled'))
    OR public.in_orphan_circle(_orphan)
    OR public.has_orphan_scope(_orphan, 'progress'));
$fn$;
REVOKE ALL ON FUNCTION public.can_see_qualification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_qualification(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sponsor_qualification(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.can_see_qualification(_orphan) THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;
  RETURN jsonb_build_object('allowed', true,
    'programs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'program', pr.title,
               'status', e.status,
               'stage', e.stage::text,
               'started_at', e.started_at,
               'accepted', (SELECT count(*) FROM public.enrollment_units u
                             WHERE u.enrollment_id = e.id AND u.status = 'accepted'),
               'total', (SELECT count(*) FROM public.program_units pu
                          WHERE pu.program_id = e.program_id AND pu.active),
               -- الجلسات بعناوينها ومحاورها، وشهر قبولها — لا مخرجاتها ولا ملاحظاتها.
               'units', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'ordinal', pu.ordinal, 'title', pu.title, 'focus', pu.focus,
                           'status', COALESCE(u.status::text, 'pending'),
                           'accepted_month', CASE WHEN u.status = 'accepted'
                                                  THEN to_char(u.decided_at, 'YYYY-MM') END)
                         ORDER BY pu.ordinal)
                    FROM public.program_units pu
                    LEFT JOIN public.enrollment_units u ON u.unit_id = pu.id AND u.enrollment_id = e.id
                   WHERE pu.program_id = e.program_id AND pu.active), '[]'::jsonb))
             ORDER BY e.created_at DESC)
        FROM public.program_enrollments e
        JOIN public.programs pr ON pr.id = e.program_id
       WHERE e.orphan_id = _orphan AND e.status IN ('funded', 'paused', 'completed')), '[]'::jsonb),
    -- النموّ بالأبعاد: متوسّط أوّل قياسٍ وآخره لكل سمةٍ في البُعد.
    'growth', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'dimension', g.label, 'first', g.first_avg, 'latest', g.latest_avg,
               'observations', g.obs) ORDER BY g.sort_order)
        FROM (
          SELECT d.label_ar AS label, d.sort_order,
                 round(avg(f.pct), 0) AS first_avg, round(avg(l.pct), 0) AS latest_avg,
                 sum(c.n)::int AS obs
            FROM public.trait_dimensions d
            JOIN public.trait_definitions t ON t.dimension_id = d.id AND t.deleted_at IS NULL
            CROSS JOIN LATERAL (SELECT count(*) AS n FROM public.orphan_trait_scores s
                                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL) c
            CROSS JOIN LATERAL (SELECT 100 * s.score / s.scale_max AS pct FROM public.orphan_trait_scores s
                                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                                 ORDER BY s.observed_at ASC LIMIT 1) f
            CROSS JOIN LATERAL (SELECT 100 * s.score / s.scale_max AS pct FROM public.orphan_trait_scores s
                                 WHERE s.orphan_id = _orphan AND s.trait_id = t.id AND s.deleted_at IS NULL
                                 ORDER BY s.observed_at DESC LIMIT 1) l
           GROUP BY d.id, d.label_ar, d.sort_order
          HAVING sum(c.n) >= 2
        ) g), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsor_qualification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_qualification(UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260925100000', 'sponsor_qualification');

-- >>> migration 20260926100000 ops_health
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926100000') THEN
    RAISE EXCEPTION 'الهجرة 20260926100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- صحّة التشغيل — فحوصٌ دورية وتنبيهٌ للمشرفين
-- ---------------------------------------------------------------------
-- الحماية التي لا يراها أحد لا تحمي: قائمة المراجعة في لوحة الإدارة
-- تنفع من يفتحها فقط. هنا تُحسب الفحوص في مكانٍ واحد، ويُسجَّل كل تشغيلٍ
-- في `ops_runs` (إلحاقٌ فقط)، ويُنبَّه المشرفون حين يتغيّر الحال أو يمضي
-- يومٌ على تنبيهٍ قائم — لا في كل تشغيل، فالتنبيه المتكرّر يُتجاهَل.
--
-- الفحوص (لكلٍّ مستوى: ok · warn · critical):
--   integrity_chain   سلسلة سجلّ السلامة سليمة
--   webhook_errors    أحداث مزوّد الدفع فشلت معالجتها أو لم تُعالَج
--   payments_stuck    دفعاتٌ معلّقة أكثر من ساعتين
--   discrepancies     تعارضاتٌ من منصّة التشغيل تنتظر قراراً
--   unlock_waiting    طلبات فكّ قفلٍ تنتظر أكثر من ٤٨ ساعة
--   email_failed      رسائل استنفدت محاولاتها
--   mirror_lag        منصّة تشغيلٍ فعّالة بلا دفعةٍ منذ ٤٨ ساعة
--   admin_quorum      أقلّ من ثلاثة مشرفين (النصاب يحتاج اثنين غير الطالب)
-- =====================================================================

CREATE OR REPLACE FUNCTION public._ops_checks()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _out JSONB := '[]'::jsonb;
  _r public.integrity_log; _prev TEXT := 'genesis'; _broken BIGINT;
  _n BIGINT; _old BIGINT;
  _check JSONB;
BEGIN
  -- ١) السلسلة: إعادة حسابٍ كاملة؛ أوّل كسرٍ يكفي.
  FOR _r IN SELECT * FROM public.integrity_log ORDER BY id LOOP
    IF _r.prev_hash <> _prev OR _r.hash <> public.integrity_row_hash(_r.prev_hash, _r.at, _r.actor,
         _r.kind, _r.orphan_id, _r.source, _r.detail) THEN
      _broken := _r.id; EXIT;
    END IF;
    _prev := _r.hash;
  END LOOP;
  _out := _out || jsonb_build_object('key', 'integrity_chain',
    'level', CASE WHEN _broken IS NULL THEN 'ok' ELSE 'critical' END,
    'count', COALESCE(_broken, 0),
    'title', CASE WHEN _broken IS NULL THEN 'سلسلة سجلّ السلامة سليمة'
                  ELSE format('سلسلة سجلّ السلامة انكسرت عند السطر %s', _broken) END);

  -- ٢) أحداث الدفع: خطأٌ مسجّل، أو لم تُعالَج بعد ٣٠ دقيقة (آخر ٧ أيام).
  SELECT count(*) INTO _n FROM public.payment_events
   WHERE created_at > now() - interval '7 days'
     AND (error IS NOT NULL OR (processed_at IS NULL AND created_at < now() - interval '30 minutes'));
  _out := _out || jsonb_build_object('key', 'webhook_errors',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'critical' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'أحداث الدفع تُعالَج كلّها'
                  ELSE format('%s حدثَ دفعٍ لم يُعالَج أو فشلت معالجته', _n) END);

  -- ٣) دفعاتٌ معلّقة طويلاً: المزوّد لم يؤكّد، أو الحدث لم يصل.
  SELECT count(*) INTO _n FROM public.sponsorship_payments
   WHERE status::text = 'pending' AND created_at < now() - interval '2 hours'
     AND created_at > now() - interval '30 days';
  _out := _out || jsonb_build_object('key', 'payments_stuck',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا دفعات معلّقة'
                  ELSE format('%s دفعةً معلّقة أكثر من ساعتين', _n) END);

  -- ٤) التعارضات: تحجز تغييراً على سجلٍّ مقفل؛ بعد ٧٢ ساعة تصير حرجة.
  SELECT count(*), count(*) FILTER (WHERE created_at < now() - interval '72 hours')
    INTO _n, _old FROM public.integrity_discrepancies WHERE status = 'open';
  _out := _out || jsonb_build_object('key', 'discrepancies',
    'level', CASE WHEN _n = 0 THEN 'ok' WHEN _old > 0 THEN 'critical' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا تعارضات مع منصّات التشغيل'
                  ELSE format('%s تعارضاً ينتظر قراراً', _n) END);

  -- ٥) طلبات فكّ القفل المنتظرة.
  SELECT count(*) INTO _n FROM public.unlock_requests
   WHERE status = 'pending' AND created_at < now() - interval '48 hours';
  _out := _out || jsonb_build_object('key', 'unlock_waiting',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا طلبات فكّ قفلٍ متأخّرة'
                  ELSE format('%s طلبَ فكّ قفلٍ ينتظر أكثر من ٤٨ ساعة', _n) END);

  -- ٦) البريد.
  SELECT count(*) INTO _n FROM public.notifications
   WHERE email_state = 'failed' AND created_at > now() - interval '7 days';
  _out := _out || jsonb_build_object('key', 'email_failed',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا رسائل فاشلة'
                  ELSE format('%s رسالةً استنفدت محاولاتها', _n) END);

  -- ٧) تأخّر المرآة: منصّةٌ فعّالة بلا دفعةٍ حديثة.
  SELECT count(*) INTO _n FROM public.operating_platforms p
   WHERE p.active AND p.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM public.mirror_batches b
                      WHERE b.source = p.key AND b.received_at > now() - interval '48 hours');
  _out := _out || jsonb_build_object('key', 'mirror_lag',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'منصّات التشغيل الفعّالة متزامنة'
                  ELSE format('%s منصّةَ تشغيلٍ بلا مزامنةٍ منذ ٤٨ ساعة', _n) END);

  -- ٨) النصاب.
  SELECT count(*) INTO _n FROM public.user_roles WHERE role = 'admin';
  _out := _out || jsonb_build_object('key', 'admin_quorum',
    'level', CASE WHEN _n >= 3 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n >= 3 THEN format('%s مشرفين — النصاب متاح', _n)
                  ELSE format('%s مشرف فقط — فكّ القفل يحتاج ثلاثة على الأقل', _n) END);

  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public._ops_checks() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._ops_level(_checks JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_checks) c WHERE c->>'level' = 'critical') THEN 'critical'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_checks) c WHERE c->>'level' = 'warn') THEN 'warn'
    ELSE 'ok' END;
$fn$;

-- ---------------------------------------------------------------------
-- سجلّ التشغيلات — إلحاقٌ فقط
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ops_runs (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  level       TEXT NOT NULL CHECK (level IN ('ok', 'warn', 'critical')),
  -- بصمة ما ليس سليماً: مفاتيح الفحوص ومستوياتها وأعدادها. تغيّرها = خبرٌ جديد.
  signature   TEXT NOT NULL,
  checks      JSONB NOT NULL,
  notified    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ops_runs_at ON public.ops_runs(at DESC);
ALTER TABLE public.ops_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_admin ON public.ops_runs;
CREATE POLICY ops_admin ON public.ops_runs FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.ops_runs FROM anon, authenticated;
GRANT SELECT ON public.ops_runs TO authenticated;
GRANT ALL ON public.ops_runs TO service_role;
DROP TRIGGER IF EXISTS ops_runs_frozen ON public.ops_runs;
CREATE TRIGGER ops_runs_frozen BEFORE UPDATE OR DELETE ON public.ops_runs
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

-- للمشرف في اللوحة: الحال الآن، بلا تسجيل.
CREATE OR REPLACE FUNCTION public.ops_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _c JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  _c := public._ops_checks();
  RETURN jsonb_build_object('level', public._ops_level(_c), 'checks', _c, 'at', now(),
    'last_run', (SELECT to_jsonb(r) - 'checks' FROM public.ops_runs r ORDER BY id DESC LIMIT 1));
END $fn$;
REVOKE ALL ON FUNCTION public.ops_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_health() TO authenticated;

-- للمجدول: يسجّل التشغيل، وينبّه المشرفين داخل التطبيق (والبريد يتبع
-- صندوق الإرسال وحجبه). ينبّه حين تتغيّر البصمة، أو يمضي ٢٠ ساعة على
-- آخر تنبيهٍ بنفس البصمة وما زال الحال غير سليم. العودة إلى السلامة خبرٌ
-- يُرسَل مرّةً واحدة.
CREATE OR REPLACE FUNCTION public.ops_record_run()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _c JSONB; _level TEXT; _sig TEXT; _last public.ops_runs; _lastn public.ops_runs;
  _notify BOOLEAN; _sent INTEGER := 0; _admin UUID; _title TEXT; _body TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ops_record_run'));
  _c := public._ops_checks();
  _level := public._ops_level(_c);
  SELECT COALESCE(string_agg(format('%s:%s:%s', x->>'key', x->>'level', x->>'count'), ',' ORDER BY x->>'key'), '')
    INTO _sig FROM jsonb_array_elements(_c) x WHERE x->>'level' <> 'ok';

  SELECT * INTO _last FROM public.ops_runs ORDER BY id DESC LIMIT 1;
  SELECT * INTO _lastn FROM public.ops_runs WHERE notified > 0 ORDER BY id DESC LIMIT 1;

  _notify := CASE
    WHEN _level = 'ok' THEN _last.id IS NOT NULL AND _last.level <> 'ok'          -- عاد سليماً
    WHEN _lastn.id IS NULL THEN true
    WHEN _lastn.signature <> _sig THEN true                                       -- تغيّر الحال
    ELSE _lastn.at < now() - interval '20 hours' END;                             -- تذكيرٌ يومي

  IF _notify THEN
    IF _level = 'ok' THEN
      _title := 'صحّة التشغيل: عاد كل شيءٍ سليماً';
      _body := 'الفحوص الثمانية سليمة.';
    ELSE
      _title := CASE _level WHEN 'critical' THEN 'صحّة التشغيل: تنبيهٌ حرج' ELSE 'صحّة التشغيل: يحتاج انتباهاً' END;
      SELECT string_agg('• ' || (x->>'title'), E'\n' ORDER BY (x->>'level') = 'critical' DESC, x->>'key')
        INTO _body FROM jsonb_array_elements(_c) x WHERE x->>'level' <> 'ok';
    END IF;
    FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      PERFORM public.notify(_admin, 'other', _title, _body, '/admin?tab=monitoring', 'ops_run', NULL);
      _sent := _sent + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_runs (level, signature, checks, notified) VALUES (_level, _sig, _c, _sent);
  RETURN jsonb_build_object('level', _level, 'notified', _sent, 'checks', _c);
END $fn$;
REVOKE ALL ON FUNCTION public.ops_record_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_record_run() TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260926100000', 'ops_health');

COMMIT;
