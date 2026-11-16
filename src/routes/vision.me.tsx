import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ClipboardCheck,
  HandHeart,
  Landmark,
  LogOut,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Bar, Eyebrow, Tally, useNum, useT, VisionShell } from "@/components/vision/VisionKit";
import {
  DonateForm,
  Feed,
  type Persona,
  type Role,
  useMoney,
  usePlace,
  useVision,
} from "@/components/vision/VisionStore";
import { pageTitle } from "@/config/brand";
import { GROUPS } from "@/data/vision-demo";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { childrenOf, type DemoChild, type Stage, stageOf } from "@/lib/vision-children";
import {
  fundingPct,
  type GroupState,
  groupCostOf,
  isFunded,
  recommend,
  SESSIONS_PER_CYCLE,
  totals,
  type VisionState,
} from "@/lib/vision-engine";

export const Route = createFileRoute("/vision/me")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: MePage,
});

const COPY = defineCopy("routes/vision.me", {
  ar: {
    title: "ادخل بدورك",
    lead: "بيئةٌ تجريبية كاملة بلا حساب: اختر دورك فتُفتح لك واجهته، ويُحفظ كلّ ما تفعله في متصفّحك.",
    label: "الدخول التجريبي",
    pick: "اختر دورك",
    roles: {
      supporter: {
        name: "داعم",
        text: "تتبرّع، وترى ملفات الأطفال الذين يصلهم دعمك بأسماءٍ مستعارة، وإيصالاتك، وأثرك.",
        cta: "ادخل كداعم",
      },
      supervisor: {
        name: "مشرف في التشغيل",
        text: "تدير مجموعات تيرانا: تسجّل الجلسات والقياس، وترى ملف كلّ طفل في مجموعتك.",
        cta: "ادخل كمشرف",
      },
      decider: {
        name: "صاحب القرار",
        text: "ترى المؤشّرات المجمّعة والفجوات، وتعتمد القرارات — بلا اسمٍ ولا ملف.",
        cta: "ادخل كصاحب قرار",
      },
    } as Record<Role, { name: string; text: string; cta: string }>,
    yourName: "اسمك (مستعار، اختياري)",
    defaultName: {
      supporter: "داعمٌ تجريبي",
      supervisor: "المشرف «أ. ر.»",
      decider: "صاحب القرار",
    } as Record<Role, string>,
    hello: (n: string) => `أهلاً، ${n}`,
    as: (r: string) => `تتصفّح بدور: ${r}`,
    switchRole: "تبديل الدور",
    // الداعم
    myGiving: "ما قدّمت",
    myGroups: "مجموعات يصلها دعمك",
    myChildren: "أطفالٌ يصلهم أثرك",
    myMeasured: "قياساتٌ اكتملت",
    filesH: "ملفات من تدعمهم",
    filesLead: "أسماءٌ مستعارة وعمرٌ ومرحلة — بلا صورةٍ ولا مكان. اضغط ملفاً لترى رحلته.",
    noFiles: "لم يصل دعمك إلى مجموعةٍ بعد. ابدأ بتبرّع، وستظهر ملفات أطفالها هنا فور تخصيصه.",
    waitingH: "مجموعاتٌ تنتظر دعمك",
    receiptsH: "إيصالاتي",
    noReceipts: "لا إيصالات بعد.",
    pending: "بانتظار المطابقة",
    giveH: "تبرّع باسمك",
    // المشرف
    supH: "مجموعاتي",
    supLead:
      "سجّل الجلسة بعد انعقادها، والقياس البعدي بعد الجلسة السادسة — يصل الداعمَ والقرارَ فوراً.",
    record: "سجّل جلسة",
    measure: "سجّل القياس",
    needsFunding: "تنتظر التمويل",
    roster: "الأطفال",
    // القرار
    decH: "المؤشّرات اليوم",
    funding: "تمويل التأهيل",
    gap: "طفلاً في الفجوة",
    groups: "مجموعات مموّلة",
    measured: "في رحلةٍ مقيسة",
    recsH: "قراراتٌ تنتظرك",
    noRecs: "لا قرارات مفتوحة الآن.",
    approve: "اعتمد",
    recKind: {
      campaign: "حملة",
      newGroup: "مجموعة جديدة",
      redirect: "إعادة توجيه فائض",
      fundGroup: "تمويل مجموعة",
    } as Record<string, string>,
    openBoard: "افتح لوحة القرار كاملة",
    openOps: "افتح منصّة التشغيل كاملة",
    // الملف
    file: "ملف الطفل",
    age: (n: number) => `${n} سنة`,
    groupOf: "المجموعة",
    sessions: "الجلسات",
    trait: "سمة الرشد",
    before: "قبل",
    after: "بعد",
    notYet: "لم يُقَس بعد",
    journey: "الرحلة",
    privacy: "اسمٌ مستعار. لا صورة ولا موقع ولا مدرسة — هذا كلّ ما يراه الداعم.",
    stage: {
      waiting: "بانتظار التمويل",
      baseline: "القياس القبلي",
      sessions: "في الجلسات",
      ready: "جاهز للقياس البعدي",
      measured: "اكتمل القياس",
    } as Record<Stage, string>,
    steps: ["تمويل المجموعة", "القياس القبلي", "الجلسات الست", "القياس البعدي"],
  },
  en: {
    title: "Enter by role",
    lead: "A complete sandbox with no account: pick a role and its interface opens; everything you do is kept in your browser.",
    label: "Demo sign-in",
    pick: "Pick your role",
    roles: {
      supporter: {
        name: "Supporter",
        text: "Donate, then see the files of the children your support reaches under pseudonyms, your receipts and your impact.",
        cta: "Enter as supporter",
      },
      supervisor: {
        name: "Operations supervisor",
        text: "Run the Tirana groups: record sessions and measurement, and see each child's file in your group.",
        cta: "Enter as supervisor",
      },
      decider: {
        name: "Decision-maker",
        text: "See aggregate indicators and gaps, and approve decisions — no names, no files.",
        cta: "Enter as decision-maker",
      },
    } as Record<Role, { name: string; text: string; cta: string }>,
    yourName: "Your name (pseudonym, optional)",
    defaultName: {
      supporter: "Demo supporter",
      supervisor: "Supervisor “A. R.”",
      decider: "Decision-maker",
    } as Record<Role, string>,
    hello: (n: string) => `Welcome, ${n}`,
    as: (r: string) => `Browsing as: ${r}`,
    switchRole: "Switch role",
    myGiving: "You gave",
    myGroups: "Groups your support reaches",
    myChildren: "Children your impact reaches",
    myMeasured: "Measurements completed",
    filesH: "Files of those you support",
    filesLead: "Pseudonym, age and stage — no photo, no place. Tap a file to see the journey.",
    noFiles:
      "Your support hasn't reached a group yet. Start with a donation and its children's files appear here once allocated.",
    waitingH: "Groups waiting for your support",
    receiptsH: "My receipts",
    noReceipts: "No receipts yet.",
    pending: "Awaiting reconciliation",
    giveH: "Donate in your name",
    supH: "My groups",
    supLead:
      "Record each session after it meets, and the follow-up measurement after session six — it reaches the supporter and the board at once.",
    record: "Record session",
    measure: "Record measurement",
    needsFunding: "Awaiting funding",
    roster: "Children",
    decH: "Indicators today",
    funding: "Qualification funding",
    gap: "children in the gap",
    groups: "Funded groups",
    measured: "In a measured journey",
    recsH: "Decisions awaiting you",
    noRecs: "No open decisions right now.",
    approve: "Approve",
    recKind: {
      campaign: "Campaign",
      newGroup: "New group",
      redirect: "Redirect surplus",
      fundGroup: "Fund a group",
    } as Record<string, string>,
    openBoard: "Open the full decision board",
    openOps: "Open the full operations platform",
    file: "Child file",
    age: (n: number) => `${n} years`,
    groupOf: "Group",
    sessions: "Sessions",
    trait: "Maturity trait",
    before: "Before",
    after: "After",
    notYet: "Not measured yet",
    journey: "Journey",
    privacy: "A pseudonym. No photo, place or school — this is all a supporter sees.",
    stage: {
      waiting: "Awaiting funding",
      baseline: "Baseline measurement",
      sessions: "In sessions",
      ready: "Ready for follow-up",
      measured: "Measured",
    } as Record<Stage, string>,
    steps: ["Group funded", "Baseline", "Six sessions", "Follow-up measurement"],
  },
});

