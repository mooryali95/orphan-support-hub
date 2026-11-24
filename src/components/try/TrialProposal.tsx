import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useGivingCopy } from "@/config/giving-tracks";
import { countryName } from "@/lib/countries";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import {
  dismissProposal,
  HANDOFF_EVENT,
  loadProposals,
  matchProposal,
  type TrialProposal,
  type TrialTrack,
} from "@/lib/try-handoff";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/try/TrialProposal", {
  ar: {
    monthly: "شهرياً",
    oneTime: "مرّة واحدة",
    oneTimeKind: "عطاءٌ لمرّة واحدة",
    eyebrow: "من الوضع التجريبي",
    title: "ما اخترته في التجربة ينتظر تأكيدك",
    lead: "هذه مقترحاتٌ فقط: لم تُنشأ كفالةٌ ولا تعهّد، ولم يُخصم شيء. أطفال التجربة بأسماءٍ مستعارة؛ فاختر هنا طفلاً أو مكاناً حقيقياً، ثم أكّد المبلغ بنفسك.",
    chooseChild: (country: string) => `اختر طفلاً في ${country}`,
    supportIn: (country: string) => `ادعم في ${country}`,
    notNow: "ليس الآن",
    dismissOne: "أخفِ هذا المقترح",
    offerFrom: "من تجربتك",
    offerUse: "استعمل هذا المبلغ",
    offerUsed: "وُضع في النموذج. راجعه، ثم أكّد بنفسك.",
    offerNote: "لا يتغيّر شيء حتى تضغط.",
    authTitle: "تدخل الآن الرحلة الحقيقية",
    authText:
      "ما اخترته في الوضع التجريبي ينتظرك مقترحاً. لا يُنشأ شيءٌ ولا يُخصم قبل أن تؤكّده بنفسك.",
  },
  en: {
    monthly: "monthly",
    oneTime: "one-time",
    oneTimeKind: "One-time gift",
    eyebrow: "From demo mode",
    title: "What you chose in the trial awaits your confirmation",
    lead: "These are proposals only: no sponsorship or pledge was created, and nothing was charged. The trial's children are fictional, so choose a real child or place here, then confirm the amount yourself.",
    chooseChild: (country: string) => `Choose a child in ${country}`,
    supportIn: (country: string) => `Support in ${country}`,
    notNow: "Not now",
    dismissOne: "Hide this proposal",
    offerFrom: "From your trial",
    offerUse: "Use this amount",
    offerUsed: "Placed in the form. Review it, then confirm yourself.",
    offerNote: "Nothing changes until you press.",
    authTitle: "You are entering the real journey",
    authText:
      "What you chose in demo mode is waiting as a proposal. Nothing is created or charged before you confirm it yourself.",
  },
});

