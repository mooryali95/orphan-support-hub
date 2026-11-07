-- =====================================================================
-- المرحلة صفر — ما وجدته المراجعة بعد الإصلاح (المجموعة REV)
-- ---------------------------------------------------------------------
-- مراجعتان مستقلّتان قرأتا هجرات DB-A وDB-B وPERF ووجدتا أبواباً بقيت
-- مفتوحة، وأخرى فتحها الإصلاح نفسه. كلٌّ منها مُثبَتٌ بفحصٍ يفشل قبل هذه
-- الهجرة ويمرّ بعدها (`supabase/tests/review-fixes-verification.sql`):
--
--   ١) CP-05  حماية «أقلّ من ٥» تُلتفّ عليها: سجلّ الكفالة يُعيد المنطقة
--             الخام لأيّ كفالةٍ «بانتظار الدفع» يُنشئها أيّ حساب، و
--             `published_regions` تسرد كلّ منطقة، وكتالوج الدعم يُعلن منطقة
--             المجموعة وعدد أطفالها ثم يُفلتر الدليلُ بها، و`org_id` يدلّ
--             على جهةٍ مدينتُها معلنة.
--   ٢) CP-05  الخارطة: «صغيرة» و«مُخفاةٌ تكميلياً» علامتان مختلفتان،
--             والترتيب بالعدد الحقيقي — فالطرح يُعيد ما أُخفي.
--   ٣) CP-04  نصّ الاحتياج (العنوان والملاحظات) يقرؤه الزائر بنداء REST،
--             وتكتبه الجهة متى شاءت بلا مراجعة.
--   ٤) CP-04  عضو الدائرة يقرأ اسم المدرسة من الجدول مباشرةً متجاوزاً
--             `orphan_profile`.
--   ٥) CP-01  المشرف الذي انقضى أجلُ اعتماده يبقى يعمل: التقويم والجلسات
--             والمرحلة لا تسأل عن القرار ولا الأجل.
--   ٦) CP-02  صورة الطفل في خزنةٍ عامّة تُسرد مجلّداتها وتُنزَّل بلا إذن
--             «الهوية»، وتبقى بعد سحب الموافقة.
--   ٧) DB-07  «الإعادة للمراجعة» كانت تُسقط الطفل المكفول من النشر لتصحيح
--             حرف، وتغيّبه عن كافله، ولا يعود إلا بوثائق لم تُطلب يوماً —
--             وكلّ مزامنةٍ من الشريك تُسقطه كذلك.
--   ٨) CP-01  اعتماد الدائرة ينقضي بعد سنة ولا يعود إلى صندوق الإدارة.
--
-- كلّ ما هنا `CREATE OR REPLACE` و`DROP ... IF EXISTS` وإضافاتٌ مشروطة،
-- فتُطبَّق على البثّ كما هي. وتواقيع الدوالّ التي تستدعيها الواجهة
-- باقية. وكلّ دالّةٍ أو جدولٍ جديد يُسحب من العموم أولاً ثم يُمنح لمن قُصد
-- له: صلاحيات Supabase الافتراضية تمنح anon وauthenticated كلَّ ما يُنشأ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) CP-05 — كلّ قارئٍ للمنطقة يحجبها كما تحجبها البطاقة
-- ---------------------------------------------------------------------
-- القاعدة واحدة: المنطقة تُعرض إن كان حشد الطفل آمناً (٥ فأكثر) أو كان
-- القارئ ممّن يرى تفصيله (`can_view_orphan_detail`). وكان سجلّ الكفالة
-- يكتفي بأن يملك القارئ الكفالة — وأيّ حسابٍ يُنشئ كفالةً «بانتظار الدفع»
-- بزرّ «اكفل» أو بإدراجٍ مباشر، فيقرأ «كوكس» لطفلٍ وحيدٍ فيها، ويبقى
-- يقرؤها بعد أن يُلغي.
--
-- ويُعاد تعريف السجلّ كما هو حرفاً إلا سطر المنطقة: الإيصال وبصمته لا
-- يدخل فيهما شيءٌ ممّا تغيّر.
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
      'country', _o.country,
      -- الحشد الصغير يُحجب كما في البطاقة؛ والكافل الحاليّ يراه كما يرى الملفّ.
      'region', CASE WHEN public.can_view_orphan_detail(_o.id) OR public.cohort_is_safe(_o.id)
                     THEN _o.region END,
      'age_band', public.age_band_of(_o.birth_date),
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

/* قائمة مناطق الاقتراح كانت تسرد كلّ منطقةٍ فيها طفلٌ منشور — ولو
   واحد. فصارت كقائمة الفلترة: منطقةٌ فيها حشدٌ آمن واحدٌ على الأقلّ. */
CREATE OR REPLACE FUNCTION public.published_regions()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(r ORDER BY r), '[]'::jsonb)
  FROM (
    SELECT DISTINCT o.region AS r
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id AND cs.safe
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.region), '') <> ''
  ) s;
$fn$;
REVOKE ALL ON FUNCTION public.published_regions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.published_regions() TO anon, authenticated;

/* كتالوج الدعم: المجموعة تُعلن منطقتها وعدد أطفالها، والدليل يُفلتر بها
   — فـ«مجموعة كوكس: طفل واحد» ثم «أطفال المجموعة» يعطي الطفل ومنطقته.
   فعدد الأطفال لا يُنشر دون الحدّ، ومنطقة المجموعة لا تُنشر إن كان في
   أطفالها المنشورين من حشده صغير — ولا تدخل قائمة المناطق من طريقها.
   والترتيب بالاسم: الترتيب بالمنطقة المحجوبة يُظهرها بجيرانها. */
CREATE OR REPLACE FUNCTION public.support_catalog(_country TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH c AS (
    SELECT code, name_ar FROM public.countries
     WHERE status = 'active' AND (_country IS NULL OR code = _country)
  ),
  safety AS (SELECT * FROM public.cohort_safety()),
  gstat AS (
    SELECT o.group_id,
           count(*) FILTER (WHERE o.status = 'approved') AS n,
           count(*) FILTER (WHERE NOT s.safe) AS unsafe
      FROM public.orphans o
      JOIN safety s ON s.orphan_id = o.id
     WHERE o.group_id IS NOT NULL
     GROUP BY o.group_id
  ),
  grp AS (
    SELECT g.id, g.name, g.country_code, g.region,
           COALESCE(gs.n, 0) AS n, COALESCE(gs.unsafe, 0) = 0 AS region_ok
      FROM public.mirror_groups g
      LEFT JOIN gstat gs ON gs.group_id = g.id
     WHERE g.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar) ORDER BY name_ar)
                             FROM c), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('country', r.country, 'name', r.region))
                           FROM (SELECT g.country_code AS country, g.region FROM grp g
                                  WHERE g.region IS NOT NULL AND g.region_ok
                                 UNION
                                 SELECT o.country_code, o.region FROM public.offices o
                                  WHERE o.active AND o.region IS NOT NULL) r
                          WHERE r.country IN (SELECT code FROM c)), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', g.id, 'name', g.name, 'country', g.country_code,
                          'region', CASE WHEN g.region_ok THEN g.region END,
                          'children', CASE WHEN g.n >= public.cohort_min() THEN g.n END)
                        ORDER BY g.name, g.id)
                          FROM grp g
                         WHERE g.country_code IN (SELECT code FROM c)), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'name', o.name, 'kind', k.label, 'country', o.country_code,
                          'region', o.region)
                        ORDER BY o.name)
                          FROM public.care_organizations o
                          LEFT JOIN public.institution_kinds k ON k.key = o.kind
                         WHERE o.status = 'approved' AND o.country_code IN (SELECT code FROM c)), '[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.support_catalog(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_catalog(TEXT) TO anon, authenticated;

