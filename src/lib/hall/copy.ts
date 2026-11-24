/**
 * نصوص قاعة الأثر التي يكتبها المشهد نفسه (الشريط والتلميحات وشاشات القاعة ولوحة العالم)، بلغة
 * الواجهة. المشهد (`components/hall/hall-scene.js`) لا يكتب نصّاً من عنده: يأخذ هذه مع اللغة
 * والاتجاه واسم الدولة من `hallLocale`، كما يأخذ نصوص التجربة من `./trial` ونصوص القاعة
 * الحيّة (لوحات الدولة والدعم المحاكى والأثر) من `./live`.
 *
 * اسم الدولة من `countryName` وحدها (ما تقرؤه بقية المنصّة)، على الكرة وفي القوائم معاً؛
 * والأعداد بنظام أرقام المنصّة (`intlOf`).
 */
import { countryName } from "@/lib/countries";
import { copyOf, defineCopy, dirOf, intlOf, pluralOf, type Locale } from "@/lib/locale";

export const HALL_COPY = defineCopy("lib/hall/copy", {
  ar: {
    hall: "قاعة الأثر",
    focus: { off: "عرض المجسّم", on: "إظهار اللوحات" },
    sound: { off: "الصوت", on: "الصوت يعمل" },
    status: {
      hq: "المقرّ الرئيسي",
      office: "مكتب مؤكَّد",
      field: "نشاط ميداني",
      unconfirmed: "غير مؤكَّد — للإدارة فقط",
    },
    network: {
      title: "شبكة الندوة حول العالم",
      sites: (n: string) => `المقرّ في الرياض و${n} موقعاً مؤكَّد الحضور`,
      choose: (n: string) =>
        `المقرّ في الرياض و${n} موقعاً مؤكَّد الحضور، تختار منها أين يذهب دعمك.`,
      hq: "مقرّ رئيسي",
      offices: "مكتباً مؤكَّداً",
      field: "نشاطاً ميدانياً",
      touch: "المس الكرة أو هذه الشاشة لتختار دولتك على خريطة العالم",
      pick: "اختر دولة",
      pickLine: "المس دولةً على الكرة أو من القائمة، فتظهر صورتها وحالها هنا، ثم تدخلها.",
    },
    hint: {
      hall: "المس الكرة لتفتح خريطة العالم وتختار دولتك",
      hallAgain: (name: string) => `المس الكرة لتختار دولة، أو الشاشة لتعود إلى ${name}`,
      world: "اسحب لتدير العالم · المس دولةً لترى صورتها",
      screens: "اسحب يميناً ويساراً بين الشاشات · المس شاشة الأثر لتفاصيله",
    },
    band: (country: string, status: string, hall: string) => `${country} · ${status} · ${hall}`,
    perf: { low: "منخفضة (جوال)", high: "عالية", stepped: "مخفَّضة تلقائياً" },
    /* the browser took the 3D context away (GPU restart, low memory): said plainly, with a way on */
    lost: {
      title: "توقّف العرض ثلاثي الأبعاد",
      body: "أوقف المتصفّح الرسم ثلاثي الأبعاد في هذه الصفحة، وقد يحدث ذلك حين تقلّ ذاكرة الجهاز. لم يضع شيءٌ ممّا سجّلته. أعد تحميل القاعة، أو تابع في الصفحات.",
      reload: "أعد تحميل القاعة",
      mine: "تابع في «أثري»",
    },
    /* what an authenticated donor sees: their own figures, the dashboard's, and nothing simulated */
    donor: {
      tag: "أثرك الحقيقي",
      title: "أثرك حول العالم",
      sub: "هذه أرقام كفالاتك أنت كما في لوحتك: الأطفال الذين في رعايتك اليوم، وأشهر رعايتك، وحصّتك من حاجتهم الشهرية.",
      inCare: "طفلاً في رعايتك",
      months: "شهراً من الرعاية",
      share: "حصّتك من حاجتهم",
      countries: "دول كفالاتك",
      inCountry: pluralOf(
        {
          one: "طفلٌ واحد في رعايتك",
          two: "طفلان في رعايتك",
          few: "{0} أطفال في رعايتك",
          many: "{0} طفلاً في رعايتك",
          other: "{0} طفل في رعايتك",
        },
        0,
        "ar",
      ),
      monthsOf: pluralOf(
        { one: "شهر واحد", two: "شهران", few: "{0} أشهر", many: "{0} شهراً", other: "{0} شهر" },
        0,
        "ar",
      ),
      unplaced: pluralOf(
        {
          one: "طفلٌ واحد من أطفالك لا تنشر بطاقته دولته: هو في أرقامك وليس على الكرة.",
          two: "طفلان من أطفالك لا تنشر بطاقتاهما دولتيهما: هما في أرقامك وليسا على الكرة.",
          few: "{0} من أطفالك لا تنشر بطاقاتهم دولهم: هم في أرقامك وليسوا على الكرة.",
          many: "{0} من أطفالك لا تنشر بطاقاتهم دولهم: هم في أرقامك وليسوا على الكرة.",
          other: "{0} من أطفالك لا تنشر بطاقاتهم دولهم: هم في أرقامك وليسوا على الكرة.",
        },
        0,
        "ar",
      ),
      offGlobe: "خارج الدول المرسومة على كرة القاعة",
      offGlobeCard:
        "هذه الدولة ليست مرسومةً على كرة القاعة، فلا موضع لها تُدار الكرة إليه. أطفالك فيها مذكورون هنا.",
      card: (country: string) => `كفالاتك في ${country}`,
      childLine: (months: string, share: string) => `${months} · حصّتك ${share} من حاجته`,
      endedLine: (months: string) => `${months} · انتهت`,
      ended: "انتهت كفالاتك هنا",
      elsewhere: "لا كفالة لك في هذه الدولة. الدول المضيئة على الكرة هي دول كفالاتك.",
      open: "افتح ملفّه",
      dashboard: "إلى لوحتي",
      another: "اكفل يتيماً آخر",
      note: "أرقامك من سجلّ كفالاتك نفسه الذي تقرؤه لوحتك. لا محاكاة هنا ولا أرقام نموذجية.",
      emptyTitle: "لا كفالات لك بعد",
      empty:
        "حين تبدأ كفالتك الأولى يظهر أثرك هنا: دولتها مضيئةً على الكرة، وأرقامك كما في لوحتك. لا نعرض أرقاماً نموذجية على أنّها أرقامك.",
      start: "اكفل يتيماً",
      unavailable: "تعذّر تحميل أثرك الآن. أرقامك في لوحتك، ولا نعرض هنا بديلاً نموذجياً.",
      loading: "يُحمَّل أثرك…",
      hint: "اسحب لتدير العالم · الدول المضيئة دول كفالاتك",
      screenTitle: "أثرك حتى الآن",
      screenOpen: "المس الكرة لترى دول كفالاتك",
      kinds: "أنواع الدعم في المنصّة",
      kindsOpen: "المس الكرة لترى أثرك على خريطة العالم",
      back: "عودة إلى القاعة",
    },
  },
  en: {
    hall: "Impact Hall",
    focus: { off: "Scene only", on: "Show panels" },
    sound: { off: "Sound", on: "Sound on" },
    status: {
      hq: "Headquarters",
      office: "Confirmed office",
      field: "Field activity",
      unconfirmed: "Unconfirmed — staff only",
    },
    network: {
      title: "The WAMY network worldwide",
      sites: (n: string) => `Headquarters in Riyadh and ${n} sites of confirmed presence`,
      choose: (n: string) =>
        `Headquarters in Riyadh and ${n} sites of confirmed presence. Choose where your support goes.`,
      hq: "Headquarters",
      offices: "Confirmed offices",
      field: "Field sites",
      touch: "Tap the globe or this screen to choose your country",
      pick: "Choose a country",
      pickLine:
        "Tap a country on the globe or in the list to see its outline and how it stands, then enter it.",
    },
    hint: {
      hall: "Tap the globe to open the world map and choose your country",
      hallAgain: (name: string) =>
        `Tap the globe to choose a country, or the screen to return to ${name}`,
      world: "Drag to turn the world · tap a country to see it",
      screens: "Swipe left and right between the screens · tap the impact screen for details",
    },
    band: (country: string, status: string, hall: string) => `${country} · ${status} · ${hall}`,
    perf: { low: "Low (phone)", high: "High", stepped: "Lowered automatically" },
    lost: {
      title: "The 3D view has stopped",
      body: "The browser stopped 3D drawing on this page, which can happen when the device runs short of memory. Nothing you recorded is lost. Reload the hall, or carry on in the pages.",
      reload: "Reload the hall",
      mine: "Continue in My impact",
    },
    donor: {
      tag: "Your real impact",
      title: "Your impact around the world",
      sub: "These are your own sponsorship figures, exactly as on your dashboard: the children in your care today, your months of care, and your share of their monthly need.",
      inCare: "children in your care",
      months: "months of care",
      share: "your share of their need",
      countries: "Countries you sponsor in",
      inCountry: pluralOf({ one: "{0} child in your care", other: "{0} children in your care" }),
      monthsOf: pluralOf({ one: "{0} month", other: "{0} months" }),
      unplaced: pluralOf({
        one: "{0} of your children has no country on their public card: counted in your figures, not placed on the globe.",
        other:
          "{0} of your children have no country on their public card: counted in your figures, not placed on the globe.",
      }),
      offGlobe: "Not among the countries drawn on the hall's globe",
      offGlobeCard:
        "This country is not drawn on the hall's globe, so there is no marker to turn to. Your children there are listed here.",
      card: (country: string) => `Your sponsorships in ${country}`,
      childLine: (months: string, share: string) =>
        `${months} · your share is ${share} of the need`,
      endedLine: (months: string) => `${months} · ended`,
      ended: "Your sponsorships here have ended",
      elsewhere:
        "You have no sponsorship in this country. The countries lit on the globe are the ones you sponsor in.",
      open: "Open the file",
      dashboard: "To my dashboard",
      another: "Sponsor another child",
      note: "Your figures come from the same sponsorship record your dashboard reads. Nothing here is simulated or sample data.",
      emptyTitle: "No sponsorships yet",
      empty:
        "Once your first sponsorship begins, your impact appears here: its country lit on the globe, and your figures as on your dashboard. We do not show sample figures as if they were yours.",
      start: "Sponsor a child",
      unavailable:
        "Your impact could not be loaded just now. Your figures are on your dashboard; no sample data is shown in their place.",
      loading: "Loading your impact…",
      hint: "Drag to turn the world · the lit countries are the ones you sponsor in",
      screenTitle: "Your impact so far",
      screenOpen: "Tap the globe to see the countries you sponsor in",
      kinds: "Kinds of support on the platform",
      kindsOpen: "Tap the globe to see your impact on the world map",
      back: "Back to the hall",
    },
  },
});

export type HallLocale = ReturnType<typeof hallLocale>;

/** what the scene is handed about the language: its strings, direction, numbers and country names */
export function hallLocale(locale: Locale) {
  const number = new Intl.NumberFormat(intlOf(locale));
  return {
    locale,
    dir: dirOf(locale),
    copy: copyOf(HALL_COPY, locale),
    /** the one country name of the whole platform, on the globe and in the lists alike */
    countryName: (code: string) => countryName(code, locale),
    /** a whole number in the platform's own numerals (Latin digits in Arabic too) */
    count: (n: number) => number.format(Math.round(n)),
  };
}
