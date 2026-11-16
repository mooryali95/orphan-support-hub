import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Circle, FileDown, HeartHandshake, Users } from "lucide-react";

import {
  Bar,
  Eyebrow,
  PlatformFrame,
  Tally,
  useNum,
  useT,
  VisionShell,
} from "@/components/vision/VisionKit";
import { pageTitle } from "@/config/brand";
import { ALBANIA, GROUPS, ORPHAN_FILE, REPORT_DATE, SYSTEM, TRAITS } from "@/data/vision-demo";
import { copyOf, defineCopy, intlOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vision/operations")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: OperationsPage,
});

const COPY = defineCopy("routes/vision.operations", {
  ar: {
    label: "الطبقة الأولى · التشغيل",
    title: "أهلية الأيتام",
    lead: "منصة الرواد كما ستتّصل بالمنظومة: مركز القيادة، والمجموعات، وملف كل يتيم، والتقرير الحي — كلّه يتحدّث من الميدان أولاً بأول.",
    brand: "بناء الأهلية (الرواد)",
    chip: "التشغيل",
    tabCommand: "مركز القيادة",
    tabGroups: "المجموعات",
    tabFile: "ملف اليتيم",
    tabReport: "التقرير الحي",
    commandH: "مركز قيادة المنصة",
    commandLead: "لوحة قيادة واحدة للبرنامج كلّه، تُحدَّث من الميدان أولاً بأول.",
    inJourney: "في رحلة تأهيل مقيسة",
    groups: "مجموعات إشرافية",
    funded: "منها مموّلة",
    sessions: "جلسات مكتملة هذا الشهر",
    supervisors: "مشرفون مؤهّلون",
    byCity: "المجموعات حسب المدينة",
    members: (n: number) => `${n} أعضاء`,
    sessionsOf: (a: number, b: number) => `الجلسات ${a} / ${b}`,
    concept: "المفهوم",
    fundedTag: "مموّلة",
    awaiting: "بانتظار تمويل",
    fileH: "ملف تربوي شامل",
    fileLead: "دائرة رعاية تجمع المشرف والوليّ والمرجع الشرعي والكافل — كلٌّ يرى ما يحقّ له.",
    circle: "دائرة الرعاية",
    path: "مسار المرحلة",
    traitsH: "السمات بين القياسين",
    before: "قبلي",
    after: "بعدي",
    reportH: "تقرير الأثر الحي",
    reportKind: "تقرير رسمي · إدارة المنصة",
    reportHero: "الأثر كما تسجّله المنصة",
    reportHeroLead: "تحدَّث هذه الأرقام تلقائيًا من بيانات البرنامج عند كل فتحٍ للتقرير.",
    export: "تصدير PDF",
    exportSoon: "متاحٌ عند التكامل",
    supervisorsH: "أثر البرنامج على المشرفين في تقييم الأقران",
    beneficiariesH: "أثر البرنامج على المستفيدين",
    sync: "ما يصل منصّة الدعم من هنا",
    syncLines: [
      "حال المجموعة وجلساتها — بلا أسماء",
      "متوسّط السمات قبل وبعد — لكل مجموعة",
      "إثبات الصرف والتسليم — مجمَّدًا ببصمته",
    ],
  },
  en: {
    label: "Layer one · Operations",
    title: "Orphan capability",
    lead: "The Rowad platform as it will connect to the system: the command centre, the groups, every orphan's file and the live report — all updated from the field.",
    brand: "Capability building (Rowad)",
    chip: "Operations",
    tabCommand: "Command centre",
    tabGroups: "Groups",
    tabFile: "Orphan file",
    tabReport: "Live report",
    commandH: "Platform command centre",
    commandLead: "One board for the whole programme, updated from the field as it happens.",
    inJourney: "in a measured qualification journey",
    groups: "supervised groups",
    funded: "of them funded",
    sessions: "sessions completed this month",
    supervisors: "qualified supervisors",
    byCity: "Groups by city",
    members: (n: number) => `${n} members`,
    sessionsOf: (a: number, b: number) => `Sessions ${a} / ${b}`,
    concept: "Concept",
    fundedTag: "Funded",
    awaiting: "Awaiting funding",
    fileH: "A complete educational file",
    fileLead:
      "A care circle of supervisor, guardian, religious mentor and sponsor — each sees what they are entitled to.",
    circle: "Care circle",
    path: "Stage path",
    traitsH: "Traits between the two measurements",
    before: "Before",
    after: "After",
    reportH: "Live impact report",
    reportKind: "Official report · platform administration",
    reportHero: "Impact as the platform records it",
    reportHeroLead:
      "These figures update automatically from programme data every time the report opens.",
    export: "Export PDF",
    exportSoon: "Available with the integration",
    supervisorsH: "Programme impact on supervisors (peer assessment)",
    beneficiariesH: "Programme impact on beneficiaries",
    sync: "What reaches the support platform from here",
    syncLines: [
      "Group status and sessions — no names",
      "Average traits before and after — per group",
      "Disbursement and delivery proof — frozen by fingerprint",
    ],
  },
});

