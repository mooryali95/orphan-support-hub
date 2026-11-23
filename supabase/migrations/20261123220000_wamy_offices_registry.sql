-- =====================================================================
-- سجلّ مكاتب الندوة — قابلٌ للتعديل والإضافة والإيقاف
-- ---------------------------------------------------------------------
-- المصدر: «سجل الحصر» في ملفّ «تأهيل القيادات والمكاتب — الندوة» (ص ٢٨)،
-- عن wamy.org/offices وwamy.org/about، اطّلاع ٢٢ نوفمبر ٢٠٢٦.
--
-- القواعد (AGENTS.md «Demonstration boundaries»):
--   • ما يُبذر هنا **تجريبي** (`is_demo`) و**موقوف** (`active = false`)، واسمه
--     يبدأ بـ«[تجريبي]»، حتى تراجعه الإدارة فتحوّله حقيقياً.
--   • المدينة ما ذكره السجلّ وحده؛ «—» في السجلّ تبقى NULL (المكتب على
--     مستوى الدولة)، فلا مدينة مخترعة.
--   • عمود الشبكة في جدول الدول لا يُمسّ: له مصدره الواحد (src/data/wamy-network.ts).
--     الدولة الناقصة تُضاف «مخطّطة» على افتراضه.
-- =====================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_seen_at DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.offices ADD CONSTRAINT ck_office_category CHECK (category IS NULL OR category IN
    ('multi_program', 'health', 'relief', 'youth_education', 'survey_pending', 'activity_scope'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- السجلّ التجريبي القائم: الاسم الموسوم هو الوسم.
UPDATE public.offices SET is_demo = true WHERE name LIKE '[تجريبي]%' AND NOT is_demo;


WITH registry (code, office, city, category) AS (
  VALUES
    ('TD', 'تشاد', 'أنجمينا', 'multi_program'),
    ('ID', 'إندونيسيا', 'جاكرتا', 'multi_program'),
    ('KG', 'قيرغيزستان', 'بشكيك', 'multi_program'),
    ('ML', 'مالي', 'باماكو', 'multi_program'),
    ('NG', 'نيجيريا', 'أبوجا', 'health'),
    ('CM', 'الكاميرون', 'ياوندي', 'health'),
    ('GN', 'غينيا', 'كوناكري', 'health'),
    ('BD', 'بنغلاديش', NULL, 'health'),
    ('SD', 'السودان', 'الخرطوم', 'relief'),
    ('NE', 'النيجر', 'نيامي', 'relief'),
    ('SO', 'الصومال', 'مقديشو', 'relief'),
    ('BA', 'البوسنة والهرسك', 'سراييفو', 'youth_education'),
    ('EG', 'مصر', 'القاهرة', 'youth_education'),
    ('TH', 'تايلاند', 'بانكوك', 'youth_education'),
    ('KE', 'كينيا', 'نيروبي', 'youth_education'),
    ('DJ', 'جيبوتي', 'جيبوتي', 'youth_education'),
    ('SN', 'السنغال', 'دكار', 'survey_pending'),
    ('BR', 'البرازيل', 'ساو برناردو', 'youth_education'),
    ('XK', 'كوسوفو', 'فريزاي', 'survey_pending'),
    ('MR', 'موريتانيا', NULL, 'survey_pending'),
    ('ZA', 'جنوب أفريقيا', 'ديربن', 'survey_pending'),
    ('PS', 'فلسطين', 'غزة', 'survey_pending'),
    ('IQ', 'كردستان العراق', 'أربيل', 'survey_pending'),
    ('YE', 'اليمن', 'عدن', 'survey_pending'),
    ('PH', 'الفلبين', NULL, 'survey_pending'),
    ('MY', 'ماليزيا', 'كاجنغ', 'survey_pending'),
    ('US', 'الولايات المتحدة', NULL, 'survey_pending'),
    ('GB', 'بريطانيا', 'لندن', 'survey_pending'),
    ('AU', 'أستراليا', NULL, 'survey_pending'),
    ('AL', 'ألبانيا', NULL, 'activity_scope'),
    ('MK', 'مقدونيا الشمالية', NULL, 'activity_scope'),
    ('ET', 'إثيوبيا', NULL, 'activity_scope'),
    ('TZ', 'تنزانيا', NULL, 'activity_scope'),
    ('RW', 'رواندا', NULL, 'activity_scope'),
    ('CI', 'ساحل العاج', NULL, 'activity_scope'),
    ('TJ', 'طاجيكستان', NULL, 'activity_scope'),
    ('UG', 'أوغندا', NULL, 'activity_scope'),
    ('TR', 'تركيا', NULL, 'activity_scope')
),
-- كلّ دولةٍ في السجلّ موجودةٌ في جدول الدول قبل مكتبها: تُضاف «مخطّطة» غير
-- معلَّمة إن غابت، ولا يُمسّ ما وُجد.
added AS (
  -- عمود الشبكة يبقى على افتراضه (غير معلَّم): له مصدره الواحد.
  INSERT INTO public.countries (code, name_ar, status)
  SELECT r.code, r.office, 'planned' FROM registry r
  ON CONFLICT (code) DO NOTHING
  RETURNING code
),
touched AS (
  UPDATE public.offices o
     SET city = COALESCE(o.city, r.city), category = COALESCE(o.category, r.category),
         source_url = COALESCE(o.source_url, 'https://wamy.org/offices'),
         source_seen_at = COALESCE(o.source_seen_at, DATE '2026-11-22'), updated_at = now()
    FROM registry r
   WHERE o.country_code = r.code AND o.is_demo
  RETURNING o.country_code
)
INSERT INTO public.offices (name, country_code, region, city, category, is_demo, active,
                            source_url, source_seen_at)
SELECT '[تجريبي] مكتب ' || r.office, r.code, r.city, r.city, r.category, true, false,
       'https://wamy.org/offices', DATE '2026-11-22'
  FROM registry r
 WHERE NOT EXISTS (SELECT 1 FROM public.offices o WHERE o.country_code = r.code AND o.is_demo)
   AND NOT EXISTS (SELECT 1 FROM touched t WHERE t.country_code = r.code);

-- المكتب الحقيقي في ألبانيا: فئته من السجلّ، ولا يُمسّ غيرها.
UPDATE public.offices SET category = 'activity_scope'
 WHERE country_code = 'AL' AND NOT is_demo AND category IS NULL;

-- ---------------------------------------------------------------------
-- القراءة العامّة: ما يُرسم على خريطة المكاتب
-- ---------------------------------------------------------------------
-- لا أعضاء ولا معرّفات داخلية غير المعرّف؛ والتجريبي يُعاد موسوماً كي تُظهره
-- الواجهة «تجريبي». المكتب الموقوف الحقيقي لا يُعرض.
CREATE OR REPLACE FUNCTION public.public_offices_map()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'country', o.country_code, 'country_name', c.name_ar,
           'name', regexp_replace(o.name, '^\[تجريبي\]\s*', ''),
           'city', o.city, 'category', o.category, 'demo', o.is_demo, 'active', o.active,
           'source_url', o.source_url, 'source_seen_at', o.source_seen_at)
         ORDER BY o.is_demo, c.sort_order NULLS LAST, o.country_code), '[]'::jsonb)
    FROM public.offices o
    JOIN public.countries c ON c.code = o.country_code
   WHERE o.parent_id IS NULL AND (o.active OR o.is_demo);