/* والدليل: «أطفال المجموعة» كفلترة المنطقة — المجموعة تعني منطقتها،
   فلا يُطابقها إلا طفلٌ حشده آمن. ومن حشده صغير يبقى في الدليل العامّ
   بلا منطقة، كما كان. */
CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,
  _building BOOLEAN DEFAULT NULL,
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0,
  _group UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب لا يُحذف: محرف البدل يصير محرفاً عادياً لا «كلّ شيء». */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها.
              والحشد محسوبٌ مرّةً لكلّ النداء في `cohort_safety()`. */
           CASE WHEN cs.safe THEN o.region END AS region,
           CASE WHEN cs.safe THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           /* والجهة كالمنطقة: في حشدٍ صغير تدلّ مدينتها المعلنة على الطفل. */
           o.status, CASE WHEN cs.safe THEN o.org_id END AS org_id,
           o.created_at, o.group_id, cs.safe AS cohort_safe,
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
             AS waiting_days,
           /* إشارات الثقة: عددٌ ونعم/لا، لا محتوى. */
           (SELECT count(*) FROM public.orphan_profile_sections p
             WHERE p.orphan_id = o.id)::INTEGER AS profile_sections,
           (o.photo_consent IN ('granted', 'face_hidden')) AS consent_documented,
           EXISTS (SELECT 1 FROM public.progress_reports r
                    WHERE r.orphan_id = o.id AND r.status = 'approved'
                      AND r.updated_at > now() - interval '90 days') AS recent_report
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       /* الفلترة على المنطقة المحجوبة لا الخام: وإلا صار سؤال «هل في
          كوكس أحد؟» جواباً. */
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       /* والمجموعة منطقةٌ معلنة: لا يُطابقها إلا حشدٌ آمن. */
       AND (_group IS NULL OR (b.group_id = _group AND b.cohort_safe))
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' - 'cohort_safe' ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN _sort = 'documented' THEN f.profile_sections END DESC,
          CASE WHEN _sort = 'documented' THEN f.recent_report END DESC,
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
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ١ب) CP-05 — الجهة لا تدلّ على طفل الحشد الصغير
-- ---------------------------------------------------------------------
-- مدينة الجهة ومنطقتها معلنتان في دليل الجهات — وهما بيانات مؤسّسة لا
-- بيانات طفل. لكنّ `orphans.org_id` كان يُقرأ بنداء REST من الزائر وكلّ
-- مسجَّل، ويعود في البطاقة والملفّ والاقتراحات: «أرديت ← جهة كوكس» يُعيد
-- ما حجبته البطاقة. والصفحة كانت تحذف مدينة الجهة في الحشد الصغير من الردّ
-- — بعد أن قرأتها؛ والقاعدة لم تحجب شيئاً.
--
-- الآن تُعرف الجهة كما تُعرف المنطقة: لحشدٍ آمن أو لمن يرى التفصيل. والعمود
-- يُسحب من القراءة المباشرة؛ فالجهة ترى أطفالها من `org_orphans`، والإدارة
-- من دوالّها، وسياسات RLS تقرؤه دون منح.
REVOKE SELECT (org_id) ON TABLE public.orphans FROM anon, authenticated;

/* الإدخال كان يقيّد التحديث بـ`org_id = _org_id` بصلاحية المستدعي — وهي
   قراءةٌ للعمود المسحوب. فالسؤال يُسأل بصلاحية المالك، ولا يُجيب إلا مالك
   الجهة: غيرُه لا يعرف منه لمن الطفل. */
CREATE OR REPLACE FUNCTION public.orphan_in_my_org(_orphan UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.orphans o
                  WHERE o.id = _orphan AND o.org_id = _org AND public.owns_org(_org));
$fn$;
REVOKE ALL ON FUNCTION public.orphan_in_my_org(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_in_my_org(UUID, UUID) TO authenticated;

-- كما هي حرفاً إلا شرط الجهة في تحديث المسودّة.
CREATE OR REPLACE FUNCTION public.create_orphan_intake(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id UUID := (_payload->>'org_id')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _code TEXT;
  _need JSONB;
  _doc JSONB;
  _needs_total NUMERIC(12,2) := 0;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'intake: org_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.care_organizations
     WHERE id = _org_id AND owner_id = auth.uid() AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'intake: organisation not yours or not approved'
      USING ERRCODE = '42501';
  END IF;

  IF _orphan IS NULL THEN
    _code := public.next_orphan_code();
    INSERT INTO public.orphans (
      code, org_id, created_by, display_name, gender, birth_date,
      city, region, education_stage, story, monthly_need, status
    ) VALUES (
      _code, _org_id, auth.uid(),
      _payload->>'display_name',
      COALESCE(_payload->>'gender', 'male'),
      NULLIF(_payload->>'birth_date', '')::date,
      NULLIF(_payload->>'city', ''),
      NULLIF(_payload->>'region', ''),
      NULLIF(_payload->>'education_stage', ''),
      NULLIF(_payload->>'story', ''),
      0,
      'submitted'
    ) RETURNING id INTO _orphan;
  ELSE
    UPDATE public.orphans SET
      display_name    = _payload->>'display_name',
      gender          = COALESCE(_payload->>'gender', 'male'),
      birth_date      = NULLIF(_payload->>'birth_date', '')::date,
      city            = NULLIF(_payload->>'city', ''),
      region          = NULLIF(_payload->>'region', ''),
      education_stage = NULLIF(_payload->>'education_stage', ''),
      story           = NULLIF(_payload->>'story', ''),
      status          = 'submitted',
      updated_at      = now()
    WHERE id = _orphan AND public.orphan_in_my_org(id, _org_id)
      AND status IN ('draft', 'rejected');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;

    _code := (SELECT code FROM public.orphans WHERE id = _orphan);
    DELETE FROM public.orphan_needs WHERE orphan_id = _orphan;
  END IF;

  INSERT INTO public.orphan_private (
    orphan_id, full_name, national_id, guardian_name, guardian_relation,
    guardian_phone, address, family_size, family_income,
    health_notes, school_name, notes
  ) VALUES (
    _orphan,
    NULLIF(_payload->>'full_name', ''),
    NULLIF(_payload->>'national_id', ''),
    NULLIF(_payload->>'guardian_name', ''),
    NULLIF(_payload->>'guardian_relation', ''),
    NULLIF(_payload->>'guardian_phone', ''),
    NULLIF(_payload->>'address', ''),
    NULLIF(_payload->>'family_size', '')::integer,
    NULLIF(_payload->>'family_income', '')::numeric,
    NULLIF(_payload->>'health_notes', ''),
    NULLIF(_payload->>'school_name', ''),
    NULLIF(_payload->>'private_notes', '')
  )
  ON CONFLICT (orphan_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    national_id = EXCLUDED.national_id,
    guardian_name = EXCLUDED.guardian_name,
    guardian_relation = EXCLUDED.guardian_relation,
    guardian_phone = EXCLUDED.guardian_phone,
    address = EXCLUDED.address,
    family_size = EXCLUDED.family_size,
    family_income = EXCLUDED.family_income,
    health_notes = EXCLUDED.health_notes,
    school_name = EXCLUDED.school_name,
    notes = EXCLUDED.notes;

  FOR _need IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'needs', '[]'::jsonb))
  LOOP
    INSERT INTO public.orphan_needs (orphan_id, category, title, monthly_amount, notes)
    VALUES (
      _orphan,
      COALESCE(_need->>'category', 'other')::public.need_category,
      COALESCE(NULLIF(_need->>'title', ''), 'بند'),
      COALESCE((_need->>'monthly_amount')::numeric, 0),
      NULLIF(_need->>'note', '')
    );
    _needs_total := _needs_total + COALESCE((_need->>'monthly_amount')::numeric, 0);
  END LOOP;

  IF _needs_total = 0 THEN
    UPDATE public.orphans
       SET monthly_need = COALESCE((_payload->>'monthly_need')::numeric, 0)
     WHERE id = _orphan;
  END IF;

  FOR _doc IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb))
  LOOP
    INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    VALUES (
      _orphan,
      COALESCE(_doc->>'kind', 'other'),
      COALESCE(_doc->>'kind', 'other')::public.orphan_doc_type,
      _doc->>'storage_path',
      NULLIF(_doc->>'file_name', ''),
      NULLIF(_doc->>'mime_type', ''),
      NULLIF(_doc->>'size_bytes', '')::integer,
      auth.uid()
    )
    ON CONFLICT (storage_path) DO NOTHING;
  END LOOP;

  PERFORM public.write_audit('orphan.submitted', 'orphan', _orphan,
    jsonb_build_object('code', _code, 'org_id', _org_id,
                       'needs', jsonb_array_length(COALESCE(_payload->'needs', '[]'::jsonb)),
                       'documents', jsonb_array_length(COALESCE(_payload->'documents', '[]'::jsonb))));

  RETURN jsonb_build_object('id', _orphan, 'code', _code);
