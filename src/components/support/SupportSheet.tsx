import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { AuthDialog } from "@/components/auth/AuthDialog";
import { SupporterModeGate } from "@/components/SupporterModeGate";
import { CelebrateMark } from "@/components/kit/Celebrate";
import type { MapActionContext } from "@/components/map/WorldMap";
import type { MapStats } from "@/components/map/demo-stats";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { normalize } from "@/lib/countries";
import { payableOptions } from "@/lib/currency";
import { readLastGift, saveLastGift, type LastGift } from "@/lib/last-gift";
import { formatMoney } from "@/lib/format";
import { useGivingCopy, type GivingTrack } from "@/config/giving-tracks";
import { TrackArrow } from "@/components/support/GivingTrackChoice";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { defaultIndividualAmount, gapOfTarget, individualPresets } from "@/lib/support-amounts";
import {
  createPledge,
  type SupportCatalog,
  type SupportKind,
  type TargetType,
} from "@/lib/support.functions";
import { PledgeReceipt } from "@/components/support/PledgeReceipt";
import { SupportSheetBody, type SheetTarget } from "@/components/support/SupportSheetBody";
import { trialSlots } from "@/lib/trial-slots";

/** من التجربة إن وُجدت (`@/lib/trial-slots`) */
const ProposalOffer = trialSlots?.ProposalOffer;

const COPY = defineCopy("components/support/SupportSheet", {
  ar: {
    whom: "إلى من؟",
    thisCountry: "هذه الدولة",
    aChild: "طفلٌ بعينه",
    toHall: "شاهد هذا المكان في قاعة الأثر",
    toDirectory: "اختر من الدليل",
    toChildren: "أطفالٌ ينتظرون كافلاً هنا",
    thisRegion: "هذه المنطقة",
    children: (n: number) => `${n} طفل`,
    kind: "نوع الدعم",
    amount: "المبلغ الشهري",
    fromGap: (g: string) => `الحاجة غير المغطّاة هنا ${g}`,
    rest: "سدّ المتبقّي",
    other: "مبلغ آخر",
    note: "ملاحظة (اختياري)",
    confirm: (a: string) => `سجّل دعمي بمبلغ ${a}`,
    signIn: "سجّل الدخول لإتمام الدعم",
    signInHint: "تبقى هنا؛ بعد الدخول يُسجَّل دعمك بالمبلغ نفسه.",
    pledgeNote: "يُسجَّل تعهّداً، ولا يُخصم شيء حتى يُفتح التحصيل الإلكتروني.",
    thanks: "شكراً لك",
    pledged: "سُجّل دعمك. سنُعلمك حين يُفتح التحصيل، وتتابعه من «بواباتي».",
    portals: "بواباتي",
    another: "دعمٌ آخر",
    failed: "تعذّر التسجيل.",
  },
  en: {
    whom: "For whom?",
    thisCountry: "This country",
    aChild: "One child",
    toHall: "See this place in the impact hall",
    toDirectory: "Choose from the directory",
    toChildren: "Children waiting for a sponsor here",
    thisRegion: "This region",
    children: pluralOf({ one: "{0} child", other: "{0} children" }),
    kind: "Kind of support",
    amount: "Monthly amount",
    fromGap: (g: string) => `The uncovered need here is ${g}`,
    rest: "Cover the remaining need",
    other: "Other amount",
    note: "Note (optional)",
    confirm: (a: string) => `Record my support of ${a}`,
    signIn: "Sign in to complete your support",
    signInHint: "You stay here; after signing in, your support is recorded with the same amount.",
    pledgeNote: "Recorded as a pledge; nothing is charged until online collection opens.",
    thanks: "Thank you",
    pledged:
      "Your support is recorded. We'll let you know when collection opens; follow it from “My portals”.",
    portals: "My portals",
    another: "Support again",
    failed: "It couldn't be recorded.",
  },
});

