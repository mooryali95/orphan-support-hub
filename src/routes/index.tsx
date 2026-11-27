import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  ArrowLeft,
  FlaskConical,
  FileCheck2,
  Stamp,
  LineChart,
  ScrollText,
  HeartHandshake,
  Sprout,
  Package,
  type LucideIcon,
  Box,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { Button } from "@/components/ui/button";
import { getPlatformStats } from "@/lib/orphans.functions";
import { listPrograms, type PublicProgram } from "@/lib/programs.functions";
import { formatMoney, formatMoneyTotals } from "@/lib/format";
import type { PlatformStats } from "@/lib/orphans.functions";
import { PartnerPlate } from "@/components/brand/PartnerPlate";
import { hallEntryHref, isTrial, showTrialLink } from "@/config/platform";
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";
import { enterDemo } from "@/lib/demo-mode";
import { brandFor } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { CountUp } from "@/components/motion/CountUp";
import { useInView } from "@/lib/motion/use-in-view";
import { type MapLayer, parseLayer } from "@/components/map/layers";
import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { MapActions } from "@/components/map/MapActions";
import { useMapStats } from "@/components/map/useMapStats";
import { geoQuery } from "@/lib/geo";
import { kindCounts, networkPaint } from "@/components/map/network-layer";

// دول الشبكة الظاهرة للزوّار — نفسها قائمة دعم التأهيل (countries.in_network).
const HOME_SUPPORTABLE: ReadonlySet<string> = new Set(networkPaint("network").keys());
import { GIVING_TRACKS, type GivingTrack, useGivingCopy } from "@/config/giving-tracks";
import { useAuth } from "@/hooks/useAuth";

/**
 * الصفحة الأولى تفتح على شبكة الندوة الحقيقية (بيانات بحثية بمصادرها) بدل
 * المكاتب التجريبية؛ وطبقات أعداد المنصّة على بُعد ضغطة.
 */
const HOME_LAYER: MapLayer = "network";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: async () => {
    // على الخادم: لا ننتظر قاعدة البيانات بلا حدّ. إن تأخّرت تُرسم الصفحة بلا
    // أعداد (كما تُرسم عند التعذّر) ثم يعيد المتصفّح الجلب بهدوء.
    const late = typeof window === "undefined" ? within(HOME_WAIT_MS) : null;
    const both = Promise.all([getPlatformStats(), listPrograms()]);
    const got = late ? await Promise.race([both, late]) : await both;
    if (!got) return { stats: null, programs: [] as PublicProgram[], partial: true };
    const [stats, catalogue] = got;
    return { stats, programs: catalogue.programs as PublicProgram[], partial: false };
  },
});

const HOME_WAIT_MS = 2500;
const within = (ms: number) => new Promise<null>((done) => setTimeout(() => done(null), ms));

