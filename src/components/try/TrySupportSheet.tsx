import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CelebrateMark } from "@/components/kit/Celebrate";
import type { MapActionContext } from "@/components/map/WorldMap";
import { PayCurrencyChoice } from "@/components/sponsorship/PayCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGivingCopy } from "@/config/giving-tracks";
import { payableOptions } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { INDIVIDUAL_AMOUNTS } from "@/lib/support-amounts";
import type { SupportKind } from "@/lib/support-impact";
import { localTryChild } from "@/lib/try-demo";
import {
  tryChildOf,
  tryGroupName,
  tryPlace,
  tryRegionName,
  tryRegionOfChild,
} from "@/lib/try-places";
import { addPledge, tryRegionByName, type TryScope } from "@/lib/try-support";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/try/TrySupportSheet", {
  ar: {
    whom: "إلى من؟",
    thisCountry: "هذه الدولة",
    thisRegion: "هذه المنطقة",
    children: pluralOf(
      {
        one: "طفلٌ واحد",
        two: "طفلان",
        few: "{0} أطفال",
        many: "{0} طفلاً",
        other: "{0} طفل",
      },
      0,
      "ar",
    ),
    aChild: "طفلٌ بعينه",
    orRegion: "أو ادعم منطقةً فيها:",
    kind: "نوع الدعم",
    amount: "المبلغ الشهري",
    other: "مبلغ آخر",
    confirm: (a: string) => `سجّل دعمي (محاكاة): ${a}`,
    note: "محاكاة: يُحفظ في متصفّحك وحده، ولا يُرسل شيء ولا يُخصم.",
    sampleRegions: (a: string, b: string) =>
      `منطقتا التجربة هنا: ${a} و${b}. اختر إحداهما لتدعمها، أو ادعم الدولة كلّها.`,
    financial: (name: string) => `أو اكفل ${name} كفالةً مادية`,
    thanks: "سُجّل دعمك",
    done: {
      qualification: "في «أثري» ترى التأهيل يتقدّم شهراً بشهر: الجلسات، والقياس قبلها وبعدها.",
      in_kind: "في «أثري» ترى تعهّدك يُجهَّز ثم يُسلَّم بمستنده.",
    } satisfies Record<SupportKind, string>,
    see: "شاهد أثره",
    another: "دعمٌ آخر",
  },
  en: {
    whom: "For whom?",
    thisCountry: "This country",
    thisRegion: "This region",
    children: pluralOf({ one: "{0} child", other: "{0} children" }),
    aChild: "One child",
    orRegion: "Or support a region in it:",
    kind: "Kind of support",
    amount: "Monthly amount",
    other: "Other amount",
    confirm: (a: string) => `Record my support (simulated): ${a}`,
    note: "Simulated: kept in your browser only. Nothing is sent and nothing is charged.",
    sampleRegions: (a: string, b: string) =>
      `The trial's regions here are ${a} and ${b}. Choose one to support it, or support the whole country.`,
    financial: (name: string) => `Or sponsor ${name} financially`,
    thanks: "Your support is recorded",
    done: {
      qualification:
        "“My impact” shows the qualification advancing month by month: the sessions, and the measurement before and after.",
      in_kind: "“My impact” shows your pledge being prepared, then delivered with its document.",
    } satisfies Record<SupportKind, string>,
    see: "See its impact",
    another: "Support again",
  },
});

type Target = { scope: TryScope; target: string; label: string; hint?: string };

/**
 * ورقة الدعم في خريطة التجربة: كورقة الدعم الحقيقية (إلى من؟ ← النوع ← العملة ← المبلغ ←
 * التأكيد) لكنّ أهدافها من كتالوج التجربة الافتراضي، وتأكيدها يحفظ التعهّد في المتصفّح وحده.
 * لا حساب ولا خادم.
 */