/** المقترحات كما هي الآن في هذا المتصفّح؛ فارغةٌ على الخادم وقبل التركيب */
export function useTrialProposals(): TrialProposal[] {
  const [list, setList] = useState<TrialProposal[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => setList(loadProposals());
    read();
    window.addEventListener(HANDOFF_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(HANDOFF_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return list;
}

/** سطر المقترح: نوعه، ودولته، ومبلغه بدوريّته. لا اسم طفلٍ فيه أبداً. */
export function ProposalLine({ p, className }: { p: TrialProposal; className?: string }) {
  const c = useCopy(COPY);
  const g = useGivingCopy();
  const locale = useLocale();
  const kind =
    p.track === "sponsorship"
      ? p.cadence === "one_time"
        ? c.oneTimeKind
        : g.tracks.monthly.name
      : g.tracks[p.track].name;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className="font-bold">{kind}</span>
      <span className="text-muted-foreground">{countryName(p.co, locale)}</span>
      <span className="font-bold tabular-nums text-primary">
        {formatMoney(p.amount, p.currency, locale)}
      </span>
      <span className="text-sm text-muted-foreground">
        {p.cadence === "one_time" ? c.oneTime : c.monthly}
      </span>
    </span>
  );
}

/** في صفحة الدخول، للقادم من الوضع التجريبي: ما ينتظره هناك مقترحٌ يؤكّده هو، لا شيء يُنشأ عنه */
export function TrialAuthNotice({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const list = useTrialProposals();
  if (list.length === 0) return null;
  return (
    <>
      <div
        data-auth-trial
        className={cn(
          "rounded-xl border border-bridge/40 bg-bridge/8 px-4 py-3 text-sm leading-7",
          className,
        )}
      >
        <p className="font-bold text-bridge-ink">{c.authTitle}</p>
        <p>{c.authText}</p>
        <ProposalLine p={list[0]!} className="mt-2 border-t border-bridge/30 pt-2" />
      </div>
      {/* on the two-panel layout the welcome heading follows directly: keep them apart */}
      <span aria-hidden="true" className="hidden h-8 lg:flex" />
    </>
  );
}

/**
 * في «أثري» الحقيقية: ما اختاره الزائر في التجربة، مقترحاً لا أكثر. كلّ سطرٍ يقود إلى الموضع
 * الحقيقي الذي يُؤكَّد فيه (الدليل أو بطاقة المكان)، وهناك يضغط «استعمل هذا المبلغ» ثم التأكيد.
 * هذه البطاقة لا تنادي الخادم ولا تُنشئ شيئاً.
 */
export function TrialProposalCard({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const list = useTrialProposals();
  if (list.length === 0) return null;
  return (
    <section
      aria-labelledby="trial-proposals"
      data-trial-proposals
      className={cn(
        "try-rise overflow-hidden rounded-2xl border border-bridge/40 bg-card shadow-soft",
        className,
      )}
    >
      <span aria-hidden="true" className="rule-champagne block w-full" />
      <div className="p-5 md:p-6">
        <p className="text-xs font-bold text-bridge-ink">{c.eyebrow}</p>
        <h2 id="trial-proposals" className="mt-1 text-xl font-bold text-balance">
          {c.title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{c.lead}</p>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {list.map((p) => {
            const country = countryName(p.co, locale);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <ProposalLine p={p} className="basis-full sm:flex-1 sm:basis-auto" />
                <span className="flex items-center gap-1">
                  <Button asChild size="sm" className="min-h-11">
                    {p.track === "sponsorship" ? (
                      <Link to="/orphans" search={{ country: p.co, funding: "open" }}>
                        {c.chooseChild(country)}
                        <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
                      </Link>
                    ) : (
                      <Link to="/support" search={{ c: p.co, kind: p.track }}>
                        {c.supportIn(country)}
                        <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
                      </Link>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => dismissProposal(p.id)}
                    aria-label={c.dismissOne}
                    title={c.notNow}
                    className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * داخل النموذج الحقيقي (ملفّ الطفل، بطاقة المكان): مقترح التجربة سطراً واحداً بزرّ «استعمل هذا
 * المبلغ». لا يغيّر المبلغ من تلقاء نفسه: `onUse` لا يُنادى إلا بضغطة الزائر، وما بعدها زرّ
 * التأكيد الحقيقي كما هو. `usable` يحجب المقترح حين لا تُقبل عملته هنا (لا تحويل صامت).
 */
export function TrialProposalOffer({
  tracks,
  co,
  sameCountryOnly,
  usable,
  onUse,
  className,
}: {
  tracks: readonly TrialTrack[];
  co?: string | null | undefined;
  sameCountryOnly?: boolean;
  usable?: (p: TrialProposal) => boolean;
  onUse: (p: TrialProposal) => void;
  className?: string;
}) {
  const c = useCopy(COPY);
  const list = useTrialProposals();
  const [used, setUsed] = useState<string | null>(null);
  const p = matchProposal(list, { tracks, co, ...(sameCountryOnly ? { sameCountryOnly } : {}) });
  if (!p || (usable && !usable(p))) return null;
  const done = used === p.id;
  return (
    <div
      data-trial-offer
      className={cn("rounded-xl border border-bridge/40 bg-bridge/8 px-4 py-3 text-sm", className)}
    >
      <p className="text-xs font-bold text-bridge-ink">{c.offerFrom}</p>
      <ProposalLine p={p} className="mt-1" />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {done ? (
          <p role="status" className="flex min-h-11 items-center gap-1.5 leading-6">
            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {c.offerUsed}
          </p>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 bg-card"
              onClick={() => {
                onUse(p);
                setUsed(p.id);
              }}
            >
              {c.offerUse}
            </Button>
            <button
              type="button"
              onClick={() => dismissProposal(p.id)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {c.notNow}
            </button>
            <span className="text-xs text-muted-foreground">{c.offerNote}</span>
          </>
        )}
      </div>
    </div>
  );
}