function OperationsPage() {
  const c = useCopy(COPY);
  const [tab, setTab] = useState("command");
  const tabs = [
    { key: "command", label: c.tabCommand },
    { key: "groups", label: c.tabGroups },
    { key: "file", label: c.tabFile },
    { key: "report", label: c.tabReport },
  ] as const;
  return (
    <VisionShell>
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <Eyebrow n="01" label={c.label} title={c.title} lead={c.lead} />
        <div className="mt-10">
          <PlatformFrame
            host="rowad-albania.manzoma.sa"
            brand={c.brand}
            chip={c.chip}
            tabs={tabs}
            active={tab}
            onTab={setTab}
          >
            {tab === "command" && <Command />}
            {tab === "groups" && <Groups />}
            {tab === "file" && <OrphanFile />}
            {tab === "report" && <LiveReport />}
          </PlatformFrame>
        </div>
        <SyncNote />
      </section>
    </VisionShell>
  );
}

function Command() {
  const c = useCopy(COPY);
  const tr = useT();
  const groups = ALBANIA.reduce((a, x) => a + x.groups, 0);
  const sessions = GROUPS.reduce((a, g) => a + g.sessionsDone, 0);
  return (
    <div>
      <div className="rounded-2xl bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-6 text-ivory md:p-8">
        <p className="text-xs text-gold-soft">{c.commandH}</p>
        <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">{c.brand}</h2>
        <p className="mt-2 max-w-xl text-sm text-ivory/75">{c.commandLead}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            [SYSTEM.measured, c.inJourney],
            [groups, c.groups],
            [sessions, c.sessions],
            [SYSTEM.supervisors, c.supervisors],
          ] as const
        ).map(([n, label]) => (
          <div key={label} className="rounded-2xl border border-wine/10 bg-white p-4">
            <dd className="text-3xl text-wine">
              <Tally to={n} />
            </dd>
            <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 text-sm font-bold text-wine">{c.byCity}</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ALBANIA.map((city) => (
          <li
            key={city.id}
            className="flex items-center justify-between rounded-xl bg-wine/[0.04] px-4 py-3 text-sm"
          >
            <span className="font-medium">{tr(city.name)}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-4" aria-hidden="true" />
              <span className="tabular-nums">{city.groups}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Groups() {
  const c = useCopy(COPY);
  const tr = useT();
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {GROUPS.map((g, i) => (
        <li
          key={g.id}
          style={{ ["--i" as string]: i }}
          className="stagger-in rounded-2xl border border-wine/10 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-wine">{tr(g.name)}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tr(g.supervisor)} · {c.members(g.members)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                g.funded ? "bg-gold-soft text-wine-ink" : "bg-wine/5 text-muted-foreground",
              )}
            >
              {g.funded ? c.fundedTag : c.awaiting}
            </span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {c.concept}: <span className="font-semibold text-foreground">«{tr(g.concept)}»</span>
          </p>
          <div
            className="mt-2 flex gap-1"
            aria-label={c.sessionsOf(g.sessionsDone, g.sessionsTotal)}
            role="img"
          >
            {Array.from({ length: g.sessionsTotal }, (_, k) => (
              <span
                key={k}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  k < g.sessionsDone ? "bg-wine" : "bg-wine/10",
                )}
              />
            ))}
          </div>
          <p className="mt-1.5">
            <span dir="ltr" className="inline-block font-serif text-lg text-wine tabular-nums">
              {g.sessionsDone} / {g.sessionsTotal}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function OrphanFile() {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <div className="rounded-2xl bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-6 text-ivory">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"
            >
              <HeartHandshake className="size-7 text-gold" />
            </span>
            <div>
              <p className="text-xs text-gold-soft">{c.fileH}</p>
              <h2 className="text-xl font-bold">{tr(ORPHAN_FILE.pseudonym)}</h2>
              <p className="text-xs text-ivory/70" dir="ltr">
                {ORPHAN_FILE.code}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-ivory/80">{tr(ORPHAN_FILE.stage)}</p>
        </div>
        <section className="rounded-2xl border border-wine/10 bg-white p-5">
          <h3 className="text-sm font-bold text-wine">{c.circle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{c.fileLead}</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {ORPHAN_FILE.circle.map((m) => (
              <li key={m.role.en} className="rounded-xl bg-wine/[0.04] p-3">
                <p className="text-sm font-semibold">{tr(m.role)}</p>
                <p className="text-xs text-muted-foreground">{tr(m.note)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="space-y-4">
        <section className="rounded-2xl border border-wine/10 bg-white p-5">
          <h3 className="text-sm font-bold text-wine">{c.path}</h3>
          <ol className="mt-3 space-y-2">
            {ORPHAN_FILE.milestones.map((m) => (
              <li key={m.name.en} className="flex items-center gap-2.5 text-sm">
                {m.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-wine" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-wine/30" aria-hidden="true" />
                )}
                <span className={m.done ? "" : "text-muted-foreground"}>{tr(m.name)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-2xl border border-wine/10 bg-white p-5">
          <h3 className="text-sm font-bold text-wine">{c.traitsH}</h3>
          <ul className="mt-3 space-y-3">
            {TRAITS.slice(0, 4).map((x) => (
              <li key={x.key}>
                <div className="flex justify-between text-sm">
                  <span>{tr(x.name)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {num(x.before, { minimumFractionDigits: 1 })} →{" "}
                    <strong className="text-wine">
                      {num(x.after, { minimumFractionDigits: 1 })}
                    </strong>
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-wine/8">
                  <span
                    className="absolute inset-y-0 start-0 rounded-full bg-gold-soft"
                    style={{ width: `${(x.before / 25) * 100}%` }}
                  />
                  <span
                    className="vision-bar absolute inset-y-0 start-0 rounded-full bg-wine/80 mix-blend-multiply"
                    style={{ width: `${(x.after / 25) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function LiveReport() {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  const locale = useLocale();
  const today = new Intl.DateTimeFormat(intlOf(locale), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(REPORT_DATE));
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex justify-end">
        <button
          type="button"
          disabled
          title={c.exportSoon}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-wine/15 bg-white px-3 text-sm text-muted-foreground"
        >
          <FileDown className="size-4" aria-hidden="true" />
          {c.export}
        </button>
      </div>
      <article className="mt-3 rounded-2xl border border-wine/10 bg-white p-6 md:p-8">
        <p className="text-center text-xs text-muted-foreground">{c.reportKind}</p>
        <h2 className="mt-1 text-center text-2xl font-extrabold text-wine md:text-3xl">
          {c.reportH}
        </h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {c.brand} · {today}
        </p>
        <div className="mt-6 rounded-2xl bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-6 text-ivory">
          <h3 className="text-xl font-bold">{c.reportHero}</h3>
          <p className="mt-1 text-sm text-ivory/75">{c.reportHeroLead}</p>
        </div>
        {(
          [
            [c.supervisorsH, 0.6],
            [c.beneficiariesH, 1],
          ] as const
        ).map(([h, k]) => (
          <section key={h} className="mt-6">
            <h3 className="text-sm font-bold text-wine">{h}</h3>
            <ul className="mt-3 space-y-2.5">
              {TRAITS.map((x) => {
                const gain = ((x.after - x.before) / x.before) * 100 * k;
                return (
                  <li
                    key={x.key}
                    className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm"
                  >
                    <span>{tr(x.name)}</span>
                    <Bar pct={gain * 6} className="text-wine" />
                    <span className="text-end tabular-nums text-muted-foreground">
                      +{num(gain, { maximumFractionDigits: 1 })}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </article>
    </div>
  );
}

function SyncNote() {
  const c = useCopy(COPY);
  return (
    <aside className="mx-auto mt-8 max-w-3xl rounded-2xl border border-gold/40 bg-white/70 p-5">
      <h2 className="text-sm font-bold text-wine">{c.sync}</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {c.syncLines.map((l) => (
          <li key={l} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />
            {l}
          </li>
        ))}
      </ul>
    </aside>
  );
}