END $function$;
REVOKE ALL ON FUNCTION public.create_orphan_intake(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_orphan_intake(JSONB) TO authenticated;

/* اقتراحات الكافل: كما هي إلا الجهة، تُحجب مع المنطقة. */
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL, _region TEXT DEFAULT NULL, _limit INTEGER DEFAULT 12)
RETURNS TABLE(id UUID, code TEXT, display_name TEXT, gender TEXT, country TEXT, region TEXT,
              education_stage TEXT, age_band public.age_band, monthly_need NUMERIC,
              funded_monthly NUMERIC, currency TEXT, status public.orphan_status, org_id UUID,
              created_at TIMESTAMPTZ, gap NUMERIC, building BOOLEAN, completes BOOLEAN,
              in_region BOOLEAN, waiting_days INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT COALESCE(_budget, p.monthly_budget) AS budget,
           COALESCE(NULLIF(btrim(COALESCE(_region, '')), ''), p.preferred_region) AS region
      FROM (SELECT NULL::UUID) z
      LEFT JOIN public.profiles p ON p.id = auth.uid()
  ),
  cand AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country, o.birth_date,
           o.monthly_need, o.funded_monthly, o.currency, o.status, o.org_id,
           o.created_at, o.approved_at,
           cs.safe,
           o.region AS raw_region, o.education_stage AS raw_stage,
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
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status = 'approved'
       AND (o.monthly_need - o.funded_monthly) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.sponsorships s
          WHERE s.orphan_id = o.id
            AND s.sponsor_id = auth.uid()
            AND s.status IN ('pending_payment', 'active', 'paused')
       )
  ),
  masked AS (
    SELECT c.*,
           CASE WHEN c.safe THEN c.raw_region END AS m_region,
           CASE WHEN c.safe THEN c.raw_stage END AS m_stage,
           CASE WHEN c.safe THEN c.org_id END AS m_org
      FROM cand c
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.m_region,
         c.m_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status, c.m_org,
         c.created_at,
         c.gap,
         c.building,
         (me.budget IS NOT NULL AND c.gap <= me.budget) AS completes,
         (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) AS in_region,
         GREATEST(0, (now()::date - COALESCE(c.approved_at, c.created_at)::date))::INTEGER
    FROM masked c CROSS JOIN me
   ORDER BY
     c.building DESC,
     (me.budget IS NOT NULL AND c.gap <= me.budget) DESC,
     (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) DESC,
     COALESCE(c.approved_at, c.created_at) ASC,
     c.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 48);
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------
-- ٢) CP-05 — الخارطة: كلّ منطقةٍ مخفيّة بعلامةٍ واحدة، ولا تُثبَّت بالطرح
-- ---------------------------------------------------------------------
-- كانت المخفيّة لصغرها تحمل `small` والمخفيّة تكميلياً تحمل `suppressed`،
-- والترتيب بالعدد الحقيقي. فـ«البلد ١٢، تيرانا ٦، شكودر (≥٥)، كوكس (≥١)»
-- يعطي ١٢ − ٦ = ٦ = ٥ + ١ بالضبط.
--
-- الآن:
--   • كلّ منطقةٍ لم يُنشر عددها تحمل العلامة نفسها (`small: true`،
--     والأرقام فارغة) — لا يُعرف أصغيرةٌ هي أم أُخفيت لتحمي غيرها.
--   • الظاهرة مرتّبةٌ بعددها، والمخفيّة بعدها **بالاسم**.
--   • وقاعدة الحدّ الأدنى: الباقي R (البلد − الظاهر) موزَّعٌ على h منطقةً
--     مخفيّة، كلٌّ منها طفلٌ على الأقلّ؛ فأكبر ما يمكن أن تكونه إحداها
--     R − (h − 1). فإن نقص عن الحدّ عُلم أنّ كلّ مخفيّةٍ صغيرة — وقد يُعلم
--     عددها بعينه (R = h). فتُخفى أصغرُ الظاهرة واحدةً بعد واحدة حتى يبلغ
--     R − h + 1 الحدّ. وإن لم يبقَ ما يُخفى، فالمناطق كلّها مخفيّة.
--     (وبلا منطقةٍ مخفيّة: R صفرٌ أو ≥ الحدّ كما كان.)
--   • و«المكفول» و«وصلهم تسليم» على قاعدتهما: لا يُنشران إلا لمنطقةٍ
--     ظاهرة، ولا للبلد إلا حين يبلغ كلا شقّي الباقي الحدّ. والفجوة المالية
--     تتبع العدد: لا تُنشر لمنطقةٍ مخفيّة، ولا للبلد إن حُجب عدده.
-- وعدد البلد يبقى: هو مقروءٌ من عمود `country` نفسه بنداء REST.
CREATE OR REPLACE FUNCTION public.geo_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH k AS (SELECT public.cohort_min() AS k),
  pub AS (
    SELECT o.id,
           btrim(o.country) AS country,
           NULLIF(btrim(o.region), '') AS region,
           (o.status = 'fully_sponsored') AS sponsored,
           GREATEST(0, o.monthly_need - o.funded_monthly) AS gap,
           o.currency,
           EXISTS (SELECT 1 FROM public.disbursements d
                    WHERE d.orphan_id = o.id AND d.status = 'delivered'
                      AND d.delivered_at > now() - interval '90 days') AS delivered
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.country), '') <> ''
  ),
  reg AS (
    SELECT country, region,
           count(*) AS total,
           count(*) FILTER (WHERE sponsored) AS spon,
           count(*) FILTER (WHERE delivered) AS deliv,
           mode() WITHIN GROUP (ORDER BY currency) AS currency
      FROM pub WHERE region IS NOT NULL GROUP BY country, region
  ),
  reg_gap AS (
    SELECT r.country, r.region, sum(p.gap) AS gap
      FROM reg r JOIN pub p ON p.country = r.country AND p.region = r.region
                           AND p.currency = r.currency
     GROUP BY r.country, r.region
  ),
  cty AS (
    SELECT country,
           count(*) AS total,
           count(*) FILTER (WHERE sponsored) AS spon,
           count(*) FILTER (WHERE delivered) AS deliv,
           mode() WITHIN GROUP (ORDER BY currency) AS currency
      FROM pub GROUP BY country
  ),
  cty_gap AS (
    SELECT c.country, sum(p.gap) AS gap
      FROM cty c JOIN pub p ON p.country = c.country AND p.currency = c.currency
     GROUP BY c.country
  ),
  /* المناطق التي بلغت الحدّ، مرتّبةً من الأصغر، ومجموعُها التراكمي. */
  lg AS (
    SELECT r.country, r.region,
           row_number() OVER (PARTITION BY r.country ORDER BY r.total, r.region) AS rk,
           sum(r.total) OVER (PARTITION BY r.country ORDER BY r.total, r.region
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
      FROM reg r, k WHERE r.total >= k.k
  ),
  /* قبل أيّ إخفاءٍ تكميلي: الباقي u (الصغيرة ومن بلا منطقة) وعدد الصغيرة. */
  cstat AS (
    SELECT c.country,
           c.total - COALESCE((SELECT sum(r.total) FROM reg r, k
                                WHERE r.country = c.country AND r.total >= k.k), 0) AS u,
           (SELECT count(*) FROM reg r, k WHERE r.country = c.country AND r.total < k.k) AS h_s,
           (SELECT count(*) FROM reg r, k WHERE r.country = c.country AND r.total >= k.k) AS n_large
      FROM cty c
  ),
  /* إخفاء m من أصغر الكبيرة: الباقي rr والمخفيّة hh. */
  cand AS (
    SELECT s.country, 0::BIGINT AS m, s.u AS rr, s.h_s AS hh FROM cstat s
    UNION ALL
    SELECT l.country, l.rk, s.u + l.cum, s.h_s + l.rk
      FROM lg l JOIN cstat s ON s.country = l.country
  ),
  pick AS (
    SELECT s.country,
           COALESCE((
             SELECT min(c.m) FROM cand c, k
              WHERE c.country = s.country
                AND ((c.hh = 0 AND (c.rr = 0 OR c.rr >= k.k))
                     OR (c.hh > 0 AND c.rr - c.hh + 1 >= k.k))), s.n_large) AS m
      FROM cstat s
  ),
  reg_vis AS (
    SELECT r.*, rg.gap,
           (l.rk IS NOT NULL AND l.rk > p.m) AS shown
      FROM reg r
      JOIN reg_gap rg ON rg.country = r.country AND rg.region = r.region
      JOIN pick p ON p.country = r.country
      LEFT JOIN lg l ON l.country = r.country AND l.region = r.region
  ),
  reg_out AS (
    SELECT v.*,
           (v.shown AND v.spon >= k.k AND v.total - v.spon >= k.k) AS spon_shown,
           (v.shown AND v.deliv >= k.k AND v.total - v.deliv >= k.k) AS deliv_shown
      FROM reg_vis v CROSS JOIN k
  ),
  /* بواقي البلد لكل رقم: من لم يظهر رقمُ منطقته، وكم منهم في الفئة. */
  cres AS (
    SELECT c.country,
           c.total - COALESCE(sum(r.total) FILTER (WHERE r.shown), 0) AS n_tot,
           c.total - COALESCE(sum(r.total) FILTER (WHERE r.spon_shown), 0) AS n_spon,
           c.spon  - COALESCE(sum(r.spon)  FILTER (WHERE r.spon_shown), 0) AS x_spon,
           c.total - COALESCE(sum(r.total) FILTER (WHERE r.deliv_shown), 0) AS n_deliv,
           c.deliv - COALESCE(sum(r.deliv) FILTER (WHERE r.deliv_shown), 0) AS x_deliv
      FROM cty c LEFT JOIN reg_out r ON r.country = c.country
     GROUP BY c.country, c.total, c.spon, c.deliv
  ),
  shaped AS (
    SELECT c.country, c.total, c.spon, c.deliv, c.currency, cg.gap,
           (c.total >= k.k AND (cr.n_tot = 0 OR cr.n_tot >= k.k)) AS tot_ok,
           (c.total >= k.k AND c.spon >= k.k AND c.total - c.spon >= k.k
            AND (cr.n_spon = 0 OR (cr.x_spon >= k.k AND cr.n_spon - cr.x_spon >= k.k))) AS spon_ok,
           (c.total >= k.k AND c.deliv >= k.k AND c.total - c.deliv >= k.k
            AND (cr.n_deliv = 0 OR (cr.x_deliv >= k.k AND cr.n_deliv - cr.x_deliv >= k.k))) AS deliv_ok,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'region', r.region,
                      'small', NOT r.shown,
                      'total', CASE WHEN r.shown THEN r.total END,
                      'sponsored', CASE WHEN r.spon_shown THEN r.spon END,
                      'delivered', CASE WHEN r.deliv_shown THEN r.deliv END,
                      'gap', CASE WHEN r.shown THEN r.gap END,
                      'currency', CASE WHEN r.shown THEN r.currency END)
                    ORDER BY r.shown DESC,
                             CASE WHEN r.shown THEN r.total END DESC NULLS LAST,
                             r.region)
               FROM reg_out r
              WHERE r.country = c.country), '[]'::jsonb) AS regions
      FROM cty c
      JOIN cty_gap cg ON cg.country = c.country
      JOIN cres cr ON cr.country = c.country
     CROSS JOIN k
  )
  SELECT jsonb_build_object(
    'countries', COALESCE(jsonb_agg(jsonb_build_object(
        'country', s.country,
        'small', s.total < (SELECT k FROM k),
        'total', CASE WHEN s.tot_ok THEN s.total END,
        'sponsored', CASE WHEN s.tot_ok AND s.spon_ok THEN s.spon END,
        'delivered', CASE WHEN s.tot_ok AND s.deliv_ok THEN s.deliv END,
        'gap', CASE WHEN s.tot_ok THEN s.gap END,
        'currency', CASE WHEN s.tot_ok THEN s.currency END,
        'regions', s.regions)
      ORDER BY s.total DESC, s.country), '[]'::jsonb)
  ) FROM shaped s;
