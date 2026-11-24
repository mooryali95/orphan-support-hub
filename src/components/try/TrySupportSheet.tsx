import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CelebrateMark } from "@/components/kit/Celebrate";
import type { MapActionContext } from "@/components/map/WorldMap";
import { TryRealLine } from "@/components/try/TryRealInvite";
import { Button } from "@/components/ui/button";
import type { GivingTrack } from "@/config/giving-tracks";
import { TrackArrow } from "@/components/support/GivingTrackChoice";
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
import { tryPledgeCurrencies, tryReachText } from "@/lib/try-reach";
import { addPledge, tryRegionByName, type TryScope } from "@/lib/try-support";
import { SupportSheetBody, type SheetTarget } from "@/components/support/SupportSheetBody";

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
    sponsorChild: (name: string) => `اكفل ${name} كفالةً مادية`,
    financialAny: "اختر طفلاً لكفالته",
    toHall: "شاهد عطاءك في قاعة الأثر",
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
    sponsorChild: (name: string) => `Sponsor ${name} financially`,
    financialAny: "Choose a child to sponsor",
    toHall: "See your gift in the impact hall",
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
  // الكفالة المادية لطفلٍ بعينه: تقود إلى صفحة طفل التجربة، ولا تُسجَّل تعهّداً من البطاقة.
  const [monthly, setMonthly] = useState(false);
  const track: GivingTrack = monthly ? "monthly" : kind;

  // the pledge is recorded in the chosen currency as typed: no conversion, so no rate to show
  const payList = useMemo(() => tryPledgeCurrencies(ctx.code), [ctx.code]);
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
        <a
          href={`/hall?try=1&c=${ctx.code}`}
          data-to-hall
          className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          {t.toHall}
        </a>
        <TryRealLine className="mt-2" />
      </div>
    );
  }

  // what the amount stands for, in the words the impact hall shows for the same input
  const reach = tryReachText(
    { scope: target.scope, target: target.target, co: place.co },
    amount,
    currency,
    locale,
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

  const key = (x: Target) => `${x.scope}:${x.target}`;
  const sheetTargets: SheetTarget[] = targets.map((x) => ({
    key: key(x),
    label: x.label,
    ...(x.hint ? { hint: x.hint } : {}),
    scope: x.scope,
  }));
  const sponsorGo = (
    <Button asChild size="lg" className="w-full" data-monthly-go>
      {child ? (
        <Link to="/try/$childId" params={{ childId: child.id }}>
          {t.sponsorChild(child.name)}
          <TrackArrow />
        </Link>
      ) : (
        <Link to="/try">
          {t.financialAny}
          <TrackArrow />
        </Link>
      )}
    </Button>
  );

  return (
    <SupportSheetBody
      targets={sheetTargets}
      target={sheetTargets.find((x) => x.key === key(target)) ?? sheetTargets[0]!}
      onTarget={(x) => {
        const next = targets.find((y) => key(y) === x.key);
        if (next) setPicked({ scope: next.scope, target: next.target });
      }}
      afterTargets={
        <>
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
        </>
      }
      track={track}
      onTrack={(next) => {
        setMonthly(next === "monthly");
        if (next !== "monthly") setKind(next);
      }}
      monthly={sponsorGo}
      monthlyWhom={target.label}
      monthlyChild={target.scope === "orphan" ? (child?.name ?? null) : null}
      payList={payList}
      currency={currency}
      onCurrency={setChosenCurrency}
      amounts={INDIVIDUAL_AMOUNTS.map((v) => ({
        key: String(v),
        label: formatMoney(v, currency, locale),
        value: v,
      }))}
      amount={amount}
      onAmount={setAmount}
      reach={
        reach && (
          <p
            className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs leading-5"
            data-try-reach
          >
            <b className="block text-sm text-foreground">{reach.head}</b>
            <span className="text-muted-foreground">{reach.line}</span>
          </p>
        )
      }
      confirm={
        <Button size="lg" className="w-full whitespace-normal" data-try-confirm onClick={confirm}>
          {t.confirm(formatMoney(amount, currency, locale))}
        </Button>
      }
      footnote={<p className="text-xs leading-5 text-muted-foreground">{t.note}</p>}
      after={
        !monthly &&
        local &&
        child && (
          <Link
            to="/try/$childId"
            params={{ childId: child.id }}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            {t.financial(child.name)}
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </Link>
        )
      }
    />
  );
}