const ROLE_ICON = { supporter: HandHeart, supervisor: ClipboardCheck, decider: Landmark } as const;

function MePage() {
  return (
    <VisionShell>
      <MeBody />
    </VisionShell>
  );
}

function MeBody() {
  const { persona, ready } = useVision();
  const c = useCopy(COPY);
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      {!ready ? (
        <div className="h-96 animate-pulse rounded-3xl bg-wine/5" />
      ) : persona ? (
        <>
          <PersonaBar persona={persona} />
          {persona.role === "supporter" && <Supporter name={persona.name} />}
          {persona.role === "supervisor" && <Supervisor />}
          {persona.role === "decider" && <Decider />}
        </>
      ) : (
        <>
          <Eyebrow label={c.label} title={c.title} lead={c.lead} />
          <RolePicker />
        </>
      )}
    </section>
  );
}

function RolePicker() {
  const c = useCopy(COPY);
  const { setPersona } = useVision();
  const [name, setName] = useState("");
  return (
    <div className="mt-10">
      <label className="mx-auto block max-w-sm text-center text-sm font-semibold text-wine-ink">
        {c.yourName}
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-wine/15 bg-white px-3 text-center text-base"
        />
      </label>
      <ol className="mt-8 grid gap-5 lg:grid-cols-3">
        {(["supporter", "supervisor", "decider"] as const).map((r, i) => {
          const Icon = ROLE_ICON[r];
          const dark = r === "decider";
          return (
            <li key={r} style={{ ["--i" as string]: i }} className="stagger-in">
              <button
                type="button"
                onClick={() => setPersona({ role: r, name: name.trim() || c.defaultName[r] })}
                className={cn(
                  "group flex h-full w-full flex-col rounded-3xl p-7 text-start transition-[transform,box-shadow] duration-300 hover:-translate-y-1 active:scale-[0.99]",
                  dark
                    ? "bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] text-ivory shadow-[0_24px_48px_-24px_rgb(43_11_20/0.7)]"
                    : "border border-wine/10 bg-white shadow-[0_18px_40px_-28px_rgb(43_11_20/0.5)] hover:shadow-[0_24px_48px_-24px_rgb(43_11_20/0.5)]",
                )}
              >
                <span
                  className={cn(
                    "grid size-14 place-items-center rounded-2xl",
                    dark ? "bg-gold text-wine-deep" : "bg-wine text-gold",
                  )}
                >
                  <Icon className="size-7" aria-hidden="true" />
                </span>
                <span className={cn("mt-5 text-2xl font-extrabold", !dark && "text-wine")}>
                  {c.roles[r].name}
                </span>
                <span
                  className={cn(
                    "mt-2 flex-1 text-sm leading-7",
                    dark ? "text-ivory/75" : "text-muted-foreground",
                  )}
                >
                  {c.roles[r].text}
                </span>
                <span
                  className={cn(
                    "mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-semibold",
                    dark ? "bg-gold text-wine-deep" : "bg-wine text-ivory",
                  )}
                >
                  {c.roles[r].cta}
                  <ArrowLeft
                    className="size-4 transition-transform group-hover:-translate-x-1 ltr:-scale-x-100 ltr:group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PersonaBar({ persona }: { persona: Persona }) {
  const c = useCopy(COPY);
  const { setPersona } = useVision();
  const Icon = ROLE_ICON[persona.role];
  return (
    <div className="vision-rise flex flex-wrap items-center gap-4 rounded-3xl bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-6 text-ivory md:p-8">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold text-wine-deep">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <div className="flex-1">
        <p className="text-xs text-gold-soft">{c.as(c.roles[persona.role].name)}</p>
        <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{c.hello(persona.name)}</h1>
      </div>
      <button
        type="button"
        onClick={() => setPersona(null)}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-semibold transition-colors hover:bg-white/10 active:scale-[0.97]"
      >
        <LogOut className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        {c.switchRole}
      </button>
    </div>
  );
}

/* ── الداعم ──────────────────────────────────────────────────────── */

/** المجموعات التي وصلها تبرّع الداعم: من قيود التخصيص على فواتيره. */
function myReach(s: VisionState, name: string) {
  const mine = s.donations.filter((d) => d.donor === name);
  const invoices = new Set(mine.map((d) => d.invoice).filter(Boolean));
  const groups = new Set<string>();
  for (const e of s.events) {
    if (e.kind === "allocated" && invoices.has(String(e.args["invoice"])) && e.args["group"]) {
      groups.add(String(e.args["group"]));
    }
  }
  for (const d of mine)
    if (d.target.kind === "group" && d.status === "settled") groups.add(d.target.id);
  return { mine, groups: s.groups.filter((g) => groups.has(g.id)) };
}

function Supporter({ name }: { name: string }) {
  const c = useCopy(COPY);
  const money = useMoney();
  const place = usePlace();
  const { state } = useVision();
  const { mine, groups } = useMemo(() => myReach(state, name), [state, name]);
  const kids = groups.flatMap(childrenOf);
  const [open, setOpen] = useState<DemoChild | null>(null);
  const waiting = state.groups.filter((g) => !isFunded(g)).slice(0, 3);
  const settled = mine.filter((d) => d.status === "settled");

  return (
    <div className="mt-6 space-y-8">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            [settled.reduce((a, d) => a + d.amount, 0), c.myGiving, true],
            [groups.length, c.myGroups, false],
            [kids.length, c.myChildren, false],
            [groups.filter((g) => g.after !== null).length, c.myMeasured, false],
          ] as const
        ).map(([n, label, isMoney]) => (
          <div key={label} className="rounded-2xl border border-wine/10 bg-white p-5">
            <dd className="font-serif text-3xl text-wine tabular-nums">
              {isMoney ? money(n) : <Tally to={n} />}
            </dd>
            <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      <section aria-labelledby="files-h">
        <h2 id="files-h" className="text-2xl font-extrabold text-wine">
          {c.filesH}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.filesLead}</p>
        {kids.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-wine/20 bg-white/60 p-6 text-center text-sm text-muted-foreground">
            {c.noFiles}
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map((g) => (
              <div key={g.id}>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-wine">
                  <Users className="size-4" aria-hidden="true" />
                  {place(g.id)}
                  <StageChip stage={stageOf(g)} />
                </h3>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {childrenOf(g).map((k) => (
                    <li key={k.id}>
                      <ChildCard child={k} onOpen={() => setOpen(k)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {waiting.length > 0 && (
        <section aria-labelledby="wait-h">
          <h2 id="wait-h" className="text-lg font-bold text-wine">
            {c.waitingH}
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {waiting.map((g) => (
              <li key={g.id} className="rounded-2xl border border-wine/10 bg-white p-4">
                <p className="font-semibold text-wine">{place(g.id)}</p>
                <Bar pct={(g.funded / groupCostOf(g)) * 100} className="mt-3 text-wine" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {money(g.funded)} / {money(groupCostOf(g))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold text-wine">{c.giveH}</h2>
          <DonateForm fixedDonor={name} defaultTarget={waiting[0]?.id ?? "tirana"} />
        </div>
        <section aria-labelledby="rec-h" className="rounded-3xl border border-wine/10 bg-white p-5">
          <h2 id="rec-h" className="flex items-center gap-2 text-lg font-bold text-wine">
            <Receipt className="size-5" aria-hidden="true" />
            {c.receiptsH}
          </h2>
          {mine.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{c.noReceipts}</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {mine.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-wine/[0.04] px-3 py-2 text-sm"
                >
                  <span>
                    <span className="block font-semibold">{place(d.target.id)}</span>
                    <span
                      dir="ltr"
                      className="inline-block font-mono text-xs text-muted-foreground"
                    >
                      {d.invoice || c.pending}
                    </span>
                  </span>
                  <span className="font-serif tabular-nums">{money(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Feed limit={8} />
      <ChildSheet child={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function StageChip({ stage }: { stage: Stage }) {
  const c = useCopy(COPY);
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
        stage === "measured"
          ? "bg-gold-soft text-wine-ink"
          : stage === "waiting"
            ? "bg-wine/5 text-muted-foreground"
            : "bg-wine text-ivory",
      )}
    >
      {c.stage[stage]}
    </span>
  );
}

function ChildCard({ child, onOpen }: { child: DemoChild; onOpen: () => void }) {
  const c = useCopy(COPY);
  const tr = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col items-center rounded-2xl border border-wine/10 bg-white p-4 text-center transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-18px_rgb(43_11_20/0.5)] active:scale-[0.98]"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-gold-soft),var(--color-ivory))] font-serif text-lg text-wine ring-1 ring-gold/40"
      >
        {tr(child.pseudonym)
          .replace(/[«»“”.\s]/g, "")
          .slice(0, 2)}
      </span>
      <span className="mt-2 font-bold text-wine">{tr(child.pseudonym)}</span>
      <span className="text-xs text-muted-foreground">{c.age(child.age)}</span>
      <span className="mt-2 flex w-full gap-0.5" aria-hidden="true">
        {Array.from({ length: SESSIONS_PER_CYCLE }, (_, k) => (
          <i
            key={k}
            className={cn("h-1 flex-1 rounded-full", k < child.sessions ? "bg-wine" : "bg-wine/10")}
          />
        ))}
      </span>
    </button>
  );
}

function ChildSheet({ child, onClose }: { child: DemoChild | null; onClose: () => void }) {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  const place = usePlace();
  const stepDone = child
    ? [
        child.stage !== "waiting",
        child.stage !== "waiting",
        child.sessions >= SESSIONS_PER_CYCLE,
        child.after !== null,
      ]
    : [];
  return (
    <Sheet open={!!child} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="theme-light w-full overflow-y-auto bg-ivory sm:max-w-md">
        {child && (
          <>
            <SheetHeader>
              <p className="text-xs font-semibold text-gold-ink">{c.file}</p>
              <SheetTitle className="text-2xl font-extrabold text-wine">
                {tr(child.pseudonym)}
              </SheetTitle>
              <SheetDescription>
                {c.age(child.age)} ·{" "}
                <span dir="ltr" className="inline-block font-mono">
                  {child.code}
                </span>
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-8">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white p-3">
                  <dt className="text-xs text-muted-foreground">{c.groupOf}</dt>
                  <dd className="font-semibold">{place(child.group)}</dd>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <dt className="text-xs text-muted-foreground">{c.sessions}</dt>
                  <dd dir="ltr" className="font-serif text-lg text-wine tabular-nums">
                    {child.sessions} / {SESSIONS_PER_CYCLE}
                  </dd>
                </div>
              </dl>
              <section className="rounded-2xl bg-white p-4">
                <h3 className="text-sm font-bold text-wine">{c.trait}</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <TraitRow label={c.before} v={child.before} />
                  {child.after !== null ? (
                    <TraitRow label={c.after} v={child.after} strong />
                  ) : (
                    <p className="text-xs text-muted-foreground">{c.notYet}</p>
                  )}
                </div>
                {child.after !== null && (
                  <p className="mt-3 text-sm font-semibold text-wine">
                    {num(child.before, { maximumFractionDigits: 1 })} ←{" "}
                    {num(child.after, { maximumFractionDigits: 1 })}
                  </p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-bold text-wine">{c.journey}</h3>
                <ol className="mt-3 space-y-2">
                  {c.steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-sm">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-6 place-items-center rounded-full text-xs",
                          stepDone[i]
                            ? "bg-wine text-ivory"
                            : "border border-wine/20 text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className={stepDone[i] ? "font-semibold" : "text-muted-foreground"}>
                        {s}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
              <p className="flex gap-2 rounded-xl bg-gold-soft/60 p-3 text-xs leading-6 text-wine-ink">
                <Sparkles className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                {c.privacy}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TraitRow({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  const num = useNum();
  return (
    <div className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Bar pct={(v / 25) * 100} tone={strong ? "gold" : "wine"} className="text-wine" />
      <span className="text-end font-serif tabular-nums">
        {num(v, { maximumFractionDigits: 1 })}
      </span>
    </div>
  );
}

/* ── المشرف ──────────────────────────────────────────────────────── */

function Supervisor() {
  const c = useCopy(COPY);
  const place = usePlace();
  const tr = useT();
  const { state, dispatch } = useVision();
  const mine = state.groups.filter((g) => g.city === "tirana");
  const [open, setOpen] = useState<DemoChild | null>(null);
  const concept = new Map(GROUPS.map((g) => [g.id, g.concept]));
  return (
    <div className="mt-6 space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-wine">{c.supH}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.supLead}</p>
      </div>
      {mine.map((g) => (
        <SupGroup
          key={g.id}
          g={g}
          concept={concept.get(g.id) ? tr(concept.get(g.id)!) : null}
          title={place(g.id)}
          onSession={() => dispatch({ type: "session", group: g.id })}
          onMeasure={() => dispatch({ type: "measure", group: g.id })}
          onOpen={setOpen}
        />
      ))}
      <Feed layer="operations" limit={6} />
      <Link
        to="/vision/operations"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wine px-5 font-semibold text-ivory"
      >
        {c.openOps}
        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
      <ChildSheet child={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function SupGroup({
  g,
  title,
  concept,
  onSession,
  onMeasure,
  onOpen,
}: {
  g: GroupState;
  title: string;
  concept: string | null;
  onSession: () => void;
  onMeasure: () => void;
  onOpen: (k: DemoChild) => void;
}) {
  const c = useCopy(COPY);
  const st = stageOf(g);
  return (
    <section className="rounded-3xl border border-wine/10 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold text-wine">{title}</h3>
        <StageChip stage={st} />
        {concept && <span className="text-xs text-muted-foreground">«{concept}»</span>}
        <span className="ms-auto">
          {st === "baseline" || st === "sessions" ? (
            <button
              type="button"
              onClick={onSession}
              className="min-h-10 rounded-full bg-wine px-4 text-sm font-semibold text-ivory active:scale-[0.97]"
            >
              {c.record}
            </button>
          ) : st === "ready" ? (
            <button
              type="button"
              onClick={onMeasure}
              className="min-h-10 rounded-full bg-gold px-4 text-sm font-semibold text-wine-deep active:scale-[0.97]"
            >
              {c.measure}
            </button>
          ) : st === "waiting" ? (
            <span className="text-xs text-muted-foreground">{c.needsFunding}</span>
          ) : null}
        </span>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {Array.from({ length: SESSIONS_PER_CYCLE }, (_, k) => (
          <span
            key={k}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500",
              k < g.sessionsDone ? "bg-wine" : "bg-wine/10",
            )}
          />
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold text-muted-foreground">{c.roster}</p>
      <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {childrenOf(g).map((k) => (
          <li key={k.id}>
            <ChildCard child={k} onOpen={() => onOpen(k)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── صاحب القرار ─────────────────────────────────────────────────── */

function Decider() {
  const c = useCopy(COPY);
  const place = usePlace();
  const money = useMoney();
  const num = useNum();
  const { state, dispatch } = useVision();
  const t = totals(state);
  const recs = recommend(state).slice(0, 3);
  const cities = [...state.cities].sort((a, b) => fundingPct(a) - fundingPct(b));
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-3xl bg-[radial-gradient(120%_80%_at_80%_0%,#5b1626,var(--color-wine-deep)_70%)] p-6 text-ivory md:p-8">
        <h2 className="text-xl font-extrabold">{c.decH}</h2>
        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              [`${num(t.pct)}%`, c.funding],
              [num(t.gap), c.gap],
              [`${num(t.fundedGroups)} / ${num(t.groups)}`, c.groups],
              [num(t.measured), c.measured],
            ] as const
          ).map(([v, k]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <dd dir="ltr" className="font-serif text-3xl text-gold tabular-nums">
                {v}
              </dd>
              <dt className="mt-1 text-xs text-ivory/70">{k}</dt>
            </div>
          ))}
        </dl>
        <ul className="mt-6 space-y-2">
          {cities.map((x) => (
            <li key={x.id} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-sm">
              <span>{place(x.id)}</span>
              <Bar pct={fundingPct(x)} className="text-ivory" />
              <span className="text-end tabular-nums text-ivory/80">{fundingPct(x)}%</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-wine">{c.recsH}</h2>
        {recs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.noRecs}</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {recs.map((r) => (
              <li
                key={r.key}
                className="vision-rise flex flex-col rounded-2xl border border-gold/40 bg-white p-5"
              >
                <p className="text-xs font-semibold text-gold-ink">{c.recKind[r.kind]}</p>
                <p className="mt-1 flex-1 font-bold text-wine">
                  {r.kind === "fundGroup" && r.group ? place(r.group) : place(r.city)} ·{" "}
                  {money(r.amount ?? 0)}
                </p>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "apply", key: r.key })}
                  className="mt-4 min-h-10 rounded-full bg-wine px-4 text-sm font-semibold text-ivory active:scale-[0.97]"
                >
                  {c.approve}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Feed layer="decision" limit={5} />
      <Link
        to="/vision/decision"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wine px-5 font-semibold text-ivory"
      >
        {c.openBoard}
        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
    </div>
  );
}