$fn$;
REVOKE ALL ON FUNCTION public.geo_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geo_stats() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ٣) CP-04 — نصّ الاحتياج لا يقرؤه العموم، ولا يُنشر قبل أن تراه الإدارة
-- ---------------------------------------------------------------------
-- العنوان والملاحظات نصٌّ حرّ تكتبه الجهة: «كتب مدرسة كوكس التاسعة»،
-- «يسكن مع جدّته في الشارع ٥». وكان الزائر يقرؤه بنداء REST (سياسة
-- `needs_public_read`)، وكلّ مسجَّلٍ كذلك (`needs_read_auth`)، والجهة
-- تكتبه متى شاءت.
--
-- الآن:
--   • الجدول لمن يدير الملفّ والإدارة وحدهم. والتفصيل يصل من يحقّ له عبر
--     `orphan_view` — الفئة والمبلغ والعنوان، بلا الملاحظات.
--   • والعنوان لا يصل غيرَ الجهة والإدارة حتى تراه الإدارة
--     (`text_reviewed`). اعتمادُ الملفّ يعتمده؛ وما يُكتب بعد النشر يظهر
--     في صندوق القرارات مع تعديلات الملفّ (أدناه)، وحتى يُعتمد يظهر بفئته.
REVOKE ALL ON TABLE public.orphan_needs FROM anon;
DROP POLICY IF EXISTS "needs_public_read" ON public.orphan_needs;
DROP POLICY IF EXISTS "needs_read_auth" ON public.orphan_needs;
CREATE POLICY "needs_read_auth" ON public.orphan_needs FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());

