-- =====================================================================
-- نموذج بناء الأهلية — منهجية «الرواد»
-- ---------------------------------------------------------------------
-- الكتالوج الذي بُني في 20260826100000 كتالوجُ **خدمات**: عنوان وسعر
-- ومخرجات. يُجيب «ما الذي يُشترى؟» ولا يُجيب «ما الذي يُبنى؟».
--
-- والمنهجية تنقل العمل «من منطق الرعاية (سدّ الاحتياج) إلى منطق البناء
-- (صناعة الفاعلية)». فالكفالة ليست شراء خدمة لطفل، بل اشتراكٌ في بناء
-- أهليّته. وهذا يفرض على النموذج خمسة أشياء لم تكن فيه:
--
--   ١) **مدخلات وعمليات، لا مخرجات وحدها.** `deliverables` وعدٌ بلا
--      طريق: لا يُعرف ما يدخل ولا كيف يُشتغل.
--   ٢) **مفهومٌ وسمة.** والقاعدة الحاكمة في المنهجية: «يبدأ التصميم
--      دائماً من المفهوم لا من النشاط»، وكتالوجنا كلّه أنشطة.
--   ٣) **أدوار.** مشرفٌ وفقيهٌ ووليٌّ ووصيّ — البناء لا يقوم بلا من
--      يحمله ومن يضبط مرجعيّته ومن يأذن به.
--   ٤) **قياس.** «القياس أداة بناء لا اختبار» — وبلا مقياس يبقى الأثر
--      دعوى.
--   ٥) **رحلة.** المفهوم ← السمة ← النظام ← الأفعال ← القياس ← الأهلية.
--
-- ولا يُلغى كتالوج الخدمات: الخدمات تبقى **مدخلاتٍ** في النظام الحاضن
-- (وظيفة «توفير الخبرات» و«تنظيم البيئة»)، والبرنامج التأهيلي هو العمود.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) السمات — ما نريد أن نبنيه
-- ---------------------------------------------------------------------
-- جدولٌ لا تعدادٌ عمداً: السمات تُضاف وتُوصف وتُرتَّب، والتعداد يجعل كل
-- إضافةٍ هجرة. والمقياس يوزّع مئةً عليها، فعددها ليس ثابتاً بالضرورة.
CREATE TABLE IF NOT EXISTS public.qualification_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qualification_traits TO anon, authenticated;
GRANT ALL ON public.qualification_traits TO service_role;
ALTER TABLE public.qualification_traits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "traits_public_read" ON public.qualification_traits;
CREATE POLICY "traits_public_read" ON public.qualification_traits
  FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS "traits_admin_write" ON public.qualification_traits;
CREATE POLICY "traits_admin_write" ON public.qualification_traits
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.qualification_traits (slug, name, summary, sort_order) VALUES
  ('dirayah',  'الدراية',  'أن يرى الصورة على حقيقتها، ويدرك موقعه منها.', 1),
  ('himmah',   'الحمية',   'الاندفاع الذي يحمي المبدأ ويمنع التفريط فيه.', 2),
  ('azm',      'العزم',    'عقد النية على الفعل ثم المضيّ فيه حتى يتمّ.', 3),
  ('rushd',    'الرشد',    'إصابة الصواب في الاختيار، وضبط الفعل بمقصده.', 4),
  ('maalat',   'المآلات',  'النظر في عاقبة الفعل قبل الإقدام عليه.', 5),
  ('tadbir',   'التدبير',  'ترتيب الموارد والزمن ليبلغ الفعل غايته.', 6)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2) المفاهيم — أداة التشغيل الخماسية
