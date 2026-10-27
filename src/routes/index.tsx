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
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { Button } from "@/components/ui/button";
import { getPlatformStats } from "@/lib/orphans.functions";
import { listPrograms, type PublicProgram } from "@/lib/programs.functions";
import { formatMoney } from "@/lib/format";
import { BRAND } from "@/config/brand";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: async () => {
    const [stats, catalogue] = await Promise.all([getPlatformStats(), listPrograms()]);
    return { stats, programs: catalogue.programs as PublicProgram[] };
  },
});

const TITLE = `${BRAND.name} — عبورٌ باليتيم من شطّ الفقد إلى شطّ العمران`;
const DESCRIPTION =
  "لا نقدّم رعاية مؤقتة بل نبني نظم عمران. ملف موثّق من جهة رعاية مرخّصة، واعتماد إداري، وبرامج تعليم وتأهيل مسمّاة بمخرجاتها، وتقارير أثر دورية.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQuery),
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
    rank: "الدراية",
    bar: "bg-shore-need",
    chip: "bg-shore-need/12 text-shore-need",
    label: "text-shore-need",
    title: "أن ترى الصورة",
    text: "ملف موثّق من جهة رعاية معتمدة يختصر أزمة كاملة في صورة واحدة تصدمك وتخلق إطاراً ذهنياً جديداً.",
  },
  {
    icon: Aperture,
    rank: "الميقات",
    bar: "bg-bridge-bright",
    // الأرضية تبقى بحرارة البرتقالي، أما الأيقونة فوقها فتُصبّ بالذهبي الداكن:
    // البرتقالي يبلغ 2.1:1 على الأبيض ولا يستوفي 3:1 المطلوبة للعناصر غير النصّية.
    chip: "bg-bridge-bright/12 text-bridge-ink",
    label: "text-bridge-ink",
    title: "اللحظة الفاصلة",
    text: "اللحظة التي يجتمع فيها الزمان والمكان والفاعل، فتختار من تكفل وينزل المفهوم إلى الواقع.",
  },
  {
    icon: ShieldCheck,
    rank: "التعقل",
    bar: "bg-bridge",
    chip: "bg-bridge/12 text-bridge-ink",
    label: "text-bridge-ink",
    title: "الالتزام بالنظام",
    text: "لا تبرّع عابر بل كفالة شهرية شفافة: تعهّد مستمر تراه في كل دفعة وكل تقرير.",
  },
  {
    icon: Building2,
    rank: "العمران",
    bar: "bg-shore-thrive",
    chip: "bg-shore-thrive/12 text-shore-thrive",
    label: "text-shore-thrive",
    title: "من الهامش إلى المركز",
    text: "تقارير أثر دورية عن التعليم والصحة والمعيشة، حتى يصبح اليتيم قوة فاعلة في مجتمعه.",
  },
];

/** الشطّان والمضيق — الاستعارة الحاكمة للهوية، لا صورة بلاغية. */
const CROSSING = [
  {
    tone: "text-shore-need",
    dot: "bg-shore-need",
    label: "شطّ الفقد",
    text: "طفلٌ فقد عائله. لا ينقصه العطف بل ينقصه نظامٌ يحمله: مدرسة تُدفع رسومها، وعلاج يُتابَع، وبيت لا يُهدَّد.",
  },
  {
    tone: "text-bridge-ink",
    dot: "bg-bridge",
    label: "المضيق",
    text: "هنا تعمل المنصّة. جهة رعاية مرخّصة توثّق الملف، والإدارة تعتمده، ثم كفالة شهرية تُصرَف على برامج مسمّاة لا على بندٍ مبهم.",
  },
  {
    tone: "text-shore-thrive",
    dot: "bg-shore-thrive",
    label: "شطّ العمران",
    text: "شابٌّ يقرأ ويتعلّم حرفة ويعمل. لم يعد متلقّياً بل صار قادراً — وهذا وحده مقياس نجاحنا.",
  },
];

/** كيف يصير الملفّ منشوراً — سلسلة التوثيق كما تفرضها القاعدة لا كما تُوصف. */
const CUSTODY = [
  {
    icon: Building2,
    title: "جهة رعاية مرخّصة",
    text: "لا يُنشئ الملفَّ فردٌ. تُراجَع الجهة وتُعتمد أولاً، وتبقى مسؤولةً عن صحّة البيانات وتحديثها.",
  },
  {
    icon: FileCheck2,
    title: "وثائق تُرفَع وتُدقَّق",
    text: "شهادة الوفاة وإثبات الولاية والسجلّ الدراسي والتقرير الطبّي. كل وثيقة تُوسم مدقَّقةً باسم من دقّقها ووقتِه.",
  },
  {
    icon: Stamp,
    title: "اعتماد إداري صريح",
    text: "لا يُنشر ملف إلا بقرار اعتماد. والرفض يحمل سبباً مُرمَّزاً، فالقرار مُساءَل لا مُبهَم.",
  },
  {
    icon: LineChart,
    title: "أثرٌ يُنشر دورياً",
    text: "تقارير عن التعليم والصحة والمعيشة تمرّ بمراجعة الإدارة قبل نشرها للكافل.",
  },
];