/* ما كُتب قبل هذه الهجرة مرّ بالاعتماد الذي نُشر به الملفّ (أو سيمرّ به
   إن كان مسودّة)، فلا يُخفى بأثرٍ رجعيّ: العمود يُضاف «مُراجَعاً». وما
   يكتبه المالك من القاعدة نفسها (هجرة، صيانة) كذلك؛ أمّا ما يأتي من جلسةٍ
   أو مفتاح خدمة فيضبطه الحارس أدناه «غير مُراجَع». */
ALTER TABLE public.orphan_needs
  ADD COLUMN IF NOT EXISTS text_reviewed BOOLEAN NOT NULL DEFAULT true;

/* بصفة المالك: الإدخال (`create_orphan_intake`) يعمل بصفة المستدعي، وفاحصا
   القناة مغلقان على العموم. */
CREATE OR REPLACE FUNCTION public.guard_need_text_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.is_admin() OR NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;
  -- ما تكتبه الجهة أو الشريك نصٌّ لم يُراجَع؛ والعلامة لا يكتبها غير الإدارة.
  IF TG_OP = 'INSERT'
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    NEW.text_reviewed := false;
  ELSE
    NEW.text_reviewed := OLD.text_reviewed;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_need_text_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_need_text_review ON public.orphan_needs;
CREATE TRIGGER trg_guard_need_text_review
BEFORE INSERT OR UPDATE ON public.orphan_needs
FOR EACH ROW EXECUTE FUNCTION public.guard_need_text_review();

/* اعتماد الملفّ اعتمادٌ لنصوص احتياجه: لا ينشر الملفَّ إلا الإدارة
   (`guard_orphan_update` و`trg_require_publication_documents`). */
CREATE OR REPLACE FUNCTION public.mark_needs_reviewed_on_publication()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IN ('approved', 'fully_sponsored')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('approved', 'fully_sponsored')) THEN
    UPDATE public.orphan_needs SET text_reviewed = true
     WHERE orphan_id = NEW.id AND NOT text_reviewed;
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_needs_reviewed_on_publication() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_needs_reviewed_on_publication ON public.orphans;
CREATE TRIGGER trg_mark_needs_reviewed_on_publication
AFTER INSERT OR UPDATE OF status ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.mark_needs_reviewed_on_publication();


-- ---------------------------------------------------------------------
-- ٤) CP-04 — أقسام الملفّ تُقرأ من الجدول لمن يكتبها وحده
-- ---------------------------------------------------------------------
-- `orphan_profile` تنزع اسم المدرسة ما لم يُمنح «الموقع»، والسياسة كانت
-- تفتح الجدول لكلّ عضو دائرة — فالمرشد يقرأ بنداء REST ما حجبته الدالّة،
-- ومعه الملاحظة الحرّة. فالقراءة المباشرة لمن يدير الملفّ والإدارة؛
-- وأعضاء الدائرة الآخرون يقرؤون عبر `orphan_profile` وحدها، حيث تُطبَّق
-- النطاقات حقلاً حقلاً.
DROP POLICY IF EXISTS "profile_circle_read" ON public.orphan_profile_sections;
CREATE POLICY "profile_circle_read" ON public.orphan_profile_sections
  FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());


-- ---------------------------------------------------------------------
-- ٥) CP-01 — صلاحيات المشرف تتبع قرار الإدارة وأجله
-- ---------------------------------------------------------------------
-- الدائرة تُغلق عند انقضاء الأجل (`holds_live_circle_role`)، لكنّ «من
-- المشرف؟» كان يُسأل بلا قرارٍ ولا أجل — فالمشرف المنقضي أجلُه يسجّل
-- التقويم والجلسات ويحرّك المرحلة ويرى قائمته. والإذن كذلك: إذنٌ كتبه
-- دورٌ معلّقٌ أو مرفوضٌ أو منقضٍ لا يُحسب.
CREATE OR REPLACE FUNCTION public.circle_role_is_live(
  _approval TEXT, _person UUID, _expires TIMESTAMPTZ, _ended TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT _ended IS NULL AND (
    (_person IS NULL AND _approval IN ('not_required', 'approved'))
    OR (_approval = 'approved' AND _expires > now())
  );
$fn$;
REVOKE ALL ON FUNCTION public.circle_role_is_live(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
     AND r.approval = 'approved' AND r.expires_at > now()
   LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.enrollment_has_consent(_enrollment UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollment_roles r
     WHERE r.enrollment_id = _enrollment
       AND r.role IN ('guardian', 'trustee')
       AND r.consent_at IS NOT NULL
       AND public.circle_role_is_live(r.approval, r.person_id, r.expires_at, r.ended_at)
  );
$fn$;

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
       AND r.approval = 'approved' AND r.expires_at > now()
     LIMIT 1),
    jsonb_build_object('assigned', false)
  );
