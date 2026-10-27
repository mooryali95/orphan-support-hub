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
