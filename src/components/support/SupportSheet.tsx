import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { AuthDialog } from "@/components/auth/AuthDialog";
import { CelebrateMark } from "@/components/kit/Celebrate";
import type { MapActionContext } from "@/components/map/WorldMap";
import type { MapStats } from "@/components/map/demo-stats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalize } from "@/lib/countries";
import { formatMoney } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { defaultAmount, gapOfTarget, suggestionsFor } from "@/lib/support-amounts";
import {
  createPledge,
  type SupportCatalog,
  type SupportKind,
  type TargetType,
} from "@/lib/support.functions";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/support/SupportSheet", {
  ar: {
    whom: "إلى من؟",
    thisCountry: "هذه الدولة",
    thisRegion: "هذه المنطقة",
    children: (n: number) => `${n} طفل`,
    kind: "نوع الدعم",
    qualification: "بناء الأهلية",
    inKind: "دعم عيني",
    amount: "المبلغ الشهري",
    fromGap: (g: string) => `الحاجة غير المغطّاة هنا ${g}`,
    fullMonth: "يسدّ الشهر",
    halfMonth: "نصفه",
    quarterMonth: "ربعه",
    other: "مبلغ آخر",
    note: "ملاحظة (اختياري)",
    confirm: (a: string) => `سجّل دعمي — ${a}`,
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
    thisRegion: "This region",
    children: pluralOf({ one: "{0} child", other: "{0} children" }),
    kind: "Kind of support",
    qualification: "Building capability",
    inKind: "In-kind support",
    amount: "Monthly amount",
    fromGap: (g: string) => `The uncovered need here is ${g}`,
    fullMonth: "Covers the month",
    halfMonth: "Half",
    quarterMonth: "A quarter",
    other: "Other amount",
    note: "Note (optional)",
    confirm: (a: string) => `Record my support — ${a}`,
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

const FALLBACK = [10, 25, 50, 100];

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
        out.push({ type: "group", value: g.id, label: g.name, hint: t.children(g.children) });
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
    return out;
  }, [ctx.code, ctx.regionValue, ctx.regionName, catalog, t]);

  const fallbackTarget: Target = { type: "country", value: ctx.code, label: t.thisCountry };
  const [target, setTarget] = useState<Target>(() => targets[0] ?? fallbackTarget);
  useEffect(() => {
    setTarget((previous) =>
      targets.find((x) => x.type === previous.type && x.value === previous.value)
      ?? targets[0] ?? previous,
    );
  }, [targets]);
  const [kind, setKind] = useState<SupportKind>(presetKind ?? "qualification");
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
  const currency = gap?.currency ?? "EUR";
  const suggested = gap
    ? (["fullMonth", "halfMonth", "quarterMonth"] as const).map((k, i) => ({
        label: t[k],
        value: suggestionsFor(gap.gap)[i] ?? 25,
      }))
    : FALLBACK.map((a) => ({ label: formatMoney(a, "EUR", locale), value: a }));
  const suggestedDefault = defaultAmount(gap, 25);
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function confirm() {
    setBusy(true);
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
    setBusy(false);
    setResult(res.ok ? { ok: true, text: t.pledged } : { ok: false, text: res.error ?? t.failed });
  }

  if (result?.ok) {
    return (
      <div className="text-center">
        <CelebrateMark className="mx-auto size-12" />
        <p role="status" className="celebrate-text mt-3 font-serif text-xl font-bold text-primary">
          {t.thanks}
        </p>
        <p className="celebrate-text mt-1 text-sm leading-6 text-muted-foreground">{result.text}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button asChild size="sm">
            <Link to="/workspaces">{t.portals}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setResult(null)}>
            {t.another}
          </Button>
        </div>
      </div>
    );
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-[background-color,border-color,transform] active:scale-[0.97]",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background hover:border-primary/60",
    );

  return (
    <div className="grid gap-3">
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.whom}</legend>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {targets.map((x) => (
            <button
              key={`${x.type}:${x.value}`}
              type="button"
              aria-pressed={target.type === x.type && target.value === x.value}
              onClick={() => setTarget(x)}
              className={chip(target.type === x.type && target.value === x.value)}
            >
              {x.label}
              {x.hint && <span className="text-xs opacity-75">{x.hint}</span>}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.kind}</legend>
        <div className="flex gap-1.5">
          {(
            [
              ["qualification", t.qualification],
              ["in_kind", t.inKind],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              disabled={k === "qualification" && target.type === "institution"}
              onClick={() => setKind(k)}
              className={cn(chip(kind === k), "disabled:opacity-40")}
            >
              {kind === k && <Check className="size-3.5" aria-hidden="true" />}
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t.amount}
          {gap && (
            <span className="ms-1 text-muted-foreground/80">
              — {t.fromGap(formatMoney(gap.gap, gap.currency, locale))}
            </span>
          )}
        </legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {suggested.map((a) => (
            <button
              key={a.label}
              type="button"
              aria-pressed={amount === a.value}
              onClick={() => chooseAmount(a.value)}
              className={chip(amount === a.value)}
            >
              {a.label}
              {gap && (
                <span className="text-xs tabular-nums opacity-80">
                  {formatMoney(a.value, currency, locale)}
                </span>
              )}
            </button>
          ))}
          <Input
            aria-label={t.other}
            type="number"
            inputMode="numeric"
            min={1}
            className="h-9 w-24 rounded-full"
            value={amount}
            onChange={(e) => chooseAmount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </fieldset>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">{t.note}</summary>
        <Textarea
          rows={2}
          className="mt-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </details>

      {signedIn ? (
        <Button size="lg" className="w-full" disabled={busy} onClick={confirm}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {t.confirm(formatMoney(amount, currency, locale))}
        </Button>
      ) : (
        <AuthDialog
          title={t.signIn}
          hint={t.signInHint}
          trigger={(open) => (
            <Button size="lg" className="w-full" onClick={open}>
              {t.signIn}
            </Button>
          )}
        />
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">{t.pledgeNote}</p>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-destructive">
          {result.text}
        </p>
      )}
    </div>
  );
}
