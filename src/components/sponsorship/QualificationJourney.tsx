import { Check, GraduationCap, Lock, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { STAGE_LABELS, type SponsorQualification } from "@/lib/scopes.functions";
import { arCount, type ArForms } from "@/lib/plural";
import { cn } from "@/lib/utils";

const STAGES = ["concept", "trait", "system", "actions", "measurement", "qualified"] as const;
const SESSIONS: ArForms = {
  zero: "لا جلسات",
  one: "جلسةٌ واحدة",
  two: "جلستان",
  few: "{n} جلسات",
  many: "{n} جلسة",
  other: "{n} جلسة",
};
const MEASURES: ArForms = {
  zero: "لا قياسات",
  one: "قياسٌ واحد",
  two: "قياسان",
  few: "{n} قياسات",
  many: "{n} قياساً",
  other: "{n} قياس",
};
const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ""} ${ym.slice(0, 4)}`;

/**
 * رحلة التأهيل — ما يُبنى بالكفالة: البرنامج، والمرحلة من ستّ، والجلسات
 * التي اجتازها الطفل ومتى، ونموّ أبعاد سماته. لا مخرجات ولا ملاحظات مشرف
 * ولا درجات فردية: هذه للدائرة القريبة وبإذن.
 */
export function QualificationJourney({
  q,
  name,
}: {
  q: SponsorQualification | undefined;
  name: string;
}) {
  if (!q) return null;
  if (!q.allowed) return null;
  if (q.programs.length === 0 && q.growth.length === 0) {
    return (
      <section
        className="rounded-3xl border border-dashed border-border p-8 text-center"
        aria-label="رحلة التأهيل"
      >
        <GraduationCap
          className="mx-auto size-8 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="mt-3 font-semibold">رحلة التأهيل تبدأ قريباً</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-7 text-muted-foreground">
          حين يلتحق {name} ببرنامج تأهيل، تظهر هنا مرحلته والجلسات التي اجتازها ونموّ سماته.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="qj-h">
      <h2 id="qj-h" className="flex items-center gap-2 text-lg font-bold">
        <GraduationCap className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
        رحلة التأهيل
      </h2>

      {q.programs.map((p, pi) => {
        const stageIdx = Math.max(0, STAGES.indexOf(p.stage as (typeof STAGES)[number]));
        const current = p.units.find((u) => u.status !== "accepted");
        const pct = p.total ? Math.round((p.accepted / p.total) * 100) : 0;
        return (
          <article
            key={pi}
            className="stagger-in rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06),0_2px_4px_0_rgb(0_0_0/0.04)]"
            style={{ ["--i" as string]: pi }}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">{p.program}</h3>
              <p className="text-sm text-muted-foreground">
                <strong className="tabular-nums text-foreground">{p.accepted}</strong> من{" "}
                <span className="tabular-nums">{p.total}</span> ·{" "}
                <bdi dir="ltr" className="tabular-nums">
                  {pct}%
                </bdi>
              </p>
            </header>

            {/* المراحل الستّ: من المفهوم إلى الأهلية */}
            <ol
              className="mt-5 grid grid-cols-6 gap-1"
              aria-label={`المرحلة: ${STAGE_LABELS[p.stage] ?? p.stage}`}
            >
              {STAGES.map((s, i) => (
                <li key={s} className="text-center">
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-colors duration-700",
                      i < stageIdx ? "bg-primary" : i === stageIdx ? "bg-bridge" : "bg-secondary",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "mt-1.5 block text-[11px] leading-4",
                      i === stageIdx ? "font-bold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {STAGE_LABELS[s]}
                  </span>
                </li>
              ))}
            </ol>

            {current && (
              <p className="mt-5 flex items-start gap-2 rounded-2xl bg-accent/60 p-4 text-sm leading-7">
                <Sparkles className="mt-1 size-4 shrink-0 text-bridge-ink" aria-hidden="true" />
                <span>
                  <strong>يعمل الآن على:</strong> {current.title}
                  <span className="block text-xs text-muted-foreground">{current.focus}</span>
                </span>
              </p>
            )}

            <ol className="mt-5 space-y-0" aria-label="الجلسات">
              {p.units.map((u) => {
                const done = u.status === "accepted";
                const now = u === current;
                return (
                  <li
                    key={u.ordinal}
                    className={cn(
                      "relative flex items-start gap-3 border-s-2 py-2 ps-5",
                      done ? "border-primary" : "border-border",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -start-[9px] top-2.5 grid size-4 place-items-center rounded-full ring-4 ring-card",
                        done
                          ? "bg-primary text-primary-foreground"
                          : now
                            ? "bg-card shadow-[0_0_0_2px_var(--color-bridge)]"
                            : "bg-secondary",
                      )}
                    >
                      {done && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm",
                          done || now ? "font-medium" : "text-muted-foreground",
                        )}
                      >
                        <span className="tabular-nums text-muted-foreground">{u.ordinal}.</span>{" "}
                        {u.title}
                      </span>
                      {done && u.accepted_month && (
                        <span className="block text-xs text-primary">
                          اجتازها في {monthName(u.accepted_month)}
                        </span>
                      )}
                      {!done && u.status === "submitted" && (
                        <span className="block text-xs text-bridge-ink">
                          سلّمها — قيد تقويم المشرف
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}

      {q.growth.length > 0 && (
        <article className="stagger-in rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
          <h3 className="font-bold">نموّ السمات</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            متوسّط كل بُعدٍ عند أوّل قياسٍ وآخره، كما يرصده المشرف في برنامج التأهيل.
          </p>
          <ul className="mt-5 space-y-4">
            {q.growth.map((g) => {
              const delta = g.latest - g.first;
              return (
                <li key={g.dimension}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{g.dimension}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 tabular-nums",
                        delta > 0
                          ? "text-primary"
                          : delta < 0
                            ? "text-bridge-ink"
                            : "text-muted-foreground",
                      )}
                    >
                      {delta > 0 ? (
                        <TrendingUp className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                      ) : delta < 0 ? (
                        <TrendingDown className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                      ) : null}
                      {g.first}% ← {g.latest}%
                    </span>
                  </div>
                  <div className="relative mt-2 h-2 rounded-full bg-secondary" aria-hidden="true">
                    <div
                      className="absolute inset-y-0 start-0 rounded-full bg-primary/25"
                      style={{ width: `${g.first}%` }}
                    />
                    <div
                      className="map-grow absolute inset-y-0 start-0 rounded-full bg-primary"
                      style={{ width: `${g.latest}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {arCount(g.observations, MEASURES)}
                  </p>
                </li>
              );
            })}
          </ul>
        </article>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        مخرجات الجلسات وملاحظات المشرف وتفاصيل السمات تبقى للدائرة القريبة من الطفل، وتُطلب بإذن.
      </p>
    </section>
  );
}
