-- =====================================================================
-- دول الشبكة: `countries.in_network` يُملأ من ملفّ الشبكة
-- ---------------------------------------------------------------------
-- العمود أُضيف `DEFAULT false` (20261116100000) ولم يملأه شيء، وجدول الدول
-- يُبذر بألبانيا وحدها. فالخريطة والقاعة ترسمان ٢٧ دولة حضورٍ علني من
-- src/data/wamy-network.ts، و`support_catalog` لا يعرض منها إلا المفعَّل،
-- و`create_support_pledge` يرفض الباقي بـ`country_not_active`.
--
-- القائمة أدناه هي دول الحضور العلني في ملفّ الشبكة بالضبط: مكتبٌ مؤكَّد
-- (`office`) أو نشاطٌ ميداني موثّق (`field`). غير المؤكَّد (`unconfirmed`:
-- SO YE PH IQ ZA MY TJ UG) خارجها عمداً — لا يُعرض للزوّار ولا يُفتح للدعم.
-- src/lib/single-source.test.ts يقارن هذه القائمة بالملفّ رمزاً واسماً،
-- فيحمرّ إن تغيّر أحدهما دون الآخر؛ وتغيير الملفّ لاحقاً يحتاج هجرةً جديدة
-- (أو «مطابقة الشبكة» في لوحة الدول، وهي تكتب الشيء نفسه).
--
-- ما تفعله، وهي تُعاد بلا أثر:
--   • دولةٌ في القائمة وليست في الجدول: تُضاف «مخطّطة» ومعلَّمة — كما تضيفها
--     مطابقة الشبكة في الإدارة. التعليم يفتحها وجهةً لدعم التأهيل والدعم
--     العيني وحدهما؛ الكفالة تبقى لكل دولةٍ بقرار تفعيلها. وعملتها يملؤها
--     `trg_fill_country_currency` من قاعدة القارة.
--   • دولةٌ في القائمة وموجودة: تُعلَّم فقط؛ اسمها وحالتها وعملتها لا تُمسّ.
--   • دولةٌ معلَّمة وليست في القائمة: يُرفع عنها التعليم؛ حالتها لا تُمسّ.
-- لا سياسات ولا منح ولا دوالّ هنا.
-- =====================================================================

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
