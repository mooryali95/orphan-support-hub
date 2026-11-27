/**
 * نصوص طبقتي الشبكة — مساحة اسمٍ واحدة (`components/map/NetworkLayer`) تُشارَك
 * بين الخريطة وبطاقتها وقسم «قرار التوسّع».
 */
import { countryName } from "@/lib/countries";
import { copyOf, defineCopy, type Locale, useLocale } from "@/lib/locale";
import { NETWORK_BY_CODE } from "@/lib/office-gap";

export const NETWORK_COPY = defineCopy("components/map/NetworkLayer", {
  ar: {
    layerNetwork: "الشبكة",
    layerNeeds: "تحتاج مكتباً",
    layerNetworkHint: "مكاتب الندوة العالمية للشباب الإسلامي ونشاطها الميداني الموثّق",
    layerNeedsHint: "دولٌ بلا مكتبٍ مؤكَّد مرتّبةً بحاجة الأيتام فيها",
    networkTitle: "شبكة الندوة العالمية للشباب الإسلامي",
    networkLine: (offices: string, field: string) =>
      `${offices} مكتباً بنشاطٍ موثّق من 2024 إلى 2026، ونشاطٌ ميداني في ${field} دول بلا مكتبٍ مؤكَّد.`,
    needsTitle: "أين تحتاج الندوة مكتباً؟",
    needsLine: (high: string, medium: string, data: string) =>
      `${high} دول أولويةً عالية، و${medium} متوسطة، و${data} تحتاج بيانات قبل الحكم.`,
    legend: "مفتاح الألوان",
    hq: "المقرّ الرئيسي",
    office: "مكتب مؤكَّد",
    field: "نشاط ميداني",
    unconfirmed: "غير مؤكَّد: للإدارة فقط",
    demo: "مكتب تجريبي: قيد المراجعة",
    high: "أولوية عالية",
    medium: "أولوية متوسطة",
    data: "تحتاج بيانات",
    covered: "فيها مكتب",
    research:
      "مواقع المكاتب والنشاط المعروضة مأخوذة من مصادر عامّة، إلى أن يصدر السجلّ الرسمي عن الأمانة العامة.",
    blockNeed: "الحاجة الوطنية",
    blockPresence: "حضور الندوة",
    blockPlatform: "على المنصّة الآن",
    blockWhy: "لماذا تحتاج مكتباً",
    noNeed: "لا مؤشّرات وطنية موثوقة لهذه الدولة في البحث بعد.",
    notInNetwork: "لا بيانات بحثية للندوة في هذه الدولة.",
    noPresence: "لا حضور مؤكَّداً للندوة حالياً.",
    noPresenceNote: "يُعرض الحضور متى أكّدته الأمانة العامة أو مصدرٌ مؤرَّخ حديث.",
    lastEvidence: (year: string) => `آخر دليلٍ وجده البحث: ${year}، وهو قديمٌ أو غير كافٍ للتأكيد.`,
    noEvidence: "لم يجد البحث دليلاً على مكتبٍ أو نشاط.",
    city: "المدينة",
    cityUnknown: "المدينة غير مؤكَّدة",
    latest: "آخر نشاطٍ موثّق",
    source: "المصدر",
    estimate: "تقديري",
    unverifiable: "تعذّر التحقّق",
    confHigh: "ثقة عالية",
    confMedium: "ثقة متوسطة",
    confLow: "ثقة منخفضة",
    derivedYears: (pop: string, rate: string) => `سكان ${pop} × نسبة ${rate}`,
    coverageLine: (n: string) => `الحاجة هنا: نحو ${n} يتيم، وللندوة مكتبٌ قائم.`,
    coverageNone: "للندوة مكتبٌ قائم هنا، ولا رقم وطنياً موثوقاً للأيتام بعد.",
    decision: "قرار التوسّع",
    decisionLead:
      "الدول التي ليس فيها مكتبٌ مؤكَّد، مرتّبةً بعدد الأيتام التقديري موزوناً بثقة الرقم (عالية 1، متوسطة 0.8، منخفضة 0.6). من لا رقم موثوقاً له لا يُخمَّن.",
    coverageTitle: "التغطية الحالية: الحاجة حيث للندوة مكتب",
    coverageLead: "دول المكاتب المؤكَّدة مرتّبةً بالحاجة نفسها، لقراءة الحضور أمام الحاجة.",
    coverageNoData: "لا رقم وطنياً موثوقاً بعد",
    coverageNoDataList: "مكاتب لا رقم وطنياً موثوقاً للأيتام في دولها بعد:",
    open: (name: string) => `افتح ${name} على الخريطة`,
    sources: "المصادر",
    sourcesLead: "رابطٌ لكلّ مؤشّر ولكلّ دليل حضور، كما وردت في البحث.",
    presenceSource: "دليل الحضور",
    sponsoredNote: (n: string, year: string) =>
      `آخر رقمٍ مؤكَّد لعدد الأيتام المكفولين لدى الندوة: ${n} (${year})، رقمٌ قديم يُذكر بسنته.`,
    officesH: "المكاتب والنشاط",
    countryButton: (name: string, kind: string) => `${name}: ${kind}. اضغط Enter للدخول`,
    ind_orphans_total: "الأيتام دون 18",
    ind_conflict_orphans: "فقدوا أحد الوالدين أو كليهما في الحرب",
    ind_orphan_rate_pct: "نسبة اليُتم بين الأطفال",
    ind_double_orphans: "فقدوا الوالدين معاً",
    ind_child_pop_u18: "الأطفال دون 18",
    ind_children_in_residential_care: "في الرعاية الإيوائية",
    ind_child_poverty_pct: "فقر الأطفال",
    ind_extreme_poverty_pct: "الفقر المدقع",
  },
  en: {
    layerNetwork: "Network",
    layerNeeds: "Needs an office",
    layerNetworkHint: "WAMY offices and documented field activity",
    layerNeedsHint: "Countries with no confirmed office, ranked by orphan need",
    networkTitle: "World Assembly of Muslim Youth network",
    networkLine: (offices: string, field: string) =>
      `${offices} offices with documented activity in 2024–2026, plus field activity in ${field} countries with no confirmed office.`,
    needsTitle: "Where does WAMY need an office?",
    needsLine: (high: string, medium: string, data: string) =>
      `${high} high-priority countries, ${medium} medium, and ${data} that need data before a decision.`,
    legend: "Colour key",
    hq: "Headquarters",
    office: "Confirmed office",
    field: "Field activity",
    unconfirmed: "Unconfirmed: admins only",
    demo: "Sample office: under review",
    high: "High priority",
    medium: "Medium priority",
    data: "Needs data",
    covered: "Has an office",
    research:
      "Office locations and activity shown here come from public sources, pending the official register from the General Secretariat.",
    blockNeed: "National need",
    blockPresence: "WAMY presence",
    blockPlatform: "On the platform now",
    blockWhy: "Why it needs an office",
    noNeed: "No reliable national indicators for this country in the research yet.",
    notInNetwork: "No WAMY research data for this country.",
    noPresence: "No confirmed WAMY presence at the moment.",
    noPresenceNote:
      "Presence is shown once the General Secretariat or a recent dated source confirms it.",
    lastEvidence: (year: string) =>
      `Latest evidence found: ${year}, which is too old or too thin to confirm.`,
    noEvidence: "The research found no evidence of an office or activity.",
    city: "City",
    cityUnknown: "City not confirmed",
    latest: "Latest documented activity",
    source: "Source",
    estimate: "Estimate",
    unverifiable: "Unverified",
    confHigh: "High confidence",
    confMedium: "Medium confidence",
    confLow: "Low confidence",
    derivedYears: (pop: string, rate: string) => `${pop} population × ${rate} rate`,
    coverageLine: (n: string) => `Need here: about ${n} orphans, and WAMY has an office.`,
    coverageNone: "WAMY has an office here; no reliable national orphan figure yet.",
    decision: "Expansion decision",
    decisionLead:
      "Countries with no confirmed office, ranked by estimated orphans weighted by confidence (high 1, medium 0.8, low 0.6). Countries without a reliable figure are not guessed.",
    coverageTitle: "Current coverage: need where WAMY has an office",
    coverageLead: "Confirmed-office countries ranked by the same need; presence against need.",
    coverageNoData: "No reliable national figure yet",
    coverageNoDataList: "Offices in countries with no reliable national orphan figure yet:",
    open: (name: string) => `Open ${name} on the map`,
    sources: "Sources",
    sourcesLead: "A link for every indicator and every piece of presence evidence, as researched.",
    presenceSource: "Presence evidence",
    sponsoredNote: (n: string, year: string) =>
      `Last confirmed number of orphans sponsored by WAMY: ${n} (${year}); an old figure, shown with its year.`,
    officesH: "Offices and activity",
    countryButton: (name: string, kind: string) => `${name}: ${kind}. Press Enter to open`,
    ind_orphans_total: "Orphans under 18",
    ind_conflict_orphans: "Lost one or both parents in the war",
    ind_orphan_rate_pct: "Share of children orphaned",
    ind_double_orphans: "Lost both parents",
    ind_child_pop_u18: "Children under 18",
    ind_children_in_residential_care: "In residential care",
    ind_child_poverty_pct: "Child poverty",
    ind_extreme_poverty_pct: "Extreme poverty",
  },
});

export const useNetworkCopy = () => copyOf(NETWORK_COPY, useLocale());
export const networkCopy = (locale: Locale) => copyOf(NETWORK_COPY, locale);

/**
 * أسماءٌ تختلف فيها بيانات ICU بين الخادم (Node) والمتصفّح فتُفسد الإماهة —
 * تُثبَّت هنا بالإنجليزية (Node: «Palestinian Territories»، Chromium: «Palestine»).
 */
const EN_FIXED: Record<string, string> = { PS: "Palestine" };

/** اسم الدولة بلغة الواجهة: العربية من البحث، وغيرها من Intl. */
export const nameOf = (code: string, locale: Locale) =>
  locale === "ar"
    ? (NETWORK_BY_CODE.get(code)?.nameAr ?? countryName(code, "ar"))
    : locale === "en" && EN_FIXED[code]
      ? EN_FIXED[code]
      : countryName(code, locale);
