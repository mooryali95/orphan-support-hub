-- =====================================================================
-- تعليق الدفع، وتحويل العرض إلى خدمات تُقدَّم لليتيم
-- =====================================================================
-- قراران مترابطان:
--
-- 1. **تعليق التحصيل عبر Creem** حتى يُتحقَّق من قبولهم لحالة استخدامنا.
--    سياستهم تمنع «التبرّع الخيري حيث لا منتج»، وتشغيل التحصيل قبل
--    الجواب يعرّض أموال الكفلاء للتجميد — وهو أسوأ من التأجيل.
--
-- 2. **تحويل ما يُشترى من «تبرّع» إلى خدمة**: الكافل لا يتبرّع بمبلغ
--    مجرّد، بل يشتري لليتيم اشتراكاً في برنامج محدّد تُقدّمه المنصة —
--    دورة تعليمية، أو تأهيلاً مهنياً، أو دعماً نفسياً، أو علاجاً.
--
-- والثاني ليس التفافاً على الأول بل حلٌّ له: حين يوجد منتج له وصف وسعر
-- ومدّة ومزوّد، ويُسلَّم فعلاً ويُتابَع أثره في تقارير المرحلة 4، فالشرط
-- «حيث لا منتج» لا ينطبق. والأهمّ أنه أفضل للطفل: مالٌ موجَّه إلى خدمة
-- محدَّدة يُتابَع تسليمها أنفع من مبلغ يدخل ميزانية عامة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- مفتاح التعليق
-- ---------------------------------------------------------------------
ALTER TABLE public.platform_settings
  -- true = لا تحصيل إلكتروني. يبقى التحويل اليدوي عاملاً.
  ADD COLUMN IF NOT EXISTS payments_on_hold BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payments_hold_reason TEXT
    DEFAULT 'بانتظار تأكيد مزوّد الدفع قبول حالة استخدام كفالة الأيتام',
  ADD COLUMN IF NOT EXISTS payments_hold_since TIMESTAMPTZ DEFAULT now();

-- التعليق قائم افتراضياً على القواعد القائمة أيضاً، لا على الجديدة وحدها.
UPDATE public.platform_settings
   SET payments_on_hold = true,
       payments_hold_reason = COALESCE(payments_hold_reason,
         'بانتظار تأكيد مزوّد الدفع قبول حالة استخدام كفالة الأيتام'),
       payments_hold_since = COALESCE(payments_hold_since, now())
 WHERE id;

-- ---------------------------------------------------------------------
-- كتالوج البرامج — ما يُشترى فعلاً
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.program_category AS ENUM (
    'education',      -- دورات ومناهج ودعم دراسي
    'rehabilitation', -- تأهيل مهني ومهارات عمل
    'psychosocial',   -- دعم نفسي واجتماعي
    'health',         -- برامج علاجية ومتابعة طبية
    'essentials'      -- احتياجات معيشية مُدارة
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.program_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  category public.program_category NOT NULL,
  -- السعر الشهري للمقعد الواحد. هذا هو ما يُحصَّل، ومقابله خدمة مُسلَّمة.
  monthly_price NUMERIC(12,2) NOT NULL CHECK (monthly_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  -- مدّة البرنامج بالأشهر؛ NULL يعني مستمرّاً بلا نهاية محدّدة.
  duration_months SMALLINT CHECK (duration_months IS NULL OR duration_months > 0),
  -- ما يحصل عليه الطفل فعلاً — يُعرض للكافل قبل الشراء.
  deliverables TEXT[] NOT NULL DEFAULT '{}',
  -- الجهة المنفّذة: جهة رعاية مسجّلة، أو المنصة نفسها حين NULL.
  provider_org_id UUID REFERENCES public.care_organizations(id) ON DELETE SET NULL,
  status public.program_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_status ON public.programs(status);
GRANT SELECT ON public.programs TO anon, authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programs_public_read" ON public.programs;
CREATE POLICY "programs_public_read" ON public.programs
  FOR SELECT TO anon, authenticated USING (status = 'active');

DROP POLICY IF EXISTS "programs_admin_read" ON public.programs;
CREATE POLICY "programs_admin_read" ON public.programs
  FOR SELECT TO authenticated USING (public.is_admin());

-- الكتابة للإدارة وحدها: الكتالوج هو ما يُعلَن للكافل، وتحريره من الجهات
-- يعني أسعاراً ووعوداً بلا مراجعة.
DROP POLICY IF EXISTS "programs_admin_write" ON public.programs;
CREATE POLICY "programs_admin_write" ON public.programs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_programs_updated ON public.programs;
CREATE TRIGGER trg_programs_updated BEFORE UPDATE ON public.programs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- الالتحاق — ربط الطفل بالخدمة
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.enrollment_status AS ENUM (
    'proposed',   -- اقترحته الجهة، بانتظار كافل
    'funded',     -- مُموَّل ونشط
    'paused',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.program_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  status public.enrollment_status NOT NULL DEFAULT 'proposed',
  -- السعر مُثبَّت عند الالتحاق: تغيير الكتالوج لاحقاً لا يُغيّر ما اتُّفق عليه.
  monthly_price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- التحاق حيّ واحد لكل طفل في كل برنامج.
  CONSTRAINT uq_live_enrollment UNIQUE (orphan_id, program_id, status)
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS idx_enrollments_orphan ON public.program_enrollments(orphan_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_program ON public.program_enrollments(program_id);
GRANT SELECT, INSERT, UPDATE ON public.program_enrollments TO authenticated;
GRANT SELECT ON public.program_enrollments TO anon;
GRANT ALL ON public.program_enrollments TO service_role;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;

-- الزائر يرى التحاقات الملفّات المنشورة: هي جزء ممّا يُعرض عليه ليختار.
DROP POLICY IF EXISTS "enroll_public_read" ON public.program_enrollments;
CREATE POLICY "enroll_public_read" ON public.program_enrollments FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.orphans o
                  WHERE o.id = orphan_id AND o.status IN ('approved','fully_sponsored')));

DROP POLICY IF EXISTS "enroll_read_auth" ON public.program_enrollments;
CREATE POLICY "enroll_read_auth" ON public.program_enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orphans o
                  WHERE o.id = orphan_id AND o.status IN ('approved','fully_sponsored'))
         OR public.can_manage_orphan(orphan_id));

