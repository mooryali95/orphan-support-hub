import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, User } from "lucide-react";

import { Bar, Eyebrow, Tally, useNum, useT, VisionShell } from "@/components/vision/VisionKit";
import { pageTitle } from "@/config/brand";
import { Feed, useMoney } from "@/components/vision/VisionStore";
import { ALBANIA_GROUPS, CYCLE } from "@/data/vision-demo";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vision/cycle")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: CyclePage,
});

const COPY = defineCopy("routes/vision.cycle", {
  ar: {
    label: "ما نسعى إليه",
    title: "اليتيم في قلب المنظومة",
    lead: "عطاءٌ واحد يمرّ بالطبقات الثلاث: يصل إلى المجموعة، ويعود أثرُه من حول اليتيم، ثم يتحرّك الرقم ويعود القرار إلى الميدان.",
    orphan: "اليتيم",
    ringOps: "التشغيل · المشرف والمجموعة",
    ringSupport: "الدعم · الداعم",
    ringDecision: "القرار · صاحب القرار",
    donor: "الداعم",
    group: "المجموعة",
    decider: "صاحب القرار",
    newGroup: "مجموعة جديدة",
    campaign: "حملة تيرانا",
    support: "الدعم",
    supportSees: "يرى الداعم: أسماء مستعارة، والتقدّم",
    toTirana: "دعمٌ لمجموعة تيرانا",
    lines: [
      "وصل دعمك إلى المجموعة",
      "اكتملت جلسات مفهوم «النيّة المثمرة»",
      "نمت سمة الرشد بين القياسين",
    ],
    ops: "التشغيل",
    opsSees: "يرى المشرف: المجموعة، والجلسات، والقياس",
    sessions: "جلسات المفهوم",
    trait: "سمة الرشد",
    decision: "القرار",
    decisionSees: "يرى صاحب القرار: الأرقام المجمّعة فقط",
    funding: "تمويل التأهيل في تيرانا",
    groups: "مجموعات مموّلة في ألبانيا",
    ofGroups: (n: number) => `من ${n} مجموعة إشرافية`,
    decided: "قرار: حملة لتيرانا، ومجموعة جديدة",
    legendDonate: "التبرّع يصل إلى الميدان",
    legendImpact: "الأثر يعود من حول اليتيم",
    legendDecision: "القرار يعود إلى الميدان",
    play: "تشغيل",
    pause: "إيقاف",
    prev: "الخطوة السابقة",
    next: "الخطوة التالية",
    again: "من البداية",
    step: (a: number, b: number) => `الخطوة ${a} من ${b}`,
    closing: "واليتيم في قلبها جميعاً، كلّ طبقةٍ ترى ما يحقّ لها أن تراه.",
  },
  en: {
    label: "What we aim for",
    title: "The orphan at the heart of the system",
    lead: "One donation passes through all three layers: it reaches the group, its impact returns from around the orphan, the number moves, and the decision returns to the field.",
    orphan: "Orphan",
    ringOps: "Operations · supervisor and group",
    ringSupport: "Support · supporter",
    ringDecision: "Decision · decision-maker",
    donor: "Supporter",
    group: "Group",
    decider: "Decision-maker",
    newGroup: "New group",
    campaign: "Tirana campaign",
    support: "Support",
    supportSees: "The supporter sees pseudonyms and progress",
    toTirana: "Support for the Tirana group",
    lines: [
      "Your support reached the group",
      "The “fruitful intention” sessions are complete",
      "Maturity grew between the two measurements",
    ],
    ops: "Operations",
    opsSees: "The supervisor sees the group, sessions and measurement",
    sessions: "Concept sessions",
    trait: "Maturity trait",
    decision: "Decision",
    decisionSees: "The decision-maker sees aggregates only",
    funding: "Tirana qualification funding",
    groups: "Funded groups in Albania",
    ofGroups: (n: number) => `of ${n} supervised groups`,
    decided: "Decision: a Tirana campaign and a new group",
    legendDonate: "The donation reaches the field",
    legendImpact: "Impact returns from around the orphan",
    legendDecision: "The decision returns to the field",
    play: "Play",
    pause: "Pause",
    prev: "Previous step",
    next: "Next step",
    again: "From the start",
    step: (a: number, b: number) => `Step ${a} of ${b}`,
    closing:
      "And the orphan at the heart of it all, with each layer seeing only what it is entitled to.",
  },
});

