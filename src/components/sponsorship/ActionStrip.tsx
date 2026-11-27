import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CalendarClock, CreditCard, Loader2, TriangleAlert } from "lucide-react";

import { Name } from "@/components/kit/Name";
import { useLedgers } from "@/components/sponsorship/ledger-query";
import { ManageSponsorshipLink } from "@/components/sponsorship/ManageSponsorship";
import { monthLabel } from "@/components/sponsorship/sponsor-format";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/demo-mode";
import { formatDate, formatMoney } from "@/lib/format";
import type { SponsorshipLedger } from "@/lib/ledger.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { actionItems, newestFirst, type ActionItem } from "@/lib/sponsor-center";
import type { MySponsorship } from "@/lib/sponsorships.functions";
import { trialRoute } from "@/lib/trial-gate";

const COPY = defineCopy("components/sponsorship/ActionStrip", {
  ar: {
    title: "يحتاج إجراءك",
    pending: (amount: string) => `تنتظر الدفع لتبدأ · ${amount}`,
    failed: (month: string) => `تعذّر دفع ${month}`,
    disputed: (month: string) => `دفع ${month} قيد منازعة لدى مزوّد الدفع`,
    resumes: (date: string) => `موقوفة بطلبك، وتُستأنف في ${date}`,
    payNow: "ادفع الآن",
    open: "افتح الشهر",
    resumeNow: "استأنف الآن",
    deletedFile: "ملفّ محذوف",
  },
  en: {
    title: "Needs your action",
    pending: (amount: string) => `Waiting for payment to start · ${amount}`,
    failed: (month: string) => `Payment for ${month} failed`,
    disputed: (month: string) => `Payment for ${month} is disputed with the payment provider`,
    resumes: (date: string) => `Paused at your request; resumes on ${date}`,
    payNow: "Pay now",
    open: "Open the month",
    resumeNow: "Resume now",
    deletedFile: "Deleted file",
  },
});

/** the ledgers the strip reads: the same ones the first cards fetch, from the cache only */
const STRIP_LEDGERS = 6;

/**
 * شريط ما يحتاج الكافل، سطرٌ لكلّ أمر: دفعٌ معلّق، أو شهرٌ تعذّر دفعه أو نوزع فيه، أو إيقافٌ
 * يُستأنف قريباً. يغيب كلّه إن لم يكن شيء: لا «كلّ شيء بخير» يزاحم الطفل.
 * يقرأ السجلّات من الذاكرة التي ملأتها البطاقات، فلا يزيد طلباً.
 */
export function ActionStrip({
  list,
  onPay,
  paying,
  payLabel,
  children,
}: {
  list: readonly MySponsorship[];
  onPay: (id: string) => void;
  paying: string | null;
  /** «أكمل الدفع» أو «تعليمات التحويل» بحسب وضع الدفع */
  payLabel?: string;
  /** شرح وضع الدفع تحت العنوان */
  children?: ReactNode;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const demo = useDemo();
  const ids = newestFirst(list)
    .filter((s) => s.status !== "pending_payment")
    .slice(0, STRIP_LEDGERS)
    .map((s) => s.id);
  const results = useLedgers(ids, false);
  const ledgers: Record<string, SponsorshipLedger | undefined> = {};
  ids.forEach((id, i) => {
    const d = results[i]?.data;
    if (d?.ok && d.ledger) ledgers[id] = d.ledger;
  });
  const items = actionItems(list, ledgers);
  if (items.length === 0) return null;
  const byId = new Map(list.map((s) => [s.id, s]));
  const page = (id: string) =>
    demo
      ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(id)}`) }
      : { to: "/sponsorships/$sponsorshipId" as const, params: { sponsorshipId: id } };
  const manage = (id: string) =>
    demo
      ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(id)}/manage`) }
      : { to: "/sponsorships/$sponsorshipId/manage" as const, params: { sponsorshipId: id } };

  const line = (it: ActionItem, s: MySponsorship) => {
    if (it.kind === "pending") return c.pending(formatMoney(s.amount, s.currency, locale));
    if (it.kind === "resumes") return c.resumes(formatDate(it.on, locale));
    return it.kind === "failed"
      ? c.failed(monthLabel(it.month, locale))
      : c.disputed(monthLabel(it.month, locale));
  };

  return (
    <section
      aria-labelledby="action-strip"
      className="rounded-2xl border border-bridge/40 bg-bridge/8 p-4 sm:p-5"
    >
      <h2 id="action-strip" className="text-base font-bold">
        {c.title}
      </h2>
      {children}
      <ul className="mt-3 space-y-2">
        {items.map((it) => {
          const s = byId.get(it.sponsorshipId)!;
          const Icon =
            it.kind === "resumes"
              ? CalendarClock
              : it.kind === "pending"
                ? CreditCard
                : TriangleAlert;
          return (
            <li
              key={`${it.kind}-${it.sponsorshipId}-${"month" in it ? it.month : ""}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
            >
              <Icon
                className="size-4 shrink-0 text-bridge-ink"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 basis-48 text-sm leading-6">
                <Name className="font-bold">{s.orphan?.display_name ?? c.deletedFile}</Name>
                <span className="block text-muted-foreground">{line(it, s)}</span>
              </p>
              {it.kind === "pending" || it.kind === "failed" ? (
                <Button className="min-h-11" onClick={() => onPay(s.id)} disabled={paying === s.id}>
                  {paying === s.id && <Loader2 className="size-4 animate-spin" />}
                  {it.kind === "pending" && payLabel ? payLabel : c.payNow}
                </Button>
              ) : null}
              {it.kind === "pending" && <ManageSponsorshipLink s={s} />}
              {it.kind === "resumes" ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link {...manage(s.id)}>{c.resumeNow}</Link>
                </Button>
              ) : it.kind !== "pending" ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link {...page(s.id)}>{c.open}</Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