/** أرقام هندية عربية: خلطُها بالأرقام اللاتينية في نصٍّ عربي شذوذٌ بصري. */
const ORDINALS = ["١", "٢", "٣", "٤"];

const CATEGORY_LABEL: Record<string, string> = {
  education: "تعليم",
  rehabilitation: "تأهيل",
  psychosocial: "دعم نفسي",
  health: "صحّة",
  essentials: "معيشة",
};

function HomePage() {
  const { data } = useSuspenseQuery(homeQuery);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/* ── الهيرو: استراتيجية الفراغ — ما يُترك فارغاً يعمل بقدر ما يُملأ ── */}
        <section className="surface-crossing relative overflow-hidden border-b border-border/70">
          <BrandPattern density="active" className="text-gold-line" opacity={0.18} tile={104} />
          <div className="relative mx-auto max-w-3xl px-4 py-20 text-center md:py-28">
            <KahataynMark className="mx-auto h-24 w-auto md:h-32" title={`شعار ${BRAND.name}`} />
            <p className="mt-4 font-serif text-3xl font-bold text-primary md:text-4xl">
              {BRAND.name}
            </p>
            <p className="mt-1 text-sm font-medium text-bridge-ink">{BRAND.tagline}</p>
            <h1 className="mt-10 text-4xl leading-tight font-extrabold md:text-5xl">
              لا نقدّم رعايةً مؤقّتة،
              <br />
              بل نبني نظم عمران
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              نعبر باليتيم من شطّ الفقد إلى شطّ العمران: ملفٌّ توثّقه جهة رعاية مرخّصة، وتعتمده
              الإدارة، ثم كفالة شهرية تُصرَف على برامج مسمّاة بمخرجاتها — ويعود إليك أثرها تقريراً.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/orphans">
                  تصفّح ملفات الأيتام
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/how-it-works">كيف تعمل الكفالة؟</Link>
              </Button>
            </div>

            {/* «هكذا» اسم إشارة إلى حركة يد؛ حذفُها يترك اللفظ بلا مشارٍ إليه. */}
            <blockquote className="mx-auto mt-14 max-w-lg">
              <p className="font-quran text-lg leading-9 text-shore-need">
                «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى وفرَّجَ بينهما شيئاً.
              </p>
              <cite className="mt-2 block text-xs not-italic text-muted-foreground">
                رواه البخاري (٦٠٠٥) عن سهل بن سعد رضي الله عنه
              </cite>
            </blockquote>
          </div>
        </section>

        {/* ── الشطّان والمضيق ── */}
        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="crossing-heading">
          <h2 id="crossing-heading" className="text-2xl font-extrabold">
            شطّان ومضيق
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            اسم المنصّة وشعارها ليسا زخرفة: الخيط المتصل هو الرعاية التي لا تنقطع، والطفل يظهر في
            الفراغ السالب بين الحرفين — لا يُرسم، بل تُكمله العين.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {CROSSING.map((stage) => (
              <li key={stage.label} className="rounded-2xl border border-border bg-card p-6 md:p-7">
                <span className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${stage.dot}`} aria-hidden="true" />
                  <span className={`text-sm font-bold ${stage.tone}`}>{stage.label}</span>
                </span>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{stage.text}</p>
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
                  اليتيم عندنا شخصٌ لا «حالة»
                </h2>
                <div className="mt-4 space-y-4 text-sm leading-8 text-muted-foreground">
                  <p>
                    الملفّ في المنصّة ليس نداء استعطاف. هو سجلّ مُدقَّق لطفلٍ له اسم ومدرسة ومدينة
                    واحتياج مُحدَّد بالرقم — لأن ما لا يُقاس لا يُتابَع، وما لا يُتابَع لا يتغيّر.
                  </p>
                  <p>
                    ولذلك نكتب الاحتياج الشهري صريحاً، ونعرض ما غُطّي منه وما بقي، ونُسمّي البرنامج
                    الذي يُصرَف عليه المال. الكافل شريكٌ في نظام، لا متبرّعٌ في صندوق.
                  </p>
                </div>
              </div>

              <aside className="rounded-2xl border border-shore-need/25 bg-background p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-shore-need/12 text-shore-need">
                  <ScrollText className="size-5" />
                </span>
                <h3 className="mt-4 font-bold">الكرامة قيدٌ في الكود لا وعدٌ في الصفحة</h3>
                <ul className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                  <li>
                    لا تُنشر صورة وجهٍ لملفٍّ في حالة الاحتياج ما لم تُوثَّق موافقة مصوّرة على
                    النشر.
                  </li>
                  <li>
                    الصور المؤلمة تُعالَج أحاديةَ اللون بلا وجه، والصور الملهمة وحدها تُعرض بلونها
                    الكامل — والسجلّ يُشتقّ من حالة الملف آلياً، لا يختاره من يرفع الصورة.
                  </li>
                  <li>البيانات الحسّاسة — الوثائق والعناوين — لا يراها الزائر أبداً.</li>
                </ul>
              </aside>
            </div>
          </div>
        </section>

        {/* ── مراتب الوعي ── */}
        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="ladder-heading">
          <h2 id="ladder-heading" className="text-2xl font-extrabold">
            مراتب الوعي: من الدراية إلى العمران
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            رحلة الكافل ليست خطوات إجرائية، بل انتقالات في الوعي — من رؤية الصورة إلى الالتزام
            بالنظام.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AWARENESS_LADDER.map((step) => (
              <div
                key={step.rank}
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
                <p className={`mt-4 text-[11px] font-bold tracking-widest uppercase ${step.label}`}>
                  {step.rank}
                </p>
                <h3 className="mt-1 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ما يشتريه الكافل: البرامج ── */}
        {data.programs.length > 0 && (
          <section className="border-y border-border/70 bg-secondary/30">
            <div className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="programs-heading">
              <h2 id="programs-heading" className="text-2xl font-extrabold">
                الكفالة بناء أهلية، لا سدُّ احتياج
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                ننقل العمل من منطق الرعاية إلى منطق البناء: لا نسدّ حاجة شهر، بل نكوّن قابليةً تُنتج
                الفعل ذاتياً بعد أن ينتهي تدخّلنا.
              </p>

              {/* المعادلة الحاكمة — تُذكر لأنها تحكم التصميم لا لأنها شعار. */}
              <figure className="mt-6 max-w-2xl rounded-2xl border border-bridge/30 bg-background p-5">
                <blockquote className="text-center text-base leading-9 font-bold md:text-lg">
                  الأهلية = القدرة على <span className="text-shore-need">تفهّم الخطاب</span> +{" "}
                  <span className="text-shore-thrive">اكتساب الفعل</span>
                </blockquote>
                <figcaption className="mt-3 text-center text-xs leading-6 text-muted-foreground">
                  تفهّم الخطاب: أن يدرك ما يُطلب منه ومسؤوليته تجاهه. واكتساب الفعل: أن يصير قادراً
                  على إنتاج أفعالٍ جديدة متزايدة، لا أن يؤدّي فعلاً مرّة.
                </figcaption>
              </figure>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground">
                ولذلك يبدأ كل برنامج من <strong>المفهوم</strong> لا من النشاط: يُعلَّم المفهوم
                فيُشغّل <strong>سمةً</strong>، فتُنتج السمة أفعالاً، ثم يُقاس التحوّل. والخدمات
                أدناه مدخلاتٌ في هذا النظام لا غاياتٍ بذاتها.
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
                          ? "بناء أهلية"
                          : (CATEGORY_LABEL[program.category] ?? program.category)}
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
                      {formatMoney(program.monthly_price, program.currency)}
                      <span className="font-normal text-muted-foreground"> / شهرياً</span>
                      {program.duration_months && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {program.duration_months} شهراً
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
            كيف يصير الملفّ جديراً بالثقة
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            الثقة لا تُطلب بالكلام. هذه السلسلة مفروضة في قاعدة البيانات نفسها: ما لا يجتازها لا
            يُنشر.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CUSTODY.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border bg-card p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-shore-thrive/12 text-shore-thrive">
                  <step.icon className="size-5" />
                </span>
                <p className="mt-4 text-[11px] font-bold tracking-widest text-muted-foreground">
                  {ORDINALS[i]}
                </p>
                <h3 className="mt-1 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── الأرقام ── */}
        <section className="border-t border-border/70 bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="numbers-heading">
            <h2 id="numbers-heading" className="text-2xl font-extrabold">
              أرقام المنصّة اليوم
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              محسوبة من الملفات المعتمدة لحظةَ فتحك الصفحة — لا أرقاماً مكتوبةً في التصميم.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="ملف معتمد" value={String(data.stats.totalOrphans)} />
              <StatCard label="مكفول بالكامل" value={String(data.stats.fullySponsored)} />
              <StatCard
                label="مبالغ الكفالة الشهرية"
                value={formatMoney(data.stats.monthlyFunded)}
              />
              <StatCard label="الاحتياج الشهري الكلي" value={formatMoney(data.stats.monthlyNeed)} />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/orphans">
                  ابدأ من ملفٍّ حقيقي
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/organizations">جهات الرعاية الشريكة</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/90 p-5">
      <p className="text-2xl font-extrabold text-primary">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