export function TrySupportSheet({
  ctx,
  presetKind,
  presetChild,
  onPickRegion,
}: {
  ctx: MapActionContext;
  presetKind?: SupportKind | undefined;
  /** a trial child the visitor came from: chosen at once when the card stands on their country */
  presetChild?: string | undefined;
  /** opens one of the country's trial regions on the map (the card can cover it on the map) */
  onPickRegion?: (regionId: string) => void;
}) {
  const t = useCopy(COPY);
  const g = useGivingCopy();
  const locale = useLocale();
  const place = tryPlace(ctx.code);
  const region = tryRegionByName(ctx.code, ctx.regionValue);
  const onRegion = !!ctx.regionName;
  const kid = tryChildOf(ctx.code);
  const child = kid ? localTryChild(kid, locale) : undefined;
  // the group and the child are listed under the country and under the region they stand in
  const home = kid ? tryRegionOfChild(kid) : undefined;
  const local = !!place && (!onRegion || (!!region && region.id === home?.id));

  const targets = useMemo<Target[]>(() => {
    if (!place) return [];
    const out: Target[] = [];
    if (region) out.push({ scope: "region", target: region.id, label: t.thisRegion });
    out.push({ scope: "country", target: place.co, label: t.thisCountry });
    if (local) {
      out.push({
        scope: "group",
        target: place.group.id,
        label: tryGroupName(place.group.id, locale),
        hint: t.children(place.group.children),
      });
      if (child) out.push({ scope: "orphan", target: child.id, label: child.name, hint: t.aChild });
    }
    return out;
  }, [place, region, local, child, locale, t]);

  const [picked, setPicked] = useState<{ scope: TryScope; target: string } | null>(() =>
    presetChild && child?.id === presetChild ? { scope: "orphan", target: presetChild } : null,
  );
  const target =
    targets.find((x) => x.scope === picked?.scope && x.target === picked.target) ?? targets[0];
  const [kind, setKind] = useState<SupportKind>(presetKind ?? "qualification");
  useEffect(() => {
    if (presetKind) setKind(presetKind);
  }, [presetKind]);

  // the pledge is recorded in the chosen currency as typed: no conversion, so no rate to show
  const payList = useMemo(() => payableOptions(ctx.code, null), [ctx.code]);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const currency =
    payList.find((o) => o.currency === chosenCurrency)?.currency ?? payList[0]!.currency;
  const [amount, setAmount] = useState(50);
  const [done, setDone] = useState<SupportKind | null>(null);

  if (!place || !target) return null;

  if (done) {
    return (
      <div className="text-center">
        <CelebrateMark className="mx-auto size-12" />
        <p role="status" className="celebrate-text mt-3 font-serif text-xl font-bold text-primary">
          {t.thanks}
        </p>
        <p className="celebrate-text mt-1 text-sm leading-6 text-muted-foreground">
          {t.done[done]}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/try/impact" search={{ kind: done }}>
              {t.see}
              <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setDone(null)}>
            {t.another}
          </Button>
        </div>
      </div>
    );
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-[background-color,border-color,transform] active:scale-[0.97]",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background hover:border-primary/60",
    );

  function confirm() {
    if (!place || !target) return;
    const saved = addPledge({
      kind,
      scope: target.scope,
      target: target.target,
      co: place.co,
      amount,
      currency,
    });
    if (saved) setDone(kind);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.whom}</legend>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {targets.map((x) => {
            const on = x.scope === target.scope && x.target === target.target;
            return (
              <button
                key={`${x.scope}:${x.target}`}
                type="button"
                aria-pressed={on}
                data-scope={x.scope}
                onClick={() => setPicked({ scope: x.scope, target: x.target })}
                className={chip(on)}
              >
                {x.label}
                {x.hint && <span className="text-xs opacity-75">{x.hint}</span>}
              </button>
            );
          })}
        </div>
        {!onRegion && onPickRegion && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t.orRegion}</span>
            {place.regions.map((r) => (
              <button
                key={r.id}
                type="button"
                data-pick-region={r.id}
                onClick={() => onPickRegion(r.id)}
                className="inline-flex min-h-11 items-center rounded-full border border-bridge/60 px-3.5 text-sm font-bold text-bridge-ink transition-colors hover:bg-bridge/10"
              >
                {tryRegionName(r.id, locale)}
              </button>
            ))}
          </p>
        )}
        {onRegion && !region && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t.sampleRegions(
              tryRegionName(place.regions[0].id, locale),
              tryRegionName(place.regions[1].id, locale),
            )}
          </p>
        )}
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.kind}</legend>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["qualification", g.tracks.qualification.name],
              ["in_kind", g.tracks.in_kind.name],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              data-kind={k}
              onClick={() => setKind(k)}
              className={chip(kind === k)}
            >
              {kind === k && <Check className="size-3.5" aria-hidden="true" />}
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <PayCurrencyChoice options={payList} value={currency} onChange={setChosenCurrency} />

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.amount}</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {INDIVIDUAL_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={amount === v}
              onClick={() => setAmount(v)}
              className={cn(chip(amount === v), "tabular-nums")}
            >
              {formatMoney(v, currency, locale)}
            </button>
          ))}
          <Input
            aria-label={t.other}
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            className="h-11 w-28 rounded-full"
            value={amount}
            onChange={(e) =>
              setAmount(Math.min(100_000, Math.max(1, Math.floor(Number(e.target.value)) || 1)))
            }
          />
        </div>
      </fieldset>

      <Button size="lg" className="w-full whitespace-normal" data-try-confirm onClick={confirm}>
        {t.confirm(formatMoney(amount, currency, locale))}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">{t.note}</p>
      {local && child && (
        <Link
          to="/try/$childId"
          params={{ childId: child.id }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          {t.financial(child.name)}
          <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