-- ---------------------------------------------------------------------
-- المنهجية تُحلّل كل مفهوم قبل إدخاله بخمسة أسئلة: المقصد، الأصل،
-- السمة التي يشغّلها، الأفعال التي ينتجها، عناصر النظام التي تدعمه.
-- فالجدول هو الأداة نفسها، لا وصفٌ لها: مفهومٌ بلا أحد هذه الخمسة لا
-- يُدخَل — ولذلك كلّها `NOT NULL`.
--
-- والقاعدة الحاكمة: **المفهوم وسيلة، والسمة غاية.** المفهوم ما نُعلّمه،
-- والسمة ما نريد أن نبنيه. ولذلك المفهوم يشير إلى سمة، لا العكس.
CREATE TABLE IF NOT EXISTS public.qualification_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  /* المقصد — ما الغاية التي يخدمها؟ */
  intent TEXT NOT NULL,
  /* الأصل — ما المرجع الذي يضبط فهمه؟ */
  origin TEXT NOT NULL,
  /* السمة التي يشغّلها */
  trait_id UUID NOT NULL REFERENCES public.qualification_traits(id) ON DELETE RESTRICT,
  /* الأفعال التي ينتجها */
  actions TEXT[] NOT NULL CHECK (cardinality(actions) > 0),
  /* عناصر النظام التي تدعمه */
  system_support TEXT[] NOT NULL CHECK (cardinality(system_support) > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concepts_trait ON public.qualification_concepts(trait_id);
GRANT SELECT ON public.qualification_concepts TO anon, authenticated;
GRANT ALL ON public.qualification_concepts TO service_role;
ALTER TABLE public.qualification_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "concepts_public_read" ON public.qualification_concepts;
CREATE POLICY "concepts_public_read" ON public.qualification_concepts
  FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS "concepts_admin_write" ON public.qualification_concepts;
CREATE POLICY "concepts_admin_write" ON public.qualification_concepts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.qualification_concepts
  (slug, name, intent, origin, trait_id, actions, system_support)
SELECT v.slug, v.name, v.intent, v.origin, t.id, v.actions, v.system_support
  FROM (VALUES
    ('niyyah-muthmirah', 'النيّة المثمرة',
     'أن يصير القصد محرّكاً للفعل لا خاطراً يمرّ.',
     'الأعمال بالنيّات، وأثر القصد في قيمة العمل.',
     'azm',
     ARRAY['يكتب قصده من كل مهمّة قبل بدئها','يراجع أثر قصده بعد إتمامها'],
     ARRAY['جلسة تأصيل','مهمّة تطبيقية أسبوعية','مراجعة مع المشرف']),

    ('masar-azzaman', 'مسار الزمن',
     'أن يرى عمره مورداً محدوداً يُدبَّر، لا امتداداً بلا حدّ.',
     'حساب العمر ومسؤولية الوقت.',
     'tadbir',
     ARRAY['يبني خطة أسبوعية ويلتزمها','يرصد فجوة المخطَّط والمنجَز'],
     ARRAY['أداة تخطيط','رصد أسبوعي','قدوة تُظهر أثر الانضباط']),

    ('maalat-concept', 'المآلات',
     'أن يسبق نظرُه فعلَه، فيزن العاقبة قبل الإقدام.',
     'اعتبار المآل في تقدير الأفعال.',
     'maalat',
     ARRAY['يحلّل قراراً بأثره القريب والبعيد','يعدّل خياره بناءً على المآل'],
     ARRAY['دراسة حالة','نقاش جماعي','تغذية راجعة من المشرف']),

    ('omran-concept', 'العمران',
     'أن ينتقل من الانتفاع بالمجتمع إلى الإسهام في بنائه.',
     'عمارة الأرض والاستخلاف فيها.',
     'dirayah',
     ARRAY['ينفّذ مبادرة نافعة لمحيطه','ينقل ما تعلّمه إلى غيره'],
     ARRAY['مشروع ميداني','شبكة أقران','عرض النتائج على المجتمع المحلي'])
  ) AS v(slug, name, intent, origin, trait_slug, actions, system_support)
  JOIN public.qualification_traits t ON t.slug = v.trait_slug
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------
-- 3) البرنامج: خدمة أم بناء أهلية
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.program_kind AS ENUM ('service', 'qualification');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.program_level AS ENUM ('foundational', 'applied', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS kind public.program_kind NOT NULL DEFAULT 'service',
  /* المدخلات — ما يدخل النظام: مواد، أدوات، وقت، أشخاص. */
  ADD COLUMN IF NOT EXISTS inputs TEXT[] NOT NULL DEFAULT '{}',
  /* العمليات — كيف يشتغل: وظائف النظام الست في المنهجية. */
  ADD COLUMN IF NOT EXISTS processes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES public.qualification_concepts(id)
    ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS target_trait_id UUID REFERENCES public.qualification_traits(id)
    ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS level public.program_level;

CREATE INDEX IF NOT EXISTS idx_programs_kind ON public.programs(kind);
CREATE INDEX IF NOT EXISTS idx_programs_concept ON public.programs(concept_id)
  WHERE concept_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programs_target_trait ON public.programs(target_trait_id)
  WHERE target_trait_id IS NOT NULL;

/* برنامجٌ يدّعي بناء الأهلية بلا مفهومٍ ولا سمةٍ ولا مدخلاتٍ ولا عمليات
   هو خدمةٌ سمّت نفسها تأهيلاً. القيد يمنع الادّعاء لا الخدمة: `service`
   يبقى حرّاً كما كان. */
ALTER TABLE public.programs
  DROP CONSTRAINT IF EXISTS ck_qualification_is_complete;
ALTER TABLE public.programs
  ADD CONSTRAINT ck_qualification_is_complete CHECK (
    kind <> 'qualification' OR (
      concept_id IS NOT NULL
      AND target_trait_id IS NOT NULL
      AND level IS NOT NULL
      AND cardinality(inputs) > 0
      AND cardinality(processes) > 0
      AND cardinality(deliverables) > 0
    )
  );


-- برنامج تأهيلي مبذور من ورش المنهجية التأسيسية.
INSERT INTO public.programs
  (slug, title, summary, description, category, monthly_price, duration_months,
   kind, level, inputs, processes, deliverables, concept_id, target_trait_id, status)
SELECT
  'ahliyyah-foundational',
  'بناء الأهلية — المستوى التأسيسي',
  'ستّ ورش تنقل اليتيم من تلقّي الرعاية إلى إنتاج الفعل، على معادلة الأهلية.',
  'الأهلية = القدرة على تفهّم الخطاب + اكتساب الفعل. والبرنامج يبدأ من المفهوم لا من النشاط: '
  'يُعلَّم المفهوم، فيُشغّل سمةً، فتُنتج السمة أفعالاً متزايدة، ثم يُقاس التحوّل.',
  'rehabilitation', 120, 3,
  'qualification', 'foundational',
  ARRAY[
    'مادة علمية لستّ جلسات',
    'مشرف معتمَد يرصد يومياً ويرفع تقريراً أسبوعياً',
    'مرجعية شرعية تضبط الأصول',
    'إذن الولي أو الوصي موثَّقاً',
    'أدوات رقمية للمهامّ التطبيقية'
  ],
  ARRAY[
    'تعليم المفهوم — جلسات ومواد ونقاش',
    'تجسيد المفهوم — قدوات ونماذج ناجحة',
    'توفير الخبرات — مهامّ ميدانية ومشاريع',
    'بناء العلاقات — فريق وشبكة داعمة',
    'تنظيم البيئة وصناعة المواقف',
    'المتابعة والتقويم المستمرّ'
  ],
  ARRAY[
    'ستّ مخرجات جلسات (عرض وفيديو وخريطة ذهنية)',
    'مبادرة نافعة منفَّذة في المحيط',
    'خريطة سمات مقيسة قبل البرنامج وبعده',
    'تقرير أهلية موقَّع من المشرف'
  ],
  c.id, t.id, 'active'
FROM public.qualification_concepts c, public.qualification_traits t
WHERE c.slug = 'omran-concept' AND t.slug = 'dirayah'
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------
-- 4) رحلة التشغيل الست
-- ---------------------------------------------------------------------
-- المسار في المنهجية ترتيبٌ لا تصنيف: لا تُقاس سمةٌ لم تُشغَّل، ولا
-- تُعلَن أهليةٌ لم تُقَس. فالترتيب محفوظ في `stage_order` ليُفرض تقدّمٌ
-- لا قفز.
DO $$ BEGIN
  CREATE TYPE public.qualification_stage AS ENUM (
    'concept',        -- المفهوم
    'trait',          -- السمة
    'system',         -- النظام
    'actions',        -- الأفعال
    'measurement',    -- القياس
    'qualified'       -- الأهلية
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.program_enrollments
  ADD COLUMN IF NOT EXISTS stage public.qualification_stage NOT NULL DEFAULT 'concept',
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

/* رتبة المرحلة عدداً، ليُقارَن التقدّم. */
CREATE OR REPLACE FUNCTION public.stage_order(_s public.qualification_stage)
RETURNS SMALLINT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _s
    WHEN 'concept' THEN 1 WHEN 'trait' THEN 2 WHEN 'system' THEN 3
    WHEN 'actions' THEN 4 WHEN 'measurement' THEN 5 WHEN 'qualified' THEN 6
  END::SMALLINT;
$fn$;