const COPY = defineCopy("routes/index", {
  ar: {
    title: (brand: string) => `${brand} — عبورٌ باليتيم من شطّ الفقد إلى شطّ العمران`,
    description:
      "لا نقدّم رعايةً مؤقّتة بل نبني نظم عمران: ملفٌّ يوثّقه مكتبٌ للندوة أو شريكٌ ميداني لها، واعتمادٌ إداري، وثلاثة مساراتٍ للعطاء يُسجَّل تسليمها بمستند، وتقارير أثرٍ دورية.",
    ladder: [
      [
        "الدراية",
        "أن ترى الصورة",
        "ملفّ يوثّقه مكتبٌ للندوة أو شريكٌ ميداني لها يختصر أزمة كاملة في صورة واحدة تصدمك وتخلق إطاراً ذهنياً جديداً.",
      ],
      [
        "الميقات",
        "اللحظة الفاصلة",
        "اللحظة التي يجتمع فيها الزمان والمكان والفاعل، فتختار من تكفل وينزل المفهوم إلى الواقع.",
      ],
      [
        "التعقل",
        "الالتزام بالنظام",
        "لا تبرّع عابر بل كفالة شهرية شفافة: تعهّد مستمر تراه في كل دفعة وكل تقرير.",
      ],
      [
        "العمران",
        "من الهامش إلى المركز",
        "تقارير أثر دورية عن التعليم والصحة والمعيشة، حتى يصبح اليتيم قوة فاعلة في مجتمعه.",
      ],
    ],
    crossing: [
      [
        "شطّ الفقد",
        "طفلٌ فقد عائله. لا ينقصه العطف بل ينقصه نظامٌ يحمله: مدرسة تُدفع رسومها، وعلاج يُتابَع، وبيت لا يُهدَّد.",
      ],
      [
        "المضيق",
        "هنا تعمل المنصّة. مكاتب الندوة وشركاؤها الميدانيون يوثّقون الملفّ، والإدارة تعتمده، ثم كفالة شهرية تُصرَف على احتياج الطفل المعلَن، ويُسجَّل تسليمها بمستندٍ تراه.",
      ],
      [
        "شطّ العمران",
        "شابٌّ يقرأ ويتعلّم حرفة ويعمل. لم يعد متلقّياً بل صار قادراً — وهذا وحده مقياس نجاحنا.",
      ],
    ],
    custody: [
      [
        "مكاتب الندوة وشركاؤها الميدانيون",
        "لا يُنشئ الملفَّ فردٌ، بل جهة ميدانية تعمل تحت مظلّة الندوة: تراجعها إدارة المنصّة وتعتمدها أولاً، وتبقى مسؤولةً عن صحّة البيانات وتحديثها.",
      ],
      [
        "وثائق تُرفَع وتُدقَّق",
        "شهادة الوفاة وإثبات الولاية والسجلّ الدراسي والتقرير الطبّي. كل وثيقة تُوسم مدقَّقةً باسم من دقّقها ووقتِه.",
      ],
      [
        "اعتماد إداري صريح",
        "لا يُنشر ملفّ إلا بقرار اعتماد. والرفض يحمل سبباً مُرمَّزاً، فالقرار مُساءَل لا مُبهَم.",
      ],
      [
        "أثرٌ يُنشر دورياً",
        "تقارير عن التعليم والصحة والمعيشة تمرّ بمراجعة الإدارة قبل نشرها للكافل.",
      ],
    ],
    // أرقام هندية عربية: خلطُها بالأرقام اللاتينية في نصٍّ عربي شذوذٌ بصري.
    ordinals: ["1", "2", "3", "4"],
    categories: {
      education: "تعليم",
      rehabilitation: "تأهيل",
      psychosocial: "دعم نفسي",
      health: "صحّة",
      essentials: "معيشة",
    } as Record<string, string>,
    logo: (brand: string) => `شعار ${brand}`,
    h1a: "لا نقدّم رعايةً مؤقّتة،",
    h1b: "بل نبني نظم عمران",
    lead: "نعبر باليتيم من شطّ الفقد إلى شطّ العمران: ملفٌّ موثّق، واعتمادٌ إداري، وعطاءٌ يُسلَّم بمستند — ويعود إليك أثرُه تقريراً.",
    supportNow: "ادعم الآن",
    hallHero: "ادخل قاعة الأثر",
    hallEyebrow: "قاعة الأثر · ثلاثية الأبعاد",
    hallH: "العالم كما يتحرّك به عطاؤك",
    hallP:
      "اختر دولةً من شبكة الندوة، ثم نوع العطاء ومقداره، وشاهد الأثر يتغيّر أمامك حتى الطفل — المكان نفسه الذي على الخريطة، بمنظرٍ آخر.",
    hallCta: "ادخل القاعة",
    hallNote: "تجربةٌ ببياناتٍ نموذجية، بلا حسابٍ ولا خصم.",
    hallNoteLive: "شبكة الندوة حقيقية، وأرقام الدعم فيها محاكاة — بلا حسابٍ ولا خصم.",
    tryIt: "ادخل التجربة — بلا حساب ولا خصم",
    sponsor: "اكفل يتيمًا",
    hadithMeaning: null as string | null,
    hadithSource: "رواه البخاري (6005) عن سهل بن سعد رضي الله عنه",
    moneyFunded: "مبالغ الكفالة الشهرية",
    moneyNeed: "الاحتياج الشهري الكلي",
    impactH: "ما يعود إليك",
    impactP:
      "كل دفعةٍ يُسجَّل تسليمها بمستندٍ تراه، وتقارير أثرٍ دورية عن التعليم والصحة والمعيشة تراجعها الإدارة قبل أن تصلك.",
    closeH: "من هنا جاء الاسم",
    startReal: "ابدأ من ملفٍّ حقيقي",
    partners: "مكاتب الندوة وشركاؤها الميدانيون",
    proofH: "المنصّة اليوم",
    proofOffices: "دول فيها مكتبٌ مؤكَّد للندوة",
    proofField: "دول بنشاطٍ ميداني موثّق",
    proofFiles: "ملفات معتمدة على المنصّة",
    proofFull: "مكفولون بالكامل",
    launching: "قيد الإطلاق",
    proofSource:
      "مكاتب الندوة ونشاطها الميداني هنا من مصادر عامّة موثّقة (2024–2026) بانتظار السجلّ الرسمي، وأعداد الملفات محسوبة لحظة فتحك الصفحة.",
    mapH: "أين نعمل",
    mapP: "شبكة الندوة العالمية للشباب الإسلامي؛ مواقع مكاتبها هنا من مصادر عامّة بانتظار السجلّ الرسمي. بدّل الطبقة لترى من ينتظر كافلاً، أو أين تحتاج الندوة مكتباً.",
    crossingH: "شطّان ومضيق",
    childH: "اليتيم عندنا شخصٌ لا «حالة»",
    childP1:
      "الملفّ في المنصّة ليس نداء استعطاف. هو سجلّ مُدقَّق لطفلٍ له اسم ومدرسة ومدينة واحتياج مُحدَّد بالرقم — لأن ما لا يُقاس لا يُتابَع، وما لا يُتابَع لا يتغيّر.",
    childP2:
      "ولذلك نكتب الاحتياج الشهري صريحاً، ونعرض ما غُطّي منه وما بقي، ونُسمّي البرنامج الذي يُصرَف عليه المال. الكافل شريكٌ في نظام، لا متبرّعٌ في صندوق.",
    dignityH: "الكرامة قيدٌ في الكود لا وعدٌ في الصفحة",
    dignity: [
      "لا تُنشر صورة وجهٍ لملفٍّ في حالة الاحتياج ما لم تُوثَّق موافقة مصوّرة على النشر.",
      "الصور المؤلمة تُعالَج أحاديةَ اللون بلا وجه، والصور الملهمة وحدها تُعرض بلونها الكامل — والسجلّ يُشتقّ من حالة الملفّ آلياً، لا يختاره من يرفع الصورة.",
      "البيانات الحسّاسة — الوثائق والعناوين — لا يراها الزائر أبداً.",
    ],
    ladderH: "مراتب الوعي: من الدراية إلى العمران",
    ladderP:
      "رحلة الكافل ليست خطوات إجرائية، بل انتقالات في الوعي — من رؤية الصورة إلى الالتزام بالنظام.",
    programsH: "الكفالة بناء أهلية، لا سدُّ احتياج",
    programsP:
      "ننقل العمل من منطق الرعاية إلى منطق البناء: لا نسدّ حاجة شهر، بل نكوّن قابليةً تُنتج الفعل ذاتياً بعد أن ينتهي تدخّلنا.",
    eqLabel: "الأهلية = القدرة على",
    eqA: "تفهّم الخطاب",
    eqB: "اكتساب الفعل",
    eqCaption:
      "تفهّم الخطاب: أن يدرك ما يُطلب منه ومسؤوليته تجاهه. واكتساب الفعل: أن يصير قادراً على إنتاج أفعالٍ جديدة متزايدة، لا أن يؤدّي فعلاً مرّة.",
    programsP2: [
      "ولذلك يبدأ كل برنامج من ",
      "المفهوم",
      " لا من النشاط: يُعلَّم المفهوم فيُشغّل ",
      "سمةً",
      "، فتُنتج السمة أفعالاً، ثم يُقاس التحوّل. والخدمات أدناه مدخلاتٌ في هذا النظام لا غاياتٍ بذاتها.",
    ],
    qualification: "بناء أهلية",
    perMonth: " / شهرياً",
    months: (n: number) => `${n} شهراً`,
    custodyH: "كيف يصير الملفّ جديراً بالثقة",
    custodyP:
      "الثقة لا تُطلب بالكلام. هذه السلسلة مفروضة في قاعدة البيانات نفسها: ما لا يجتازها لا يُنشر.",
  },
  en: {
    title: (brand: string) =>
      `${brand} — Carrying the orphan from the shore of loss to the shore of thriving`,
    description:
      "We don't offer temporary care; we build systems that let children thrive. A file documented by a WAMY office or field partner, administrative approval, need-based monthly support whose delivery is recorded with a document, and regular impact reports.",
    ladder: [
      [
        "Awareness",
        "Seeing the picture",
        "A file documented by a WAMY office or field partner captures a whole crisis in one picture — it moves you and reframes how you see it.",
      ],
      [
        "The moment",
        "The decisive moment",
        "When time, place and person meet: you choose whom to sponsor, and the idea becomes real.",
      ],
      [
        "Reasoned commitment",
        "Committing to a system",
        "Not a passing donation but a transparent monthly sponsorship: an ongoing commitment you can see in every payment and every report.",
      ],
      [
        "Thriving",
        "From the margins to the center",
        "Regular impact reports on education, health and living conditions, until the orphan becomes an active force in their community.",
      ],
    ],
    crossing: [
      [
        "The shore of loss",
        "A child who has lost their provider. What they lack isn't compassion but a system to carry them: school fees paid, treatment followed up, a home that isn't under threat.",
      ],
      [
        "The strait",
        "This is where the platform works. WAMY's offices and field partners document the file, the administration approves it, then a monthly sponsorship is spent on the child's stated needs, and each delivery is recorded with a document you can see.",
      ],
      [
        "The shore of thriving",
        "A young person who reads, learns a trade and works. No longer a recipient but capable — and that alone is how we measure success.",
      ],
    ],
    custody: [
      [
        "WAMY's offices and field partners",
        "No individual creates a file. A field organization working under WAMY's umbrella does: the platform's administration reviews and approves it first, and it stays responsible for the data being accurate and up to date.",
      ],
      [
        "Documents uploaded and checked",
        "Death certificate, proof of guardianship, school record and medical report. Each document is marked as checked, with who checked it and when.",
      ],
      [
        "Explicit administrative approval",
        "No file is published without an approval decision. A rejection carries a coded reason, so every decision is accountable.",
      ],
      [
        "Impact published regularly",
        "Reports on education, health and living conditions are reviewed by the administration before sponsors see them.",
      ],
    ],
    ordinals: ["1", "2", "3", "4"],
    categories: {
      education: "Education",
      rehabilitation: "Rehabilitation",
      psychosocial: "Psychosocial support",
      health: "Health",
      essentials: "Essentials",
    } as Record<string, string>,
    logo: (brand: string) => `${brand} logo`,
    h1a: "We don't offer temporary care —",
    h1b: "we build systems for thriving",
    lead: "We carry the orphan from the shore of loss to the shore of thriving: a file documented by a WAMY office or field partner and approved by the administration, then a monthly sponsorship spent on the child's stated needs, with each delivery recorded by a document — and the impact comes back to you as a report.",
    supportNow: "Support now",
    hallHero: "Enter the impact hall",
    hallEyebrow: "The impact hall · 3D",
    hallH: "The world as your giving moves it",
    hallP:
      "Enter the hall, choose a country in WAMY's network, then the kind and amount of giving, and watch the impact change on the country, the region, the group and the child. The same place as on the map, from another view.",
    hallCta: "Enter the hall",
    hallNote: "A walkthrough on sample data, with no account and nothing charged.",
    hallNoteLive:
      "WAMY's network is real; the support figures inside are simulated — no account, nothing charged.",
    tryIt: "Enter the demo — no account, nothing charged",
    sponsor: "Sponsor an orphan",
    hadithMeaning:
      "“I and the one who sponsors an orphan will be in Paradise like this,” and he gestured with his index and middle fingers, slightly apart.",
    hadithSource: "Sahih al-Bukhari 6005, narrated by Sahl ibn Sa‘d",
    moneyFunded: "Monthly sponsorship",
    moneyNeed: "Total monthly need",
    impactH: "What comes back to you",
    impactP:
      "Each delivery is recorded with a document you can see, and regular impact reports on education, health and living conditions are reviewed by the administration before they reach you.",
    closeH: "Where the name comes from",
    startReal: "Start with a real file",
    partners: "WAMY's offices and field partners",
    proofH: "The platform today",
    proofOffices: "countries with a confirmed WAMY office",
    proofField: "countries with documented field activity",
    proofFiles: "approved files on the platform",
    proofFull: "fully sponsored",
    launching: "Launching soon",
    proofSource:
      "WAMY's offices and field activity shown here come from cited public sources (2024–2026), pending the official register; file counts are calculated the moment you open this page.",
    mapH: "Where we work",
    mapP: "The World Assembly of Muslim Youth network; office locations shown are from public sources pending the official register. Switch the layer to see who is waiting for a sponsor, or where WAMY needs an office.",
    crossingH: "Two shores and a strait",
    childH: "Here, an orphan is a person, not a “case”",
    childP1:
      "A file on the platform isn't an appeal for pity. It's a verified record of a child with a name, a school, a city and a need stated in numbers — because what isn't measured isn't followed, and what isn't followed doesn't change.",
    childP2:
      "That's why we state the monthly need plainly, show what has been covered and what remains, and name the program the money is spent on. A sponsor is a partner in a system, not a donor to a fund.",
    dignityH: "Dignity is a rule in the code, not a promise on the page",
    dignity: [
      "No face photo is published for a child in need unless written consent to publish has been documented.",
      "Painful photos are shown in monochrome without faces; only uplifting photos appear in full color — and that choice is derived automatically from the file's status, not picked by whoever uploads the photo.",
      "Sensitive data — documents and addresses — is never visible to visitors.",
    ],
    ladderH: "Stages of awareness: from seeing to thriving",
    ladderP:
      "A sponsor's journey isn't a set of procedural steps but shifts in awareness — from seeing the picture to committing to the system.",
    programsH: "Sponsorship builds capability, not just covers needs",
    programsP:
      "We move from a logic of care to a logic of building: not covering one month's need, but forming a capability that keeps producing action after our intervention ends.",
    eqLabel: "Capability = the ability to",
    eqA: "understand what is asked",
    eqB: "acquire action",
    eqCaption:
      "Understanding what is asked: grasping what is expected and one's responsibility toward it. Acquiring action: becoming able to produce new and growing actions, not performing an action once.",
    programsP2: [
      "So every program starts from a ",
      "concept",
      ", not an activity: the concept is taught, it activates a ",
      "trait",
      ", the trait produces actions, and then the change is measured. The services below are inputs to this system, not ends in themselves.",
    ],
    qualification: "Capability building",
    perMonth: " / month",
    months: (n: number) => `${n} months`,
    custodyH: "How a file earns trust",
    custodyP:
      "Trust isn't asked for with words. This chain is enforced in the database itself: whatever doesn't pass it isn't published.",
  },
});

