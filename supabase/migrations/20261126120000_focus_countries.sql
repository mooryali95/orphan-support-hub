-- =====================================================================
-- الدول الخمس الأساسية في الوضع الحقيقي
-- ---------------------------------------------------------------------
-- سريلانكا، وكشمير (منطقةً في باكستان)، وتايلاند، والسودان، والسنغال هي ما
-- يعرضه الوضع الحقيقي الآن؛ والتجربة تبقى على الشبكة كلّها ببياناتها النموذجية.
--
--   • `countries.live_focus`: الدول الأساسية. تُفعَّل (`active`) فتقبل الكفالة
--     والدعم، وتظهر في القاعة الحيّة. لا تُطفأ دولةٌ أخرى هنا (ألبانيا ومنصّة
--     الرواد باقيتان كما هما)؛ تخرج من العرض الحقيقي فقط.
--   • سريلانكا وباكستان تدخلان ملفّ الشبكة بإفادة مالك المنصّة، فتُعاد هنا
--     قائمة `in_network` كاملةً كما يشترط single-source.test.
--   • كشمير منطقةٌ في باكستان (`country_regions`)، لا دولة: لا رمز ISO لها.
--   • لا منصّة تشغيل سليمة بعد في أيٍّ منها: وضع المكتب `none`، فالندوة تملك
--     كل الحقول، والانتقال إلى shadow ثم active من «مصادر التحقق».
--   • السعة المستهدفة ٥٠٠ عامل و١٠٬٠٠٠ مستفيد: فهرسٌ لكشف التكرار بالميلاد.
-- =====================================================================

ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS live_focus BOOLEAN NOT NULL DEFAULT false;

WITH network (code, name_ar, name_local) AS (
  VALUES
    -- مكتبٌ مؤكَّد
    ('SA', 'السعودية', 'Saudi Arabia'),
    ('TD', 'تشاد', 'Chad'),
    ('NE', 'النيجر', 'Niger'),
    ('SD', 'السودان', 'Sudan'),
    ('KE', 'كينيا', 'Kenya'),
    ('DJ', 'جيبوتي', 'Djibouti'),
    ('SN', 'السنغال', 'Senegal'),
    ('GN', 'غينيا', 'Guinea'),
    ('MR', 'موريتانيا', 'Mauritania'),
    ('EG', 'مصر', 'Egypt'),
    ('NG', 'نيجيريا', 'Nigeria'),
    ('KG', 'قيرغيزستان', 'Kyrgyzstan'),
    ('TH', 'تايلاند', 'Thailand'),
    ('CM', 'الكاميرون', 'Cameroon'),
    ('ML', 'مالي', 'Mali'),
    ('ID', 'إندونيسيا', 'Indonesia'),
    ('BD', 'بنغلاديش', 'Bangladesh'),
    ('BA', 'البوسنة والهرسك', 'Bosnia and Herzegovina'),
    ('BR', 'البرازيل', 'Brazil'),
    ('PS', 'فلسطين', 'Palestine'),
    ('LK', 'سريلانكا', 'Sri Lanka'),
    ('PK', 'باكستان', 'Pakistan'),
    -- نشاطٌ ميداني موثّق
    ('AL', 'ألبانيا', 'Albania'),
    ('XK', 'كوسوفو', 'Kosovo'),
    ('MK', 'مقدونيا الشمالية', 'North Macedonia'),
    ('ET', 'إثيوبيا', 'Ethiopia'),
    ('TZ', 'تنزانيا', 'Tanzania'),
    ('RW', 'رواندا', 'Rwanda'),
    ('CI', 'كوت ديفوار', 'Côte d''Ivoire')
),
marked AS (
  INSERT INTO public.countries (code, name_ar, name_local, status, in_network)
  SELECT code, name_ar, name_local, 'planned', true FROM network
  ON CONFLICT (code) DO UPDATE SET in_network = true
    WHERE NOT public.countries.in_network
  RETURNING code
)
UPDATE public.countries c
   SET in_network = false
 WHERE c.in_network
   AND NOT EXISTS (SELECT 1 FROM network n WHERE n.code = c.code);

UPDATE public.countries SET live_focus = (code IN ('LK', 'PK', 'TH', 'SD', 'SN'));
UPDATE public.countries SET status = 'active' WHERE code IN ('LK', 'PK', 'TH', 'SD', 'SN') AND status = 'planned';
UPDATE public.countries SET sort_order = CASE code WHEN 'LK' THEN 1 WHEN 'PK' THEN 2 WHEN 'TH' THEN 3
                                                   WHEN 'SD' THEN 4 WHEN 'SN' THEN 5 END
 WHERE code IN ('LK', 'PK', 'TH', 'SD', 'SN');

INSERT INTO public.country_regions (country_code, name_ar, name_local, sort_order)
VALUES ('PK', 'كشمير', 'Azad Jammu and Kashmir', 1)
ON CONFLICT (country_code, name_ar) DO NOTHING;

INSERT INTO public.country_data_sources (country_code, office_mode)
SELECT code, 'none' FROM public.countries WHERE live_focus
ON CONFLICT (country_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_orphans_country_birth ON public.orphans(country_code, birth_date);

-- ما يعرضه الوضع الحقيقي: رموز الدول الأساسية بترتيبها، بلا أعداد ولا صفوف.
CREATE OR REPLACE FUNCTION public.public_focus_countries()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(code ORDER BY sort_order, code), '{}')
    FROM public.countries WHERE live_focus AND status = 'active';
$fn$;
REVOKE ALL ON FUNCTION public.public_focus_countries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_focus_countries() TO anon, authenticated;
