import { useState } from "react";

import {
  ImpactFigure,
  PledgeHead,
  SampleBadge,
  StepChain,
} from "@/components/impact/SupportImpactParts";
import { monthLabel } from "@/lib/impact-evidence";
import { defineCopy, intlOf, pluralOf, useCopy, useLocale } from "@/lib/locale";
import {
  deliveryReached,
  deliveryTotals,
  isAggregate,
  sortDeliveries,
  type InKindImpact,
} from "@/lib/support-impact";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/InKindImpactView", {
  ar: {
    title: "أثر الدعم العيني",
    lead: "تعهّدك وهو يصير تسليماً: يجهّزه المكتب المحلي، ثم يسلّمه ويوثّقه بمستند. لا يُعدّ هنا إلا ما له قيد.",
    documented: ["تسليماتٌ موثّقة", "كلٌّ بمستند"],
    preparing: ["قيد التجهيز", "لدى المكتب المحلي"],
    steps: ["سُجِّل التعهّد", "يجهّزه المكتب", "سُلِّم بمستند"],
    chain: (done: number) => `${done} من 3 خطوات اكتملت هذا الشهر`,
    recorded: "سُجّل تعهّدك؛ والتالي أن يبدأ المكتب المحلي تجهيزه.",
    inPreparation: "المكتب المحلي يجهّزه؛ وبانتظار مستند التسليم.",
    deliveredTo: (name: string) => `سُلِّم لـ${name} بمستند.`,
    deliveredIn: (place: string) => `سُلِّم في ${place} عبر المكتب المحلي بمستند.`,
    ref: "مرجع المستند",
    showAll: pluralOf(
      {
        one: "اعرض شهراً أسبق",
        two: "اعرض شهرين أسبقين",
        few: "اعرض {0} أشهر أسبق",
        many: "اعرض {0} شهراً أسبق",
        other: "اعرض {0} شهر أسبق",
      },
      0,
      "ar",
    ),
    showLess: "اعرض الأحدث فقط",
    reachNote: "المستند يوثّق التسليم في المكان؛ وعدد المستفيدين لا يُقيَّد، فلا يُدَّعى هنا.",
  },
  en: {
    title: "In-kind impact",
    lead: "Your pledge on its way to delivery: the local office prepares it, then delivers and documents it. Only what is on record is counted here.",
    documented: ["Documented deliveries", "each with a document"],
    preparing: ["In preparation", "at the local office"],
    steps: ["Pledge recorded", "Office preparing", "Delivered, documented"],
    chain: (done: number) => `${done} of 3 steps complete this month`,
    recorded: "Your pledge is recorded; next, the local office starts preparing it.",
    inPreparation: "The local office is preparing it; the delivery document is awaited.",
    deliveredTo: (name: string) => `Delivered to ${name}, with a document.`,
    deliveredIn: (place: string) =>
      `Delivered in ${place} through the local office, with a document.`,
    ref: "Document reference",
    showAll: pluralOf({ one: "Show {0} earlier month", other: "Show {0} earlier months" }),
    showLess: "Show the latest only",
    reachNote:
      "The document records the delivery in the place. The number of recipients is not recorded, so none is claimed here.",
  },
});

const LATEST = 3;

function Pledge({ item }: { item: InKindImpact }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const rows = sortDeliveries(item.deliveries);
  const totals = deliveryTotals(rows);
  const shown = all ? rows : rows.slice(0, LATEST);
  const hidden = rows.length - LATEST;
  const wide = isAggregate(item.scope);
  const num = (v: number) => v.toLocaleString(intlOf(locale));
  return (
    <>
      <PledgeHead item={item} />
      <dl className="mt-4 grid grid-cols-2 border-y border-border">
        <ImpactFigure
          label={c.documented[0]!}
          unit={c.documented[1]!}
          value={num(totals.documented)}
          strong
          className="pe-4"
        />
        <ImpactFigure
          label={c.preparing[0]!}
          unit={c.preparing[1]!}
          value={num(totals.preparing)}
          className="border-s border-border ps-4"
        />
      </dl>
      <ol>
        {shown.map((r) => {
          const reached = deliveryReached(r);
          return (
            <li
              key={r.id}
              className="grid gap-x-6 gap-y-3 border-b border-border py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
            >
              <p className="font-display text-lg font-bold leading-tight">
                {monthLabel(r.month, locale)}
              </p>
              <div className="min-w-0">
                <StepChain
                  label={c.chain(reached)}
                  steps={c.steps.map((label, n) => ({
                    label,
                    done: reached > n,
                    current: reached === n,
                  }))}
                />
                <p className="mt-3 text-sm leading-6">
                  {reached === 3
                    ? wide
                      ? c.deliveredIn(item.label)
                      : c.deliveredTo(item.label)
                    : reached === 2
                      ? c.inPreparation
                      : c.recorded}
                </p>
                {r.ref && (
                  <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{c.ref}</span>
                    <span dir="ltr" className="tabular-nums">
                      {r.ref}
                    </span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          {all ? c.showLess : c.showAll(hidden)}
        </button>
      )}
      {wide && <p className="mt-2 text-xs leading-6 text-muted-foreground">{c.reachNote}</p>}
    </>
  );
}

/**
 * «أثر الدعم العيني»: منظر تسليم. كل تعهّدٍ بسلسلة أشهره (سُجِّل ← يجهّزه المكتب ← سُلِّم
 * بمستند) وعدد تسليماته الموثّقة. للطفل «سُلِّم له»، وللمجموعة أو المنطقة أو الدولة «سُلِّم
 * فيها»، ولا يُدَّعى عدد مستفيدين لا تقيّده المنصّة. يُقاد بالخصائص وحدها.
 */
export function InKindImpactView({
  items,
  sample,
  className,
  children,
}: {
  items: InKindImpact[];
  /** trial figures: the section is labelled as sample data */
  sample?: boolean;
  className?: string;
  /** an optional control strip under the lead (the trial's «قدّم شهراً») */
  children?: React.ReactNode;
}) {
  const c = useCopy(COPY);
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="in-kind-impact"
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="in-kind-impact" className="font-display text-2xl font-bold">
          {c.title}
        </h3>
        {sample && <SampleBadge />}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{c.lead}</p>
      {children}
      <ul className="mt-3">
        {items.map((item, i) => (
          <li
            key={item.id}
            className="mo-rise border-t border-border py-5 last:pb-0"
            style={{ ["--i" as string]: i }}
          >
            <Pledge item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
