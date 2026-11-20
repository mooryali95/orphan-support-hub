import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, FastForward, FileCheck2, MessageSquareText, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { milestones, nextMilestone } from "@/lib/milestones";
import type { MyImpact } from "@/lib/my-impact";
import { monthStory, nextTryChild, tryChild, type TryGift } from "@/lib/try-demo";
import { cn } from "@/lib/utils";

const ICON = { transfer: Send, delivery: FileCheck2, note: MessageSquareText } as const;
const MAX_AHEAD = 12;
const monthsAr = (n: number) =>
  n === 1 ? "شهر" : n === 2 ? "شهرين" : n <= 10 ? `${n} أشهر` : `${n} شهراً`;

/**
 * «رحلتك عبر الأشهر»: الداعم يقدّم الزمن شهراً فيرى ما سيصله فعلاً (التحويل، مستند التسليم،
 * كلمة المشرف)، وتتقدّم محطّاته. محاكاةٌ صريحة فوق عطاءات التجربة؛ لا تُحفظ ولا تغيّر شيئاً.
 */
export function TryJourneyAhead({
  gifts,
  impact,
  ahead,
  onAhead,
}: {
  gifts: TryGift[];
  impact: MyImpact;
  ahead: number;
  onAhead: (n: number) => void;
}) {
  const monthly = gifts.find((g) => g.cadence === "monthly");
  const child = monthly ? tryChild(monthly.childId) : undefined;
  const list = milestones(impact);
  const next = nextMilestone(list);
  const suggestion = nextTryChild(gifts);

  return (
    <section aria-labelledby="journey-ahead" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="journey-ahead" className="text-xl font-bold">
          رحلتك عبر الأشهر
        </h2>
        <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
          محاكاة
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        قدّم الزمن شهراً لترى ما يصلك بعد الكفالة، ومحطّاتك وهي تتحقّق.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="font-display text-2xl font-bold">
              {ahead === 0 ? "اليوم" : `بعد ${monthsAr(ahead)}`}
            </p>
            <div className="flex gap-2">
              {ahead > 0 && (
                <Button variant="outline" size="sm" onClick={() => onAhead(0)}>
                  عُد إلى اليوم
                </Button>
              )}
              <Button
                size="sm"
                disabled={!child || ahead >= MAX_AHEAD}
                onClick={() => onAhead(Math.min(MAX_AHEAD, ahead + 1))}
              >
                <FastForward className="size-4" aria-hidden="true" />
                قدّم شهراً
              </Button>
            </div>
          </div>
          {!child ? (
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              تقديم الزمن للكفالة الشهرية: ابدأ كفالةً شهرية لترى تقاريرها تتوالى.
            </p>
          ) : ahead === 0 ? (
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              كفالتك لـ{child.name} جارية. اضغط «قدّم شهراً» لترى ما يحمله الشهر القادم.
            </p>
          ) : (
            <ol key={ahead} className="try-rise mt-4 space-y-3">
              {monthStory(child, monthly!.amount, ahead).map((s) => {
                const Icon = ICON[s.key];
                return (
                  <li key={s.key} className="flex gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{s.title}</span>
                      <span className="block text-sm leading-6 text-muted-foreground">
                        {s.text}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-bold">محطّاتك</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {list.map((m) => (
              <li
                key={m.key}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm",
                  m.done
                    ? "border-primary/25 bg-primary/8 font-bold text-primary"
                    : m === next
                      ? "border-bridge/50 text-foreground"
                      : "border-border text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full",
                    m.done ? "bg-primary text-primary-foreground" : "border border-current",
                  )}
                >
                  {m.done && <Check className="size-3" />}
                </span>
                {m.title}
                <span className="sr-only">{m.done ? ": تحقّقت" : ": لم تتحقّق بعد"}</span>
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="mt-3 text-sm leading-6 text-muted-foreground">
            {next ? (
              <>
                القادمة: <b className="text-foreground">{next.title}</b>. {next.hint}
              </>
            ) : (
              "تحقّقت محطّاتك كلّها. جزاك الله خيراً."
            )}
          </p>
        </div>
      </div>

      {suggestion && (
        <Link
          to="/try/$childId"
          params={{ childId: suggestion.id }}
          className="mt-4 flex items-center gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-secondary"
        >
          <span className="mural-placeholder grid size-14 shrink-0 place-items-center rounded-2xl font-display text-2xl font-bold text-white">
            {suggestion.name.charAt(0)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-bridge-ink">الخطوة التالية</span>
            <span className="block font-bold">
              {suggestion.name} في {suggestion.country} ينتظر منذ {suggestion.waitingDays} يوماً
            </span>
            <span className="block text-sm text-muted-foreground">
              هو الأطول انتظاراً ممّن لم تكفلهم بعد.
            </span>
          </span>
          <ArrowLeft className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