/* ── الهندسة: مركزٌ وثلاث حلقات ── */
const C = 300;
const R = { ops: 140, support: 205, decision: 268 } as const;
const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};
const P = {
  donor: at(R.support, -38),
  group: at(R.ops, 12),
  decider: at(R.decision, 188),
  newGroup: at(R.ops, 158),
};
const MEMBERS = [40, 60, 80, 100, 120, 140].map((d) => at(R.ops, d));
/** منحنى بين نقطتين يمرّ قرب المركز قليلاً — كالخيط في الفيلم. */
const curve = (a: { x: number; y: number }, b: { x: number; y: number }, pull = 0.35) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx + (C - mx) * pull;
  const cy = my + (C - my) * pull;
  return `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
};
const PATHS = {
  donate: curve(P.donor, P.group, 0.15),
  impact: curve({ x: C, y: C }, P.donor, 0.0),
  decision: curve({ x: C, y: C }, P.decider, 0.0),
  back: curve(P.decider, P.newGroup, 0.2),
};
const arc = (r: number) => `M${C - r},${C} A${r},${r} 0 0 1 ${C + r},${C}`;

function CyclePage() {
  const c = useCopy(COPY);
  const tr = useT();
  const money = useMoney();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const step = CYCLE[i]!;
  const last = CYCLE.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setI((x) => Math.min(last, x + 1)), i === 0 ? 3200 : 4600);
    return () => window.clearTimeout(id);
  }, [playing, i, last]);

  const go = (n: number) => {
    setPlaying(false);
    setI(Math.max(0, Math.min(last, n)));
  };

  return (
    <VisionShell>
      <section className="mx-auto max-w-7xl px-4 py-12 md:py-16">
        <Eyebrow label={c.label} title={c.title} lead={c.lead} />

        <div className="mt-10 grid items-center gap-6 lg:grid-cols-[19rem_1fr_19rem]">
          <div className="space-y-4">
            <SupportCard i={i} />
            <OpsCard i={i} />
          </div>
          <div className="max-lg:order-first">
            <Orbit i={i} />
          </div>
          <DecisionCard i={i} />
        </div>

        {/* السرد والتحكّم */}
        <div className="mx-auto mt-8 max-w-2xl text-center">
          <div aria-live="polite" key={step.key} className="vision-rise">
            <p className="text-xs text-gold-ink">{c.step(i + 1, CYCLE.length)}</p>
            <h2 className="mt-1 text-2xl font-extrabold text-wine md:text-3xl">{tr(step.title)}</h2>
            <p className="mt-2 leading-8 text-muted-foreground">
              {tr(step.text).replace("{amount}", money(step.support.amount))}
            </p>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label={c.prev}
              onClick={() => go(i - 1)}
              disabled={i === 0}
              className="vision-ctl"
            >
              <ChevronRight className="size-5 ltr:-scale-x-100" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => (i >= last ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wine px-5 font-semibold text-ivory shadow-[0_8px_24px_-10px_rgb(107_29_46/0.7)] transition-transform active:scale-[0.97]"
            >
              {i >= last ? (
                <RotateCcw className="size-4" aria-hidden="true" />
              ) : playing ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {i >= last ? c.again : playing ? c.pause : c.play}
            </button>
            <button
              type="button"
              aria-label={c.next}
              onClick={() => go(i + 1)}
              disabled={i === last}
              className="vision-ctl"
            >
              <ChevronLeft className="size-5 ltr:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
          <ol className="mt-4 flex justify-center gap-1.5" aria-label={c.step(i + 1, CYCLE.length)}>
            {CYCLE.map((s, k) => (
              <li key={s.key}>
                <button
                  type="button"
                  aria-label={tr(s.title)}
                  aria-current={k === i ? "step" : undefined}
                  onClick={() => go(k)}
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-500",
                    k === i ? "w-8 bg-wine" : k < i ? "w-3 bg-wine/40" : "w-3 bg-wine/15",
                  )}
                />
              </li>
            ))}
          </ol>
          {i === last && <p className="vision-rise mt-6 font-semibold text-wine">{c.closing}</p>}
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 pb-12">
        <Feed limit={8} />
      </div>
    </VisionShell>
  );
}

function Orbit({ i }: { i: number }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const s = CYCLE[i]!.key;
  const reached = i >= 2;
  const sessionsLit = i >= 3 ? 6 : i >= 2 ? 2 : 0;
  const glow = (k: string) => s === k;
  return (
    <figure className="relative mx-auto w-full max-w-[36rem]">
      <svg
        viewBox="0 0 600 600"
        className="w-full"
        role="img"
        aria-label={c.title}
        direction={locale === "ar" ? "rtl" : "ltr"}
      >
        <defs>
          <radialGradient id="cyc-core" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#8a2a3f" />
            <stop offset="100%" stopColor="var(--color-wine-ink)" />
          </radialGradient>
          <radialGradient id="cyc-halo">
            <stop offset="0%" stopColor="#f3e3c3" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f3e3c3" stopOpacity="0" />
          </radialGradient>
          {(["ops", "support", "decision"] as const).map((k) => (
            <path key={k} id={`cyc-arc-${k}`} d={arc(R[k] + 12)} />
          ))}
        </defs>

        <circle cx={C} cy={C} r={250} fill="url(#cyc-halo)" opacity={0.6} />
        {/* الحلقات تظهر من الداخل إلى الخارج */}
        {(
          [
            ["ops", "#7a2b3b", c.ringOps],
            ["support", "var(--color-gold)", c.ringSupport],
            ["decision", "#8b5563", c.ringDecision],
          ] as const
        ).map(([k, color, label], n) => (
          <g key={k} className="cyc-ring" style={{ ["--d" as string]: `${200 + n * 220}ms` }}>
            <circle
              cx={C}
              cy={C}
              r={R[k]}
              fill="none"
              stroke={color}
              strokeOpacity={0.45}
              strokeWidth={1.4}
            />
            <text className="fill-wine-ink text-[15px] font-bold">
              <textPath href={`#cyc-arc-${k}`} startOffset="50%" textAnchor="middle">
                {label}
              </textPath>
            </text>
          </g>
        ))}

        {/* أعضاء المجموعة على حلقة التشغيل: يضيئون مع الجلسات */}
        {MEMBERS.map((m, k) => (
          <circle
            key={k}
            cx={m.x}
            cy={m.y}
            r={8}
            className="transition-all duration-700"
            fill={k < sessionsLit ? "var(--color-wine)" : "#e9d9da"}
            stroke="var(--color-ivory)"
            strokeWidth={3}
          />
        ))}

        {/* الخيوط بين الطبقات */}
        <path
          d={PATHS.donate}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={2}
          className={cn("cyc-thread", i >= 1 && "on")}
        />
        <path
          d={PATHS.impact}
          fill="none"
          stroke="var(--color-wine)"
          strokeWidth={2}
          className={cn("cyc-thread", i >= 4 && "on")}
        />
        <path
          d={PATHS.decision}
          fill="none"
          stroke="var(--color-wine)"
          strokeWidth={2}
          className={cn("cyc-thread", i >= 5 && "on")}
        />
        <path
          d={PATHS.back}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={2}
          strokeDasharray="6 6"
          className={cn("cyc-thread dashed", i >= 6 && "on")}
        />

        {/* الحبّة المسافرة: ما يتحرّك في هذه الخطوة */}
        {(
          [
            ["donate", PATHS.donate, "var(--color-gold)"],
            ["reach", PATHS.donate, "var(--color-gold)"],
            ["measure", PATHS.impact, "var(--color-wine)"],
            ["number", PATHS.decision, "var(--color-wine)"],
            ["decide", PATHS.back, "var(--color-gold)"],
          ] as const
        )
          .filter(([k]) => k === s)
          .map(([k, d, color]) => (
            <circle key={k} r={7} fill={color} className="cyc-bead">
              <animateMotion
                dur="1.8s"
                repeatCount="indefinite"
                path={d}
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="spline"
                keySplines="0.4 0 0.2 1"
              />
            </circle>
          ))}

        {/* العقد */}
        <Node
          p={P.donor}
          label={c.donor}
          color="var(--color-gold)"
          active={glow("donate") || glow("measure")}
        />
        <Node
          p={P.group}
          label={c.group}
          color="var(--color-wine)"
          active={glow("reach") || glow("sessions")}
          lit={reached}
        />
        <Node
          p={P.decider}
          label={c.decider}
          color="var(--color-wine)"
          active={glow("number") || glow("decide")}
        />
        {i >= 6 && (
          <g className="cyc-pop">
            <Node p={P.newGroup} label={c.newGroup} color="var(--color-gold)" active />
            <g transform={`translate(${P.decider.x + 26},${P.decider.y + 52})`}>
              <rect x={-58} y={-15} width={116} height={30} rx={15} fill="var(--color-wine)" />
              <text textAnchor="middle" dy={5} className="fill-ivory text-[13px] font-bold">
                {c.campaign}
              </text>
            </g>
          </g>
        )}

        {/* اليتيم */}
        <g className="cyc-core">
          <circle cx={C} cy={C} r={74} fill="var(--color-ivory)" />
          <circle
            cx={C}
            cy={C}
            r={66}
            fill="url(#cyc-core)"
            className={cn(i >= 4 && "cyc-heart")}
          />
          <circle
            cx={C}
            cy={C}
            r={58}
            fill="none"
            stroke="var(--color-gold)"
            strokeOpacity={0.35}
          />
          <foreignObject x={C - 20} y={C - 36} width={40} height={40}>
            <User className="size-10 text-gold" strokeWidth={1.6} aria-hidden="true" />
          </foreignObject>
          <text x={C} y={C + 30} textAnchor="middle" className="fill-ivory text-[17px] font-bold">
            {c.orphan}
          </text>
        </g>
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Legend color="bg-gold" label={c.legendDonate} />
        <Legend color="bg-wine" label={c.legendImpact} />
        <Legend color="bg-gold" dashed label={c.legendDecision} />
      </figcaption>
    </figure>
  );
}

