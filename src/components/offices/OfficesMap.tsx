import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import type { NetworkKind } from "@/components/map/network-layer";
import { Badge } from "@/components/ui/badge";
import { defineCopy, useCopy } from "@/lib/locale";
import {
  OFFICE_CATEGORIES,
  type OfficeCategory,
  type PublicOffice,
} from "@/lib/organizations.functions";
import { officeRegisterQuery } from "@/lib/office-presence";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/offices/OfficesMap", {
  ar: {
    title: "خريطة مكاتب الندوة",
    lead: "سجلّ المكاتب كما حصرته الأمانة العامّة للندوة من المصادر العامّة. المكتب التجريبي يبقى موسوماً حتى تراجعه الإدارة وتعتمده.",
    sample: "بيانات تجريبية",
    all: "الكلّ",
    categories: {
      multi_program: "متعددة البرامج",
      health: "صحة",
      relief: "إغاثية",
      youth_education: "شبابية وتعليمية",
      survey_pending: "يُصنَّف بالمسح",
      activity_scope: "نطاق نشاط",
    } satisfies Record<OfficeCategory, string>,
    demo: "تجريبي — قيد المراجعة",
    real: "معتمد",
    countryLevel: "على مستوى الدولة",
    source: (d: string) => `المصدر: سجلّ الحصر، اطّلاع ${d}`,
    count: (n: number) => `${n} مكتباً`,
    failed: "تعذّر تحميل سجلّ المكاتب الآن.",
    toHall: "الشبكة نفسها في قاعة الأثر ثلاثية الأبعاد",
  },
  en: {
    title: "Map of WAMY offices",
    lead: "The office register as compiled from public sources. A sample office stays labelled until the administration reviews and approves it.",
    sample: "Sample data",
    all: "All",
    categories: {
      multi_program: "Multi-programme",
      health: "Health",
      relief: "Relief",
      youth_education: "Youth & education",
      survey_pending: "To be classified by survey",
      activity_scope: "Activity scope",
    } satisfies Record<OfficeCategory, string>,
    demo: "Sample — under review",
    real: "Approved",
    countryLevel: "Country level",
    source: (d: string) => `Source: office register, accessed ${d}`,
    count: (n: number) => `${n} offices`,
    failed: "The office register could not be loaded right now.",
    toHall: "The same network in the 3D impact hall",
  },
});

/** الحقيقي فوق التجريبي في الدولة الواحدة. */
const kindOf = (o: PublicOffice): NetworkKind => (o.demo ? "demo" : "office");

/**
 * مكاتب الندوة على الخارطة نفسها التي تعرض الشبكة في الصفحة الأولى، والمصدر سجلّ المكاتب في
 * القاعدة. الإضافة والتعديل والإيقاف من لوحة الإدارة (المكاتب).
 */
export function OfficesMap() {
  const c = useCopy(COPY);
  const { data, isPending } = useQuery(officeRegisterQuery);
  const [category, setCategory] = useState<OfficeCategory | null>(null);
  const [selection, setSelection] = useState<MapSelection>({ country: null, region: null });

  const offices = useMemo(
    () => (data?.offices ?? []).filter((o) => !category || o.category === category),
    [data, category],
  );
  const paint = useMemo(() => {
    const m = new Map<string, NetworkKind>();
    for (const o of offices) {
      if (m.get(o.country) === "office") continue;
      m.set(o.country, kindOf(o));
    }
    return m;
  }, [offices]);
  const byCountry = useMemo(() => {
    const m = new Map<string, PublicOffice[]>();
    for (const o of offices) m.set(o.country, [...(m.get(o.country) ?? []), o]);
    return m;
  }, [offices]);
  const anyDemo = offices.some((o) => o.demo);

  if (data?.error) {
    return <p className="mt-10 text-sm text-muted-foreground">{c.failed}</p>;
  }

  return (
    <section aria-labelledby="offices-map" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="offices-map" className="text-xl font-bold">
          {c.title}
        </h2>
        {anyDemo && <Badge variant="outline">{c.sample}</Badge>}
        {!isPending && (
          <span className="text-sm text-muted-foreground">{c.count(offices.length)}</span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
        {c.lead}{" "}
        <a
          href="/hall"
          data-to-hall
          className="font-bold text-primary underline-offset-4 hover:underline"
        >
          {c.toHall}
        </a>
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={c.title}>
        {[null, ...OFFICE_CATEGORIES].map((k) => (
          <button
            key={k ?? "all"}
            type="button"
            aria-pressed={category === k}
            onClick={() => setCategory(k)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-sm transition-colors",
              category === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            {k ? c.categories[k] : c.all}
          </button>
        ))}
      </div>

      <WorldMap
        className="mt-4 h-[min(70dvh,640px)] min-h-[26rem]"
        stats={{}}
        layer="network"
        networkPaintOverride={paint}
        selection={selection}
        onSelect={setSelection}
        status={isPending ? "loading" : "ready"}
        countryCard={(code) => <CountryOffices offices={byCountry.get(code) ?? []} />}
      />

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {offices.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => setSelection({ country: o.country, region: null })}
              className="w-full rounded-2xl border border-border bg-card p-4 text-start hover:bg-muted/50"
            >
              <OfficeLine office={o} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OfficeLine({ office: o }: { office: PublicOffice }) {
  const c = useCopy(COPY);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">{o.name}</p>
        <Badge variant={o.demo ? "outline" : "default"} className="shrink-0">
          {o.demo ? c.demo : c.real}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {o.country_name} — {o.city ?? c.countryLevel}
      </p>
      {o.category && <p className="mt-2 text-xs">{c.categories[o.category]}</p>}
    </>
  );
}

function CountryOffices({ offices }: { offices: PublicOffice[] }) {
  const c = useCopy(COPY);
  return (
    <div className="space-y-3">
      {offices.map((o) => (
        <div key={o.id}>
          <OfficeLine office={o} />
          {o.source_url && (
            <a
              href={o.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              {c.source(o.source_seen_at ?? "")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
