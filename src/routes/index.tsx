import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Eye, Aperture, ShieldCheck, Building2, ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrphanCard, type PublicOrphan } from "@/components/OrphanCard";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { Button } from "@/components/ui/button";
import { listPublicOrphans, getPlatformStats } from "@/lib/orphans.functions";
import { formatMoney } from "@/lib/format";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: async () => {
    const [featured, stats] = await Promise.all([
      listPublicOrphans({ data: { limit: 6, onlyOpen: true } }),
      getPlatformStats(),
    ]);
    return { featured: featured.orphans as PublicOrphan[], stats };
  },
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "كافل — اكفل يتيماً بملف موثّق" },
      {
        name: "description",
        content:
          "منصة كافل تربطك بيتيم حقيقي عبر ملف موثّق من جهة رعاية معتمدة، مع كفالة شهرية شفافة وتقارير أثر دورية.",
      },
      { property: "og:title", content: "كافل — اكفل يتيماً بملف موثّق" },
      {
        property: "og:description",
        content: "كفالة شهرية شفافة لأيتام بملفات موثّقة من جهات رعاية معتمدة.",
      },
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
    chip: "bg-bridge-bright/12 text-bridge-bright",
    label: "text-bridge-bright",
    title: "اللحظة الفاصلة",
    text: "اللحظة التي يجتمع فيها الزمان والمكان والفاعل، فتختار من تكفل وينزل المفهوم إلى الواقع.",
  },
  {
    icon: ShieldCheck,
    rank: "التعقل",
    bar: "bg-bridge",
    chip: "bg-bridge/12 text-bridge",
    label: "text-bridge",
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

function HomePage() {
  const { data } = useSuspenseQuery(homeQuery);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="surface-crossing relative overflow-hidden border-b border-border/70">
          <BrandPattern density="active" className="text-gold-line" opacity={0.18} tile={104} />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
            <div>
              <span className="inline-flex rounded-full border border-shore-need/25 bg-background/75 px-3 py-1 text-xs font-medium text-shore-need">
                ملفات موثّقة من جهات رعاية معتمدة
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight md:text-5xl">
                اكفل يتيماً،
                <br />
                وكن له سنداً كل شهر
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
                لا نقدّم رعاية مؤقتة، بل نبني نظم عمران متكاملة. نعبر باليتيم من شاطئ الاحتياج إلى
                شاطئ العمران: جهة رعاية معتمدة توثّق ملفه، والإدارة تعتمده، ثم كفالة شهرية شفافة
                تحتضنه وتتابع أثرها.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
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
              <p className="mt-8 font-quran text-lg text-shore-need">
                «أنا وكافلُ اليتيمِ في الجنّةِ هكذا»
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 self-center">
              <StatCard label="ملف معتمد" value={String(data.stats.totalOrphans)} />
              <StatCard label="مكفول بالكامل" value={String(data.stats.fullySponsored)} />
              <StatCard
                label="مبالغ الكفالة الشهرية"
                value={formatMoney(data.stats.monthlyFunded)}
              />
              <StatCard label="الاحتياج الشهري الكلي" value={formatMoney(data.stats.monthlyNeed)} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-extrabold">مراتب الوعي: من الدراية إلى العمران</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            رحلة الكافل ليست خطوات إجرائية، بل انتقالات في الوعي — من رؤية الصورة إلى الالتزام
            بالنظام.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AWARENESS_LADDER.map((step) => (
              <div
                key={step.rank}
                className="border-border bg-card relative overflow-hidden rounded-2xl border p-5"
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
                <p className="text-muted-foreground mt-2 text-sm leading-7">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-extrabold">ملفات بانتظار كافل</h2>
            <Link to="/orphans" className="text-sm font-medium text-primary hover:underline">
              عرض الكل
            </Link>
          </div>
          {data.featured.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">لا توجد ملفات معتمدة حالياً.</p>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.featured.map((orphan) => (
                <OrphanCard key={orphan.id} orphan={orphan} />
              ))}
            </div>
          )}
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
