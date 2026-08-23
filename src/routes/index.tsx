import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck, FileCheck2, HeartHandshake, LineChart, ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrphanCard, type PublicOrphan } from "@/components/OrphanCard";
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

const STEPS = [
  {
    icon: FileCheck2,
    title: "ملف موثّق",
    text: "جهة الرعاية ترفع ملف اليتيم مع مستنداته، والإدارة تراجعه قبل النشر.",
  },
  {
    icon: HeartHandshake,
    title: "اختيار الكافل",
    text: "تتصفح الملفات المعتمدة وتختار اليتيم والمبلغ الشهري المناسب لك.",
  },
  {
    icon: ShieldCheck,
    title: "دفع آمن",
    text: "الكفالة تُفعّل بعد الدفع الإلكتروني، ويمكنك إيقافها أو تعديلها في أي وقت.",
  },
  {
    icon: LineChart,
    title: "تقارير أثر",
    text: "تصلك تحديثات دورية عن الحالة التعليمية والصحية لليتيم الذي تكفله.",
  },
];

function HomePage() {
  const { data } = useSuspenseQuery(homeQuery);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="surface-warm border-b border-border/70">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
            <div>
              <span className="inline-flex rounded-full border border-primary/25 bg-background/70 px-3 py-1 text-xs font-medium text-primary">
                ملفات موثّقة من جهات رعاية معتمدة
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight md:text-5xl">
                اكفل يتيماً،
                <br />
                وكن له سنداً كل شهر
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
                منصة «كافل» تجمع اليتيم وجهة الرعاية والكافل والإدارة في مسار واحد واضح: توثيق
                الملف، اعتماده، ثم كفالة شهرية شفافة مع متابعة أثر مستمرة.
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
              <p className="mt-8 font-quran text-lg text-primary">
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
              <StatCard
                label="الاحتياج الشهري الكلي"
                value={formatMoney(data.stats.monthlyNeed)}
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-extrabold">كيف تسير الرحلة؟</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.title} className="rounded-2xl border border-border bg-card p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.text}</p>
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
