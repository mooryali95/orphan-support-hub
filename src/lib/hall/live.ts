/**
 * نصوص القاعة الحيّة (`/hall` بلا `try` ولا `me`) وما يكتبها به المشهد: بلغة الواجهة، كما
 * تأخذ قاعة التجربة نصوصها من `./trial` وقاعة الداعم من `./copy`. المشهد لا يكتب نصّاً من عنده.
 *
 * ما في القاعة الحيّة حقيقيٌّ ونموذجي، وهذا الملفّ يسمّي كلّاً باسمه:
 *   - حقيقي: شبكة الندوة (`@/data/wamy-network`، من البحث العامّ) وأعداد الدليل بالدولة
 *     (`geoQuery`، ما تقرؤه الخريطة والدليل، بحجب الأعداد الصغيرة نفسه: `hallDirectory`).
 *   - نموذجي: كلّ ما عداهما — المناطق وحاجتها وتمويلها (`./model`)، ومدن ألبانيا ومجموعاتها
 *     وأطفالها (`@/data/vision-demo` ومحرّك الرؤية)، وأسعار الوحدات، والدفع (محاكاة لا يُخصم
 *     بها شيء)، وقصّة الأثر بعده. كلّ لوحةٍ تعرض شيئاً منه تحمل شارة «بيانات نموذجية».
 *
 * المبالغ بعملة المنصّة الموحّدة (`UNIFIED_CURRENCY`) عبر `formatMoney`، لا عملة مكتوبة باليد.
 */
import { TRAITS as DEMO_TRAITS } from "@/data/vision-demo";
import { UNIFIED_CURRENCY } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { copyOf, defineCopy, dirOf, pluralOf, type Locale } from "@/lib/locale";

import type { Region } from "./model";