$fn$;

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
    'since', r.assigned_at,
    'expires_at', r.expires_at
  ) ORDER BY o.display_name), '[]'::jsonb)
  FROM public.enrollment_roles r
  JOIN public.program_enrollments e ON e.id = r.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.orphans o ON o.id = e.orphan_id
  WHERE r.role = 'supervisor'
    AND r.ended_at IS NULL
    AND r.approval = 'approved' AND r.expires_at > now()
    AND r.person_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION public.my_supervisor_today()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH mine AS (
    SELECT e.id, e.stage, o.id AS orphan_id, o.display_name, p.title AS program
      FROM public.enrollment_roles r
      JOIN public.program_enrollments e ON e.id = r.enrollment_id
      JOIN public.programs p ON p.id = e.program_id
      JOIN public.orphans o ON o.id = e.orphan_id
     WHERE r.role = 'supervisor' AND r.ended_at IS NULL AND r.person_id = auth.uid()
       AND r.approval = 'approved' AND r.expires_at > now()
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


-- ---------------------------------------------------------------------
-- ٦) CP-02 — صورة الطفل في خزنةٍ خاصّة، بروابط موقّعةٍ قصيرة
-- ---------------------------------------------------------------------
-- `public-media` خزنةٌ عامّة: كلّ ملفٍّ فيها يُنزَّل بلا جلسة، وسياسة
-- القراءة كانت تفتح سرد مجلّداتها للزائر — ومعرّفات الأطفال معلنة. فتُسرد
-- صور طفلٍ وتُنزَّل دون نطاق «الهوية»، وتبقى بعد سحب الوليّ موافقته.
--
-- الآن:
--   • صورة الطفل في `orphan-photos` الخاصّة، مسارها `<orphan_id>/<ملف>`.
--   • تُقرأ (ويُوقَّع رابطها) لمن يدير الملفّ، أو لمن له نطاق «الهوية» على
--     طفلٍ صورته الحالية هي هذا الملفّ وموافقتها قائمة. فالسحب يُغلقها في
--     الحال: لا رابط جديد، والموقَّع ينقضي بعد دقائق.
--   • `public-media` لا يُكتب فيها بعد اليوم، ولا يسرد مجلّداتها إلا من
--     يدير الملفّ (ليحذف ما فيها). وما رُفع إليها من قبلُ لا يُعرض بعد
--     اليوم (`orphan_view` لا تُعيد إلا مساراً في الخزنة الخاصّة)؛ ونقلُه
--     وحذفُه من الخزنة العامّة خطوةُ تشغيلٍ موثّقة في دليل الإصدار — الحذف
--     من `storage.objects` بـ SQL ممنوعٌ على Supabase.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('orphan-photos', 'orphan-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.photo_url_is_platform(_orphan UUID, _url TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  -- مسارٌ في الخزنة الخاصّة داخل مجلّد الطفل نفسه — لا رابطٌ من أيّ نطاق.
  SELECT _url IS NOT NULL AND position('..' IN _url) = 0
     AND _url ~ ('^' || _orphan::text || '/[A-Za-z0-9._-]+$');
$fn$;
REVOKE ALL ON FUNCTION public.photo_url_is_platform(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photo_url_is_platform(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_orphan_photo(_path TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF auth.uid() IS NULL OR _path IS NULL THEN RETURN false; END IF;
  BEGIN
    _id := split_part(_path, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public.orphans o
     WHERE o.id = _id
       AND o.photo_url = _path
       AND o.photo_consent IN ('granted', 'face_hidden')
       AND (o.status IN ('approved', 'fully_sponsored') OR public.sponsors_orphan(o.id))
       AND public.can_view_orphan_detail(o.id)
       AND 'identity' = ANY(public.my_orphan_scopes(o.id)));
END $fn$;
REVOKE ALL ON FUNCTION public.can_view_orphan_photo(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_orphan_photo(TEXT) TO authenticated;

DROP POLICY IF EXISTS "orphan_photos_read" ON storage.objects;
CREATE POLICY "orphan_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'orphan-photos'
         AND (public.can_reach_orphan_folder(name) OR public.can_view_orphan_photo(name)));

DROP POLICY IF EXISTS "orphan_photos_write" ON storage.objects;
CREATE POLICY "orphan_photos_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orphan-photos' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "orphan_photos_delete" ON storage.objects;
CREATE POLICY "orphan_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orphan-photos' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'public-media' AND public.can_reach_orphan_folder(name));
DROP POLICY IF EXISTS "public_media_write" ON storage.objects;


-- ---------------------------------------------------------------------
-- ٧) DB-07 + CP-10 — التعديل ينتظر المراجعة، والمنشور يبقى كما رُوجع
-- ---------------------------------------------------------------------
-- «الإعادة للمراجعة» كانت تُسقط الملفّ كلَّه من النشر: طفلٌ مكفول يغيب عن
-- كافله («ملف محذوف» في لوحته) لتصحيح حرفٍ في قصّته، ولا يعود إلا بشهادة
-- وفاةٍ وإثبات وصايةٍ لم يُطلبا حين نُشر — وكلّ مزامنةٍ من الشريك تُسقطه.
--
-- فالتعديل الآن **يُمسَك** لا يُنشر ولا يُسقط:
--   • ما تكتبه الجهة أو الوليّ أو الشريك (مفتاح الخدمة) على ملفٍّ منشور —
--     الاسم والقصّة والمدينة والمنطقة والبلد وتاريخ الميلاد والجنس
--     والمرحلة الدراسية وصورةٌ جديدة — يُحفظ في `orphan_pending_edits`،
--     ويبقى الملفّ على ما راجعته الإدارة، منشوراً وقابلاً للكفالة.
--   • تراه الإدارة في صندوق القرارات مع نصوص الاحتياج غير المراجَعة،
--     فتعتمده (فيُكتب) أو ترفضه (فيُطوى)، وكلاهما بأثرٍ وإشعارٍ للجهة.
--   • وما لم يتغيّر لا يُمسَك: المزامنة التي تُعيد القيم نفسها لا تترك شيئاً.
--   • وحذف الطفل في المصدر يبقى سحباً من النشر حتى تقرّر الإدارة.
-- والإدارة نفسها تكتب مباشرة كما كانت.
CREATE TABLE IF NOT EXISTS public.orphan_pending_edits (
  orphan_id    UUID PRIMARY KEY REFERENCES public.orphans(id) ON DELETE CASCADE,
  changes      JSONB NOT NULL,
  previous     JSONB NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  via          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orphan_pending_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orphan_pending_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orphan_pending_edits TO authenticated;
GRANT ALL ON TABLE public.orphan_pending_edits TO service_role;
DROP POLICY IF EXISTS "pending_edits_read" ON public.orphan_pending_edits;
CREATE POLICY "pending_edits_read" ON public.orphan_pending_edits FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.public_edit_fields()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['display_name', 'story', 'city', 'region', 'country', 'birth_date',
               'gender', 'education_stage']::TEXT[];
$fn$;
REVOKE ALL ON FUNCTION public.public_edit_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hold_public_edit_for_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _held JSONB := '{}'; _prev JSONB := '{}'; _o JSONB; _n JSONB; _f TEXT;
BEGIN
  IF pg_trigger_depth() > 1 OR OLD.status NOT IN ('approved', 'fully_sponsored')
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() OR NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;

  _o := to_jsonb(OLD); _n := to_jsonb(NEW);
  FOREACH _f IN ARRAY public.public_edit_fields() LOOP
    IF _n->_f IS DISTINCT FROM _o->_f THEN
      _held := _held || jsonb_build_object(_f, _n->_f);
      _prev := _prev || jsonb_build_object(_f, _o->_f);
    END IF;
  END LOOP;
  -- إزالة الصورة تقليلٌ لا يحتاج مراجعة؛ صورةٌ جديدة تحتاجها.
  IF NULLIF(NEW.photo_url, '') IS NOT NULL AND NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    _held := _held || jsonb_build_object('photo_url', NEW.photo_url);
    _prev := _prev || jsonb_build_object('photo_url', OLD.photo_url);
  END IF;

  -- صورةٌ ممسوكة سقطت موافقتها لا تنتظر شيئاً.
  IF NEW.photo_consent NOT IN ('granted', 'face_hidden') THEN
    UPDATE public.orphan_pending_edits SET changes = changes - 'photo_url', updated_at = now()
     WHERE orphan_id = NEW.id AND changes ? 'photo_url';
    _held := _held - 'photo_url';
  END IF;

  -- الحذف في المصدر: يُسحب من النشر حتى تقرّر الإدارة.
  IF OLD.external_deleted_at IS NULL AND NEW.external_deleted_at IS NOT NULL THEN
    NEW.status := 'submitted';
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'orphan.sent_back_to_review', 'orphan', NEW.id,
            jsonb_build_object('fields', '["external_deleted_at"]'::jsonb, 'from', OLD.status,
                               'via', public.request_channel()));
  END IF;

  IF _held = '{}'::jsonb THEN RETURN NEW; END IF;

  -- المنشور يبقى كما رُوجع؛ والجديد ينتظر.
  NEW := jsonb_populate_record(NEW, _prev);

  INSERT INTO public.orphan_pending_edits (orphan_id, changes, previous, requested_by, via)
  VALUES (NEW.id, _held, _prev, auth.uid(), public.request_channel())
  ON CONFLICT (orphan_id) DO UPDATE
    SET changes = public.orphan_pending_edits.changes || EXCLUDED.changes,
        -- «السابق» ما راجعته الإدارة: أوّل ما أُمسك عليه يبقى.
        previous = EXCLUDED.previous || public.orphan_pending_edits.previous,
        requested_by = EXCLUDED.requested_by,
        via = EXCLUDED.via,
        updated_at = now();

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'orphan.edit_held_for_review', 'orphan', NEW.id,
          jsonb_build_object('fields', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_held) k),
                             'status', OLD.status, 'via', public.request_channel()));
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.hold_public_edit_for_review() FROM PUBLIC, anon, authenticated;

