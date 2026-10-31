import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { formatMoney } from "@/lib/format";
import { DEFAULT_LAYER } from "@/components/map/layers";
import { defaultAmount, gapOfTarget, suggestionsFor } from "@/lib/support-amounts";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  createPledge,
  getSupportCatalog,
  KIND_INFO,
  TARGET_INFO,
  type SupportKind,
  type TargetType,
} from "@/lib/support.functions";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { OfferingNote } from "@/components/kit/OfferingNote";
import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { useMapStats } from "@/components/map/useMapStats";
import { normalize, resolveCountry } from "@/lib/countries";
import { CelebrateMark } from "@/components/kit/Celebrate";

const search = z.object({
  orphan: z.string().uuid().optional(),
  name: z.string().max(120).optional(),
  kind: z.enum(["qualification", "in_kind"]).optional(),
  // موضع الخارطة: الدولة (رمز) والمنطقة (كما في القاعدة).
  c: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  r: z.string().max(120).optional(),
  // فجوة الطفل بعملته (من ملفّه) — منها يُقترح المبلغ.
  gap: z.coerce.number().positive().max(1_000_000).optional(),
  cur: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

export const Route = createFileRoute("/support")({
  validateSearch: search,
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).section, false, l) },
        { name: "description", content: copyOf(COPY, l).description },
      ],
    };
  },
  component: SupportPage,
});

const COPY = defineCopy("routes/support", {
  ar: {
    section: "ادعم",
    description: "اختر نوع الدعم وهدفه: يتيم، مجموعة، منطقة، دولة، أو مؤسسة.",
    steps: ["نوع الدعم", "الهدف", "الاختيار", "المبلغ"],
    kinds: KIND_INFO,
    targets: TARGET_INFO,
    children: (n: number) => `${n} طفل`,
    pledged: "سُجّل دعمك. سنُعلمك حين يُفتح التحصيل، وتتابعه من «بواباتي».",
    failed: "تعذّر التسجيل.",
    mapTitle: "أين تريد أن تدعم؟",
    mapText: "اختر دولةً ثم منطقة، أو تابع بالخطوات أدناه.",
    supportRegion: "ادعم هذه المنطقة",
    supportCountry: "ادعم هذه الدولة",
    h1: "ادعم",
    lead: "أربع خطوات قصيرة. يمكنك الرجوع إلى أيّها بالضغط عليها.",
    stepsLabel: "الخطوات",
    preparingA: "مسار الدعم يتجهّز الآن، وسيُفتح قريباً. يمكنك في الأثناء تصفّح",
    directory: "دليل الأيتام",
    thanks: "شكراً لك",
    portals: "بواباتي",
    s1: "١. نوع الدعم",
    s2: "٢. إلى من يذهب؟",
    s3: "٣. الاختيار",
    s4: "٤. المبلغ",
    country: "الدولة",
    chosenChild: "الطفل المختار:",
    fromDirectory: "من الدليل",
    pickChildA: "اختر الطفل من",
    pickChildB: "، ثم اضغط «ادعم» في ملفّه.",
    noOptions: "لا خيارات متاحة هنا بعد.",
    otherAmount: "مبلغ آخر",
    fromGap: (g: string) => `الحاجة الشهرية غير المغطّاة هنا ${g}. اختر ما يناسبك:`,
    fullMonth: "يسدّ الشهر",
    halfMonth: "نصفه",
    quarterMonth: "ربعه",
    note: "ملاحظة (اختياري)",
    confirm: (a: string) => `سجّل دعمي — ${a}`,
    signIn: "سجّل الدخول لإتمام الدعم",
    signInHint: "تبقى هنا؛ بعد الدخول يُسجَّل دعمك بالمبلغ نفسه.",
    pledgeNote: "يُسجَّل الآن تعهّداً، ولا يُخصم شيء حتى يُفتح التحصيل الإلكتروني.",
  },
  en: {
    section: "Support",
    description:
      "Choose the kind of support and where it goes: a child, a group, a region, a country, or an organization.",
    steps: ["Kind of support", "Recipient", "Choice", "Amount"],
    kinds: {
      qualification: {
        label: "Building capability",
        text: "Fund the qualification journey: sessions, follow-up, and trait measurement before and after.",
      },
      in_kind: {
        label: "In-kind support",
        text: "School bags, clothing, food, devices… delivered and documented with photos and reports.",
      },
    } as typeof KIND_INFO,
    targets: {
      orphan: { label: "A child", text: "Choose a specific child from the directory." },
      group: { label: "A group", text: "The children of one group, with their supervisor." },
      region: { label: "A region", text: "Everyone in a region within the country." },
      country: { label: "A country", text: "Wherever the need is greatest in the country." },
      institution: {
        label: "An organization",
        text: "A center, office or school… working with the children.",
      },
    } as typeof TARGET_INFO,
    children: pluralOf({ one: "{0} child", other: "{0} children" }),
    pledged:
      "Your support is recorded. We'll let you know when payment collection opens, and you can follow it from “My portals”.",
    failed: "It couldn't be recorded.",
    mapTitle: "Where would you like to support?",
    mapText: "Choose a country, then a region — or continue with the steps below.",
    supportRegion: "Support this region",
    supportCountry: "Support this country",
    h1: "Support",
    lead: "Four short steps. You can go back to any of them by tapping it.",
    stepsLabel: "Steps",
    preparingA:
      "The support flow is being prepared and will open soon. Meanwhile, you can browse the",
    directory: "children's directory",
    thanks: "Thank you",
    portals: "My portals",
    s1: "1. Kind of support",
    s2: "2. Who is it for?",
    s3: "3. Your choice",
    s4: "4. Amount",
    country: "Country",
    chosenChild: "Selected child:",
    fromDirectory: "from the directory",
    pickChildA: "Choose the child from the",
    pickChildB: ", then press “Support” on their page.",
    noOptions: "No options available here yet.",
    otherAmount: "Other amount",
    fromGap: (g: string) => `The uncovered monthly need here is ${g}. Pick what suits you:`,
    fullMonth: "Covers the month",
    halfMonth: "Half of it",
    quarterMonth: "A quarter",
    note: "Note (optional)",
    confirm: (a: string) => `Record my support — ${a}`,
    signIn: "Sign in to complete your support",
    signInHint: "You stay here; after signing in, your support is recorded with the same amount.",
    pledgeNote:
      "This is recorded as a pledge for now; nothing is charged until online payment collection opens.",
  },
});
const AMOUNTS = [10, 25, 50, 100];

