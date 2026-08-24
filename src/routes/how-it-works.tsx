import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "كيف تعمل الكفالة — IOCO — اكفل يتيماً بملف موثّق" },
      {
        name: "description",
        content:
          "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة IOCO تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية.",
      },
      { property: "og:title", content: "كيف تعمل الكفالة — IOCO — اكفل يتيماً بملف موثّق" },
      {
        property: "og:description",
        content:
          "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة IOCO تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية.",
      },
    ],
  }),
  component: HowItWorks,
});

const ACTORS = [
  {
    role: "جهة الرعاية",
    text: "جمعية أو دار مرخّصة تسجّل في المنصة، تُعتمد من الإدارة، ثم ترفع ملفات الأيتام مع المستندات وتحدّث بياناتهم دورياً.",
  },
  {
    role: "ولي الأمر",
    text: "يزوّد جهة الرعاية بالبيانات ويوثّق صلة القرابة، ويطّلع على حالة الملف والكفالة.",
  },
  {
    role: "الكافل",
    text: "يتصفّح الملفات المعتمدة، يختار اليتيم والمبلغ الشهري، ويكمل الدفع ثم يتابع الأثر.",
  },
  {
    role: "الإدارة",
    text: "تراجع الجهات والملفات، تعتمد أو ترفض مع سبب، وتشرف على الكفالات والمدفوعات والتكاملات.",
  },
];

const STAGES = [
  ["١", "تسجيل جهة الرعاية واعتمادها", "تحقق من الترخيص وبيانات التواصل قبل السماح برفع الملفات."],
  ["٢", "إنشاء ملف اليتيم", "بيانات عامة تُعرض للجمهور، وبيانات حسّاسة تبقى محجوبة في سجل خاص."],
  ["٣", "مراجعة الإدارة", "اعتماد الملف أو رفضه مع سبب واضح، ثم نشره في الدليل العام."],
  ["٤", "اختيار الكافل والدفع", "كفالة شهرية أو دعم لمرة واحدة، مع تحديث نسبة التغطية آلياً."],
  ["٥", "المتابعة والتقارير", "تحديثات دورية عن التعليم والصحة، وإمكانية إيقاف أو تعديل الكفالة."],
  ["٦", "التكامل الخارجي", "استيراد ملفات الأيتام من منصات داخلية عبر واجهة API موقّعة."],
];

function HowItWorks() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">كيف تعمل الكفالة في «IOCO»</h1>
        <p className="mt-3 leading-8 text-muted-foreground">
          المنصة تنظّم العلاقة بين أربعة أطراف داخل مسار واحد موثّق، بحيث لا يصل أي ملف إلى الكافل
          قبل التحقق منه واعتماده.
        </p>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          {ACTORS.map((a) => (
            <div key={a.role} className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-bold text-primary">{a.role}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-extrabold">مراحل المسار</h2>
          <ol className="mt-6 space-y-4">
            {STAGES.map(([num, title, text]) => (
              <li key={num} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                  {num}
                </span>
                <div>
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-1 text-sm leading-7 text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="surface-warm mt-12 rounded-3xl border border-border p-8 text-center">
          <h2 className="text-xl font-extrabold">جاهز لتكون سنداً ليتيم؟</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            اختر ملفاً معتمداً وابدأ كفالتك الشهرية اليوم.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/orphans">تصفّح الملفات</Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