type Target = { type: TargetType; value: string; label: string; hint?: string };

/**
 * الدعم من داخل الخريطة: المكان مختارٌ باللمس، وهنا — في بطاقته — الهدف
 * والنوع والمبلغ والتأكيد. لا نموذج تحت الخريطة ولا خطواتٌ تُغادَر إليها.
 */
export function SupportSheet({
  ctx,
  catalog,
  stats,
  signedIn,
  presetKind,
  openedAt,
}: {
  ctx: MapActionContext;
  catalog: SupportCatalog | null;
  stats: MapStats;
  signedIn: boolean;
  presetKind?: SupportKind | undefined;
  openedAt: number;
}) {
  const t = useCopy(COPY);
  const g = useGivingCopy();
  const locale = useLocale();
  const submit = useServerFn(createPledge);

  // الأهداف الممكنة في هذا المكان: المنطقة أو الدولة أوّلاً، ثم مجموعاتها ومؤسّساتها.
  const targets = useMemo<Target[]>(() => {
    const out: Target[] = [];
    const regionValue = ctx.regionValue ?? ctx.regionName;
    if (regionValue) out.push({ type: "region", value: regionValue, label: t.thisRegion });
    out.push({ type: "country", value: ctx.code, label: t.thisCountry });
    const here = (r: string | null) =>
      !regionValue || !r || normalize(r) === normalize(regionValue);
    for (const g of catalog?.groups ?? []) {
      if (g.country === ctx.code && here(g.region))
        out.push({
          type: "group",
          value: g.id,
          label: g.name,
          ...(g.children == null ? {} : { hint: t.children(g.children) }),
        });
    }
    for (const i of catalog?.institutions ?? []) {
      if (i.country === ctx.code && here(i.region))
        out.push({
          type: "institution",
          value: i.id,
          label: i.name,
          ...(i.kind ? { hint: i.kind } : {}),
        });
    }
    // طفلٌ بعينه: يُختار من الدليل في هذا المكان، ثم يُدعم من صفحته بالأنواع الثلاثة.
    out.push({ type: "orphan", value: "", label: t.aChild });
    return out;
  }, [ctx.code, ctx.regionValue, ctx.regionName, catalog, t]);

  const fallbackTarget: Target = { type: "country", value: ctx.code, label: t.thisCountry };
  const [target, setTarget] = useState<Target>(() => targets[0] ?? fallbackTarget);
  useEffect(() => {
    setTarget(
      (previous) =>
        targets.find((x) => x.type === previous.type && x.value === previous.value) ??
        targets[0] ??
        previous,
    );
  }, [targets]);
  const [kind, setKind] = useState<SupportKind>(presetKind ?? "qualification");
  // الكفالة المادية لطفلٍ بعينه دائماً: في الورقة تقود إلى أطفال المكان، ولا تُسجَّل تعهّداً.
  const [monthly, setMonthly] = useState(false);
  const track: GivingTrack = monthly ? "monthly" : kind;
  function chooseTrack(next: GivingTrack) {
    setMonthly(next === "monthly");
    if (next !== "monthly") setKind(next);
  }
  // المؤسّسة لا تأخذ «بناء الأهلية» (قيدٌ في القاعدة).
  useEffect(() => {
    if (target.type === "institution" && kind === "qualification") setKind("in_kind");
  }, [target.type, kind]);

  const gap = useMemo(
    () =>
      gapOfTarget({
        targetType:
          target.type === "group" || target.type === "institution" ? "region" : target.type,
        target: ctx.regionValue ?? ctx.regionName ?? "",
        country: ctx.code,
        stats,
      }),
    [target.type, ctx.code, ctx.regionValue, ctx.regionName, stats],
  );
  // عملة التعهّد: عملة الفجوة (أو عملة تشغيل الدولة) افتراضاً، والعملة الموحّدة
  // بجانبها. التعهّد يُسجَّل بالعملة المختارة كما كُتب مبلغه، بلا تحويل.
  const payList = useMemo(() => payableOptions(ctx.code, gap?.currency), [ctx.code, gap?.currency]);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const currency =
    payList.find((o) => o.currency === chosenCurrency)?.currency ?? payList[0]!.currency;
  // مبالغ فرد (UX-11): 25/50/100 و«سدّ المتبقّي» — لا كسور فجوةٍ جماعية.
  // «سدّ المتبقّي» بعملة الفجوة وحدها: لا يُعرض رقمها بعملةٍ أخرى بلا تحويل.
  const suggested = individualPresets(gap)
    .filter((p) => p.kind !== "rest" || currency === gap?.currency)
    .map((p) => ({
      key: `${p.kind}:${p.value}`,
      label: p.kind === "rest" ? t.rest : formatMoney(p.value, currency, locale),
      sub: p.kind === "rest" ? formatMoney(p.value, currency, locale) : null,
      value: p.value,
    }));
  // آخر ما أكّده الداعم يُقرأ بعد التركيب، فيصير افتراضاً ما لم يلمس المبلغ أو العملة.
  const [lastGift, setLastGift] = useState<LastGift | null>(null);
  useEffect(() => {
    const saved = readLastGift();
    if (!saved) return;
    setLastGift(saved);
    setChosenCurrency((c) => c ?? saved.currency);
  }, []);
  const suggestedDefault =
    lastGift && lastGift.currency === currency ? lastGift.amount : defaultIndividualAmount(gap);
  const [amount, setAmount] = useState(suggestedDefault);
  const amountEdited = useRef(false);
  // Only initialize untouched amounts; the map's place key starts a new sheet.
  useEffect(() => {
    if (!amountEdited.current) setAmount(suggestedDefault);
  }, [suggestedDefault]);
  function chooseAmount(value: number) {
    amountEdited.current = true;
    setAmount(value);
  }
  /* مقترح الوضع التجريبي الذي ضغط الزائر «استعمله»: يُخفى حين يُسجَّل التعهّد الحقيقي فعلاً */
  const usedProposal = useRef<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    id?: string;
    at?: Date;
  } | null>(null);

  async function confirm() {
    setBusy(true);
    try {
      const res = await submit({
        data: {
          kind,
          targetType: target.type,
          target: target.value,
          amount,
          country: ctx.code,
          note: note || undefined,
          currency,
          elapsed: Math.min(86_400, Math.round((Date.now() - openedAt) / 1000)),
        },
      });
      if (res.ok) saveLastGift({ amount, currency });
      if (res.ok && usedProposal.current) trialSlots?.dismissProposal(usedProposal.current);
      setResult(
        res.ok
          ? { ok: true, text: t.pledged, id: res.id ?? undefined, at: new Date() }
          : { ok: false, text: res.error ?? t.failed },
      );
    } catch {
      // now also runs straight after the in-place sign-in: a failure must show, not freeze the button
      setResult({ ok: false, text: t.failed });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="text-center">
        <CelebrateMark className="mx-auto size-12" />
        <p role="status" className="celebrate-text mt-3 font-serif text-xl font-bold text-primary">
          {t.thanks}
        </p>
        <p className="celebrate-text mt-1 text-sm leading-6 text-muted-foreground">{result.text}</p>
        <PledgeReceipt
          compact
          className="celebrate-text mt-3"
          rows={[
            [t.whom, target.label],
            [
              t.kind,
              kind === "qualification" ? g.tracks.qualification.name : g.tracks.in_kind.name,
            ],
            [t.amount, formatMoney(amount, currency, locale)],
          ]}
          id={result.id}
          at={result.at}
        />
        <div className="mt-3 flex justify-center gap-2">
          <Button asChild size="sm">
            <Link to="/workspaces">{t.portals}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setResult(null)}>
            {t.another}
          </Button>
        </div>
        <a
          href={`/hall?c=${ctx.code}`}
          data-to-hall
          className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          {t.toHall}
        </a>
      </div>
    );
  }

  // الدليل مرشَّحاً بهذا المكان: الدولة والمنطقة، أو المجموعة، ومن ينتظر كافلاً أوّلاً.
  const directory = (
    <Button asChild size="lg" className="w-full">
      <Link
        to="/orphans"
        search={{
          ...(target.type === "group"
            ? { group: target.value }
            : {
                ...(ctx.countryValue ? { country: ctx.countryValue } : {}),
                ...(ctx.regionValue ? { region: ctx.regionValue } : {}),
              }),
          funding: "open",
        }}
      >
        {target.type === "orphan" ? t.toDirectory : t.toChildren}
        <TrackArrow />
      </Link>
    </Button>
  );
  const whom = target.type === "orphan" ? (ctx.regionName ?? t.thisCountry) : target.label;

  const key = (x: Target) => `${x.type}:${x.value}`;
  const sheetTargets: SheetTarget[] = targets.map((x) => ({
    key: key(x),
    label: x.label,
    ...(x.hint ? { hint: x.hint } : {}),
    ...(x.type === "orphan" ? { pickChild: true } : {}),
    scope: x.type,
  }));

  return (
    <SupportSheetBody
      lead={
        /* من الوضع التجريبي، لهذه الدولة وحدها: لا يُطبَّق إلا بضغطة، فتُعدّ تعديلاً من الزائر */
        ProposalOffer && (
          <ProposalOffer
            tracks={["qualification", "in_kind"]}
            co={ctx.code}
            sameCountryOnly
            usable={(p) =>
              payList.some((o) => o.currency === p.currency) &&
              !(target.type === "institution" && p.track === "qualification")
            }
            onUse={(p) => {
              if (p.track !== "sponsorship") {
                setKind(p.track);
                setMonthly(false);
              }
              setChosenCurrency(p.currency);
              chooseAmount(p.amount);
              usedProposal.current = p.id;
            }}
          />
        )
      }
      targets={sheetTargets}
      target={sheetTargets.find((x) => x.key === key(target)) ?? sheetTargets[0]!}
      onTarget={(x) => {
        const next = targets.find((y) => key(y) === x.key);
        if (next) setTarget(next);
      }}
      track={track}
      onTrack={chooseTrack}
      trackDisabled={(k) => k === "qualification" && target.type === "institution"}
      monthly={directory}
      childPick={directory}
      monthlyWhom={whom}
      payList={payList}
      currency={currency}
      onCurrency={setChosenCurrency}
      amountLegend={
        gap && (
          <span className="ms-1 text-muted-foreground/80">
            — {t.fromGap(formatMoney(gap.gap, gap.currency, locale))}
          </span>
        )
      }
      amounts={suggested}
      amount={amount}
      onAmount={chooseAmount}
      extra={
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">{t.note}</summary>
          <Textarea
            rows={2}
            className="mt-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </details>
      }
      confirm={
        <SupporterModeGate>
          {signedIn ? (
            <Button size="lg" className="w-full" disabled={busy} onClick={confirm}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t.confirm(formatMoney(amount, currency, locale))}
            </Button>
          ) : (
            <AuthDialog
              title={t.signIn}
              hint={t.signInHint}
              // after signing in the support is recorded as promised, with no second click
              onDone={() => void confirm()}
              trigger={(open) => (
                <Button size="lg" className="w-full" onClick={open}>
                  {t.signIn}
                </Button>
              )}
            />
          )}
        </SupporterModeGate>
      }
      footnote={<p className="text-xs leading-5 text-muted-foreground">{t.pledgeNote}</p>}
      after={
        result &&
        !result.ok && (
          <p role="alert" className="text-sm text-destructive">
            {result.text}
          </p>
        )
      }
    />
  );
}