-- يحلّ محلّ مُشغّل الإعادة للمراجعة. والاسم يرتّبه بعد حارسَي القفل
-- والتحديث وحارس الصورة (`guard_locked_orphan`، `trg_guard_*`،
-- `trg_clear_photo_on_withdrawal`) وقبل مزامنة رمز البلد: يُفحص الطلب كما
-- أرسله، ثم يُعاد ما أُمسك، ثم يُشتقّ الرمز من البلد المنشور.
DROP TRIGGER IF EXISTS trg_resubmit_on_public_edit ON public.orphans;
DROP FUNCTION IF EXISTS public.resubmit_on_public_edit();
DROP TRIGGER IF EXISTS trg_hold_public_edit ON public.orphans;
CREATE TRIGGER trg_hold_public_edit
BEFORE UPDATE ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.hold_public_edit_for_review();


/* والكافل الحاليّ لا يفقد طفله إن غاب عن النشر (حذفٌ في المصدر، أو
   مراجعةٌ تفتحها الإدارة): يبقى صفّه مقروءاً له، وصفحته كما يراها. */
DROP POLICY IF EXISTS "orphans_read_auth" ON public.orphans;
CREATE POLICY "orphans_read_auth" ON public.orphans FOR SELECT TO authenticated
  USING (status IN ('approved','fully_sponsored') OR guardian_id = auth.uid()
         OR public.owns_org(org_id) OR public.is_admin() OR public.sponsors_orphan(id));

CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o RECORD; _may BOOLEAN; _acc JSONB; _out JSONB; _scopes TEXT[]; _safe BOOLEAN;
        _manage BOOLEAN;
BEGIN
  SELECT * INTO _o FROM public.orphans o
   WHERE o.id = _orphan
     AND (o.status IN ('approved', 'fully_sponsored') OR public.sponsors_orphan(o.id));
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  _may := public.can_view_orphan_detail(_orphan);
  _scopes := public.my_orphan_scopes(_orphan);
  _safe := _may OR public.cohort_is_safe(_orphan);
  _manage := public.can_manage_orphan(_orphan);

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
    'cohort_small', NOT public.cohort_is_safe(_orphan),
    'age_band', public.age_band_of(_o.birth_date),
    'monthly_need', _o.monthly_need, 'funded_monthly', _o.funded_monthly,
    'currency', _o.currency, 'status', _o.status,
    /* الجهة تُعرف لمن يرى التفصيل أو لحشدٍ آمن (انظر ١ب). */
    'org_id', CASE WHEN _safe THEN _o.org_id END,
    'created_at', _o.created_at,
    'may_view_detail', _may,
    'scopes', to_jsonb(_scopes),
    'access', COALESCE(_acc, 'null'::jsonb)
  ) || public.orphan_trust(_orphan);

  IF _may THEN
    _out := _out || jsonb_build_object(
      'detail', jsonb_build_object(
        /* الفئة العمرية للجميع في الأعلى؛ والتاريخ الدقيق والمدينة لنطاق
           «الموقع» وحده، والقصّة لنطاقها. */
        'birth_date', CASE WHEN 'location' = ANY(_scopes) THEN _o.birth_date END,
        'city', CASE WHEN 'location' = ANY(_scopes) THEN _o.city END,
        'story', CASE WHEN 'story' = ANY(_scopes) THEN _o.story END,
        'real_name', CASE WHEN 'identity' = ANY(_scopes)
          THEN (SELECT p.full_name FROM public.orphan_private p WHERE p.orphan_id = _orphan) END,
        /* مسارٌ في الخزنة الخاصّة يوقّعه الخادم برابطٍ قصير؛ ورابطٌ قديم في
           الخزنة العامّة لا يُعاد. */
        'photo_url', CASE
          WHEN 'identity' = ANY(_scopes)
           AND _o.photo_consent IN ('granted', 'face_hidden')
           AND public.photo_url_is_platform(_o.id, _o.photo_url)
          THEN _o.photo_url END,
        /* عنوان الاحتياج يُعرض بعد أن تراه الإدارة؛ وقبلها الفئة والمبلغ. */
        'needs', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'category', n.category,
            'title', CASE WHEN n.text_reviewed OR _manage THEN n.title END,
            'monthly_amount', n.monthly_amount) ORDER BY n.monthly_amount DESC)
          FROM public.orphan_needs n WHERE n.orphan_id = _orphan), '[]'::jsonb)
      ));
  END IF;

  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_view(UUID) TO anon, authenticated;


