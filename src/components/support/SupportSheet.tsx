import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
import { useGivingCopy } from "@/config/giving-tracks";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { defaultIndividualAmount, gapOfTarget, individualPresets } from "@/lib/support-amounts";
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
    amount: "المبلغ الشهري",
    fromGap: (g: string) => `الحاجة غير المغطّاة هنا ${g}`,
    rest: "سدّ المتبقّي",
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
    amount: "Monthly amount",
    fromGap: (g: string) => `The uncovered need here is ${g}`,
    rest: "Cover the remaining need",
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
    return out;
  }, [ctx, catalog, t]);

  const [target, setTarget] = useState<Target>(targets[0]!);
  useEffect(() => setTarget(targets[0]!), [targets]);
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
    [target.type, ctx, stats],
  );
  const currency = gap?.currency ?? "EUR";
  // مبالغ فرد (UX-11): 25/50/100 و«سدّ المتبقّي» — لا كسور فجوةٍ جماعية.
  const suggested = individualPresets(gap).map((p) => ({
    key: `${p.kind}:${p.value}`,
    label: p.kind === "rest" ? t.rest : formatMoney(p.value, currency, locale),
    sub: p.kind === "rest" ? formatMoney(p.value, currency, locale) : null,
    value: p.value,
  }));
  const [amount, setAmount] = useState(() => defaultIndividualAmount(gap));
  useEffect(() => setAmount(defaultIndividualAmount(gap)), [gap]);
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
      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-[background-color,border-color,transform] active:scale-[0.97]",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background hover:border-primary/60",
    );

  return (
    // عمودٌ بعرض البطاقة: صفّ «إلى من؟» يتمرّر داخلها ولا يمدّها (كان يفيض خارجها).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <fieldset className="min-w-0">
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

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.kind}</legend>
        <div className="flex gap-1.5">
          {(
            [
              // أسماء المسارات من مكانها الواحد (config/giving-tracks).
              ["qualification", g.tracks.qualification.name],
              ["in_kind", g.tracks.in_kind.name],
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

      <fieldset className="min-w-0">
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
              key={a.key}
              type="button"
              aria-pressed={amount === a.value}
              onClick={() => setAmount(a.value)}
              className={cn(chip(amount === a.value), "tabular-nums")}
            >
              {a.label}
              {a.sub && <span className="text-xs opacity-80">{a.sub}</span>}
            </button>
          ))}
          <Input
            aria-label={t.other}
            type="number"
            inputMode="numeric"
            min={1}
            className="h-11 w-28 rounded-full"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
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
      <p className="text-xs leading-5 text-muted-foreground">{t.pledgeNote}</p>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-destructive">
          {result.text}
        </p>
      )}
    </div>
  );
}