export const HALL_LIVE_COPY = defineCopy("lib/hall/live", {
  ar: {
    /** the chip every panel of sample figures carries */
    sample: "بيانات نموذجية",
    region: (n: string) => `المنطقة ${n}`,
    tracks: {
      // الأسماء أسماء «اختر أثرك» نفسها (config/giving-tracks)؛ يقفلها live.test.
      qualify: { name: "تبرع تأهيل", unit: "رحلة طفل", per: "رحلة طفل" },
      sponsor: { name: "كفالة مادية", unit: "شهر كفالة", per: "شهر" },
      kiswa: { name: "تبرع عيني", unit: "عطاء عيني ليتيم", per: "يتيم" },
    },
    trackLine: (unit: string, money: string) => `${unit} · ${money}`,
    levels: { start: "في البداية", growing: "نامٍ", capable: "متمكّن", distinct: "متميّز" },
    months: pluralOf(
      { one: "شهر واحد", two: "شهران", few: "{1} أشهر", many: "{1} شهراً", other: "{1} شهر" },
      0,
      "ar",
    ),
    age: pluralOf(
      { one: "سنة", two: "سنتان", few: "{1} سنوات", many: "{1} سنة", other: "{1} سنة" },
      0,
      "ar",
    ),
    kids: pluralOf(
      {
        zero: "لا أطفال",
        one: "طفلٌ واحد",
        two: "طفلان",
        few: "{1} أطفال",
        many: "{1} طفلاً",
        other: "{1} طفل",
      },
      0,
      "ar",
    ),
    groups: pluralOf(
      {
        one: "مجموعة واحدة",
        two: "مجموعتان",
        few: "{1} مجموعات",
        many: "{1} مجموعة",
        other: "{1} مجموعة",
      },
      0,
      "ar",
    ),
    kidName: (a: string, b: string) => `«${a}. ${b}.»`,
    initials: ["س", "ع", "م", "ن", "ر", "ي", "ح", "ل", "ف", "ز"],
    donor: "داعم القاعة (محاكاة)",
    screen: {
      mapTitle: (country: string) => `${country} — الحال الآن`,
      mapLine: (need: string, pct: string, gap: string) =>
        `بيانات نموذجية · في الحاجة ${need} · مموَّلٌ تأهيلهم ${pct}% · ينتظرون ${gap}`,
      gaps: "أكبر الفجوات",
      waiting: (n: string) => `${n} ينتظرون`,
      enter: (country: string) => `المس الشاشة لتدخل ${country}`,
      tracksTitle: "أنواع الدعم الثلاثة",
      tracksSub: {
        qualify: "ستّ جلسات وقياسٌ قبل وبعد في السمات الستّ",
        sponsor: "مبلغٌ شهري يصل الطفل بإثبات",
        kiswa: "كسوةٌ تُسلَّم بإثبات قبل الموسم",
      },
      tracksNote: "أسعار الوحدات أرقام نموذجية",
      impactTitle: "أثر دعمك في هذه الجولة (محاكاة)",
      none: "لم تدعم بعد.",
      noneSub: [
        "اختر دولةً وجرّب دعمها، فيُكتب هنا ما تمّ",
        "على البلد والمنطقة والمجموعة والطفل.",
      ],
      support: "دعمك (محاكاة)",
      reached: pluralOf(
        {
          one: "طفلٌ وصله",
          two: "طفلان وصلهما",
          few: "أطفال وصلهم",
          many: "طفلاً وصلهم",
          other: "طفل وصلهم",
        },
        0,
        "ar",
      ),
      countries: pluralOf(
        { one: "دولة", two: "دولتان", few: "دول", many: "دولة", other: "دولة" },
        0,
        "ar",
      ),
      by: {
        qualify: (n: string) => `${n} تأهّلوا`,
        sponsor: (n: string) => `${n} كُفلوا`,
        kiswa: (n: string) => `${n} كُسوا`,
      },
      open: "المس الشاشة لتفتح أثر كلّ دعمٍ بمستوياته",
    },
    legend: { qualify: "تأهّلوا", sponsor: "مكفولون", kiswa: "مكسوّون" },
    film: {
      hall: "قاعة الأثر: هنا يرى الداعم أين يذهب دعمه، وماذا يغيّر",
      network: (n: string) => `شبكة الندوة: المقرّ في الرياض و${n} موقعاً مؤكَّد الحضور`,
      pick: (country: string) =>
        `نختار ${country}: نشاطٌ ميداني للندوة، ومدنها ومجموعاتها وأطفالها هنا بياناتٌ نموذجية`,
      enter: "ندخلها: لكلّ مدينةٍ عمودٌ بقدر حاجتها، والمملوء منه ما مُوِّل تأهيله",
      support: (place: string, money: string) =>
        `نحاكي دعم ${place} بـ ${money} تأهيلاً، فيظهر الأثر قبل الدفع`,
      flow: (place: string) => `يتدفّق الدعم، ويرتفع عمود ${place} بقدر ما موّل`,
      levels: "ثم الأثر على أربعة مستويات: البلد، والمدينة، والمجموعة، والطالب",
      close: "وأخيراً أثر الدعم: ما حرّكه، قبله وبعده. كلّ ما رأيتَه محاكاة ببياناتٍ نموذجية",
    },
    card: {
      shape: (country: string) => `شكل ${country}`,
      noPresence:
        "لا دليل حديثاً على حضورٍ للندوة هنا، فلا تُعرض مكتباً لها، وأرقامها بياناتٌ نموذجية.",
      research: "من البحث العامّ",
      groups: "مجموعات تأهيل",
      inQualification: "أيتامٌ في التأهيل",
      funded: "مموَّلٌ تأهيلهم",
      supervisors: "مشرفون",
      noteLinked: (country: string) =>
        `منصّة تشغيل ${country} متّصلة، لكنّ القاعة لا تقرأ منها بعد: هذه الأرقام نموذجية.`,
      noteDemo: (country: string) =>
        `مدن ${country} ومجموعاتها وأطفالها بياناتٌ نموذجية، ودعمك هنا محاكاة تُقيَّد عليها.`,
      noteSim: (country: string) =>
        `أرقام التشغيل هنا نموذجية، لا نتائج، حتى تتّصل منصّة تشغيل ${country}.`,
      enter: (country: string) => `ادخل ${country}`,
      back: "عودة إلى القاعة",
    },
    world: {
      groups: {
        hq: "المقرّ الرئيسي",
        office: "مكاتب مؤكَّدة",
        field: "نشاط ميداني",
        unconfirmed: "غير مؤكَّد: للإدارة فقط",
      },
      full: (sites: string, unconfirmed: string) =>
        `النموذج الكامل: المقرّ و${sites} موقعاً، منها ${unconfirmed} غير مؤكَّدة تظهر للإدارة فقط.`,
      simNote:
        "الحضور من البحث العامّ. أمّا أرقام كلّ دولةٍ هنا فبياناتٌ نموذجية حتى تتّصل منصّة تشغيلها.",
      unconfirmed: "غير مؤكَّد",
      gapLead:
        "كطبقة «تحتاج مكتباً» في خريطة الموقع: دولٌ للندوة فيها نشاطٌ ميداني أو حضورٌ غير مؤكَّد، مرتّبةً بتقدير أيتامها وثقة مصدره.",
      tier: { high: "أولوية عالية", medium: "أولوية متوسطة", data: "تحتاج بيانات" },
    },
    country: {
      title: (country: string, when: string) => `${country} · ${when}`,
      now: "الحال الآن",
      subCity: "ارتفاع كلّ عمود حاجةُ المدينة، والمملوء منه ما مُوِّل تأهيله.",
      subRegion: "ارتفاع كلّ عمود حاجةُ المنطقة، والمملوء منه ما مُوِّل تأهيله.",
      sampleCity: "المدن وأرقامها بياناتٌ نموذجية، لا نتائج.",
      sampleRegion: "المناطق وأرقامها بياناتٌ نموذجية، لا نتائج.",
      need: "في الحاجة",
      funded: "مموَّلٌ تأهيلهم",
      waiting: "ينتظرون",
      cities: "المدن · الأكبر فجوةً أوّلاً",
      regions: "المناطق · الأكبر فجوةً أوّلاً",
      row: (gap: string, need: string) => `${gap} ينتظرون من ${need}`,
      support: (place: string) => `جرّب دعم ${place}`,
      other: "دولة أخرى",
      hint: "اسحب لتدور حول الدولة · المس عموداً لتختار مدينته",
    },
    time: {
      today: "اليوم",
      yearAgo: "قبل سنة",
      yearOn: "بعد سنة",
      before: pluralOf(
        {
          one: "قبل شهر",
          two: "قبل شهرين",
          few: "قبل {0} أشهر",
          many: "قبل {0} شهراً",
          other: "قبل {0} شهر",
        },
        0,
        "ar",
      ),
      after: pluralOf(
        {
          one: "بعد شهر",
          two: "بعد شهرين",
          few: "بعد {0} أشهر",
          many: "بعد {0} شهراً",
          other: "بعد {0} شهر",
        },
        0,
        "ar",
      ),
      estimate: "تقديرٌ نموذجي بإيقاع اليوم",
      past: "استرجاعٌ تقريبي نموذجي",
    },
    directory: {
      sect: "في الدليل الآن",
      chip: "من الدليل",
      count: pluralOf(
        {
          one: "طفلٌ واحد في {2}",
          two: "طفلان في {2}",
          few: "{1} أطفال في {2}",
          many: "{1} طفلاً في {2}",
          other: "{1} طفل في {2}",
        },
        0,
        "ar",
      ),
      hidden: (country: string) => `أطفال ${country}`,
      waiting: pluralOf(
        {
          zero: "كلّهم مكفولون الآن",
          one: "واحدٌ منهم ينتظر كافلاً",
          two: "اثنان منهم ينتظران كافلاً",
          few: "{1} منهم ينتظرون كافلاً",
          many: "{1} منهم ينتظرون كافلاً",
          other: "{1} منهم ينتظرون كافلاً",
        },
        0,
        "ar",
      ),
      small: "الأعداد الصغيرة تُحجب حمايةً للأطفال",
      browse: "تصفّحهم",
      note: "هذا العدد وحده من دليل المنصّة، كما تعرضه الخريطة والدليل. بقيّة أرقام هذه اللوحة نموذجية.",
    },
    support: {
      title: (place: string) => `جرّب دعم ${place}`,
      sub: "هذه محاكاة لا يُخصم بها شيء. اختر نوع الدعم ومقداره، فيتغيّر الأثر أمامك على العمود ونقاط الأيتام وشاشة الأثر.",
      kind: "نوع الدعم",
      amount: "المقدار",
      dest: "الوجهة",
      city: "المدينة",
      region: "المنطقة",
      option: (place: string, gap: string) => `${place} — ${gap} ينتظرون`,
      pay: "ادعم الآن (محاكاة)",
      back: "رجوع",
      note: "الدفع هنا محاكاة: لا يُخصم شيء ولا يُسجَّل تبرّع، والمبالغ وأسعار الوحدات أرقامٌ نموذجية. في المنصّة الحقيقية يمرّ الدفع ببوابة الدفع ويُقيَّد بفاتورة وإيصال.",
    },
    preview: {
      eyebrow: "شاشة الأثر · قبل الدفع · محاكاة",
      qTitle: (money: string, place: string) => `لو دعمت بـ ${money} تأهيلاً في ${place}`,
      qStart: pluralOf(
        {
          zero: "لا يكفي هذا المبلغ رحلةَ طفل",
          one: "طفلٌ واحد يبدأ رحلة التأهيل",
          two: "طفلان يبدآن رحلة التأهيل",
          few: "{1} أطفال يبدأون رحلة التأهيل",
          many: "{1} طفلاً يبدأون رحلة التأهيل",
          other: "{1} طفل يبدأون رحلة التأهيل",
        },
        0,
        "ar",
      ),
      qUnit: (money: string) => `كلّ رحلة ${money}`,
      spill: (n: string) => ` · وما زاد، وهو ما يكفي ${n}، يذهب لأقرب فجوة`,
      qGroups: pluralOf(
        {
          one: "مجموعة كاملة",
          two: "مجموعتان كاملتان",
          few: "{1} مجموعات كاملة",
          many: "{1} مجموعة كاملة",
          other: "{1} مجموعة كاملة",
        },
        0,
        "ar",
      ),
      qRest: (n: string) => ` و${n} في مجموعةٍ قيد التكوين`,
      qForming: (n: string) => `${n} في مجموعةٍ قيد التكوين`,
      qSessions: "ستّ جلسات لكلّ مجموعة، وقياسٌ للسمات الستّ قبلها وبعدها",
      qGap: (place: string, from: string, to: string) => `فجوة ${place}: من ${from} إلى ${to}`,
      qDrop: (pct: string, a: string, b: string) =>
        `تنخفض ${pct}% · متوسّط السمات المتوقّع من ${a} إلى ${b}`,
      sTitle: (money: string, place: string) => `لو كفلت بـ ${money} في ${place}`,
      sMonths: pluralOf(
        {
          zero: "لا يكفي هذا المبلغ شهرَ كفالة",
          one: "شهر كفالة واحد",
          two: "شهرا كفالة",
          few: "{1} أشهر كفالة",
          many: "{1} شهر كفالة",
          other: "{1} شهر كفالة",
        },
        0,
        "ar",
      ),
      sUnit: (money: string) => `كلّ شهر ${money} يصل الطفل بإثبات تسليم`,
      sYears: pluralOf(
        {
          one: "طفلٌ واحد لسنةٍ كاملة",
          two: "طفلان لسنةٍ كاملة",
          few: "{1} أطفال لسنةٍ كاملة",
          many: "{1} طفلاً لسنةٍ كاملة",
          other: "{1} طفل لسنةٍ كاملة",
        },
        0,
        "ar",
      ),
      sMore: pluralOf(
        {
          one: " وشهرٌ لطفلٍ آخر",
          two: " وشهران لطفلٍ آخر",
          few: " و{1} أشهر لطفلٍ آخر",
          many: " و{1} شهراً لطفلٍ آخر",
          other: " و{1} شهر لطفلٍ آخر",
        },
        0,
        "ar",
      ),
      sOnly: pluralOf(
        {
          zero: "أقلّ من شهرٍ واحد",
          one: "شهرٌ واحد لطفلٍ واحد",
          two: "شهران لطفلٍ واحد",
          few: "{1} أشهر لطفلٍ واحد",
          many: "{1} شهراً لطفلٍ واحد",
          other: "{1} شهر لطفلٍ واحد",
        },
        0,
        "ar",
      ),
      sPick: "يُختار الأطفال ممّن أتمّوا التأهيل ولا كافل لهم",
      sCount: (place: string, from: string, to: string) =>
        `المكفولون في ${place}: من ${from} إلى ${to}`,
      sExpect: "ارتفاعٌ متوقّع خلال سنة في الصمود والدراية والهمّة (تقديرٌ يضبطه القياس)",
      kTitle: (money: string, place: string) => `لو دعمت بـ ${money} كسوةً في ${place}`,
      kKids: pluralOf(
        {
          zero: "لا يكفي هذا المبلغ كسوةَ يتيم",
          one: "يتيمٌ واحد يُكسى",
          two: "يتيمان يُكسَيان",
          few: "{1} أيتام يُكسَون",
          many: "{1} يتيماً يُكسَون",
          other: "{1} يتيم يُكسَون",
        },
        0,
        "ar",
      ),
      kUnit: (money: string) => `كسوة اليتيم ${money}`,
      kWhen: "تُسلَّم خلال 1–3 أسابيع بإثبات",
      kProof: "يُرفق إثبات التسليم بعدد المستلمين وتاريخه، بلا صورٍ للأطفال",
      kNeed: (place: string, from: string, to: string) =>
        `حاجة الكسوة في ${place}: من ${from} إلى ${to}`,
      kMet: (pct: string) => `تُسدّ ${pct}% من حاجة الموسم`,
    },
    say: {
      qualify: pluralOf(
        {
          one: "انظر إلى العمود: ارتفع ما امتلأ منه، والحلقات المضيئة جلسات طفلٍ واحد",
          two: "انظر إلى العمود: ارتفع ما امتلأ منه، والحلقات المضيئة جلسات طفلين",
          few: "انظر إلى العمود: ارتفع ما امتلأ منه، والحلقات المضيئة جلسات {1} أطفال",
          many: "انظر إلى العمود: ارتفع ما امتلأ منه، والحلقات المضيئة جلسات {1} طفلاً",
          other: "انظر إلى العمود: ارتفع ما امتلأ منه، والحلقات المضيئة جلسات {1} طفل",
        },
        0,
        "ar",
      ),
      sponsor: pluralOf(
        {
          one: "انظر حول العمود: فانوسٌ زمرّدي انضمّ إلى مدار الكفالة",
          two: "انظر حول العمود: فانوسان زمرّديان انضمّا إلى مدار الكفالة",
          few: "انظر حول العمود: {1} فوانيس زمرّدية انضمّت إلى مدار الكفالة",
          many: "انظر حول العمود: {1} فانوساً زمرّدياً انضمّ إلى مدار الكفالة",
          other: "انظر حول العمود: {1} فانوس زمرّدي انضمّ إلى مدار الكفالة",
        },
        0,
        "ar",
      ),
      kiswa: pluralOf(
        {
          one: "انظر إلى الأطفال: هديةٌ لؤلؤية نزلت على أحدهم",
          two: "انظر إلى الأطفال: هديتان لؤلؤيتان نزلتا عليهم",
          few: "انظر إلى الأطفال: {1} هدايا لؤلؤية نزلت عليهم",
          many: "انظر إلى الأطفال: {1} هديةً لؤلؤية نزلت عليهم",
          other: "انظر إلى الأطفال: {1} هدية لؤلؤية نزلت عليهم",
        },
        0,
        "ar",
      ),
    },
    /** one support in a line: the screen, the record and the impact story's heading */
    did: {
      qualify: pluralOf(
        {
          one: "تأهّل طفلٌ واحد في {2}",
          two: "تأهّل طفلان في {2}",
          few: "تأهّل {1} أطفال في {2}",
          many: "تأهّل {1} طفلاً في {2}",
          other: "تأهّل {1} طفل في {2}",
        },
        0,
        "ar",
      ),
      sponsor: pluralOf(
        {
          one: "كفالة طفلٍ واحد في {2}",
          two: "كفالة طفلين في {2}",
          few: "كفالة {1} أطفال في {2}",
          many: "كفالة {1} طفلاً في {2}",
          other: "كفالة {1} طفل في {2}",
        },
        0,
        "ar",
      ),
      kiswa: pluralOf(
        {
          one: "كُسي يتيمٌ واحد في {2}",
          two: "كُسي يتيمان في {2}",
          few: "كُسي {1} أيتام في {2}",
          many: "كُسي {1} يتيماً في {2}",
          other: "كُسي {1} يتيم في {2}",
        },
        0,
        "ar",
      ),
      line: (money: string, track: string) => `${money} · ${track} · محاكاة`,
    },
    /** the label under the count of children a support reached */
    reached: {
      qualify: pluralOf(
        {
          one: "طفلٌ تأهّل",
          two: "طفلان تأهّلا",
          few: "أطفال تأهّلوا",
          many: "طفلاً تأهّلوا",
          other: "طفل تأهّلوا",
        },
        0,
        "ar",
      ),
      sponsor: pluralOf(
        {
          one: "طفلٌ كُفل",
          two: "طفلان كُفلا",
          few: "أطفال كُفلوا",
          many: "طفلاً كُفلوا",
          other: "طفل كُفلوا",
        },
        0,
        "ar",
      ),
      kiswa: pluralOf(
        {
          one: "يتيمٌ كُسي",
          two: "يتيمان كُسيا",
          few: "أيتام كُسوا",
          many: "يتيماً كُسوا",
          other: "يتيم كُسوا",
        },
        0,
        "ar",
      ),
    },
    lvl: {
      country: "البلد",
      city: "المدينة",
      region: "المنطقة",
      group: "المجموعة",
      student: "الطالب",
      person: "الفرد",
    },
    /** the same names inside a sentence */
    lvlIn: { city: "المدينة", region: "المنطقة", student: "الطالب", person: "الفرد" },
    story: {
      eyebrow: (money: string) => `شاشة الأثر · محاكاة · دعمك ${money}`,
      tabs: { base: "الأساس", done: "ما تمّ", levels: "الأثر بالمستويات", details: "التفاصيل" },
      was: "قبل",
      now: "الآن",
      need: "في الحاجة",
      waitingQ: "ينتظرون التأهيل",
      fundedQ: "مموَّلٌ تأهيلهم",
      traitsAvg: "متوسّط السمات الستّ",
      traitsAt: (avg: string, level: string) => `${avg} · ${level}`,
      qBase: (place: string) => `قبل دعمك، هذا حال ${place} في البيانات النموذجية.`,
      dist: "توزيع المستويات · القياس القبلي",
      qDone: (money: string, kids: string, groups: string) =>
        `موّل دعمك ${money} رحلة التأهيل: ${kids}، ${groups}، لكلّ مجموعةٍ ستّ جلسات بين قياسين.`,
      forming: "مجموعةٌ قيد التكوين",
      before: "قياسٌ قبلي",
      after: "قياسٌ بعدي",
      duration: "المدّة",
      weeks68: "6–8 أسابيع",
      weeks13: "1–3 أسابيع",
      supervisor: "المشرف",
      supervisorOf: (place: string) => `مشرف ${place} · اسمٌ مستعار`,
      attendance: "الحضور",
      traitsSect: "السمات الستّ للفئة · قبل ثم الآن",
      ledger: "القيد المالي · محاكاة",
      invoice: "الفاتورة النموذجية",
      amount: "المبلغ",
      fee: "رسوم البوابة",
      netWamy: "الصافي إلى حساب الندوة",
      net: "الصافي",
      sBase: (place: string) => `قبل دعمك: أطفالٌ أتمّوا التأهيل في ${place} ولا كافل لهم.`,
      sponsored: "المكفولون",
      of: (a: string, b: string) => `${a} من ${b}`,
      noSponsor: "بلا كافل",
      resilience: "متوسّط الصمود",
      sDone: (money: string, months: string) =>
        `${money} = ${months}، يصل كلّ شهرٍ للطفل بإثبات تسليم.`,
      payout: "الصرف",
      payoutVal: "شهرياً عبر المكتب",
      proof: "الإثبات",
      proofS: "توقيع المستلم وتاريخه",
      proofK: "عدد المستلمين وتاريخه وتوقيع المكتب",
      yearSect: "ما يتغيّر في سنة · تقديرٌ يضبطه القياس",
      kBase: (place: string) => `قبل دعمك: حاجة الكسوة لهذا الموسم في ${place}.`,
      clothedSeason: "كُسوا هذا الموسم",
      waiting: "ينتظرون",
      kits: pluralOf(
        {
          one: "كسوة كاملة واحدة",
          two: "كسوتان كاملتان",
          few: "{1} كسوات كاملة",
          many: "{1} كسوة كاملة",
          other: "{1} كسوة كاملة",
        },
        0,
        "ar",
      ),
      kDone: (money: string, kits: string) =>
        `${money} = ${kits}، تُشترى وتُجهَّز وتُسلَّم بإثبات.`,
      steps: ["الشراء", "التجهيز", "التسليم", "الإثبات"],
      waitingK: "ينتظرون الكسوة",
      noPhotos: "بلا صورٍ ولا أماكن للأطفال؛ يُكتفى بالعدد والتاريخ والتوقيع.",
      q1: (country: string, months: string) =>
        `اقتربت ${country} من سدّ حاجتها؛ بإيقاع اليوم تُسدّ الفجوة خلال ${months}.`,
      waitingIn: (place: string) => `ينتظرون في ${place}`,
      qualifiedOfNeed: "تأهّل من حاجتها",
      q2: (pct: string, place: string) => `دعمك وحده موّل ${pct}% ممّا كانت ${place} تنتظره.`,
      groupName: (place: string, n: string) => `مجموعة ${place} · ${n}`,
      andOthers: (n: string) => ` و${n} غيرها`,
      sessions: "جلساتٌ منفّذة",
      q3: (moved: string, of: string) =>
        `ثمانية أطفال في كلّ مجموعة؛ انتقل ${moved} من ${of} إلى مستوىً أعلى.`,
      kidLine: (name: string, age: string) => `${name} · ${age}`,
      q4: (from: string, to: string, code: string) =>
        `انتقل من «${from}» إلى «${to}»، وأكبر ارتفاعٍ عنده في الرشد والصمود. اسمٌ مستعار ورمزٌ نموذجي ${code}.`,
      sponsoredCountry: "مكفولون في البلد",
      s1: "كفالاتٌ شهرية جديدة تصل بإثبات تسليم كلّ شهر.",
      sponsoredIn: (place: string) => `مكفولون في ${place}`,
      s2: "تقلّص عدد من أتمّوا التأهيل ولا كافل لهم.",
      sponsoredOf8: "مكفولون من 8",
      s3: "الكفالة تُثبّت الطفل في مجموعته ومتابعته الشهرية.",
      monthly: "يصله شهرياً",
      s4: "مبلغٌ ثابت بإثبات تسليمٍ شهري، وارتفاعٌ متوقّع في سماته يضبطه القياس.",
      clothedNow: "مكسوّون هذا الموسم",
      k1: (country: string) => `تُسدّ حاجة الموسم في ${country} بقدر دعمك.`,
      k2: (pct: string, place: string) => `${pct}% من حاجة ${place} سُدّت بدعمك.`,
      groupsIn: pluralOf(
        {
          one: "مجموعة واحدة في {2}",
          two: "مجموعتان في {2}",
          few: "{1} مجموعات في {2}",
          many: "{1} مجموعة في {2}",
          other: "{1} مجموعة في {2}",
        },
        0,
        "ar",
      ),
      clothedOf8: "مكسوّون من 8 في المجموعة",
      k3: "تُسلَّم الكسوة للمجموعة كاملةً في يومٍ واحد بإثبات.",
      kBefore: "بلا كسوة الموسم",
      kNow: "كسوةٌ كاملة مسلَّمة",
      k4: "ثوبٌ وحذاءٌ ومعطفٌ للشتاء، بلا صورةٍ ولا مكانٍ للطفل.",
      members: "أطفالها",
      sessionsOf: "الجلسات",
      funding: "التمويل",
      fundedFull: "مموّلة كاملةً",
      fundedWait: "تنتظر التمويل",
      source: "المصدر",
      afterMeasure: "بعد القياس",
      moved: "قيست المجموعة بعد جلساتها الستّ، وهذا انتقال مستوياتها.",
      pending:
        "موّل دعمك المجموعة؛ تبدأ جلساتها الستّ في منصّة التشغيل، ويظهر انتقال مستوياتها بعد القياس البعدي.",
      childMoved: (from: string, to: string, code: string) =>
        `انتقل من «${from}» إلى «${to}». رمزه ${code}.`,
      childRose: (from: string, code: string) =>
        `مستواه «${from}»، وارتفعت سماته بالدعم. رمزه ${code}.`,
      childLater: (from: string, code: string) =>
        `مستواه الآن «${from}»، وتُقاس سماته بعد الجلسة السادسة. رمزه ${code}.`,
      levelsLead: (region: string, last: string) =>
        `دعمك نفسه، مقروءاً على أربعة مستويات: البلد، ثم ${region}، ثم المجموعة، ثم ${last}.`,
      noteEngine: "أرقامٌ نموذجية، محسوبةٌ بعد قيد دعمك المحاكى عليها. لا نتائج حقيقية هنا.",
      noteSim: (country: string) => `أرقام ${country} نموذجية، لا نتائج، حتى تتّصل منصّة تشغيلها.`,
    },
    done: {
      title: "تمّت المحاكاة: شكراً لك",
      sub: (region: string, last: string) =>
        `هذه محاكاة: لم يُخصم شيء ولم يُسجَّل تبرّع. اقرأ أثرها كما سيُقرأ أثر الدعم الحقيقي: الأساس، ثم ما تمّ، ثم الأثر على البلد و${region} والمجموعة و${last}، ثم التفاصيل.`,
      support: "دعمك (محاكاة)",
      invoice: "رقم الفاتورة النموذجية",
      summary: "خلاصة الأثر",
      again: "محاكاةٌ أخرى",
    },
    big: {
      title: "أثر دعمك (محاكاة)",
      sub: (place: string, country: string) =>
        `في هذه المحاكاة وصل دعمك ${place} في ${country}. هذا ما تغيّر به، قبله وبعده.`,
      subCountry: (country: string) =>
        `في هذه المحاكاة وصل دعمك ${country}. هذا ما تغيّر به، قبله وبعده.`,
      sect: (country: string) => `ما حرّكه دعمك في ${country}`,
      funded: "مموَّلٌ تأهيلهم",
      waiting: "ينتظرون التأهيل",
      clothed: "مكسوّون",
      sponsored: "مكفولون",
      closer: (country: string, months: string, was: string) =>
        `وبهذا الدعم تقترب ${country} من سدّ حاجتها: ${months} بدل ${was} بإيقاع اليوم.`,
      warm: "هكذا سيُقرأ أثر دعمك الحقيقي: وراء كلّ رقمٍ طفلٌ يقترب ممّا ينتظره. جزاك الله خيراً.",
      note: "كلّ ما في هذه اللوحة محاكاة ببياناتٍ نموذجية: لم يُخصم شيء، وليست هذه نتائج حقيقية.",
      another: "دولة أخرى",
      hall: "عودة إلى القاعة",
      real: "إلى الدليل الحقيقي",
    },
    log: {
      emptyTitle: "أثرك",
      empty:
        "لم تدعم بعد. المس الكرة واختر دولةً وجرّب دعمها، فيُسجَّل هنا أثر المحاكاة بمستوياته الأربعة.",
      pick: "اختر دولة",
      close: "إغلاق",
      title: "سجلّ هذه الجولة",
      sub: "كلّ دعمٍ حاكيته في هذه الجولة، وأثره على البلد والمنطقة والمجموعة والطفل. لا شيء منه تبرّعٌ مسجَّل.",
      item: (country: string, track: string, money: string) => `${country} · ${track} · ${money}`,
      line: (line: string, country: string) => `${line} · ${country}`,
    },
    kinds: {
      title: "أنواع الدعم الثلاثة",
      sub: "كلّ نوعٍ يُقرأ أثره على أربعة مستويات. هذا ما تراه بعد دعمك في كلّ مستوى. أسعار الوحدات أرقامٌ نموذجية.",
      level: "المستوى",
      rows: {
        country: {
          name: "البلد",
          qualify: "نسبة التمويل والمنتظرون ومدّة سدّ الفجوة",
          sponsor: "عدد المكفولين في البلد",
          kiswa: "المكسوّون هذا الموسم",
        },
        region: {
          name: "المنطقة",
          qualify: "منتظروها وما تأهّل من حاجتها",
          sponsor: "المكفولون ومن بقي بلا كافل",
          kiswa: "ما سُدّ من حاجة الموسم",
        },
        group: {
          name: "المجموعة",
          qualify: "6 جلسات، ومتوسّط السمات، وانتقال المستويات",
          sponsor: "المكفولون من أطفالها الثمانية",
          kiswa: "كسوة المجموعة كاملةً بإثبات",
        },
        child: {
          name: "الطفل",
          qualify: "سماته الستّ قبل وبعد، ومستواه",
          sponsor: "مبلغٌ شهري ثابت، وصمودُه ودرايتُه",
          kiswa: "كسوةٌ كاملة مسلَّمة",
        },
      },
      go: "اختر دولةً وجرّب",
    },
  },
  en: {
    sample: "Sample data",
    region: (n: string) => `Region ${n}`,
    tracks: {
      qualify: {
        name: "Qualification giving",
        unit: "One child's journey",
        per: "per child's journey",
      },
      sponsor: { name: "Financial sponsorship", unit: "One month", per: "per month" },
      kiswa: { name: "In-kind giving", unit: "One orphan's in-kind gift", per: "per orphan" },
    },
    trackLine: (unit: string, money: string) => `${unit} · ${money}`,
    levels: {
      start: "Starting",
      growing: "Growing",
      capable: "Capable",
      distinct: "Distinguished",
    },
    months: pluralOf({ one: "{1} month", other: "{1} months" }),
    age: pluralOf({ one: "{1} year old", other: "{1} years old" }),
    kids: pluralOf({ one: "{1} child", other: "{1} children" }),
    groups: pluralOf({ one: "{1} group", other: "{1} groups" }),
    kidName: (a: string, b: string) => `“${a}. ${b}.”`,
    initials: ["S", "A", "M", "N", "R", "Y", "H", "L", "F", "Z"],
    donor: "Hall supporter (simulated)",
    screen: {
      mapTitle: (country: string) => `${country}: as it stands`,
      mapLine: (need: string, pct: string, gap: string) =>
        `Sample data · ${need} in need · ${pct}% funded · ${gap} waiting`,
      gaps: "Largest gaps",
      waiting: (n: string) => `${n} waiting`,
      enter: (country: string) => `Tap the screen to enter ${country}`,
      tracksTitle: "Three kinds of support",
      tracksSub: {
        qualify: "Six sessions, with the six traits measured before and after",
        sponsor: "A monthly amount that reaches the child, with proof",
        kiswa: "Clothing delivered with proof before the season",
      },
      tracksNote: "Unit prices are sample figures",
      impactTitle: "Your impact this visit (simulated)",
      none: "No support yet.",
      noneSub: [
        "Choose a country and try supporting it:",
        "the result is written here, level by level.",
      ],
      support: "simulated support",
      reached: pluralOf({ one: "child reached", other: "children reached" }),
      countries: pluralOf({ one: "country", other: "countries" }),
      by: {
        qualify: (n: string) => `${n} qualified`,
        sponsor: (n: string) => `${n} sponsored`,
        kiswa: (n: string) => `${n} clothed`,
      },
      open: "Tap the screen to open each gift's impact, level by level",
    },
    legend: { qualify: "Qualified", sponsor: "Sponsored", kiswa: "Clothed" },
    film: {
      hall: "The Impact Hall: where a supporter sees where their support goes and what it changes",
      network: (n: string) =>
        `The WAMY network: headquarters in Riyadh and ${n} sites of confirmed presence`,
      pick: (country: string) =>
        `We choose ${country}: WAMY field activity; its cities, groups and children here are sample data`,
      enter:
        "We go in: each city has a column as tall as its need; the filled part is the qualification already funded",
      support: (place: string, money: string) =>
        `We simulate ${money} for qualification in ${place}, and the impact shows before any payment`,
      flow: (place: string) => `The support flows, and ${place}'s column rises by what it funded`,
      levels: "Then the impact at four levels: the country, the city, the group and the student",
      close:
        "And last, what the support moved, before and after. Everything you saw was a simulation on sample data",
    },
    card: {
      shape: (country: string) => `Outline of ${country}`,
      noPresence:
        "There is no recent evidence of a WAMY presence here, so it is not shown as an office, and its figures are sample data.",
      research: "from public research",
      groups: "Qualification groups",
      inQualification: "Orphans in qualification",
      funded: "Qualification funded",
      supervisors: "Supervisors",
      noteLinked: (country: string) =>
        `${country}'s operating platform is connected, but the hall does not read from it yet: these figures are sample data.`,
      noteDemo: (country: string) =>
        `The cities, groups and children of ${country} are sample data, and your support here is a simulation recorded against them.`,
      noteSim: (country: string) =>
        `The operating figures here are sample data, not results, until ${country}'s operating platform is connected.`,
      enter: (country: string) => `Enter ${country}`,
      back: "Back to the hall",
    },
    world: {
      groups: {
        hq: "Headquarters",
        office: "Confirmed offices",
        field: "Field activity",
        unconfirmed: "Unconfirmed: staff only",
      },
      full: (sites: string, unconfirmed: string) =>
        `The full model: headquarters and ${sites} sites, ${unconfirmed} of them unconfirmed and shown to staff only.`,
      simNote:
        "Presence comes from public research. Each country's figures here are sample data until its operating platform is connected.",
      unconfirmed: "Unconfirmed",
      gapLead:
        "As in the site map's “needs an office” layer: countries where WAMY has field activity or an unconfirmed presence, ranked by their estimated number of orphans and how reliable that estimate's source is.",
      tier: { high: "High priority", medium: "Medium priority", data: "Needs data" },
    },
    country: {
      title: (country: string, when: string) => `${country} · ${when}`,
      now: "As it stands",
      subCity:
        "Each column is as tall as its city's need; the filled part is the qualification already funded.",
      subRegion:
        "Each column is as tall as its region's need; the filled part is the qualification already funded.",
      sampleCity: "The cities and their figures are sample data, not results.",
      sampleRegion: "The regions and their figures are sample data, not results.",
      need: "In need",
      funded: "Qualification funded",
      waiting: "Waiting",
      cities: "Cities · largest gap first",
      regions: "Regions · largest gap first",
      row: (gap: string, need: string) => `${gap} of ${need} waiting`,
      support: (place: string) => `Try supporting ${place}`,
      other: "Another country",
      hint: "Drag to circle the country · tap a column to choose its city",
    },
    time: {
      today: "Today",
      yearAgo: "A year ago",
      yearOn: "A year from now",
      before: pluralOf({ one: "{0} month ago", other: "{0} months ago" }),
      after: pluralOf({ one: "In {0} month", other: "In {0} months" }),
      estimate: "Sample estimate at today's pace",
      past: "Approximate sample reconstruction",
    },
    directory: {
      sect: "In the directory now",
      chip: "From the directory",
      count: pluralOf({ one: "{1} child in {2}", other: "{1} children in {2}" }),
      hidden: (country: string) => `Children in ${country}`,
      waiting: pluralOf({
        one: "{1} of them is waiting for a sponsor",
        other: "{1} of them are waiting for a sponsor",
      }),
      small: "Small counts are hidden to protect the children",
      browse: "Browse them",
      note: "Only this count comes from the platform's directory, as the map and the directory show it. Every other figure on this panel is sample data.",
    },
    support: {
      title: (place: string) => `Try supporting ${place}`,
      sub: "This is a simulation; nothing is charged. Choose a kind of support and an amount, and the impact changes in front of you on the column, the orphans' dots and the impact screen.",
      kind: "Kind of support",
      amount: "Amount",
      dest: "Destination",
      city: "City",
      region: "Region",
      option: (place: string, gap: string) => `${place} — ${gap} waiting`,
      pay: "Support now (simulated)",
      back: "Back",
      note: "Payment here is simulated: nothing is charged and no donation is recorded, and the amounts and unit prices are sample figures. On the real platform a payment goes through the payment gateway and is recorded with an invoice and a receipt.",
    },
    preview: {
      eyebrow: "Impact screen · before paying · simulated",
      qTitle: (money: string, place: string) =>
        `If you gave ${money} for qualification in ${place}`,
      qStart: pluralOf({
        one: "{1} child starts the qualification journey",
        other: "{1} children start the qualification journey",
      }),
      qUnit: (money: string) => `${money} per journey`,
      spill: (n: string) => ` · the rest, enough for ${n} more, goes to the nearest gap`,
      qGroups: pluralOf({ one: "{1} full group", other: "{1} full groups" }),
      qRest: (n: string) => ` and ${n} in a group still forming`,
      qForming: (n: string) => `${n} in a group still forming`,
      qSessions: "Six sessions per group, with the six traits measured before and after",
      qGap: (place: string, from: string, to: string) => `${place}'s gap: from ${from} to ${to}`,
      qDrop: (pct: string, a: string, b: string) =>
        `Down ${pct}% · expected trait average from ${a} to ${b}`,
      sTitle: (money: string, place: string) => `If you sponsored with ${money} in ${place}`,
      sMonths: pluralOf({
        one: "{1} month of sponsorship",
        other: "{1} months of sponsorship",
      }),
      sUnit: (money: string) => `${money} each month reaches the child, with proof of delivery`,
      sYears: pluralOf({
        one: "{1} child for a full year",
        other: "{1} children for a full year",
      }),
      sMore: pluralOf({
        one: " and {1} month for another child",
        other: " and {1} months for another child",
      }),
      sOnly: pluralOf({ one: "{1} month for one child", other: "{1} months for one child" }),
      sPick: "Children are chosen from those who completed qualification and have no sponsor",
      sCount: (place: string, from: string, to: string) =>
        `Sponsored in ${place}: from ${from} to ${to}`,
      sExpect:
        "An expected rise within a year in resilience, awareness and drive (an estimate that measurement will correct)",
      kTitle: (money: string, place: string) => `If you gave ${money} for clothing in ${place}`,
      kKids: pluralOf({ one: "{1} orphan clothed", other: "{1} orphans clothed" }),
      kUnit: (money: string) => `${money} clothes one orphan`,
      kWhen: "Delivered within 1–3 weeks, with proof",
      kProof: "Proof of delivery states how many received it and when, with no photos of children",
      kNeed: (place: string, from: string, to: string) =>
        `Clothing need in ${place}: from ${from} to ${to}`,
      kMet: (pct: string) => `${pct}% of the season's need met`,
    },
    say: {
      qualify: pluralOf({
        one: "Look at the column: its filled part has risen, and the lit rings are the sessions of {1} child",
        other:
          "Look at the column: its filled part has risen, and the lit rings are the sessions of {1} children",
      }),
      sponsor: pluralOf({
        one: "Look around the column: {1} emerald lantern has joined the sponsorship orbit",
        other: "Look around the column: {1} emerald lanterns have joined the sponsorship orbit",
      }),
      kiswa: pluralOf({
        one: "Look at the children: {1} pearl gift has come down to them",
        other: "Look at the children: {1} pearl gifts have come down to them",
      }),
    },
    did: {
      qualify: pluralOf({
        one: "{1} child qualified in {2}",
        other: "{1} children qualified in {2}",
      }),
      sponsor: pluralOf({
        one: "{1} child sponsored in {2}",
        other: "{1} children sponsored in {2}",
      }),
      kiswa: pluralOf({ one: "{1} orphan clothed in {2}", other: "{1} orphans clothed in {2}" }),
      line: (money: string, track: string) => `${money} · ${track} · simulated`,
    },
    reached: {
      qualify: pluralOf({ one: "child qualified", other: "children qualified" }),
      sponsor: pluralOf({ one: "child sponsored", other: "children sponsored" }),
      kiswa: pluralOf({ one: "orphan clothed", other: "orphans clothed" }),
    },
    lvl: {
      country: "Country",
      city: "City",
      region: "Region",
      group: "Group",
      student: "Student",
      person: "Child",
    },
    lvlIn: { city: "city", region: "region", student: "student", person: "child" },
    story: {
      eyebrow: (money: string) => `Impact screen · simulated · your support of ${money}`,
      tabs: {
        base: "Baseline",
        done: "What happened",
        levels: "Impact by level",
        details: "Details",
      },
      was: "Before",
      now: "Now",
      need: "In need",
      waitingQ: "Waiting for qualification",
      fundedQ: "Qualification funded",
      traitsAvg: "Average of the six traits",
      traitsAt: (avg: string, level: string) => `${avg} · ${level}`,
      qBase: (place: string) =>
        `Before your support, this is how ${place} stands in the sample data.`,
      dist: "Levels · the opening measurement",
      qDone: (money: string, kids: string, groups: string) =>
        `Your support of ${money} funded the qualification journey: ${kids}, ${groups}, with six sessions per group between two measurements.`,
      forming: "a group still forming",
      before: "Before",
      after: "After",
      duration: "Duration",
      weeks68: "6–8 weeks",
      weeks13: "1–3 weeks",
      supervisor: "Supervisor",
      supervisorOf: (place: string) => `${place}'s supervisor · pseudonym`,
      attendance: "Attendance",
      traitsSect: "The cohort's six traits · before, then now",
      ledger: "Financial record · simulated",
      invoice: "Sample invoice",
      amount: "Amount",
      fee: "Gateway fee",
      netWamy: "Net to WAMY's account",
      net: "Net",
      sBase: (place: string) =>
        `Before your support: children in ${place} who completed qualification and have no sponsor.`,
      sponsored: "Sponsored",
      of: (a: string, b: string) => `${a} of ${b}`,
      noSponsor: "Without a sponsor",
      resilience: "Average resilience",
      sDone: (money: string, months: string) =>
        `${money} = ${months}, reaching the child each month with proof of delivery.`,
      payout: "Paid out",
      payoutVal: "Monthly, through the office",
      proof: "Proof",
      proofS: "The recipient's signature and the date",
      proofK: "Number of recipients, the date and the office's signature",
      yearSect: "What changes in a year · an estimate that measurement will correct",
      kBase: (place: string) => `Before your support: this season's clothing need in ${place}.`,
      clothedSeason: "Clothed this season",
      waiting: "Waiting",
      kits: pluralOf({ one: "{1} full set of clothing", other: "{1} full sets of clothing" }),
      kDone: (money: string, kits: string) =>
        `${money} = ${kits}, bought, prepared and delivered with proof.`,
      steps: ["Purchase", "Preparation", "Delivery", "Proof"],
      waitingK: "Waiting for clothing",
      noPhotos:
        "No photos or locations of children; the count, the date and the signature are enough.",
      q1: (country: string, months: string) =>
        `${country} is closer to meeting its need; at today's pace the gap closes in ${months}.`,
      waitingIn: (place: string) => `Waiting in ${place}`,
      qualifiedOfNeed: "Share of its need qualified",
      q2: (pct: string, place: string) =>
        `Your support alone funded ${pct}% of what ${place} was waiting for.`,
      groupName: (place: string, n: string) => `${place} group · ${n}`,
      andOthers: (n: string) => ` and ${n} more`,
      sessions: "Sessions held",
      q3: (moved: string, of: string) =>
        `Eight children in each group; ${moved} of ${of} moved up a level.`,
      kidLine: (name: string, age: string) => `${name} · ${age}`,
      q4: (from: string, to: string, code: string) =>
        `Moved from “${from}” to “${to}”, with the largest rise in maturity and resilience. A pseudonym and a sample code, ${code}.`,
      sponsoredCountry: "Sponsored in the country",
      s1: "New monthly sponsorships, delivered each month with proof.",
      sponsoredIn: (place: string) => `Sponsored in ${place}`,
      s2: "Fewer children who completed qualification are left without a sponsor.",
      sponsoredOf8: "Sponsored, out of 8",
      s3: "Sponsorship keeps the child in their group and in monthly follow-up.",
      monthly: "Receives each month",
      s4: "A fixed amount with monthly proof of delivery, and an expected rise in their traits that measurement will correct.",
      clothedNow: "Clothed this season",
      k1: (country: string) => `The season's need in ${country} is met by as much as you gave.`,
      k2: (pct: string, place: string) => `${pct}% of ${place}'s need was met by your support.`,
      groupsIn: pluralOf({ one: "{1} group in {2}", other: "{1} groups in {2}" }),
      clothedOf8: "Clothed, out of 8 in the group",
      k3: "The whole group receives its clothing on one day, with proof.",
      kBefore: "No clothing for the season",
      kNow: "A full set delivered",
      k4: "A garment, shoes and a winter coat, with no photo or location of the child.",
      members: "Children",
      sessionsOf: "Sessions",
      funding: "Funding",
      fundedFull: "Fully funded",
      fundedWait: "Awaiting funding",
      source: "Source",
      afterMeasure: "After measurement",
      moved: "The group was measured after its six sessions; this is how its levels moved.",
      pending:
        "Your support funded the group; its six sessions begin on the operating platform, and its move between levels shows after the closing measurement.",
      childMoved: (from: string, to: string, code: string) =>
        `Moved from “${from}” to “${to}”. Code ${code}.`,
      childRose: (from: string, code: string) =>
        `At “${from}”, and their traits rose with the support. Code ${code}.`,
      childLater: (from: string, code: string) =>
        `Now at “${from}”; their traits are measured after the sixth session. Code ${code}.`,
      levelsLead: (region: string, last: string) =>
        `The same support, read at four levels: the country, then the ${region}, then the group, then the ${last}.`,
      noteEngine:
        "Sample figures, computed after your simulated support was recorded against them. These are not real results.",
      noteSim: (country: string) =>
        `${country}'s figures are sample data, not results, until its operating platform is connected.`,
    },
    done: {
      title: "Simulation complete: thank you",
      sub: (region: string, last: string) =>
        `This was a simulation: nothing was charged and no donation was recorded. Read its impact as real support will be read: the baseline, what happened, then the impact on the country, the ${region}, the group and the ${last}, then the details.`,
      support: "Your support (simulated)",
      invoice: "Sample invoice no.",
      summary: "The impact in summary",
      again: "Simulate again",
    },
    big: {
      title: "The impact of your support (simulated)",
      sub: (place: string, country: string) =>
        `In this simulation your support reached ${place} in ${country}. This is what it changed, before and after.`,
      subCountry: (country: string) =>
        `In this simulation your support reached ${country}. This is what it changed, before and after.`,
      sect: (country: string) => `What your support moved in ${country}`,
      funded: "Qualification funded",
      waiting: "Waiting for qualification",
      clothed: "Clothed",
      sponsored: "Sponsored",
      closer: (country: string, months: string, was: string) =>
        `With this support ${country} is closer to meeting its need: ${months} instead of ${was} at today's pace.`,
      warm: "This is how the impact of your real support will read: behind every figure, a child one step closer to what they are waiting for. Thank you.",
      note: "Everything on this panel is a simulation on sample data: nothing was charged, and these are not real results.",
      another: "Another country",
      hall: "Back to the hall",
      real: "Go to the real directory",
    },
    log: {
      emptyTitle: "Your impact",
      empty:
        "No support yet. Tap the globe, choose a country and try supporting it; the simulation's impact is recorded here at its four levels.",
      pick: "Choose a country",
      close: "Close",
      title: "This visit's record",
      sub: "Every gift you simulated on this visit, and its impact on the country, the region, the group and the child. None of it is a recorded donation.",
      item: (country: string, track: string, money: string) => `${country} · ${track} · ${money}`,
      line: (line: string, country: string) => `${line} · ${country}`,
    },
    kinds: {
      title: "Three kinds of support",
      sub: "Each kind is read at four levels. This is what you see at each level after you give. Unit prices are sample figures.",
      level: "Level",
      rows: {
        country: {
          name: "Country",
          qualify: "Share funded, children waiting and time to close the gap",
          sponsor: "Children sponsored in the country",
          kiswa: "Children clothed this season",
        },
        region: {
          name: "Region",
          qualify: "Its waiting children and the share of its need qualified",
          sponsor: "Those sponsored and those still without a sponsor",
          kiswa: "The share of the season's need met",
        },
        group: {
          name: "Group",
          qualify: "Six sessions, the trait average and the move between levels",
          sponsor: "Those sponsored among its eight children",
          kiswa: "The whole group clothed, with proof",
        },
        child: {
          name: "Child",
          qualify: "Their six traits before and after, and their level",
          sponsor: "A fixed monthly amount, with their resilience and awareness",
          kiswa: "A full set of clothing, delivered",
        },
      },
      go: "Choose a country and try",
    },
  },
});

