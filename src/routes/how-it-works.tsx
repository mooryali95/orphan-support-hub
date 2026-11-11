import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { BRAND, brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";

export const Route = createFileRoute("/how-it-works")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const title = pageTitle(copyOf(COPY, l).title, true, l);
    const description = brandFor(l).description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: HowItWorks,
});

const COPY = defineCopy("routes/how-it-works", {
  ar: {
    title: "كيف تعمل الكفالة",
    h1: (brand: string) => `كيف تعمل الكفالة في «${brand}»`,
    lead: "المنصة تنظّم العلاقة بين أربعة أطراف داخل مسار واحد موثّق، بحيث لا يصل أي ملف إلى الكافل قبل التحقق منه واعتماده.",
    actors: [
      [
        "جهة الرعاية",
        "جمعية أو دار مرخّصة تسجّل في المنصة، تُعتمد من الإدارة، ثم ترفع ملفات الأيتام مع المستندات وتحدّث بياناتهم دورياً.",
      ],
      [
        "ولي الأمر",
        "يزوّد جهة الرعاية بالبيانات ويوثّق صلة القرابة، ويطّلع على حالة الملف والكفالة.",
      ],
      [
        "الكافل",
        "يتصفّح الملفات المعتمدة، يختار اليتيم والمبلغ الشهري، ويكمل الدفع ثم يتابع الأثر.",
      ],
      [
        "الإدارة",
        "تراجع الجهات والملفات، تعتمد أو ترفض مع سبب، وتشرف على الكفالات والمدفوعات والتكاملات.",
      ],
    ],
    stagesH: "مراحل المسار",
    stages: [
      [
        "1",
        "تسجيل جهة الرعاية واعتمادها",
        "تحقق من الترخيص وبيانات التواصل قبل السماح برفع الملفات.",
      ],
      [
        "2",
        "إنشاء ملف اليتيم",
        "بيانات عامة تُعرض للجمهور، وبيانات حسّاسة تبقى محجوبة في سجل خاص.",
      ],
      ["3", "مراجعة الإدارة", "اعتماد الملف أو رفضه مع سبب واضح، ثم نشره في الدليل العام."],
      ["4", "اختيار الكافل والدفع", "كفالة شهرية أو دعم لمرة واحدة، مع تحديث نسبة التغطية آلياً."],
      [
        "5",
        "المتابعة والتقارير",
        "تقارير عن التعليم والصحة حين ترفعها الجهة وتعتمدها الإدارة. وتُنهي الكفالة متى شئت فتنتهي بعد آخر شهرٍ مدفوع؛ وكفالة التحويل البنكي تُوقَف مؤقّتاً أو يُعدَّل مبلغها من لوحتك.",
      ],
      ["6", "التكامل الخارجي", "استيراد ملفات الأيتام من منصات داخلية عبر واجهة API موقّعة."],
    ],
    ctaH: "جاهز لتكون سنداً ليتيم؟",
    ctaP: "اختر ملفاً معتمداً وابدأ كفالتك الشهرية اليوم.",
    cta: "تصفّح الملفات",
  },
  en: {
    title: "How sponsorship works",
    h1: (brand: string) => `How sponsorship works on ${brand}`,
    lead: "The platform organizes the relationship between four parties in one documented path, so no file reaches a sponsor before it has been verified and approved.",
    actors: [
      [
        "Care organization",
        "A licensed charity or care home registers on the platform, is approved by the administration, then uploads children's files with their documents and keeps their data up to date.",
      ],
      [
        "Guardian",
        "Provides the care organization with the data, documents the family relationship, and can see the status of the file and the sponsorship.",
      ],
      [
        "Sponsor",
        "Browses approved files, chooses a child and a monthly amount, completes payment, then follows the impact.",
      ],
      [
        "Administration",
        "Reviews organizations and files, approves or rejects them with a reason, and oversees sponsorships, payments and integrations.",
      ],
    ],
    stagesH: "The path, stage by stage",
    stages: [
      [
        "1",
        "Registering and approving the care organization",
        "License and contact details are checked before the organization may upload files.",
      ],
      [
        "2",
        "Creating the child's file",
        "Public data shown to visitors; sensitive data kept hidden in a private record.",
      ],
      [
        "3",
        "Administrative review",
        "The file is approved or rejected with a clear reason, then published in the public directory.",
      ],
      [
        "4",
        "The sponsor chooses and pays",
        "A monthly sponsorship or one-time support, with the coverage percentage updated automatically.",
      ],
      [
        "5",
        "Follow-up and reports",
        "Education and health reports as the care organization files them and the administration approves them. End the sponsorship whenever you like and it stops after the last paid month; a bank-transfer sponsorship can also be paused or have its amount changed from your dashboard.",
      ],
      [
        "6",
        "External integration",
        "Children's files imported from internal platforms through a signed API.",
      ],
    ],
    ctaH: "Ready to stand by an orphan?",
    ctaP: "Choose an approved file and start your monthly sponsorship today.",
    cta: "Browse files",
  },
});

function HowItWorks() {
  const c = useCopy(COPY);
  const locale = useLocale();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12">
        {/* عمود القراءة يبدأ من حافة الشعار نفسها (UI-13). */}
        <div className="max-w-4xl">
          <h1 className="text-3xl font-extrabold">{c.h1(brandFor(locale).name)}</h1>
          <p className="mt-3 leading-8 text-muted-foreground">{c.lead}</p>

          <section className="mt-10 grid gap-4 sm:grid-cols-2">
            {c.actors.map(([role, text]) => (
              <div key={role} className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-bold text-primary">{role}</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
              </div>
            ))}
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-extrabold">{c.stagesH}</h2>
            <ol className="mt-6 space-y-4">
              {c.stages.map(([num, title, text]) => (
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
            <h2 className="text-xl font-extrabold">{c.ctaH}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{c.ctaP}</p>
            <Button asChild size="lg" className="mt-6">
              <Link to="/orphans">{c.cta}</Link>
            </Button>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
