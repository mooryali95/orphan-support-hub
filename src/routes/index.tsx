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
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { Button } from "@/components/ui/button";
import { getPlatformStats } from "@/lib/orphans.functions";
import { listPrograms, type PublicProgram } from "@/lib/programs.functions";
import { formatMoney } from "@/lib/format";
import { BRAND, brandFor } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { StatTile } from "@/components/kit/StatTile";
import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { MapActions } from "@/components/map/MapActions";
import { useMapStats } from "@/components/map/useMapStats";
import { geoQuery } from "@/lib/geo";

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
      "لا نقدّم رعاية مؤقتة بل نبني نظم عمران. ملف موثّق من جهة رعاية مرخّصة، واعتماد إداري، وبرامج تعليم وتأهيل مسمّاة بمخرجاتها، وتقارير أثر دورية.",
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
    doors: [
      [
        "كفالة شهرية",
        "مبلغٌ ثابت كل شهر، ترى في جدولٍ واحد متى دُفع ومتى وصل الطفل موثّقاً.",
        "اختر من الدليل",
      ],
      ["بناء الأهلية", "تموّل رحلة تأهيلٍ بجلساتها، وتُقاس سماته قبلها وبعدها.", "ادعم التأهيل"],
      ["دعم عيني", "حقائب وكسوة وأجهزة، يجهّزها المكتب ويسلّمها ويوثّقها بالصور.", "ادعم عيناً"],
    ],
    crossing: [
      [
        "شطّ الفقد",
        "طفلٌ فقد عائله. لا ينقصه العطف بل ينقصه نظامٌ يحمله: مدرسة تُدفع رسومها، وعلاج يُتابَع، وبيت لا يُهدَّد.",
      ],
      [
        "المضيق",
        "هنا تعمل المنصّة. جهة رعاية مرخّصة توثّق الملف، والإدارة تعتمده، ثم كفالة شهرية تُصرَف على برامج مسمّاة لا على بندٍ مبهم.",
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
    ordinals: ["١", "٢", "٣", "٤"],
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
    lead: "نعبر باليتيم من شطّ الفقد إلى شطّ العمران: ملفٌّ توثّقه جهة رعاية مرخّصة، وتعتمده الإدارة، ثم كفالة شهرية تُصرَف على برامج مسمّاة بمخرجاتها — ويعود إليك أثرها تقريراً.",
    supportNow: "ادعم الآن",
    browse: "تصفّح ملفات الأيتام",
    hadithMeaning: null as string | null,
    hadithSource: "رواه البخاري (٦٠٠٥) عن سهل بن سعد رضي الله عنه",
    numbersH: "أرقام المنصّة اليوم",
    numbersP: "محسوبة من الملفات المعتمدة لحظةَ فتحك الصفحة — لا أرقاماً مكتوبةً في التصميم.",
    stats: ["ملف معتمد", "مكفول بالكامل", "مبالغ الكفالة الشهرية", "الاحتياج الشهري الكلي"],
    startReal: "ابدأ من ملفٍّ حقيقي",
    partners: "جهات الرعاية الشريكة",
    doorsH: "ثلاثة أبوابٍ متساوية",
    doorsP: "اختر ما يناسبك، ولمن: يتيمٌ بعينه، أو مجموعته، أو منطقة، أو دولة، أو مؤسسة تعمل معهم.",
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
      "We don't offer temporary care; we build systems that let children thrive. A file verified by a licensed care organization, administrative approval, named education and qualification programs with defined outcomes, and regular impact reports.",
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
    doors: [
      [
        "Monthly sponsorship",
        "A fixed amount each month. One table shows when it was paid and when it reached the child, with a document.",
        "Choose from the directory",
      ],
      [
        "Building capability",
        "Fund a qualification journey session by session, with the child's traits measured before and after.",
        "Support qualification",
      ],
      [
        "In-kind support",
        "School bags, clothing and devices, prepared, delivered and documented with photos by the local office.",
        "Give in kind",
      ],
    ],
    crossing: [
      [
        "The shore of loss",
        "A child who has lost their provider. What they lack isn't compassion but a system to carry them: school fees paid, treatment followed up, a home that isn't under threat.",
      ],
      [
        "The strait",
        "This is where the platform works. A licensed care organization documents the file, the administration approves it, then a monthly sponsorship is spent on named programs — not a vague line item.",
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
    lead: "We carry the orphan from the shore of loss to the shore of thriving: a file documented by a licensed care organization and approved by the administration, then a monthly sponsorship spent on named programs with defined outcomes — and the impact comes back to you as a report.",
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
    doorsH: "Three equal doors",
    doorsP:
      "Choose what suits you, and for whom: a specific child, their group, a region, a country, or an organization working with them.",
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

export const Route = createFileRoute("/")({
  // موضع الخارطة في الرابط: يُشارَك، ويعيده زرّ الرجوع.
  validateSearch: (raw: Record<string, unknown>): { c?: string; r?: string } => ({
    ...(typeof raw["c"] === "string" && /^[A-Z]{2}$/.test(raw["c"]) ? { c: raw["c"] } : {}),
    ...(typeof raw["r"] === "string" && raw["r"] ? { r: raw["r"] } : {}),
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
      ],
    };
  },
  loader: async ({ context }) => {
    // الخارطة تُرسم من الخادم بأعدادها، فلا تومض فارغة.
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

/** ثلاثة أبواب للدعم — الأيقونة والوجهة؛ النصوص في COPY. */
const DOORS = [
  { icon: HeartHandshake, to: "/orphans" as const },
  { icon: Sprout, to: "/support" as const },
  { icon: Package, to: "/support" as const },
];

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
  const { stats, demo } = useMapStats();
  const onSelect = (s: MapSelection) =>
    void navigate({
      search: { ...(s.country ? { c: s.country } : {}), ...(s.region ? { r: s.region } : {}) },
      resetScroll: false,
      viewTransition: false,
    });

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/* الخارطة من مصدر الجغرافيا الواحد (geo_stats)؛ وتجريبيةٌ بشارةٍ إن تعذّرت القاعدة. */}
        <WorldMap
          stats={stats}
          selection={selection}
          onSelect={onSelect}
          demo={demo}
          action={(ctx) => <MapActions ctx={ctx} />}
        />

        {/* ── الهيرو: استراتيجية الفراغ — ما يُترك فارغاً يعمل بقدر ما يُملأ ── */}
        <section className="surface-crossing relative overflow-hidden border-b border-border/70">
          <BrandPattern density="active" className="text-gold-line" opacity={0.18} tile={104} />
          <div className="relative mx-auto max-w-3xl px-4 py-20 text-center md:py-28">
            <KahataynMark className="mx-auto h-24 w-auto md:h-32" title={c.logo(brand.name)} />
            <p className="mt-4 font-serif text-3xl font-bold text-primary md:text-4xl">
              {brand.name}
            </p>
            <p className="mt-1 text-sm font-medium text-bridge-ink">{brand.tagline}</p>
            <h1 className="mt-10 text-4xl leading-tight font-extrabold md:text-5xl">
              {c.h1a}
              <br />
              {c.h1b}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              {c.lead}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/support">
                  {c.supportNow}
                  <ArrowLeft className="ltr:-scale-x-100 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/orphans">{c.browse}</Link>
              </Button>
            </div>

            {/* «هكذا» اسم إشارة إلى حركة يد؛ حذفُها يترك اللفظ بلا مشارٍ إليه. */}
            <blockquote className="mx-auto mt-14 max-w-lg">
              {/* النصّ النبوي بلفظه العربي دائماً، ومعناه بالإنجليزية تحته. */}
              <p className="font-quran text-lg leading-9 text-shore-need" lang="ar" dir="rtl">
                «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى وفرَّجَ بينهما شيئاً.
              </p>
              {c.hadithMeaning && (
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.hadithMeaning}</p>
              )}
              <cite className="mt-2 block text-xs not-italic text-muted-foreground">
                {c.hadithSource}
              </cite>
            </blockquote>
          </div>
        </section>

        {/* ── الأرقام ── */}
        <section className="border-t border-border/70 bg-secondary/30">
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
                value={data.stats ? formatMoney(data.stats.monthlyFunded, undefined, locale) : "—"}
              />
              <StatTile
                label={c.stats[3]!}
                value={data.stats ? formatMoney(data.stats.monthlyNeed, undefined, locale) : "—"}
              />
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

        {/* ── ثلاثة أبواب للدعم ── */}
        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="doors-heading">
          <h2 id="doors-heading" className="text-2xl font-extrabold">
            {c.doorsH}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{c.doorsP}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {DOORS.map((d, i) => (
              <Link
                key={i}
                to={d.to}
                className="reveal group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <d.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-bold">{c.doors[i]![0]}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.doors[i]![1]}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {c.doors[i]![2]}
                  <ArrowLeft className="ltr:-scale-x-100 size-4 transition-transform group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── الشطّان والمضيق ── */}
        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="crossing-heading">
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
        <section className="border-y border-border/70 bg-secondary/30">
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
        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="ladder-heading">
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
                <p className={`mt-4 text-[11px] font-bold ${step.label}`}>{c.ladder[i]![0]}</p>
                <h3 className="mt-1 font-bold">{c.ladder[i]![1]}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.ladder[i]![2]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ما يشتريه الكافل: البرامج ── */}
        {data.programs.length > 0 && (
          <section className="border-y border-border/70 bg-secondary/30">
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
                            ? "shrink-0 rounded-full border border-shore-thrive/45 px-2.5 py-1 text-[11px] font-medium text-shore-thrive"
                            : "shrink-0 rounded-full border border-bridge/40 px-2.5 py-1 text-[11px] font-medium text-bridge-ink"
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
        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="custody-heading">
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
                <p className="mt-4 text-[11px] font-bold text-muted-foreground">{c.ordinals[i]}</p>
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
