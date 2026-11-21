import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { TrySupportSheet } from "@/components/try/TrySupportSheet";
import { countryName } from "@/lib/countries";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import type { SupportKind } from "@/lib/support-impact";
import { tryChild } from "@/lib/try-demo";
import { TRY_PLACES, tryPlace } from "@/lib/try-places";
import { TRY_SUPPORT_COUNTRIES, tryMapStats } from "@/lib/try-support";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/try/TrySupportMap", {
  ar: {
    eyebrow: "جرّب المنصّة",
    title: "ادعم من الخريطة",
    lead: "اختر دولةً ثم منطقة، وفي بطاقتها تحدّد لمن تدعم: طفلٌ بعينه، أو مجموعته، أو المنطقة، أو الدولة كلّها. ثم نوع الدعم ومبلغه.",
    jump: "اذهب مباشرةً إلى",
    mapTitle: "أين تريد أن تدعم؟",
    mapText: "ست دولٍ في التجربة، وفي كلٍّ منها منطقتان ومجموعةٌ وطفل، كلّها افتراضية.",
    toImpact: "انتقل إلى «أثري»",
  },
  en: {
    eyebrow: "Try the platform",
    title: "Support from the map",
    lead: "Choose a country, then a region. Its card lets you pick whom to support: one child, their group, the region, or the whole country. Then the kind of support and the amount.",
    jump: "Go straight to",
    mapTitle: "Where would you like to support?",
    mapText:
      "Six countries in the trial, each with two regions, a group and a child, all fictional.",
    toImpact: "Go to “My impact”",
  },
});

/**
 * خريطة الدعم في وضع التجربة: الخريطة الحقيقية نفسها بأعدادٍ نموذجية تُمرَّر عبر خصائصها،
 * وبطاقة المكان تحمل ورقة دعم التجربة. لا يُقرأ شيءٌ من القاعدة ولا يُكتب فيها. ما يأتي من
 * الرابط يُحلّ هنا على مصدر التجربة، وما ليس فيه يُهمل.
 */
export function TrySupportMap({
  country,
  region,
  kind,
  child,
}: {
  country?: string | undefined;
  region?: string | undefined;
  kind?: SupportKind | undefined;
  child?: string | undefined;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const stats = useMemo(() => tryMapStats(), []);
  const [selection, setSelection] = useState<MapSelection>(() => {
    const place = country ? tryPlace(country) : undefined;
    return {
      country: place?.co ?? null,
      region: place?.regions.find((r) => r.id === region)?.id ?? null,
    };
  });
  const presetChild = child && tryChild(child) ? child : undefined;

  return (
    <>
      <section className="try-rise">
        <p className="eyebrow">{c.eyebrow}</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h1 className="text-4xl leading-[1.3] font-bold md:text-5xl">{c.title}</h1>
          <Link
            to="/try/impact"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            {c.toImpact}
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-3 max-w-3xl text-base leading-8 text-muted-foreground">{c.lead}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">{c.jump}</span>
          {TRY_PLACES.map((p) => {
            const on = selection.country === p.co;
            return (
              <button
                key={p.co}
                type="button"
                aria-pressed={on}
                data-jump={p.co}
                onClick={() => setSelection({ country: p.co, region: null })}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:border-primary/50 hover:bg-secondary/60",
                )}
              >
                {countryName(p.co, locale)}
              </button>
            );
          })}
        </div>
      </section>

      <div className="-mx-4 mt-6 overflow-hidden border-y border-border sm:mx-0 sm:rounded-3xl sm:border">
        <WorldMap
          stats={stats}
          demo
          selection={selection}
          onSelect={setSelection}
          cardCompact
          supportable={TRY_SUPPORT_COUNTRIES}
          className="h-[calc(100dvh-7rem)] max-h-[52rem] min-h-[36rem]"
          intro={{ title: c.mapTitle, text: c.mapText }}
          action={(ctx) => (
            <TrySupportSheet
              ctx={ctx}
              presetKind={kind}
              presetChild={presetChild}
              onPickRegion={(id) => setSelection({ country: ctx.code, region: id })}
            />
          )}
        />
      </div>
    </>
  );
}