const layerSearchOf = (raw: unknown): { layer?: MapLayer } => {
  const layer = parseLayer(raw);
  return layer ? { layer } : {};
};

export const Route = createFileRoute("/")({
  // موضع الخارطة في الرابط: يُشارَك، ويعيده زرّ الرجوع.
  validateSearch: (raw: Record<string, unknown>): { c?: string; r?: string; layer?: MapLayer } => ({
    ...(typeof raw["c"] === "string" && /^[A-Z]{2}$/.test(raw["c"]) ? { c: raw["c"] } : {}),
    ...(typeof raw["r"] === "string" && raw["r"] ? { r: raw["r"] } : {}),
    ...layerSearchOf(raw["layer"]),
  }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [
        { title: c.title(brandFor(l).name) },
        { name: "description", content: c.description },
        { property: "og:title", content: c.title(brandFor(l).name) },
        { property: "og:description", content: c.description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  loader: async ({ context }) => {
    // يبدأ جلب أعداد الخارطة مبكراً ولا يُنتظر: إلى أن تصل يُرسم هيكلٌ بلا
    // أرقام (لا أرقامٌ تجريبية — ARC-11).
    void context.queryClient.prefetchQuery(geoQuery);
    return context.queryClient.ensureQueryData(homeQuery);
  },
  component: HomePage,
});

// Tailwind يستخرج الأصناف نصياً من المصدر، فأي صنف يُركَّب في وقت التشغيل
// (`bg-${tone}`) لا يُولَّد. لذلك تُذكر الأصناف كاملةً هنا لكل مرتبة. اللون نقطةٌ صغيرة
// بجانب اسم المرتبة لا شريطٌ ولا أرضية: المعنى يبقى، والصفحة تبقى محايدة.
/**
 * مراتب الوعي — سلّم المانح كما تعرّفه الاستراتيجية البصرية للعمران:
 * «الانتقال بالمانح من مجرد الدراية (رؤية الصورة) إلى التعقل (الالتزام بالنظام)».
 * فالمراحل ليست خطوات إجرائية بل انتقالات في وعي الكافل.
 */
const AWARENESS_LADDER = [
  { dot: "bg-shore-need" },
  { dot: "bg-bridge-bright" },
  { dot: "bg-bridge" },
  { dot: "bg-shore-thrive" },
];

/** «اختر أثرك» — الأيقونة والوجهة لكل مسار؛ الأسماء في config/giving-tracks. */
const TRACK_DOOR: Record<
  GivingTrack,
  { icon: LucideIcon; tone: string; kind?: "qualification" | "in_kind" }
> = {
  qualification: { icon: Sprout, tone: "text-shore-thrive", kind: "qualification" },
  // الكفالة تبدأ من طفلٍ بعينه في الدليل؛ والمساران الآخران من «ادعم» بنوعهما.
  monthly: { icon: HeartHandshake, tone: "text-primary" },
  in_kind: { icon: Package, tone: "text-bridge-ink", kind: "in_kind" },
};

/**
 * حضور الندوة من بياناتها البحثية (data/wamy-network) لا رقماً مكتوباً: دولٌ
 * فيها مكتبٌ مؤكَّد (والمقرّ منها)، ودولٌ بنشاطٍ ميداني بلا مكتب. غير المؤكَّد
 * لا يُعدّ.
 */
const NETWORK_COUNTS = (() => {
  const k = kindCounts(networkPaint("network"));
  return { offices: k.hq + k.office, field: k.field };
})();

/** الشطّان والمضيق — الاستعارة الحاكمة للهوية، لا صورة بلاغية. */
const CROSSING = [{ dot: "bg-shore-need" }, { dot: "bg-bridge" }, { dot: "bg-shore-thrive" }];

/** كيف يصير الملفّ منشوراً — سلسلة التوثيق كما تفرضها القاعدة لا كما تُوصف. */
const CUSTODY = [Building2, FileCheck2, Stamp, LineChart];

function HomePage() {
  const { data, refetch } = useSuspenseQuery(homeQuery);
  useEffect(() => {
    if (data.partial) void refetch();
  }, [data.partial, refetch]);
  const locale = useLocale();
  const c = useCopy(COPY);
  const brand = brandFor(locale);
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const selection: MapSelection = { country: sp.c ?? null, region: sp.r ?? null };
  const { stats, demo, status } = useMapStats();
  const { isAdmin } = useAuth();
  // الطبقة تبقى في الرابط عبر التنقّل، والافتراضية لا تُكتب فيه.
  const layerSearch = sp.layer && sp.layer !== HOME_LAYER ? { layer: sp.layer } : {};
  const onSelect = (s: MapSelection) =>
    void navigate({
      search: {
        ...(s.country ? { c: s.country } : {}),
        ...(s.region ? { r: s.region } : {}),
        ...layerSearch,
      },
      resetScroll: false,
      viewTransition: false,
    });
  const onLayer = (layer: MapLayer) =>
    void navigate({
      search: (prev) => {
        const { layer: _old, ...rest } = prev;
        return layer === HOME_LAYER ? rest : { ...rest, layer };
      },
      replace: true,
      resetScroll: false,
      viewTransition: false,
    });

  const g = useGivingCopy();
  // قبل أوّل ملفٍّ معتمد لا تُعرض أصفار: «قيد الإطلاق» صادقةٌ ولا توحي بمنصّةٍ مهجورة.
  const launching = data.stats?.totalOrphans === 0;
  const proof: Array<{ value: number; label: string; launch?: boolean }> = [
    { value: NETWORK_COUNTS.offices, label: c.proofOffices },
    { value: NETWORK_COUNTS.field, label: c.proofField },
    // أعداد المنصّة الحيّة: إن تعذّرت لا تُعرض، فلا «صفر» ولا رقمٌ مختلَق.
    ...(data.stats
      ? [
          { value: data.stats.totalOrphans, label: c.proofFiles, launch: launching },
          { value: data.stats.fullySponsored, label: c.proofFull, launch: launching },
        ]
      : []),
  ];
  const funded = moneyLine(data.stats, "monthlyFunded", locale);
  const need = moneyLine(data.stats, "monthlyNeed", locale);
  const money =
    funded && need
      ? [
          { label: c.moneyFunded, value: funded },
          { label: c.moneyNeed, value: need },
        ]
      : null;

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/* ── 1 · من نحن ومع مَن: الهوية، والوعد، والفعلان، والشريك، والدليل بالأرقام ── */}
        <section className="surface-crossing relative overflow-hidden border-b border-border/70">
          <BrandPattern density="watermark" className="text-gold-line" opacity={0.08} tile={132} />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-12 text-center md:pt-20 md:pb-16 lg:pt-24">
            <div className="lg:grid lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:gap-16 lg:text-start">
              <div>
                {/* the lockup is already in the header just above; here the tagline alone opens the page */}
                <p className="eyebrow">{brand.tagline}</p>
                {/* whose platform this is, from the one brand source */}
                <p className="mt-2 text-sm font-medium text-muted-foreground" data-brand-owner>
                  {brand.ownerLine}
                </p>
                <h1 className="mx-auto mt-6 max-w-4xl text-[2.25rem] leading-[1.4] font-bold md:text-5xl md:leading-[1.35] lg:mx-0 lg:leading-[1.3] rtl:lg:text-[3.75rem] ltr:lg:leading-[1.2]">
                  {c.h1a}
                  <br />
                  {c.h1b}
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg md:leading-9 lg:mx-0">
                  {c.lead}
                </p>
                {/* الفعل الأوّل كفالة طفلٍ من الدليل؛ والتجربة بابٌ ثانٍ ما دامت مفعّلة (src/config/platform.ts). */}
                {/* two buttons and a line of quiet links: three equal buttons wrapped and left the last alone */}
                <div className="mt-9 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
                  {/* the one primary act is sponsoring a real child; the trial stays a secondary door
                      (behind TRIAL_ENABLED through trialRoute, so trial removal drops it) */}
                  <Button asChild size="lg">
                    <Link to="/orphans">
                      {c.sponsor}
                      <ArrowLeft className="size-4 ltr:-scale-x-100" />
                    </Link>
                  </Button>
                  {(isTrial() || showTrialLink()) && (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal bg-background/70 py-2 text-center"
                    >
                      <Link to={trialRoute("/try")} onClick={enterDemo}>
                        <FlaskConical className="size-4" aria-hidden="true" />
                        {c.tryIt}
                      </Link>
                    </Button>
                  )}
                  {/* the two quiet links share one line of their own, aligned with the buttons' edge */}
                  <div className="flex basis-full flex-wrap items-center justify-center gap-x-1 lg:justify-start">
                    <Link
                      to="/support"
                      className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-[6px] transition-colors hover:decoration-primary"
                    >
                      {c.supportNow}
                    </Link>
                    {/* القاعة ثلاثية الأبعاد: رابطٌ عاديّ — المشهد يُحمَّل عند الدخول وحده */}
                    <a
                      href={hallEntryHref()}
                      data-to-hall
                      className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-bold text-bridge-ink underline decoration-bridge/40 underline-offset-[6px] transition-colors hover:decoration-bridge"
                    >
                      <Box className="size-4" aria-hidden="true" />
                      {c.hallHero}
                    </a>
                  </div>
                </div>
              </div>
              <PartnerPlate className="mx-auto mt-12 w-full max-w-xs lg:mx-0 lg:mt-0 lg:max-w-sm lg:justify-self-end" />
            </div>

            {/* شريط الدليل: أرقامٌ حقيقية فقط — بيانات الندوة البحثية وأعداد المنصّة الحيّة. */}
            {/* a ledger line, not a card: two hairlines and large display numerals */}
            <section aria-labelledby="proof-heading" className="mx-auto mt-14 max-w-5xl md:mt-20">
              <h2 id="proof-heading" className="sr-only">
                {c.proofH}
              </h2>
              <dl
                className={
                  proof.length === 4
                    ? "grid grid-cols-2 border-y border-border md:grid-cols-4"
                    : "mx-auto grid max-w-3xl grid-cols-2 border-y border-border"
                }
              >
                {proof.map((item, i) => (
                  <div
                    key={item.label}
                    className={
                      "flex flex-col items-center gap-3 px-4 py-7 text-center md:py-9 " +
                      (i % 2 === 1 ? "border-s border-border " : "") +
                      (i >= 2 ? "border-t border-border md:border-t-0 " : "") +
                      (i === 2 && proof.length === 4 ? "md:border-s" : "")
                    }
                  >
                    <dt className="max-w-[14rem] text-sm leading-6 text-muted-foreground">
                      {item.label}
                    </dt>
                    {item.launch ? (
                      <dd className="order-first flex min-h-[3.75rem] items-center text-2xl font-bold text-primary md:min-h-[4.5rem] md:text-3xl">
                        {c.launching}
                      </dd>
                    ) : (
                      <dd className="numeral order-first text-5xl text-primary md:text-6xl">
                        <CountUp value={item.value} />
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
              {/* المبالغ لكلّ عملةٍ على حدة (UX-07): سطرٌ هادئ تحت الشريط، ولا يُعرض إن تعذّرت الأعداد. */}
              {money && (
                <dl className="mx-auto mt-5 flex max-w-3xl flex-wrap items-baseline justify-center gap-x-8 gap-y-2 text-sm">
                  {money.map((m) => (
                    <div key={m.label} className="flex flex-wrap items-baseline gap-x-2">
                      <dt className="text-muted-foreground">{m.label}</dt>
                      <dd className="font-bold tabular-nums">{m.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mx-auto mt-4 max-w-2xl text-xs leading-6 text-muted-foreground">
                {c.proofSource}
              </p>
            </section>
          </div>
        </section>

        {/* ── 2 · طرق العطاء: المسارات الثلاثة بأسمائها من config/giving-tracks، ثم ما يشتريه العطاء ── */}
        <section
          className="reveal-scroll mx-auto max-w-6xl px-4 py-20 md:py-28"
          aria-labelledby="tracks-heading"
        >
          <h2 id="tracks-heading" className="heading-section">
            {g.heading}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{g.lead}</p>
          {/* three doors in one frame, parted by hairlines: equal weight, no card stack */}
          <div className="mt-10 grid divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
            {GIVING_TRACKS.map((key) => {
              const door = TRACK_DOOR[key];
              const t = g.tracks[key];
              return (
                <Link
                  key={key}
                  {...(door.kind
                    ? { to: "/support" as const, search: { kind: door.kind } }
                    : { to: "/orphans" as const })}
                  className="group flex flex-col p-7 transition-colors duration-200 hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none md:p-9"
                >
                  <door.icon
                    className={`size-7 ${door.tone}`}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <h3 className="mt-6 text-xl font-bold">{t.name}</h3>
                  <p className="mt-2 flex-1 text-base leading-8 text-muted-foreground">
                    {t.promise}
                  </p>
                  <span className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-base font-bold text-primary">
                    {t.cta}
                    <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-1 ltr:-scale-x-100 ltr:group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>

          {/* ما يشتريه الكافل: البرامج — تحت الأبواب لأنها جواب «على ماذا يُصرَف؟» */}
          {data.programs.length > 0 && (
            <div className="mt-16 border-t border-border pt-12 md:mt-20 md:pt-14">
              <h3 id="programs-heading" className="heading-sub">
                {c.programsH}
              </h3>
              <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">
                {c.programsP}
              </p>

              {/* المعادلة الحاكمة — تُذكر لأنها تحكم التصميم لا لأنها شعار. */}
              <figure className="mt-8 max-w-2xl border-s-2 border-primary/30 ps-6">
                <blockquote className="text-base leading-9 font-bold md:text-lg">
                  {c.eqLabel} <span className="text-shore-need">{c.eqA}</span> +{" "}
                  <span className="text-shore-thrive">{c.eqB}</span>
                </blockquote>
                <figcaption className="mt-2 text-sm leading-7 text-muted-foreground">
                  {c.eqCaption}
                </figcaption>
              </figure>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground">
                {c.programsP2[0]}
                <strong>{c.programsP2[1]}</strong>
                {c.programsP2[2]}
                <strong>{c.programsP2[3]}</strong>
                {c.programsP2[4]}
              </p>
              <ul
                className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-labelledby="programs-heading"
              >
                {data.programs.map((program) => (
                  <li
                    key={program.id}
                    className={
                      program.kind === "qualification"
                        ? "flex flex-col rounded-2xl border border-shore-thrive/50 bg-card p-6"
                        : "flex flex-col rounded-2xl border border-border bg-card p-6"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-bold">{program.title}</h4>
                      {/* the category is a neutral hairline chip; only «بناء أهلية» keeps its green */}
                      <span
                        className={
                          program.kind === "qualification"
                            ? "shrink-0 rounded-full border border-shore-thrive/45 px-2.5 py-1 text-xs font-medium text-shore-thrive"
                            : "shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {program.kind === "qualification"
                          ? c.qualification
                          : (c.categories[program.category] ?? program.category)}
                      </span>
                    </div>
                    {program.summary && (
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {program.summary}
                      </p>
                    )}
                    <ul className="mt-3 space-y-1.5 text-xs leading-6 text-muted-foreground">
                      {program.deliverables.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span
                            className="mt-2 size-1 shrink-0 rounded-full bg-bridge"
                            aria-hidden="true"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 border-t border-border/70 pt-3 text-sm font-bold text-primary">
                      {formatMoney(program.monthly_price, program.currency, locale)}
                      <span className="font-normal text-muted-foreground">{c.perMonth}</span>
                      {program.duration_months && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {c.months(program.duration_months)}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── 3 · الثقة: سلسلة التوثيق، ثم ما يعنيه الملفّ وقيود الكرامة ── */}
        <section className="reveal-scroll border-y border-border/70 bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-24" aria-labelledby="custody-heading">
            <h2 id="custody-heading" className="heading-section">
              {c.custodyH}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{c.custodyP}</p>
            {/* a chain: one continuous hairline with a node at each link */}
            <ol className="mt-12 grid gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {CUSTODY.map((Icon, i) => (
                <li key={i} className="relative border-t border-border pe-8 pt-7">
                  <span
                    aria-hidden="true"
                    className="absolute -top-[5px] start-0 size-[9px] rounded-full bg-primary"
                  />
                  <span className="flex items-center gap-3">
                    <span className="numeral text-3xl text-primary">{c.ordinals[i]}</span>
                    <Icon
                      className="size-5 text-muted-foreground"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{c.custody[i]![0]}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.custody[i]![1]}</p>
                </li>
              ))}
            </ol>

            <div className="mt-16 grid gap-12 border-t border-border pt-12 md:mt-20 md:grid-cols-[1fr_0.85fr] md:gap-16 md:pt-14">
              <div>
                <h3 className="heading-sub">{c.childH}</h3>
                <div className="mt-4 space-y-4 text-base leading-8 text-muted-foreground">
                  <p>{c.childP1}</p>
                  <p>{c.childP2}</p>
                </div>
                <Link
                  to="/organizations"
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-[6px] transition-colors hover:decoration-primary"
                >
                  {c.partners}
                  <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                </Link>
              </div>

              <aside className="self-start rounded-2xl border border-border bg-card p-7 md:p-8">
                <ScrollText className="size-6 text-primary" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="mt-5 text-lg font-bold">{c.dignityH}</h3>
                <ul className="mt-4 divide-y divide-border text-sm leading-7 text-muted-foreground">
                  {c.dignity.map((line) => (
                    <li key={line} className="py-3 first:pt-0 last:pb-0">
                      {line}
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>

        {/* ── 4 · ما يعود إلى المانح: العبور الذي يموّله، ومراتبه هو من الدراية إلى العمران ── */}
        <section
          className="reveal-scroll mx-auto max-w-6xl px-4 py-20 md:py-24"
          aria-labelledby="impact-heading"
        >
          <h2 id="impact-heading" className="heading-section">
            {c.impactH}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{c.impactP}</p>

          {/* one band parted by hairlines; the colour of each shore is its dot, the words stay ink */}
          <h3 className="heading-sub mt-12">{c.crossingH}</h3>
          <ol className="mt-5 grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {CROSSING.map((stage, i) => (
              <li key={i} className="py-7 md:px-9 md:py-9 md:first:ps-0 md:last:pe-0">
                <span className="flex items-center gap-2.5">
                  <span className={`size-2.5 rounded-full ${stage.dot}`} aria-hidden="true" />
                  <span className="text-lg font-bold">{c.crossing[i]![0]}</span>
                </span>
                <p className="mt-3 text-[0.9375rem] leading-8 text-muted-foreground">
                  {c.crossing[i]![1]}
                </p>
              </li>
            ))}
          </ol>

          <h3 className="heading-sub mt-16 md:mt-20">{c.ladderH}</h3>
          <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">{c.ladderP}</p>
          {/* numbered columns on a hairline: the display numeral does the work the icon chips did */}
          <ol className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {AWARENESS_LADDER.map((step, i) => (
              <li key={i} className="border-t border-border pt-6">
                <span className="numeral block text-5xl text-primary/30" aria-hidden="true">
                  {c.ordinals[i]}
                </span>
                <p className="mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className={`size-2 rounded-full ${step.dot}`} aria-hidden="true" />
                  {c.ladder[i]![0]}
                </p>
                <h4 className="mt-1.5 text-lg font-bold">{c.ladder[i]![1]}</h4>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.ladder[i]![2]}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── دعوة القاعة: لوحةٌ بالألوان وحدها (لا مشهد ولا صورة)؛ القاعة تُحمَّل عند الدخول ── */}
        <section aria-labelledby="hall-invite" className="border-t border-border/70">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <div className="hall-invite relative overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground shadow-soft sm:px-12">
              <div
                aria-hidden="true"
                className="hall-invite-arches pointer-events-none absolute inset-0"
              />
              <div className="relative max-w-2xl">
                <p className="text-sm font-bold tracking-wide text-bridge-bright">
                  {c.hallEyebrow}
                </p>
                <h2
                  id="hall-invite"
                  className="mt-3 font-serif text-3xl leading-[1.35] font-bold sm:text-4xl"
                >
                  {c.hallH}
                </h2>
                <p className="mt-4 text-base leading-8 opacity-90">{c.hallP}</p>
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <a
                    href={hallEntryHref()}
                    data-to-hall
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-background px-7 text-base font-bold text-primary shadow-soft transition-transform active:scale-[0.97]"
                  >
                    <Box className="size-5" aria-hidden="true" />
                    {c.hallCta}
                  </a>
                  <span className="text-sm opacity-75">
                    {TRIAL_ENABLED ? c.hallNote : c.hallNoteLive}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5 · أين: الخارطة، «الشبكة» افتراضياً ── */}
        <section
          id="map"
          aria-labelledby="map-heading"
          className="scroll-mt-16 border-t border-border/70"
        >
          <div className="mx-auto max-w-6xl px-4 pt-20 pb-6 md:pt-24">
            <h2 id="map-heading" className="heading-section">
              {c.mapH}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{c.mapP}</p>
          </div>
          {/* أعداد المنصّة من مصدر الجغرافيا الواحد (geo_stats): هيكلٌ أثناء التحميل و«غير متاحة» عند التعذّر. */}
          <WorldMap
            stats={stats}
            selection={selection}
            onSelect={onSelect}
            layer={sp.layer ?? HOME_LAYER}
            onLayer={onLayer}
            demo={demo}
            status={status}
            showUnconfirmed={isAdmin}
            supportable={HOME_SUPPORTABLE}
            action={(ctx) => <MapActions ctx={ctx} />}
            className="h-[min(78dvh,760px)] min-h-[30rem]"
          />
        </section>

        {/* ── 6 · الختام: الحديث الذي منه الاسم — مرّةً واحدة في الصفحة — وفعلٌ واحد ── */}
        <section
          className="reveal-scroll border-t border-border/70"
          aria-labelledby="close-heading"
        >
          <div className="mx-auto max-w-5xl px-4 py-20 text-center md:py-28">
            <DrawnMark />
            <h2
              id="close-heading"
              className="eyebrow mt-7 after:h-px after:w-8 after:flex-none after:bg-bridge"
            >
              {c.closeH}
            </h2>
            {/* «هكذا» اسم إشارة إلى حركة يد؛ حذفُها يترك اللفظ بلا مشارٍ إليه. */}
            <blockquote className="mt-7">
              {/* النصّ النبوي بلفظه العربي دائماً، ومعناه بالإنجليزية تحته. */}
              <p
                className="font-quran text-[1.75rem] leading-[1.9] text-balance text-foreground md:text-[2.25rem] md:leading-[1.8]"
                lang="ar"
                dir="rtl"
              >
                «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى وفرَّجَ بينهما شيئاً.
              </p>
              {c.hadithMeaning && (
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                  {c.hadithMeaning}
                </p>
              )}
              <cite className="mt-4 block text-xs text-muted-foreground not-italic">
                {c.hadithSource}
              </cite>
            </blockquote>
            <span aria-hidden="true" className="rule-champagne mx-auto mt-10 block w-40" />
            {/* فعلٌ واحد، بحسب وضع المنصّة: التجربة قبل الاعتماد، والدليل بعده. */}
            <div className="mt-10">
              {isTrial() ? (
                <Button
                  asChild
                  size="lg"
                  className="h-auto min-h-11 whitespace-normal py-2 text-center"
                >
                  <Link to={trialRoute("/try")}>
                    <FlaskConical className="size-4" aria-hidden="true" />
                    {c.tryIt}
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link to="/orphans">
                    {c.startReal}
                    <ArrowLeft className="size-4 ltr:-scale-x-100" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter hadith={false} />
    </div>
  );
}

/** علامة المنتج فوق الحديث الذي منه اسمها: حلقتها ترسم نفسها مرّةً حين تُرى (‎.mo-draw). */
function DrawnMark() {
  const [ref, inView] = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className="mx-auto block size-16 md:size-20">
      <KahataynMark draw={inView} />
    </span>
  );
}

/** المبلغ لكلّ عملةٍ على حدة (UX-07)؛ وبلا تقسيمٍ بالعملة لا يُعرض شيء — لا رقمٌ بعملةٍ مفترضة. */
function moneyLine(
  stats: PlatformStats | null,
  key: "monthlyFunded" | "monthlyNeed",
  locale: string,
) {
  if (!stats || stats.byCurrency.length === 0) return null;
  return formatMoneyTotals(
    stats.byCurrency.map((r) => ({ currency: r.currency, amount: r[key] })),
    stats.byCurrency[0]!.currency,
    locale,
  );
}
