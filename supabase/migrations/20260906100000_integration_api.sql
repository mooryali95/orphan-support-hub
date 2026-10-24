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
