import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CircleSlash, Loader2, Pause, Play, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildTimeline } from "@/components/sponsorship/ChildTimeline";
import { AmountForm, CancelForm, PauseForm } from "@/components/sponsorship/SponsorshipControls";
import {
  listMySponsorships,
  resumeSponsorship,
  type MySponsorship,
} from "@/lib/sponsorships.functions";
import { useStatusLabel } from "@/components/sponsorship/status-copy";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { trialRoute } from "@/lib/trial-gate";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/ManageSponsorship", {
  ar: {
    manage: "إدارة الكفالة",
    back: "→ العودة إلى أثري",
    title: (name: string) => `كفالة ${name}`,
    lead: "كلّ ما يمكنك تغييره في كفالتك في مكانٍ واحد. لا يحدث شيءٌ قبل أن تؤكّده، وكلّ خطوةٍ تقول ما سيحدث قبل الضغط.",
    monthly: (amount: string) => `${amount} شهرياً`,
    once: (amount: string) => `${amount} لمرّة واحدة`,
    since: (date: string) => `منذ ${date}`,
    pausedUntil: (date: string) => `موقوفة بطلبك حتى ${date}، ثم تُستأنف تلقائياً.`,
    providerPaused: "أوقف مزوّد الدفع التحصيل مؤقّتاً؛ يُرفع الإيقاف من جهته.",
    endsOn: (date: string) => `تنتهي في ${date} بعد آخر شهرٍ مدفوع، ولا يُحصَّل منك شيءٌ بعدها.`,
    ended: "انتهت هذه الكفالة، فلا شيء فيها يُغيَّر. يبقى سجلّها وأثرها في صفحتها.",
    details: "رحلة الطفل والإيصالات",
    childFile: "ملفّ الطفل",
    pause: {
      title: "إيقاف مؤقّت",
      what: "من شهرٍ إلى ثلاثة بعد آخر شهرٍ دفعته. لا يُنتظر منك تحويلٌ خلالها، ويبقى مكانك مع الطفل، ثم تُستأنف تلقائياً.",
      action: "اختر المدّة",
    },
    resume: {
      title: "الاستئناف الآن",
      what: "تعود الكفالة جاريةً من اليوم، ويُنتظر التحويل القادم بمبلغها الحالي.",
      action: "استأنف",
      confirmTitle: (name: string) => `استئناف كفالة ${name}`,
      confirmText: (amount: string) =>
        `تعود الكفالة جاريةً الآن بمبلغ ${amount} شهرياً، ويُنتظر منك التحويل القادم في موعده.`,
      confirm: "نعم، استأنفها",
      keep: "ابقَ موقوفة",
      done: "استُؤنفت الكفالة",
    },
    amount: {
      title: "تعديل المبلغ",
      what: "المبلغ الجديد يسري من التحويل القادم، وما دُفع قبله لا يتغيّر.",
      action: "عدّل المبلغ",
    },
    cancel: {
      title: "إنهاء الكفالة",
      what: "لا تنتهي فوراً: تبقى جاريةً حتى آخر شهرٍ دفعته فيصل الطفلَ كاملاً، ثم تنتهي بلا أيّ تحصيلٍ بعدها.",
      whatPending: "لم يُدفع شيءٌ بعد، فيُلغى الطلب فوراً ولا يُطلب منك تحويل.",
      action: "أنهِ الكفالة",
      actionPending: "ألغِ الطلب",
    },
    why: {
      card: "كفالة البطاقة لا تُوقَف ولا يُعدَّل مبلغها من هنا بعد.",
      ending: "سُجّل إنهاء هذه الكفالة، فلا تُغيَّر بعد الآن.",
      notActive: "متاحٌ للكفالة الجارية وحدها.",
      notPaused: "الكفالة ليست موقوفةً بطلبك.",
      providerPaused: "الإيقاف من مزوّد الدفع، فلا يُرفع من هنا.",
    },
    unavailable: "غير متاح الآن",
    notFound: "لم نجد هذه الكفالة في حسابك.",
    loadFailed: "تعذّر تحميل الكفالة. حاول مرّةً أخرى.",
    retry: "إعادة المحاولة",
    timeline: "آخر ما في رحلته",
  },
  en: {
    manage: "Manage sponsorship",
    back: "← Back to my impact",
    title: (name: string) => `Sponsoring ${name}`,
    lead: "Everything you can change in your sponsorship, in one place. Nothing happens until you confirm, and each step says what will happen before you press.",
    monthly: (amount: string) => `${amount} monthly`,
    once: (amount: string) => `${amount} once`,
    since: (date: string) => `since ${date}`,
    pausedUntil: (date: string) =>
      `Paused at your request until ${date}, then it resumes on its own.`,
    providerPaused: "The payment provider paused collection; it is lifted on their side.",
    endsOn: (date: string) =>
      `Ends on ${date} after the last paid month. Nothing is collected after that.`,
    ended:
      "This sponsorship has ended, so nothing in it can change. Its record and impact stay on its page.",
    details: "The child's journey and receipts",
    childFile: "Child's file",
    pause: {
      title: "Pause",
      what: "One to three months after your last paid month. No transfer is expected meanwhile, your place with the child is kept, and it resumes on its own.",
      action: "Choose a length",
    },
    resume: {
      title: "Resume now",
      what: "The sponsorship is ongoing again from today, and the next transfer is expected at its current amount.",
      action: "Resume",
      confirmTitle: (name: string) => `Resume sponsoring ${name}`,
      confirmText: (amount: string) =>
        `The sponsorship is ongoing again now at ${amount} monthly, and your next transfer is expected on schedule.`,
      confirm: "Yes, resume it",
      keep: "Keep it paused",
      done: "Sponsorship resumed",
    },
    amount: {
      title: "Change amount",
      what: "The new amount applies from the next transfer; what was already paid doesn't change.",
      action: "Change amount",
    },
    cancel: {
      title: "End sponsorship",
      what: "It doesn't end at once: it stays ongoing until the last month you paid, so the child receives it in full, then ends with nothing collected after.",
      whatPending:
        "Nothing has been paid yet, so the request is cancelled now and no transfer is asked of you.",
      action: "End sponsorship",
      actionPending: "Cancel request",
    },
    why: {
      card: "Card sponsorships can't be paused or changed here yet.",
      ending: "This sponsorship is already set to end, so it no longer changes.",
      notActive: "Available for an ongoing sponsorship only.",
      notPaused: "This sponsorship isn't paused at your request.",
      providerPaused: "The payment provider paused it, so it can't be lifted here.",
    },
    unavailable: "Not available now",
    notFound: "We couldn't find this sponsorship in your account.",
    loadFailed: "Your sponsorship couldn't load. Please try again.",
    retry: "Try again",
    timeline: "Latest in the journey",
  },
});