function Node({
  p,
  label,
  color,
  active,
  lit = true,
}: {
  p: { x: number; y: number };
  label: string;
  color: string;
  active?: boolean;
  lit?: boolean;
}) {
  const left = p.x < C;
  return (
    <g>
      {active && <circle cx={p.x} cy={p.y} r={24} fill={color} className="cyc-ping" />}
      <circle cx={p.x} cy={p.y} r={22} fill={color} opacity={0.14} />
      <circle
        cx={p.x}
        cy={p.y}
        r={11}
        fill={lit ? color : "#e9d9da"}
        stroke="var(--color-ivory)"
        strokeWidth={3}
        className="transition-all duration-700"
      />
      <text
        x={p.x + (left ? -30 : 30)}
        y={p.y - 18}
        textAnchor={left ? "end" : "start"}
        className="fill-wine-ink text-[15px] font-bold"
        direction="rtl"
      >
        {label}
      </text>
    </g>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <i
        aria-hidden="true"
        className={cn(
          "h-0.5 w-5 rounded-full",
          dashed
            ? "bg-[length:6px_2px] bg-repeat-x [background-image:linear-gradient(90deg,var(--color-gold)_60%,transparent_0)]"
            : color,
        )}
      />
      {label}
    </span>
  );
}

function Panel({
  title,
  sees,
  dark,
  active,
  children,
}: {
  title: string;
  sees: string;
  dark?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-3xl p-5 transition-[box-shadow,transform] duration-500",
        dark
          ? "bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] text-ivory"
          : "border border-wine/10 bg-white",
        active
          ? "-translate-y-1 shadow-[0_24px_48px_-20px_rgb(107_29_46/0.55)]"
          : "shadow-[0_10px_30px_-20px_rgb(43_11_20/0.35)]",
      )}
    >
      <h3 className={cn("flex items-center gap-2 text-xl font-extrabold", !dark && "text-wine")}>
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-full", dark ? "bg-gold" : "bg-wine")}
        />
        {title}
      </h3>
      <p className={cn("mt-0.5 text-xs", dark ? "text-gold-soft" : "text-gold-ink")}>{sees}</p>
      <div className={cn("mt-4 border-t pt-4", dark ? "border-white/10" : "border-wine/10")}>
        {children}
      </div>
    </section>
  );
}

