import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, ExternalLink, MapPin, Radio, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Bar, Eyebrow, Tally, useNum, useT, VisionShell } from "@/components/vision/VisionKit";
import { useVision } from "@/components/vision/VisionStore";
import { pageTitle } from "@/config/brand";
import { flagOf, NETWORK, type NetworkOffice } from "@/data/vision-network";
import { copyOf, defineCopy, intlOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { totals } from "@/lib/vision-engine";
import { getOperatingLinks, type OperatingLink } from "@/lib/vision-links.functions";

export const Route = createFileRoute("/vision/network")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: () => (
    <VisionShell>
      <NetworkPage />
    </VisionShell>
  ),
});

const COPY = defineCopy("routes/vision.network", {
  ar: {
    label: "شبكة الندوة",
    title: "مكاتب الندوة ونشاطها",
    lead: "كلّ دولةٍ فيها مكتبٌ للندوة أو نشاطٌ ميدانيّ موثّق بلوحةٍ نموذجية، وتبقى نموذجية حتى تتّصل منصّة تشغيلها فعلاً، فتظهر أرقامها الحقيقية.",
    countries: "دولة",
    offices: "مكتب مؤكَّد",
    field: "نشاط ميداني",
    real: "متّصلة فعلاً",
    groups: "مجموعة إشرافية",
    inQual: "يتيماً في التأهيل",
    all: "الكلّ",
    onlyOffices: "المكاتب",
    onlyField: "الميداني",
    onlyReal: "الحقيقية",
    search: "ابحث عن دولة أو مدينة",
    none: "لا دولة تطابق البحث.",
    virtual: "نموذجي",
    live: "حقيقي · متّصل بالتشغيل",
    sandbox: "بيئتك التجريبية",
    hq: "المقرّ الرئيسي",
    fieldTag: "نشاط ميداني",
    funding: "التمويل",
    supervisors: "مشرفاً",
    measured: "في رحلةٍ مقيسة",
    orphans: "يتيماً مرتبطاً",
    synced: (d: string) => `آخر مزامنة: ${d}`,
    activity: "آخر نشاطٍ موثّق",
    source: "المصدر",
    openBoard: "افتح لوحة القرار لهذه الدولة",
    virtualNote:
      "أرقام التشغيل هنا نموذجية توضّح شكل اللوحة؛ الحضور والنشاط من مصادر عامّة موثّقة.",
    realNote: "هذه الأرقام من منصّة التشغيل المتّصلة، مجمّعةً بلا أسماء.",
  },
  en: {
    label: "WAMY network",
    title: "WAMY offices and activity",
    lead: "Every country with a WAMY office or documented field activity gets a sample board, which stays a sample until its operations platform is actually connected, when its real figures appear.",
    countries: "countries",
    offices: "confirmed offices",
    field: "field activity",
    real: "actually connected",
    groups: "supervised groups",
    inQual: "orphans in qualification",
    all: "All",
    onlyOffices: "Offices",
    onlyField: "Field",
    onlyReal: "Real",
    search: "Search a country or city",
    none: "No country matches.",
    virtual: "Sample",
    live: "Real · connected to operations",
    sandbox: "Your sandbox",
    hq: "Headquarters",
    fieldTag: "Field activity",
    funding: "Funding",
    supervisors: "supervisors",
    measured: "in a measured journey",
    orphans: "linked orphans",
    synced: (d: string) => `Last sync: ${d}`,
    activity: "Latest documented activity",
    source: "Source",
    openBoard: "Open this country's decision board",
    virtualNote:
      "Operations figures here are sample data and show the board's shape; presence and activity come from documented public sources.",
    realNote:
      "These figures come from the connected operations platform, aggregated with no names.",
  },
});

type Filter = "all" | "office" | "field" | "real";