type Mode = "pause" | "amount" | "cancel" | "resume" | null;

/** ما يُتاح لكفالةٍ، وسبب ما لا يُتاح — بحكم الدوالّ نفسها في القاعدة. */
function sponsorshipActions(s: MySponsorship) {
  const card = Boolean(s.provider_subscription_id);
  const ending = Boolean(s.cancel_effective_at);
  const ended = s.status === "cancelled" || s.status === "completed";
  const changeable =
    s.status === "active" || s.status === "paused" || s.status === "pending_payment";
  type Why = keyof typeof COPY.ar.why | null;
  const pause: Why = ending ? "ending" : card ? "card" : s.status !== "active" ? "notActive" : null;
  const resume: Why =
    s.status !== "paused" ? "notPaused" : !s.paused_until ? "providerPaused" : null;
  const amount: Why = ending ? "ending" : card ? "card" : !changeable ? "notActive" : null;
  const cancel: Why = ending ? "ending" : !changeable ? "notActive" : null;
  return { ended, pause, resume, amount, cancel };
}

export function ManageSponsorshipLink({ s }: { s: MySponsorship }) {
  const c = useCopy(COPY);
  const demo = useDemo();
  if (sponsorshipActions(s).ended) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link
        // في التجربة شاشة الإدارة نفسها تحت «جرّب»، على كفالات الجلسة.
        {...(demo
          ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(s.id)}/manage`) }
          : { to: "/sponsorships/$sponsorshipId/manage", params: { sponsorshipId: s.id } })}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {c.manage}
      </Link>
    </Button>
  );
}

export function ManageSponsorship({ sponsorshipId }: { sponsorshipId: string }) {
  const c = useCopy(COPY);
  const demo = useDemo();
  const fetchList = useDataFn("sponsor.manage.list", listMySponsorships);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: useDataKey(["my-sponsorships"]),
    queryFn: () => fetchList(),
  });

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || data?.error) {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-destructive">{c.loadFailed}</p>
        <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
          {c.retry}
        </Button>
      </div>
    );
  }
  const s = data?.sponsorships.find((x) => x.id === sponsorshipId);
  if (!s) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <p className="text-muted-foreground">{c.notFound}</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to={demo ? trialRoute("/try/impact") : "/dashboard"}>{c.back}</Link>
        </Button>
      </div>
    );
  }
  return <ManageBody s={s} />;
}

function ManageBody({ s }: { s: MySponsorship }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const demo = useDemo();
  const listKey = useDataKey(["my-sponsorships"]);
  const [mode, setMode] = useState<Mode>(null);
  const name = s.orphan?.display_name ?? "—";
  const a = sponsorshipActions(s);
  const money = formatMoney(s.amount, s.currency, locale);
  const pending = s.status === "pending_payment";

  const done = async () => {
    setMode(null);
    await qc.invalidateQueries({ queryKey: listKey });
  };

  const state = s.cancel_effective_at
    ? c.endsOn(formatDate(s.cancel_effective_at, locale))
    : s.status === "paused" && s.paused_until
      ? c.pausedUntil(formatDate(s.paused_until, locale))
      : s.status === "paused"
        ? c.providerPaused
        : a.ended
          ? c.ended
          : null;

  return (
    <div className="space-y-8">
      <Link
        to={demo ? trialRoute("/try/impact") : "/dashboard"}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
      >
        {c.back}
      </Link>

      <header className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-2xl leading-snug font-bold text-balance">
            {c.title(isolate(name))}
          </h2>
          <Badge variant={s.status === "active" ? "default" : "secondary"}>
            {statusLabel(s.status)}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {s.type === "monthly" ? c.monthly(money) : c.once(money)} ·{" "}
          {c.since(formatDate(s.started_at ?? s.created_at, locale))}
        </p>
        {state && (
          <p className="mt-3 rounded-xl bg-bridge/8 px-3 py-2 text-sm leading-7 text-bridge-ink">
            {state}
          </p>
        )}
        <p className="mt-3 max-w-prose text-sm leading-7 text-pretty text-muted-foreground">
          {c.lead}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* صفحة الطفل نفسها؛ في التجربة على كفالات الجلسة */}
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link
              {...(demo
                ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(s.id)}`) }
                : { to: "/sponsorships/$sponsorshipId", params: { sponsorshipId: s.id } })}
            >
              {c.details}
            </Link>
          </Button>
          {s.orphan && (
            <Button asChild size="sm" variant="ghost">
              <Link
                {...(demo
                  ? { to: trialRoute(`/try/${encodeURIComponent(s.orphan.id)}`) }
                  : { to: "/orphans/$orphanId", params: { orphanId: s.orphan.id } })}
              >
                {c.childFile}
              </Link>
            </Button>
          )}
        </div>
      </header>

      {!a.ended && (
        <section aria-label={c.manage} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* الاستئناف أوّلاً حين تكون موقوفة بطلبه: هو الفعل الأقرب لحاله */}
          {s.status === "paused" && (
            <ActionCard
              icon={<Play className="size-4" strokeWidth={1.75} />}
              title={c.resume.title}
              what={c.resume.what}
              action={c.resume.action}
              blocked={a.resume && c.why[a.resume]}
              unavailable={c.unavailable}
              onClick={() => setMode("resume")}
            />
          )}
          {s.status !== "paused" && !pending && (
            <ActionCard
              icon={<Pause className="size-4" strokeWidth={1.75} />}
              title={c.pause.title}
              what={c.pause.what}
              action={c.pause.action}
              blocked={a.pause && c.why[a.pause]}
              unavailable={c.unavailable}
              onClick={() => setMode("pause")}
            />
          )}
          <ActionCard
            icon={<SlidersHorizontal className="size-4" strokeWidth={1.75} />}
            title={c.amount.title}
            what={c.amount.what}
            action={c.amount.action}
            blocked={a.amount && c.why[a.amount]}
            unavailable={c.unavailable}
            onClick={() => setMode("amount")}
          />
          <ActionCard
            icon={<CircleSlash className="size-4" strokeWidth={1.75} />}
            title={c.cancel.title}
            what={pending ? c.cancel.whatPending : c.cancel.what}
            action={pending ? c.cancel.actionPending : c.cancel.action}
            blocked={a.cancel && c.why[a.cancel]}
            unavailable={c.unavailable}
            quiet
            onClick={() => setMode("cancel")}
          />
        </section>
      )}

      {s.orphan && !pending && (
        <section aria-labelledby="manage-timeline">
          <h3 id="manage-timeline" className="text-lg font-bold">
            {c.timeline}
          </h3>
          <ChildTimeline orphanId={s.orphan.id} name={name} />
        </section>
      )}

      <Dialog open={mode !== null} onOpenChange={(v) => !v && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          {mode === "cancel" && (
            <CancelForm
              s={s}
              name={name}
              card={Boolean(s.provider_subscription_id)}
              onAlternative={(m) => setMode(m)}
              onDone={done}
            />
          )}
          {mode === "pause" && <PauseForm s={s} name={name} onDone={done} />}
          {mode === "amount" && <AmountForm s={s} name={name} onDone={done} />}
          {mode === "resume" && (
            <ResumeConfirm
              s={s}
              name={name}
              money={money}
              onCancel={() => setMode(null)}
              onDone={done}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  what,
  action,
  blocked,
  unavailable,
  quiet = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  what: string;
  action: string;
  blocked: string | null | false;
  unavailable: string;
  quiet?: boolean;
  onClick: () => void;
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]",
        blocked && "bg-secondary/40 shadow-none",
      )}
    >
      <h3 className="flex items-center gap-2 font-bold">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground"
        >
          {icon}
        </span>
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-7 text-pretty text-muted-foreground">{what}</p>
      {blocked ? (
        <p className="mt-4 text-sm leading-6">
          <span className="font-semibold">{unavailable}.</span> {blocked}
        </p>
      ) : (
        <Button
          type="button"
          variant={quiet ? "ghost" : "outline"}
          className={cn(
            "mt-4 min-h-11 self-start",
            quiet && "text-destructive hover:text-destructive",
          )}
          onClick={onClick}
        >
          {action}
        </Button>
      )}
    </article>
  );
}

function ResumeConfirm({
  s,
  name,
  money,
  onCancel,
  onDone,
}: {
  s: MySponsorship;
  name: string;
  money: string;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const c = useCopy(COPY);
  const resume = useDataFn("sponsor.manage.resume", resumeSponsorship);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await resume({ data: { id: s.id } });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(c.resume.done);
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>{c.resume.confirmTitle(isolate(name))}</DialogTitle>
        <DialogDescription className="leading-7">{c.resume.confirmText(money)}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="mt-6 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {c.resume.keep}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {c.resume.confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}
