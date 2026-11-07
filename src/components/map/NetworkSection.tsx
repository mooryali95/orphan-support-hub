import { Compass, MapPinned } from "lucide-react";

import { defineCopy, useCopy } from "@/lib/locale";
import { CoverageList, ExpansionList, NetworkSources } from "./NetworkLayer";
import { useNetworkCopy } from "./network-copy";

const COPY = defineCopy("components/map/NetworkSection", {
  ar: {
    eyebrow: "للأمانة العامة",
    title: "قرار التوسّع: أين نفتح المكتب التالي؟",
    lead: "تحليلٌ من بياناتٍ عامّة موثّقة: حاجة الأيتام في كل دولة مقابل حضور الندوة فيها. يُقرأ مع الخارطة أعلاه — اضغط دولةً لترى بطاقتها.",
  },
  en: {
    eyebrow: "For the General Secretariat",
    title: "Expansion decision: where should the next office open?",
    lead: "An analysis of documented public data: orphan need in each country against WAMY's presence there. Read it with the map above — select a country to see its card.",
  },
});

/**
 * قسم «قرار التوسّع» تحت الخارطة: ترتيب دول الأولوية بتعليلها، والتغطية
 * الحالية (الحاجة حيث للندوة مكتب)، ثم المصادر. بدل قائمة المكاتب التجريبية.
 */
export function NetworkSection({ onPick }: { onPick: (code: string) => void }) {
  const c = useCopy(COPY);
  const t = useNetworkCopy();
  return (
    <section
      aria-labelledby="network-decision"
      className="border-b border-border bg-[linear-gradient(180deg,var(--color-background),color-mix(in_oklch,var(--color-accent)_35%,var(--color-background)))] px-4 py-14 md:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold text-bridge-ink">{c.eyebrow}</p>
        <h2 id="network-decision" className="mt-2 font-serif text-3xl font-bold md:text-4xl">
          {c.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
          {c.lead}
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <article className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)] md:p-7">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Compass className="size-5 text-office-gap" aria-hidden="true" />
              {t.decision}
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.decisionLead}</p>
            <div className="mt-5">
              <ExpansionList onPick={onPick} />
            </div>
          </article>

          <article className="h-fit rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)] md:p-7">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <MapPinned className="size-5 text-primary" aria-hidden="true" />
              {t.coverageTitle}
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.coverageLead}</p>
            <div className="mt-4">
              <CoverageList onPick={onPick} />
            </div>
          </article>
        </div>

        <p className="mt-8 text-xs leading-6 text-muted-foreground">{t.research}</p>
        <div className="mt-3">
          <NetworkSources />
        </div>
      </div>
    </section>
  );
}
