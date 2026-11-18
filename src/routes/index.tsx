import { VisionTeaser } from "@/components/vision/VisionTeaser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Eye,
  Aperture,
  ShieldCheck,
  Building2,
  ArrowLeft,
  FileCheck2,
  Stamp,
  LineChart,
  ScrollText,
  HeartHandshake,
  Sprout,
  Package,
  type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { Button } from "@/components/ui/button";
import { getPlatformStats } from "@/lib/orphans.functions";
import { listPrograms, type PublicProgram } from "@/lib/programs.functions";
import { formatMoney, formatMoneyTotals } from "@/lib/format";
import type { PlatformStats } from "@/lib/orphans.functions";
import { BRAND, brandFor } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { StatTile } from "@/components/kit/StatTile";
import { type MapLayer, parseLayer } from "@/components/map/layers";
import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { MapActions } from "@/components/map/MapActions";
import { useMapStats } from "@/components/map/useMapStats";
import { geoQuery } from "@/lib/geo";
import { NetworkSection } from "@/components/map/NetworkSection";
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
    const [stats, catalogue] = await Promise.all([getPlatformStats(), listPrograms()]);
    return { stats, programs: catalogue.programs as PublicProgram[] };
  },
});

const COPY = defineCopy("routes/index", {
  ar: {
    title: (brand: string) => `${brand} — عبورٌ باليتيم من شطّ الفقد إلى شطّ العمران`,
    description:
      "لا نقدّم رعاية مؤقتة بل نبني نظم عمران. ملف موثّق من جهة رعاية مرخّصة، واعتماد إداري، ودعمٌ شهري بحسب احتياج الطفل يُسجَّل تسليمه بمستند، وتقارير أثر دورية.",
    ladder: [
      [
        "الدراية",
        "أن ترى الصورة",
        "ملف موثّق من جهة رعاية معتمدة يختصر أزمة كاملة في صورة واحدة تصدمك وتخلق إطاراً ذهنياً جديداً.",
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
        "هنا تعمل المنصّة. جهة رعاية مرخّصة توثّق الملف، والإدارة تعتمده، ثم كفالة شهرية تُصرَف على احتياج الطفل المعلَن، ويُسجَّل تسليمها بمستندٍ تراه.",
      ],
      [
        "شطّ العمران",
        "شابٌّ يقرأ ويتعلّم حرفة ويعمل. لم يعد متلقّياً بل صار قادراً — وهذا وحده مقياس نجاحنا.",
      ],
    ],
    custody: [
      [
        "جهة رعاية مرخّصة",
        "لا يُنشئ الملفَّ فردٌ. تُراجَع الجهة وتُعتمد أولاً، وتبقى مسؤولةً عن صحّة البيانات وتحديثها.",
      ],
      [
        "وثائق تُرفَع وتُدقَّق",
        "شهادة الوفاة وإثبات الولاية والسجلّ الدراسي والتقرير الطبّي. كل وثيقة تُوسم مدقَّقةً باسم من دقّقها ووقتِه.",
      ],
      [
        "اعتماد إداري صريح",
        "لا يُنشر ملف إلا بقرار اعتماد. والرفض يحمل سبباً مُرمَّزاً، فالقرار مُساءَل لا مُبهَم.",
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
    lead: "نعبر باليتيم من شطّ الفقد إلى شطّ العمران: ملفٌّ توثّقه جهة رعاية مرخّصة، وتعتمده الإدارة، ثم كفالة شهرية تُصرَف على احتياجه المعلَن ويُسجَّل تسليمها بمستند — ويعود إليك أثرها تقريراً.",
    supportNow: "ادعم الآن",
    browse: "تصفّح ملفات الأيتام",
    hadithMeaning: null as string | null,
    hadithSource: "رواه البخاري (6005) عن سهل بن سعد رضي الله عنه",
    numbersH: "أرقام المنصّة اليوم",
    numbersP: "محسوبة من الملفات المعتمدة لحظةَ فتحك الصفحة — لا أرقاماً مكتوبةً في التصميم.",
    stats: ["ملف معتمد", "مكفول بالكامل", "مبالغ الكفالة الشهرية", "الاحتياج الشهري الكلي"],
    startReal: "ابدأ من ملفٍّ حقيقي",
    partners: "جهات الرعاية الشريكة",
    proofH: "المنصّة اليوم",
    proofOffices: "دول فيها مكتبٌ مؤكَّد للندوة",
    proofField: "دول بنشاطٍ ميداني موثّق",
    proofFiles: "ملفات معتمدة على المنصّة",
    proofFull: "مكفولون بالكامل",
    proofSource:
      "حضور الندوة من بياناتٍ بحثية عامّة بمصادرها (2024–2026)، وأعداد الملفات محسوبة لحظة فتحك الصفحة.",
    mapH: "أين نعمل",
    mapP: "شبكة الندوة العالمية للشباب الإسلامي كما وثّقتها المصادر العامّة. بدّل الطبقة لترى من ينتظر كافلاً، أو أين تحتاج الندوة مكتباً.",
    crossingH: "شطّان ومضيق",
    crossingP:
      "الشعار ليس زخرفة: كفّان تحتضنان طفلاً، ويعلوهما قوسان متجاوران — ذهبيٌّ وأخضر — كالإصبعين في الحديث. الكافل واليتيم متجاوران، والرعاية تحتضن ولا تحجب.",
    childH: "اليتيم عندنا شخصٌ لا «حالة»",
    childP1:
      "الملفّ في المنصّة ليس نداء استعطاف. هو سجلّ مُدقَّق لطفلٍ له اسم ومدرسة ومدينة واحتياج مُحدَّد بالرقم — لأن ما لا يُقاس لا يُتابَع، وما لا يُتابَع لا يتغيّر.",
    childP2:
      "ولذلك نكتب الاحتياج الشهري صريحاً، ونعرض ما غُطّي منه وما بقي، ونُسمّي البرنامج الذي يُصرَف عليه المال. الكافل شريكٌ في نظام، لا متبرّعٌ في صندوق.",
    dignityH: "الكرامة قيدٌ في الكود لا وعدٌ في الصفحة",
    dignity: [
      "لا تُنشر صورة وجهٍ لملفٍّ في حالة الاحتياج ما لم تُوثَّق موافقة مصوّرة على النشر.",
      "الصور المؤلمة تُعالَج أحاديةَ اللون بلا وجه، والصور الملهمة وحدها تُعرض بلونها الكامل — والسجلّ يُشتقّ من حالة الملف آلياً، لا يختاره من يرفع الصورة.",
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
      "We don't offer temporary care; we build systems that let children thrive. A file verified by a licensed care organization, administrative approval, need-based monthly support whose delivery is recorded with a document, and regular impact reports.",
    ladder: [
      [
        "Awareness",
        "Seeing the picture",
        "A verified file from an approved care organization captures a whole crisis in one picture — it moves you and reframes how you see it.",
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
        "This is where the platform works. A licensed care organization documents the file, the administration approves it, then a monthly sponsorship is spent on the child's stated needs, and each delivery is recorded with a document you can see.",
      ],
      [
        "The shore of thriving",
        "A young person who reads, learns a trade and works. No longer a recipient but capable — and that alone is how we measure success.",
      ],
    ],
    custody: [
      [
        "A licensed care organization",
        "No individual creates a file. The organization is reviewed and approved first, and stays responsible for the data being accurate and up to date.",
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
    lead: "We carry the orphan from the shore of loss to the shore of thriving: a file documented by a licensed care organization and approved by the administration, then a monthly sponsorship spent on the child's stated needs, with each delivery recorded by a document — and the impact comes back to you as a report.",
    supportNow: "Support now",
    browse: "Browse children's files",
    hadithMeaning:
      "“I and the one who sponsors an orphan will be in Paradise like this,” and he gestured with his index and middle fingers, slightly apart.",
    hadithSource: "Sahih al-Bukhari 6005, narrated by Sahl ibn Sa‘d",
    numbersH: "The platform today",
    numbersP:
      "Calculated from approved files the moment you open this page — not numbers written into the design.",
    stats: ["Approved files", "Fully sponsored", "Monthly sponsorship", "Total monthly need"],
    startReal: "Start with a real file",
    partners: "Partner care organizations",
    proofH: "The platform today",
    proofOffices: "countries with a confirmed WAMY office",
    proofField: "countries with documented field activity",
    proofFiles: "approved files on the platform",
    proofFull: "fully sponsored",
    proofSource:
      "WAMY's presence comes from sourced public research (2024–2026); file counts are calculated the moment you open this page.",
    mapH: "Where we work",
    mapP: "The World Assembly of Muslim Youth network as documented in public sources. Switch the layer to see who is waiting for a sponsor, or where WAMY needs an office.",
    crossingH: "Two shores and a strait",
    crossingP:
      "The logo isn't decoration: two palms holding a child, beneath two neighboring arcs — gold and green — like the two fingers in the hadith. Sponsor and orphan side by side; care that holds without hiding.",
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
// (`bg-${tone}`) لا يُولَّد. لذلك تُذكر الأصناف كاملةً هنا لكل مرتبة.
/**
 * مراتب الوعي — سلّم المانح كما تعرّفه الاستراتيجية البصرية للعمران:
 * «الانتقال بالمانح من مجرد الدراية (رؤية الصورة) إلى التعقل (الالتزام بالنظام)».
 * فالمراحل ليست خطوات إجرائية بل انتقالات في وعي الكافل.
 */
const AWARENESS_LADDER = [
  {
    icon: Eye,
    bar: "bg-shore-need",
    chip: "bg-shore-need/12 text-shore-need",
    label: "text-shore-need",
  },
  // الأرضية تبقى بحرارة البرتقالي، أما الأيقونة فوقها فتُصبّ بالذهبي الداكن:
  // البرتقالي يبلغ 2.1:1 على الأبيض ولا يستوفي 3:1 المطلوبة للعناصر غير النصّية.
  {
    icon: Aperture,
    bar: "bg-bridge-bright",
    chip: "bg-bridge-bright/12 text-bridge-ink",
    label: "text-bridge-ink",
  },
  {
    icon: ShieldCheck,
    bar: "bg-bridge",
    chip: "bg-bridge/12 text-bridge-ink",
    label: "text-bridge-ink",
  },
  {
    icon: Building2,
    bar: "bg-shore-thrive",
    chip: "bg-shore-thrive/12 text-shore-thrive",
    label: "text-shore-thrive",
  },
];

/** «اختر أثرك» — الأيقونة والوجهة لكل مسار؛ الأسماء في config/giving-tracks. */
const TRACK_DOOR: Record<
  GivingTrack,
  { icon: LucideIcon; tone: string; glow: string; kind?: "qualification" | "in_kind" }
> = {
  qualification: {
    icon: Sprout,
    tone: "bg-shore-thrive/12 text-shore-thrive",
    glow: "from-shore-thrive/70 via-shore-thrive/25 to-transparent [--glow:var(--color-shore-thrive)]",
    kind: "qualification",
  },
  // الكفالة تبدأ من طفلٍ بعينه في الدليل؛ والمساران الآخران من «ادعم» بنوعهما.
  monthly: {
    icon: HeartHandshake,
    tone: "bg-primary/10 text-primary",
    glow: "from-primary/70 via-primary/25 to-transparent [--glow:var(--color-primary)]",
  },
  in_kind: {
    icon: Package,
    tone: "bg-bridge/15 text-bridge-ink",
    glow: "from-bridge/80 via-bridge/30 to-transparent [--glow:var(--color-bridge)]",
    kind: "in_kind",
  },
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
const CROSSING = [
  { tone: "text-shore-need", dot: "bg-shore-need" },
  { tone: "text-bridge-ink", dot: "bg-bridge" },
  { tone: "text-shore-thrive", dot: "bg-shore-thrive" },
];

/** كيف يصير الملفّ منشوراً — سلسلة التوثيق كما تفرضها القاعدة لا كما تُوصف. */
const CUSTODY = [Building2, FileCheck2, Stamp, LineChart];

function HomePage() {
  const { data } = useSuspenseQuery(homeQuery);
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
  const proof = [
    { value: String(NETWORK_COUNTS.offices), label: c.proofOffices },
    { value: String(NETWORK_COUNTS.field), label: c.proofField },
    // أعداد المنصّة الحيّة: إن تعذّرت لا تُعرض، فلا «صفر» ولا رقمٌ مختلَق.
    ...(data.stats
      ? [
          { value: String(data.stats.totalOrphans), label: c.proofFiles },
          { value: String(data.stats.fullySponsored), label: c.proofFull },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/* ── الهيرو أوّلاً (UI-06/UX-18): الهوية، والوعد، والفعلان، والدليل ── */}
        <section className="surface-crossing relative overflow-hidden border-b border-border/70">
          <BrandPattern density="active" className="text-gold-line" opacity={0.08} tile={104} />
          <div aria-hidden="true" className="blob -top-24 -right-16 size-80 bg-primary/10" />
          <div
            aria-hidden="true"
            className="blob top-1/3 -left-24 size-96 bg-bridge/12 [animation-delay:-6s]"
          />
          <div
            aria-hidden="true"
            className="blob -bottom-24 right-1/3 size-72 bg-primary/8 [animation-delay:-12s]"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-10 text-center md:pt-14 md:pb-12">
            <div className="flex flex-col items-center">
              <KahataynMark className="h-16 w-auto md:h-20" title={c.logo(brand.name)} />
              <p className="mt-3 font-serif text-2xl font-bold text-primary md:text-3xl">
                {brand.name}
              </p>
              <p className="mt-1 text-sm font-medium text-bridge-ink">{brand.tagline}</p>
            </div>
            <h1 className="mx-auto mt-7 max-w-4xl text-[2rem] leading-[1.3] font-extrabold md:text-[2.5rem] lg:text-5xl lg:leading-[1.25]">
              {c.h1a}
              <br />
              {c.h1b}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              {c.lead}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/orphans">
                  {c.browse}
                  <ArrowLeft className="size-4 ltr:-scale-x-100" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-background/70">
                <Link to="/support">{c.supportNow}</Link>
              </Button>
            </div>

            {/* شريط الدليل: أرقامٌ حقيقية فقط — بيانات الندوة البحثية وأعداد المنصّة الحيّة. */}
            <section aria-labelledby="proof-heading" className="mx-auto mt-10 max-w-4xl">
              <h2 id="proof-heading" className="sr-only">
                {c.proofH}
              </h2>
              <dl
                className={
                  proof.length === 4
                    ? "grid grid-cols-2 overflow-hidden rounded-2xl bg-card/85 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_24px_-12px_rgb(0_0_0/0.18)] backdrop-blur md:grid-cols-4"
                    : "grid grid-cols-2 overflow-hidden rounded-2xl bg-card/85 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_24px_-12px_rgb(0_0_0/0.18)] backdrop-blur"
                }
              >
                {proof.map((item, i) => (
                  <div
                    key={item.label}
                    className={
                      "flex flex-col gap-1 px-4 py-4 md:py-5 " +
                      (i % 2 === 1 ? "border-s border-border/70 " : "") +
                      (i >= 2 ? "border-t border-border/70 md:border-t-0 " : "") +
                      (i === 2 && proof.length === 4 ? "md:border-s" : "")
                    }
                  >
                    <dt className="text-sm leading-6 text-muted-foreground">{item.label}</dt>
                    <dd className="order-first text-3xl font-extrabold text-primary tabular-nums">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mx-auto mt-3 max-w-2xl text-xs leading-6 text-muted-foreground">
                {c.proofSource}
              </p>
            </section>
          </div>
        </section>

        {/* ── اختر أثرك: المسارات الثلاثة بأسمائها من config/giving-tracks ── */}
        <section
          className="reveal-scroll mx-auto max-w-6xl px-4 py-14 md:py-16"
          aria-labelledby="tracks-heading"
        >
          <h2 id="tracks-heading" className="text-[1.75rem] leading-tight font-extrabold">
            {g.heading}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">{g.lead}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {GIVING_TRACKS.map((key) => {
              const door = TRACK_DOOR[key];
              const t = g.tracks[key];
              return (
                <Link
                  key={key}
                  {...(door.kind
                    ? { to: "/support" as const, search: { kind: door.kind } }
                    : { to: "/orphans" as const })}
                  className="reveal group relative isolate flex flex-col overflow-hidden lift rounded-3xl border border-border bg-card p-6 shadow-soft hover:border-primary/40 active:scale-[0.99]"
                >
                  {/* توقيع المسار: خيطٌ بلونه أعلى البطاقة، ووهجٌ خافت يشتدّ عند المرور. */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-6 top-0 h-px bg-gradient-to-l ${door.glow}`}
                  />
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute -top-24 -z-10 size-56 rounded-full opacity-[0.07] blur-3xl transition-opacity duration-500 group-hover:opacity-[0.16] start-[-3rem] bg-[var(--glow)] ${door.glow.split(" ").at(-1)}`}
                  />
                  <span
                    className={`flex size-12 items-center justify-center rounded-2xl ring-1 ring-current/10 transition-transform duration-300 ease-[var(--ease-out)] group-hover:-translate-y-0.5 ${door.tone}`}
                  >
                    <door.icon className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{t.name}</h3>
                  <p className="mt-2 flex-1 text-base leading-8 text-muted-foreground">
                    {t.promise}
                  </p>
                  <span className="mt-5 inline-flex min-h-11 items-center gap-1 text-base font-bold text-primary">
                    {t.cta}
                    <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:-scale-x-100 ltr:group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>

          {/* «هكذا» اسم إشارة إلى حركة يد؛ حذفُها يترك اللفظ بلا مشارٍ إليه. */}
          <blockquote className="mx-auto mt-14 max-w-xl text-center">
            {/* النصّ النبوي بلفظه العربي دائماً، ومعناه بالإنجليزية تحته. */}
            <p className="font-quran text-xl leading-10 text-shore-need" lang="ar" dir="rtl">
              «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى وفرَّجَ بينهما شيئاً.
            </p>
            {c.hadithMeaning && (
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.hadithMeaning}</p>
            )}
            <cite className="mt-2 block text-xs text-muted-foreground not-italic">
              {c.hadithSource}
            </cite>
          </blockquote>
        </section>

        {/* ── منصة الرؤية والتوجهات: تجربةٌ حيّة بلا حساب ── */}
        <VisionTeaser />

        {/* ── الخارطة تحت الهيرو: «الشبكة» افتراضياً ── */}
        <section
          id="map"
          aria-labelledby="map-heading"
          className="scroll-mt-16 border-t border-border/70"
        >
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-4">
            <h2 id="map-heading" className="text-[1.75rem] leading-tight font-extrabold">
              {c.mapH}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">{c.mapP}</p>
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
        <NetworkSection
          onPick={(code) => {
            void navigate({
              search: { c: code, layer: "needs" },
              resetScroll: false,
              viewTransition: false,
            });
            document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />

        {/* ── الأرقام ── */}
        <section className="reveal-scroll border-t border-border/70 bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="numbers-heading">
            <h2 id="numbers-heading" className="text-2xl font-extrabold">
              {c.numbersH}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{c.numbersP}</p>
            <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 [&>*]:reveal">
              <StatTile
                label={c.stats[0]!}
                value={data.stats ? String(data.stats.totalOrphans) : "—"}
              />
              <StatTile
                label={c.stats[1]!}
                value={data.stats ? String(data.stats.fullySponsored) : "—"}
              />
              <StatTile
                label={c.stats[2]!}
                value={moneyLine(data.stats, "monthlyFunded", locale)}
              />
              <StatTile label={c.stats[3]!} value={moneyLine(data.stats, "monthlyNeed", locale)} />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/orphans">
                  {c.startReal}
                  <ArrowLeft className="ltr:-scale-x-100 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/organizations">{c.partners}</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ── الشطّان والمضيق ── */}
        <section
          className="reveal-scroll mx-auto max-w-6xl px-4 py-16"
          aria-labelledby="crossing-heading"
        >
          <h2 id="crossing-heading" className="text-2xl font-extrabold">
            {c.crossingH}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{c.crossingP}</p>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {CROSSING.map((stage, i) => (
              <li key={i} className="rounded-2xl border border-border bg-card p-6 md:p-7">
                <span className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${stage.dot}`} aria-hidden="true" />
                  <span className={`text-sm font-bold ${stage.tone}`}>{c.crossing[i]![0]}</span>
                </span>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{c.crossing[i]![1]}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── من هو اليتيم عندنا ── */}
        <section className="reveal-scroll border-y border-border/70 bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="child-heading">
            <div className="grid gap-10 md:grid-cols-[1fr_0.85fr]">
              <div>
                <h2 id="child-heading" className="text-2xl font-extrabold">
                  {c.childH}
                </h2>
                <div className="mt-4 space-y-4 text-sm leading-8 text-muted-foreground">
                  <p>{c.childP1}</p>
                  <p>{c.childP2}</p>
                </div>
              </div>

              <aside className="rounded-2xl border border-shore-need/25 bg-background p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-shore-need/12 text-shore-need">
                  <ScrollText className="size-5" />
                </span>
                <h3 className="mt-4 font-bold">{c.dignityH}</h3>
                <ul className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                  {c.dignity.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>

        {/* ── مراتب الوعي ── */}
        <section
          className="reveal-scroll mx-auto max-w-6xl px-4 py-16"
          aria-labelledby="ladder-heading"
        >
          <h2 id="ladder-heading" className="text-2xl font-extrabold">
            {c.ladderH}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{c.ladderP}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AWARENESS_LADDER.map((step, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-2xl border border-border bg-card p-5"
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[3px] ${step.bar}`}
                  aria-hidden="true"
                />
                <span
                  className={`flex size-10 items-center justify-center rounded-xl ${step.chip}`}
                >
                  <step.icon className="size-5" />
                </span>
                <p className={`mt-4 text-xs font-bold ${step.label}`}>{c.ladder[i]![0]}</p>
                <h3 className="mt-1 font-bold">{c.ladder[i]![1]}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.ladder[i]![2]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ما يشتريه الكافل: البرامج ── */}
        {data.programs.length > 0 && (
          <section className="reveal-scroll border-y border-border/70 bg-secondary/30">
            <div className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="programs-heading">
              <h2 id="programs-heading" className="text-2xl font-extrabold">
                {c.programsH}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                {c.programsP}
              </p>

              {/* المعادلة الحاكمة — تُذكر لأنها تحكم التصميم لا لأنها شعار. */}
              <figure className="mt-6 max-w-2xl rounded-2xl border border-bridge/30 bg-background p-5">
                <blockquote className="text-center text-base leading-9 font-bold md:text-lg">
                  {c.eqLabel} <span className="text-shore-need">{c.eqA}</span> +{" "}
                  <span className="text-shore-thrive">{c.eqB}</span>
                </blockquote>
                <figcaption className="mt-3 text-center text-xs leading-6 text-muted-foreground">
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
              <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.programs.map((program) => (
                  <li
                    key={program.id}
                    className={
                      program.kind === "qualification"
                        ? "flex flex-col rounded-2xl border-2 border-shore-thrive/35 bg-card p-5"
                        : "flex flex-col rounded-2xl border border-border bg-card p-5"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold">{program.title}</h3>
                      {/* الذهبي خطّاً لا أرضيةً تحت نصّ: على أرضية bg-bridge/12 يهبط
                          bridge-ink إلى 4.34:1، ويستوفي 4.77:1 على أرضية البطاقة. */}
                      <span
                        className={
                          program.kind === "qualification"
                            ? "shrink-0 rounded-full border border-shore-thrive/45 px-2.5 py-1 text-xs font-medium text-shore-thrive"
                            : "shrink-0 rounded-full border border-bridge/40 px-2.5 py-1 text-xs font-medium text-bridge-ink"
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
          </section>
        )}

        {/* ── سلسلة التوثيق ── */}
        <section
          className="reveal-scroll mx-auto max-w-6xl px-4 py-16"
          aria-labelledby="custody-heading"
        >
          <h2 id="custody-heading" className="text-2xl font-extrabold">
            {c.custodyH}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{c.custodyP}</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CUSTODY.map((Icon, i) => (
              <li key={i} className="rounded-2xl border border-border bg-card p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-shore-thrive/12 text-shore-thrive">
                  <Icon className="size-5" />
                </span>
                <p className="mt-4 text-xs font-bold text-muted-foreground">{c.ordinals[i]}</p>
                <h3 className="mt-1 font-bold">{c.custody[i]![0]}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.custody[i]![1]}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** المبلغ لكلّ عملةٍ على حدة (UX-07)؛ وبلا تقسيمٍ بالعملة «—» لا رقمٌ بعملةٍ مفترضة. */
function moneyLine(
  stats: PlatformStats | null,
  key: "monthlyFunded" | "monthlyNeed",
  locale: string,
) {
  if (!stats || stats.byCurrency.length === 0) return "—";
  return formatMoneyTotals(
    stats.byCurrency.map((r) => ({ currency: r.currency, amount: r[key] })),
    stats.byCurrency[0]!.currency,
    locale,
  );
}