function NetworkPage() {
  const c = useCopy(COPY);
  const tr = useT();
  const { data: links = [] } = useQuery({
    queryKey: ["vision", "operating-links"],
    queryFn: () => getOperatingLinks(),
    staleTime: 60_000,
  });
  const linkOf = useMemo(() => new Map(links.map((l) => [l.country, l])), [links]);
  const { state } = useVision();
  const t = totals(state);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<NetworkOffice | null>(null);

  // ألبانيا الافتراضية تقرأ بيئة المتصفّح نفسها، فتتحرّك مع التبرّعات والجلسات.
  const figures = (n: NetworkOffice) =>
    n.code === "AL"
      ? {
          groups: t.groups,
          inQualification: state.cities.reduce((a, x) => a + x.need, 0),
          funded: t.pct,
          supervisors: n.sim.supervisors,
          measured: t.measured,
        }
      : n.sim;

  const list = NETWORK.filter((n) => {
    if (filter === "office" && n.status !== "office") return false;
    if (filter === "field" && n.status !== "field") return false;
    if (filter === "real" && !linkOf.has(n.code)) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [n.name.ar, n.name.en, n.city?.ar ?? "", n.city?.en ?? ""].some((x) =>
      x.toLowerCase().includes(s),
    );
  }).sort(
    (a, b) =>
      Number(linkOf.has(b.code)) - Number(linkOf.has(a.code)) ||
      Number(b.hq) - Number(a.hq) ||
      (a.status === b.status ? 0 : a.status === "office" ? -1 : 1),
  );

  const sumGroups = NETWORK.reduce(
    (a, n) => a + (linkOf.get(n.code)?.groups ?? figures(n).groups),
    0,
  );
  const sumQual = NETWORK.reduce(
    (a, n) => a + (linkOf.get(n.code)?.orphans ?? figures(n).inQualification),
    0,
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <Eyebrow label={c.label} title={c.title} lead={c.lead} />

      <dl className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-6">
        {(
          [
            [NETWORK.length, c.countries],
            [NETWORK.filter((n) => n.status === "office").length, c.offices],
            [NETWORK.filter((n) => n.status === "field").length, c.field],
            [links.length, c.real],
            [sumGroups, c.groups],
            [sumQual, c.inQual],
          ] as const
        ).map(([n, label]) => (
          <div key={label} className="rounded-2xl border border-wine/10 bg-white p-4 text-center">
            <dd className="font-serif text-3xl text-wine">
              <Tally to={n} />
            </dd>
            <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          className="flex flex-wrap gap-1 rounded-full border border-wine/10 bg-white p-1"
        >
          {(
            [
              ["all", c.all],
              ["office", c.onlyOffices],
              ["field", c.onlyField],
              ["real", c.onlyReal],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "min-h-9 rounded-full px-4 text-sm transition-colors",
                filter === k ? "bg-wine text-ivory" : "text-wine-ink hover:bg-wine/5",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative ms-auto w-full max-w-xs">
          <span className="sr-only">{c.search}</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={c.search}
            className="min-h-11 w-full rounded-full border border-wine/15 bg-white ps-9 pe-4 text-base"
          />
        </label>
      </div>

      {list.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-wine/20 p-8 text-center text-sm text-muted-foreground">
          {c.none}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((n, i) => {
            const link = linkOf.get(n.code);
            const f = figures(n);
            return (
              <li key={n.code} style={{ ["--i" as string]: Math.min(i, 9) }} className="stagger-in">
                <button
                  type="button"
                  onClick={() => setOpen(n)}
                  className={cn(
                    "group flex h-full w-full flex-col rounded-3xl p-5 text-start transition-[transform,box-shadow] duration-300 hover:-translate-y-1 active:scale-[0.99]",
                    link
                      ? "bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] text-ivory shadow-[0_24px_48px_-24px_rgb(43_11_20/0.7)]"
                      : "border border-wine/10 bg-white shadow-[0_18px_40px_-28px_rgb(43_11_20/0.5)]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="text-3xl leading-none">
                      {flagOf(n.code)}
                    </span>
                    <div className="flex-1">
                      <p className={cn("text-lg font-extrabold", !link && "text-wine")}>
                        {tr(n.name)}
                      </p>
                      <p
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          link ? "text-ivory/70" : "text-muted-foreground",
                        )}
                      >
                        {n.hq ? (
                          <Building2 className="size-3.5" aria-hidden="true" />
                        ) : (
                          <MapPin className="size-3.5" aria-hidden="true" />
                        )}
                        {n.hq ? c.hq : n.city ? tr(n.city) : n.status === "field" ? c.fieldTag : ""}
                      </p>
                    </div>
                    <ModeBadge link={link} sandbox={n.code === "AL"} />
                  </div>
                  <p
                    className={cn(
                      "mt-3 line-clamp-2 flex-1 text-sm leading-6",
                      link ? "text-ivory/80" : "text-muted-foreground",
                    )}
                  >
                    {tr(n.activity)}
                  </p>
                  {link ? (
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
                      <Fig v={link.groups} k={c.groups} dark />
                      <Fig v={link.orphans} k={c.orphans} dark />
                    </dl>
                  ) : (
                    <>
                      <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
                        <Fig v={f.groups} k={c.groups} />
                        <Fig v={f.inQualification} k={c.inQual} />
                      </dl>
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{c.funding}</span>
                        <Bar pct={f.funded} className="flex-1 text-wine" />
                        <span className="tabular-nums">{f.funded}%</span>
                      </div>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <CountrySheet
        n={open}
        link={open ? linkOf.get(open.code) : undefined}
        fig={open ? figures(open) : null}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}

function ModeBadge({ link, sandbox }: { link?: OperatingLink | undefined; sandbox?: boolean }) {
  const c = useCopy(COPY);
  if (link)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-wine-deep">
        <Radio className="size-3" aria-hidden="true" />
        {c.live}
      </span>
    );
  return (
    <span className="shrink-0 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-wine-ink">
      {sandbox ? c.sandbox : c.virtual}
    </span>
  );
}

function Fig({ v, k, dark }: { v: number; k: string; dark?: boolean }) {
  const num = useNum();
  return (
    <div className={cn("rounded-xl px-2 py-2", dark ? "bg-white/10" : "bg-wine/[0.04]")}>
      <dd className={cn("font-serif text-xl tabular-nums", dark ? "text-gold" : "text-wine")}>
        {num(v)}
      </dd>
      <dt className={cn("text-[11px]", dark ? "text-ivory/70" : "text-muted-foreground")}>{k}</dt>
    </div>
  );
}

function CountrySheet({
  n,
  link,
  fig,
  onClose,
}: {
  n: NetworkOffice | null;
  link?: OperatingLink | undefined;
  fig: NetworkOffice["sim"] | null;
  onClose: () => void;
}) {
  const c = useCopy(COPY);
  const tr = useT();
  const locale = useLocale();
  return (
    <Sheet open={!!n} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="theme-light w-full overflow-y-auto bg-ivory sm:max-w-md">
        {n && fig && (
          <>
            <SheetHeader>
              <span aria-hidden="true" className="text-5xl">
                {flagOf(n.code)}
              </span>
              <SheetTitle className="text-2xl font-extrabold text-wine">{tr(n.name)}</SheetTitle>
              <SheetDescription>
                {n.hq ? c.hq : n.city ? `${tr(n.city)} · ${tr(n.type)}` : tr(n.type)}
              </SheetDescription>
              <div className="mb-2">
                <ModeBadge link={link} sandbox={n.code === "AL"} />
              </div>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-8">
              {link ? (
                <section className="rounded-2xl bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] p-4 text-ivory">
                  <dl className="grid grid-cols-2 gap-2 text-center">
                    <Fig v={link.groups} k={c.groups} dark />
                    <Fig v={link.orphans} k={c.orphans} dark />
                  </dl>
                  <p className="mt-3 text-xs text-ivory/75">
                    {link.platform} ·{" "}
                    {c.synced(
                      new Intl.DateTimeFormat(intlOf(locale), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(link.syncedAt)),
                    )}
                  </p>
                  <p className="mt-2 text-xs text-gold-soft">{c.realNote}</p>
                </section>
              ) : (
                <section className="rounded-2xl bg-white p-4">
                  <dl className="grid grid-cols-2 gap-2 text-center">
                    <Fig v={fig.groups} k={c.groups} />
                    <Fig v={fig.inQualification} k={c.inQual} />
                    <Fig v={fig.supervisors} k={c.supervisors} />
                    <Fig v={fig.measured} k={c.measured} />
                  </dl>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{c.funding}</span>
                    <Bar pct={fig.funded} className="flex-1 text-wine" />
                    <span className="tabular-nums">{fig.funded}%</span>
                  </div>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">{c.virtualNote}</p>
                </section>
              )}
              <section>
                <h3 className="text-sm font-bold text-wine">{c.activity}</h3>
                <p className="mt-1 text-sm leading-7">{tr(n.activity)}</p>
                {n.url ? (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-wine underline underline-offset-4"
                  >
                    {c.source}: {n.source} ({n.year})
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-wine">
                    {c.source}: {n.source} ({n.year})
                  </p>
                )}
              </section>
              {n.code === "AL" && (
                <Link
                  to="/vision/decision"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wine px-5 font-semibold text-ivory"
                >
                  {c.openBoard}
                  <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                </Link>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