function SupportCard({ i }: { i: number }) {
  const c = useCopy(COPY);
  const money = useMoney();
  const s = CYCLE[i]!.support;
  return (
    <Panel
      title={c.support}
      sees={c.supportSees}
      active={["donate", "reach", "measure"].includes(CYCLE[i]!.key)}
    >
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{c.toTirana}</span>
        <span className="text-2xl text-wine">
          <Tally to={s.amount} format={money} />
        </span>
      </p>
      <ul className="mt-3 space-y-2">
        {c.lines.slice(0, s.lines).map((l) => (
          <li key={l} className="vision-rise border-s-2 border-gold ps-3 text-sm">
            {l}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function OpsCard({ i }: { i: number }) {
  const c = useCopy(COPY);
  const num = useNum();
  const o = CYCLE[i]!.ops;
  return (
    <Panel
      title={c.ops}
      sees={c.opsSees}
      active={["reach", "sessions", "measure"].includes(CYCLE[i]!.key)}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{c.sessions}</span>
        <span dir="ltr" className="font-serif text-2xl text-wine tabular-nums">
          {o.sessions} / 6
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {Array.from({ length: 6 }, (_, k) => (
          <span
            key={k}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500",
              k < o.sessions ? "bg-wine" : "bg-wine/10",
            )}
          />
        ))}
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm">{c.trait}</span>
        <span className="text-2xl text-wine">
          <Tally to={o.trait} decimals={1} />
        </span>
      </div>
      <span className="sr-only">{num(o.trait)}</span>
    </Panel>
  );
}

function DecisionCard({ i }: { i: number }) {
  const c = useCopy(COPY);
  const d = CYCLE[i]!.decision;
  return (
    <Panel
      title={c.decision}
      sees={c.decisionSees}
      dark
      active={["number", "decide"].includes(CYCLE[i]!.key)}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{c.funding}</span>
        <span className="text-3xl text-gold">
          <Tally to={d.funding} suffix="%" />
        </span>
      </div>
      <Bar pct={d.funding} className="mt-2 text-ivory" />
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm">
          {c.groups}
          <span className="block text-xs text-ivory/60">{c.ofGroups(ALBANIA_GROUPS.total)}</span>
        </span>
        <span className="text-3xl text-gold">
          <Tally to={d.groups} />
        </span>
      </div>
      {d.campaign && (
        <p className="vision-rise mt-4 rounded-xl bg-ivory px-3 py-2 text-sm font-semibold text-wine">
          {c.decided}
        </p>
      )}
    </Panel>
  );
}