$fn$;
REVOKE ALL ON FUNCTION public.public_offices_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_offices_map() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- الإدارة: تعديل المكتب وحالته، بأثرٍ في سجلّ التدقيق
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_office(
  _office UUID, _name TEXT, _city TEXT, _category TEXT, _active BOOLEAN, _is_demo BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _before public.offices;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _before FROM public.offices WHERE id = _office FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'office_not_found'; END IF;
  -- المكتب التجريبي لا يُفعَّل وهو تجريبي: يُحوَّل حقيقياً أولاً (قرار المراجعة).
  IF COALESCE(_active, false) AND COALESCE(_is_demo, false) THEN
    RAISE EXCEPTION 'demo_office_cannot_be_active';
  END IF;
  UPDATE public.offices
     SET name = CASE WHEN COALESCE(_is_demo, false)
                     THEN '[تجريبي] ' || regexp_replace(btrim(_name), '^\[تجريبي\]\s*', '')
                     ELSE regexp_replace(btrim(_name), '^\[تجريبي\]\s*', '') END,
         city = NULLIF(btrim(COALESCE(_city, '')), ''),
         region = COALESCE(region, NULLIF(btrim(COALESCE(_city, '')), '')),
         category = _category, active = COALESCE(_active, false),
         is_demo = COALESCE(_is_demo, false), updated_at = now()
   WHERE id = _office;
  PERFORM public.write_audit('office.updated', 'office', _office, jsonb_build_object(
    'before', jsonb_build_object('name', _before.name, 'city', _before.city, 'category', _before.category,
                                 'active', _before.active, 'is_demo', _before.is_demo),
    'after', jsonb_build_object('name', _name, 'city', _city, 'category', _category,
                                'active', _active, 'is_demo', _is_demo)));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_update_office(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_office(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- نظرة الإدارة تحمل الحقول الجديدة.
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
        'city', o.city, 'category', o.category, 'is_demo', o.is_demo,
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