-- الجهة تقترح، والحالة تبقى `proposed` — التمويل قرار النظام لا الجهة.
DROP POLICY IF EXISTS "enroll_write" ON public.program_enrollments;
CREATE POLICY "enroll_write" ON public.program_enrollments FOR ALL TO authenticated
  USING (public.can_manage_orphan(orphan_id)) WITH CHECK (public.can_manage_orphan(orphan_id));

DROP TRIGGER IF EXISTS trg_enrollments_updated ON public.program_enrollments;
CREATE TRIGGER trg_enrollments_updated BEFORE UPDATE ON public.program_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- حارس: التحويل إلى `funded` قرار الخادم لا الجهة، تماماً كتفعيل الكفالة.
CREATE OR REPLACE FUNCTION public.guard_enrollment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'proposed';
    NEW.created_by := auth.uid();
    -- السعر يُنسخ من الكتالوج لا يُرسله العميل.
    SELECT p.monthly_price, p.currency INTO NEW.monthly_price, NEW.currency
      FROM public.programs p WHERE p.id = NEW.program_id AND p.status = 'active';
    IF NEW.monthly_price IS NULL THEN
      RAISE EXCEPTION 'enrollment: program is not active' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.monthly_price IS DISTINCT FROM OLD.monthly_price THEN
    RAISE EXCEPTION 'enrollment: price is fixed at enrolment' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (NEW.status IN ('cancelled', 'paused') AND OLD.status <> 'completed') THEN
    RAISE EXCEPTION 'enrollment: funding transitions are server-managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_enrollment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_enrollment ON public.program_enrollments;
CREATE TRIGGER trg_guard_enrollment
BEFORE INSERT OR UPDATE ON public.program_enrollments
FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment();

-- ---------------------------------------------------------------------
-- ربط الكفالة بما تشتريه
-- ---------------------------------------------------------------------
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS enrollment_id UUID
    REFERENCES public.program_enrollments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sponsorships_enrollment
  ON public.sponsorships(enrollment_id);

-- ---------------------------------------------------------------------
-- الكتالوج الابتدائي
-- ---------------------------------------------------------------------
-- برامج واقعية بأسعار تقابل قيمتها. تُعدَّل من لوحة الإدارة لاحقاً.
INSERT INTO public.programs (slug, title, summary, category, monthly_price, duration_months, deliverables, status)
VALUES
  ('basic-education-support', 'الدعم الدراسي الأساسي',
   'متابعة دراسية أسبوعية ومواد تعليمية ورسوم مدرسية.', 'education', 60, NULL,
   ARRAY['حصّتان أسبوعياً مع معلّم متابع','كتب ومستلزمات الفصل','تقرير تحصيل شهري'], 'active'),
  ('digital-skills', 'مهارات رقمية',
   'مسار تدريبي في الحاسوب والإنترنت الآمن ومهارات المستقبل.', 'education', 45, 9,
   ARRAY['منهج مسجّل ومباشر','جلسة تطبيقية أسبوعية','شهادة إتمام'], 'active'),
  ('vocational-track', 'تأهيل مهني',
   'تدريب على حرفة تُدرّ دخلاً، للفئة العمرية الأكبر.', 'rehabilitation', 90, 12,
   ARRAY['تدريب عملي لدى منشأة شريكة','عدّة العمل الأساسية','متابعة توظيف بعد التخرّج'], 'active'),
  ('psychosocial-care', 'دعم نفسي واجتماعي',
   'جلسات إرشادية منتظمة لمعالجة أثر الفقد.', 'psychosocial', 55, NULL,
   ARRAY['جلستان شهرياً مع مختصّ','متابعة مع الأسرة','تقرير حالة ربع سنوي'], 'active'),
  ('health-followup', 'المتابعة الصحّية',
   'فحوص دورية وعلاج وتغطية دوائية.', 'health', 40, NULL,
   ARRAY['فحص دوري كل ثلاثة أشهر','تغطية الأدوية الأساسية','تحويل للتخصّص عند الحاجة'], 'active'),
  ('daily-essentials', 'الاحتياج المعيشي',
   'غذاء وملبس ومستلزمات شهرية مُدارة عبر جهة الرعاية.', 'essentials', 80, NULL,
   ARRAY['سلّة غذائية شهرية','كسوة فصلية','إيصالات صرف موثّقة'], 'active')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- ما يشتريه الكافل — للعرض العام
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orphan_program_plan(_orphan UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id', e.id,
    'program_id', p.id,
    'slug', p.slug,
    'title', p.title,
    'summary', p.summary,
    'category', p.category,
    'monthly_price', e.monthly_price,
    'currency', e.currency,
    'duration_months', p.duration_months,
    'deliverables', p.deliverables,
    'status', e.status
  ) ORDER BY p.category), '[]'::jsonb)
  FROM public.program_enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.orphan_id = _orphan
    AND e.status IN ('proposed', 'funded', 'paused')
    AND EXISTS (SELECT 1 FROM public.orphans o
                 WHERE o.id = _orphan AND o.status IN ('approved','fully_sponsored'));
$fn$;
REVOKE ALL ON FUNCTION public.orphan_program_plan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_program_plan(UUID) TO anon, authenticated;