-- قرار الإدارة في التعديل الممسوك ونصوص الاحتياج معاً.
CREATE OR REPLACE FUNCTION public.review_orphan_edit(
  _orphan UUID, _decision TEXT, _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.orphan_pending_edits; _apply JSONB := '{}'; _needs INTEGER;
        _consent public.photo_consent_state; _owner UUID; _name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'نشر التعديل قرارٌ للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'القرار إمّا قبولٌ أو رفض' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _p FROM public.orphan_pending_edits WHERE orphan_id = _orphan FOR UPDATE;
  SELECT count(*) INTO _needs FROM public.orphan_needs
   WHERE orphan_id = _orphan AND NOT text_reviewed;
  IF _p.orphan_id IS NULL AND _needs = 0 THEN
    RAISE EXCEPTION 'لا تعديلَ ينتظر في هذا الملفّ' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT o.photo_consent, o.display_name, c.owner_id INTO _consent, _name, _owner
    FROM public.orphans o LEFT JOIN public.care_organizations c ON c.id = o.org_id
   WHERE o.id = _orphan;

  IF _decision = 'approved' THEN
    _apply := COALESCE(_p.changes, '{}'::jsonb);
    -- صورةٌ سُحبت موافقتها بعد أن أُمسكت لا تُنشر.
    IF _apply ? 'photo_url' AND _consent NOT IN ('granted', 'face_hidden') THEN
      _apply := _apply - 'photo_url';
    END IF;
    IF _apply <> '{}'::jsonb THEN
      UPDATE public.orphans o SET
        display_name = r.display_name, story = r.story, city = r.city, region = r.region,
        country = r.country, birth_date = r.birth_date, gender = r.gender,
        education_stage = r.education_stage, photo_url = r.photo_url, updated_at = now()
        FROM (SELECT (jsonb_populate_record(x, _apply)).*
                FROM public.orphans x WHERE x.id = _orphan) r
       WHERE o.id = _orphan;
    END IF;
    UPDATE public.orphan_needs SET text_reviewed = true
     WHERE orphan_id = _orphan AND NOT text_reviewed;
  ELSE
    -- النصّ المرفوض لا يُنشر: يبقى البند بفئته ومبلغه وعنوانٍ محايد.
    UPDATE public.orphan_needs SET title = 'بند', notes = NULL, text_reviewed = true
     WHERE orphan_id = _orphan AND NOT text_reviewed;
  END IF;

  DELETE FROM public.orphan_pending_edits WHERE orphan_id = _orphan;

  PERFORM public.write_audit('orphan.edit_' || _decision, 'orphan', _orphan,
    jsonb_build_object('fields', (SELECT jsonb_agg(k ORDER BY k)
                                    FROM jsonb_object_keys(COALESCE(_p.changes, '{}'::jsonb)) k),
                       'applied', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_apply) k),
                       'needs', _needs, 'note', NULLIF(btrim(COALESCE(_note, '')), '')));
  IF _owner IS NOT NULL THEN
    PERFORM public.notify(_owner, 'other',
      CASE WHEN _decision = 'approved' THEN 'نُشر تعديل ملف ' ELSE 'لم يُنشر تعديل ملف ' END
        || COALESCE(_name, ''),
      COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''),
               CASE WHEN _decision = 'approved' THEN 'راجعت الإدارة التعديل ونشرته.'
                    ELSE 'راجعت الإدارة التعديل ولم تنشره؛ بقي الملفّ كما كان.' END),
      '/org', 'orphan', _orphan);
  END IF;

  RETURN jsonb_build_object('decision', _decision, 'applied',
    (SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb) FROM jsonb_object_keys(_apply) k),
    'needs', _needs);
END $fn$;
REVOKE ALL ON FUNCTION public.review_orphan_edit(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_orphan_edit(UUID, TEXT, TEXT) TO authenticated;

/* وشاشة الجهة ترى ما ينتظر: حقولُ تعديلها الممسوك، وبنودٌ لم تُراجع. */
CREATE OR REPLACE FUNCTION public.org_orphans()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'code', o.code, 'display_name', o.display_name,
    'city', o.city, 'country', o.country, 'region', o.region,
    'status', o.status, 'monthly_need', o.monthly_need,
    'funded_monthly', o.funded_monthly, 'currency', o.currency,
    'created_at', o.created_at, 'rejection_code', o.rejection_code,
    'rejection_reason', o.rejection_reason, 'photo_consent', o.photo_consent,
    'pending_fields', COALESCE((SELECT jsonb_agg(k ORDER BY k)
                                  FROM public.orphan_pending_edits pe,
                                       jsonb_object_keys(pe.changes) k
                                 WHERE pe.orphan_id = o.id), '[]'::jsonb),
    'needs_pending_review', (SELECT count(*) FROM public.orphan_needs n
                              WHERE n.orphan_id = o.id AND NOT n.text_reviewed)
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE auth.uid() IS NOT NULL AND public.owns_org(o.org_id);
$fn$;
REVOKE ALL ON FUNCTION public.org_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_orphans() TO authenticated;


-- ---------------------------------------------------------------------
-- ٨) صندوق القرارات: التعديل الممسوك، وأدوار الدائرة قبل انقضائها
-- ---------------------------------------------------------------------
-- اعتماد الدائرة ينقضي بعد سنة، والصندوق كان لا يعرض إلا «المعلّق» — فيغيب
-- المشرفون والأولياء عن أطفالهم دفعةً واحدة بلا إنذار. فالدور الذي ينقضي
-- خلال ثلاثين يوماً (أو انقضى ولم يُنهَ) يعود إلى الصندوق للتجديد
-- (`decide_enrollment_role` بالقبول يجدّده، وبالرفض يُنهيه).
CREATE OR REPLACE FUNCTION public.circle_role_renewal_window()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $fn$ SELECT interval '30 days' $fn$;
REVOKE ALL ON FUNCTION public.circle_role_renewal_window() FROM PUBLIC, anon, authenticated;

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
        SELECT 'orphan_edit', o.id, o.display_name,
               'تعديلٌ على ملفٍّ منشور · ' || o.code,
               COALESCE(pe.updated_at,
                        (SELECT min(n.created_at) FROM public.orphan_needs n
                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
          FROM public.orphans o
          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
         WHERE o.status IN ('approved', 'fully_sponsored')
           AND (pe.orphan_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.orphan_needs n
                            WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
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
        SELECT 'circle_role_renewal', r.id, o.display_name,
               'تجديد دورٍ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, '')
                 || CASE WHEN r.expires_at <= now() THEN ' · انقضى' ELSE ' · ينقضي قريباً' END,
               r.expires_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'approved' AND r.ended_at IS NULL AND r.person_id IS NOT NULL
           AND r.expires_at < now() + public.circle_role_renewal_window()
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

/* سياق دور الدائرة — للإسناد الجديد وللتجديد معاً، ومعه الأجل. */
CREATE OR REPLACE FUNCTION public.admin_circle_role_context(_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
           'role', r.role, 'person_name', r.person_name,
           'person_email', u.email, 'person_contact', r.person_contact,
           'code', o.code, 'name', o.display_name, 'program', p.title,
           'org', c.name, 'assigned_by_email', ab.email,
           'note', r.note, 'approval', r.approval, 'expires_at', r.expires_at,
           'created_at', r.assigned_at)
    FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    JOIN public.orphans o ON o.id = e.orphan_id
    LEFT JOIN public.care_organizations c ON c.id = o.org_id
    LEFT JOIN auth.users u ON u.id = r.person_id
    LEFT JOIN auth.users ab ON ab.id = r.assigned_by
   WHERE r.id = _id AND public.is_admin();
$fn$;
REVOKE ALL ON FUNCTION public.admin_circle_role_context(UUID) FROM PUBLIC, anon, authenticated;

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
    WHEN 'orphan_edit' THEN (SELECT jsonb_build_object(
                          'code', o.code, 'name', o.display_name, 'status', o.status,
                          'proposed', pe.changes, 'published', pe.previous,
                          'via', pe.via, 'created_at', COALESCE(pe.updated_at, o.updated_at),
                          'needs_text', (SELECT jsonb_agg(jsonb_build_object(
                                            'category', n.category, 'title', n.title,
                                            'notes', n.notes, 'amount', n.monthly_amount)
                                          ORDER BY n.created_at)
                                           FROM public.orphan_needs n
                                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
                          FROM public.orphans o
                          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
                         WHERE o.id = _id)
    WHEN 'circle_role' THEN public.admin_circle_role_context(_id)
    WHEN 'circle_role_renewal' THEN public.admin_circle_role_context(_id)
    ELSE NULL END;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;