export type HallLive = ReturnType<typeof hallLive>;

type Named = { ar: string; en: string };

/**
 * what the scene is handed for the live hall: its strings, the one currency its sample amounts
 * are written in, and the names of the sample regions, traits and people in the interface
 * language. Arabic reads the Arabic names; every other language reads the Latin ones.
 */
export function hallLive(locale: Locale) {
  const copy = copyOf(HALL_LIVE_COPY, locale);
  const lang: "ar" | "en" = locale === "ar" ? "ar" : "en";
  const pick = (n: Named | null | undefined) => (n ? n[lang] : null);
  return {
    locale,
    lang,
    dir: dirOf(locale),
    copy,
    /** the platform's unified currency: one currency for every sample amount in the hall */
    currency: UNIFIED_CURRENCY,
    money: (amount: number) => formatMoney(amount, UNIFIED_CURRENCY, locale),
    pick,
    /** a sample region's name: Albania's cities by their own names, the rest numbered */
    regionName: (r: Pick<Region, "id" | "ar" | "en">) => {
      const n = /-r(\d+)$/.exec(r.id);
      return n ? copy.region(n[1]!) : r[lang];
    },
    /** the six traits of the vision demo, by name in this language: [name, before, after] */
    traits: DEMO_TRAITS.map((t) => [t.name[lang], t.before, t.after] as [string, number, number]),
  };
}