function SupportPage() {
  const {
    orphan,
    name,
    kind: presetKind,
    c: mapCountry,
    r: mapRegion,
    gap: orphanGap,
    cur: orphanCur,
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const t = useCopy(COPY);
  const locale = useLocale();
  // «ادعم في دقيقتين»: يُقاس من فتح المسار حتى التسجيل.
  const openedAt = useRef<number>(Date.now());
  const { stats, demo } = useMapStats();
  const formRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const fetchCatalog = useServerFn(getSupportCatalog);
  const submit = useServerFn(createPledge);
  const { data, isPending } = useQuery({
    queryKey: ["support-catalog"],
    queryFn: () => fetchCatalog(),
  });

  const [kind, setKind] = useState<SupportKind | null>(presetKind ?? null);
  const [targetType, setTargetType] = useState<TargetType | null>(orphan ? "orphan" : null);
  const [country, setCountry] = useState<string>("");
  const [target, setTarget] = useState<string>(orphan ?? "");
  const [amount, setAmount] = useState<number>(25);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const catalog = data?.catalog ?? null;
  const activeCountry = country || catalog?.countries[0]?.code || "";

  /** فجوة الهدف بعملته: الطفل من رابطه، والدولة أو المنطقة من مصدر الجغرافيا. */
  const gapOf = useMemo(
    () =>
      gapOfTarget({
        targetType,
        target,
        country: activeCountry,
        stats,
        orphanGap,
        orphanCurrency: orphanCur,
      }),
    [targetType, target, activeCountry, stats, orphanGap, orphanCur],
  );
  const currency = gapOf?.currency ?? "EUR";
  const suggested = gapOf
    ? (["fullMonth", "halfMonth", "quarterMonth"] as const).map((k, i) => ({
        label: t[k],
        value: suggestionsFor(gapOf.gap)[i]!,
      }))
    : AMOUNTS.map((a) => ({ label: formatMoney(a, "EUR", locale), value: a }));
  // حين تُعرف الفجوة يبدأ المبلغ بنصف الشهر — خطوةٌ محسوسة بلا ثقل.
  useEffect(() => {
    if (gapOf) setAmount(defaultAmount(gapOf, AMOUNTS[1]!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapOf?.gap, gapOf?.currency]);

  const options = useMemo(() => {
    if (!catalog || !targetType) return [];
    switch (targetType) {
      case "group":
        return catalog.groups
          .filter((g) => g.country === activeCountry)
          .map((g) => ({
            value: g.id,
            label: g.name,
            hint: `${g.region ?? ""} · ${t.children(g.children)}`,
          }));
      case "region":
        return catalog.regions
          .filter((r) => r.country === activeCountry)
          .map((r) => ({ value: r.name, label: r.name, hint: "" }));
      case "institution":
        return catalog.institutions
          .filter((i) => i.country === activeCountry)
          .map((i) => ({
            value: i.id,
            label: i.name,
            hint: [i.kind, i.region].filter(Boolean).join(" · "),
          }));
      case "country":
        return catalog.countries.map((c) => ({ value: c.code, label: c.name, hint: "" }));
      default:
        return [];
    }
  }, [catalog, targetType, activeCountry, t]);

  const step = !kind ? 0 : !targetType ? 1 : !target ? 2 : 3;

  /** ما اختير على الخارطة يصير هدف الدعم: الدولة، ثم المنطقة إن وُجدت في الكتالوج. */
  function applyPlace(code: string | null, region: string | null) {
    if (!catalog || !code) return;
    const c = catalog.countries.find((x) => x.code === code || resolveCountry(x.name) === code);
    if (!c) return;
    setCountry(c.code);
    const match = region
      ? catalog.regions.find((x) => x.country === c.code && normalize(x.name) === normalize(region))
      : undefined;
    if (match) {
      setTargetType("region");
      setTarget(match.name);
    } else {
      setTargetType("country");
      setTarget(c.code);
    }
  }

  // القادم من بطاقة الخارطة في الصفحة الأولى يجد المكان مختاراً.
  useEffect(() => {
    if (!targetType && !orphan) applyPlace(mapCountry ?? null, mapRegion ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // الدولة في الرابط؛ والمنطقة على الخارطة محلّية (معرّفها جغرافيّ، لا قيمة القاعدة).
  const [regionId, setRegionId] = useState<string | null>(null);
  const selection: MapSelection = { country: mapCountry ?? null, region: regionId };
  const onSelect = (sel: MapSelection) => {
    setRegionId(sel.region);
    if ((sel.country ?? undefined) === mapCountry) return;
    void navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev };
        delete next["c"];
        delete next["r"];
        if (sel.country) next["c"] = sel.country;
        return next as typeof prev;
      },
      replace: true,
      resetScroll: false,
      viewTransition: false,
    });
  };

  async function confirm() {
    if (!kind || !targetType || !target) return;
    setBusy(true);
    const res = await submit({
      data: {
        kind,
        targetType,
        target,
        amount,
        country: activeCountry || undefined,
        note: note || undefined,
        currency,
        elapsed: Math.min(86_400, Math.round((Date.now() - openedAt.current) / 1000)),
      },
    });
    setBusy(false);
    setResult(
      res.ok
        ? {
            ok: true,
            text: t.pledged,
          }
        : { ok: false, text: res.error ?? t.failed },
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      {!orphan && (
        <WorldMap
          stats={stats}
          demo={demo}
          selection={selection}
          onSelect={onSelect}
          layer={stats && Object.values(stats).some((s) => s.gap != null) ? "gap" : DEFAULT_LAYER}
          className="h-[60dvh] min-h-[26rem]"
          intro={{
            title: t.mapTitle,
            text: t.mapText,
          }}
          action={(ctx) => (
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                if (!kind) setKind("qualification");
                applyPlace(ctx.code, ctx.regionValue ?? ctx.regionName);
                formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {ctx.regionName ? t.supportRegion : t.supportCountry}
            </Button>
          )}
        />
      )}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-3xl scroll-mt-20 px-4 py-10"
        ref={formRef}
      >
        <h1 className="text-3xl font-extrabold">{t.h1}</h1>
        <p className="mt-2 text-muted-foreground">{t.lead}</p>
        <OfferingNote className="mt-4" />

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label={t.stepsLabel}>
          {t.steps.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "rounded-lg border px-2 py-2 text-center text-xs font-medium sm:text-sm",
                i < step && "border-primary/40 bg-primary/5 text-primary",
                i === step && "border-primary bg-primary text-primary-foreground",
                i > step && "border-border text-muted-foreground",
              )}
            >
              {s}
            </li>
          ))}
        </ol>

        {isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !catalog ? (
          <p className="mt-8 rounded-xl border border-border bg-secondary/40 p-5 text-sm">
            {t.preparingA}{" "}
            <Link to="/orphans" className="underline">
              {t.directory}
            </Link>
            .
          </p>
        ) : result?.ok ? (
          <div className="mt-8 rounded-3xl bg-card p-8 text-center shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.15)]">
            <CelebrateMark />
            <p
              role="status"
              className="celebrate-text mt-6 font-serif text-2xl font-bold text-primary"
            >
              {t.thanks}
            </p>
            <p className="celebrate-text mx-auto mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
              {result.text}
            </p>
            <Button asChild size="lg" className="celebrate-text mt-6">
              <Link to="/workspaces">{t.portals}</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <Section title={t.s1}>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(KIND_INFO) as SupportKind[]).map((k) => (
                  <Choice
                    key={k}
                    selected={kind === k}
                    onClick={() => setKind(k)}
                    title={t.kinds[k].label}
                    text={t.kinds[k].text}
                  />
                ))}
              </div>
            </Section>

            {kind && (
              <Section title={t.s2}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(TARGET_INFO) as TargetType[]).map((tt) => (
                    <Choice
                      key={tt}
                      selected={targetType === tt}
                      onClick={() => {
                        setTargetType(tt);
                        setTarget(tt === "orphan" ? (orphan ?? "") : "");
                      }}
                      title={t.targets[tt].label}
                      text={t.targets[tt].text}
                    />
                  ))}
                </div>
              </Section>
            )}

            {kind && targetType && (
              <Section title={t.s3}>
                {targetType !== "country" && catalog.countries.length > 1 && (
                  <div className="mb-4 max-w-xs">
                    <Label htmlFor="sp-country">{t.country}</Label>
                    <select
                      id="sp-country"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={activeCountry}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        setTarget("");
                      }}
                    >
                      {catalog.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {targetType === "orphan" ? (
                  orphan ? (
                    <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                      {t.chosenChild} <strong>{name ?? t.fromDirectory}</strong>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t.pickChildA}{" "}
                      <Link to="/orphans" className="font-medium text-primary underline">
                        {t.directory}
                      </Link>
                      {t.pickChildB}
                    </p>
                  )
                ) : options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noOptions}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((o) => (
                      <Choice
                        key={o.value}
                        selected={target === o.value}
                        onClick={() => setTarget(o.value)}
                        title={o.label}
                        text={o.hint}
                      />
                    ))}
                  </div>
                )}
              </Section>
            )}

            {kind && targetType && target && (
              <Section title={t.s4}>
                {gapOf && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t.fromGap(formatMoney(gapOf.gap, gapOf.currency, locale))}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {suggested.map((a) => (
                    <Button
                      key={a.label}
                      type="button"
                      variant={amount === a.value ? "default" : "outline"}
                      onClick={() => setAmount(a.value)}
                    >
                      {a.label}
                      {gapOf && (
                        <span className="tabular-nums opacity-80">
                          {formatMoney(a.value, currency, locale)}
                        </span>
                      )}
                    </Button>
                  ))}
                  <Input
                    aria-label={t.otherAmount}
                    type="number"
                    min={1}
                    className="w-28"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="mt-4">
                  <Label htmlFor="sp-note">{t.note}</Label>
                  <Textarea
                    id="sp-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="mt-6">
                  {user ? (
                    <Button size="lg" disabled={busy} onClick={confirm}>
                      {busy && <Loader2 className="size-4 animate-spin" />}
                      {t.confirm(formatMoney(amount, currency, locale))}
                    </Button>
                  ) : (
                    <AuthDialog
                      title={t.signIn}
                      hint={t.signInHint}
                      trigger={(open) => (
                        <Button size="lg" onClick={open}>
                          {t.signIn}
                        </Button>
                      )}
                    />
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{t.pledgeNote}</p>
                  {result && !result.ok && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {result.text}
                    </p>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Choice({
  selected,
  onClick,
  title,
  text,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/60",
      )}
    >
      <span className="flex items-center justify-between gap-2 font-semibold">
        {title}
        {selected && <Check className="size-4 text-primary" />}
      </span>
      {text && <span className="mt-1 block text-sm text-muted-foreground">{text}</span>}
    </button>
  );
}
