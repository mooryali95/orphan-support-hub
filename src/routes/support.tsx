import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";

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
});

export const Route = createFileRoute("/support")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: pageTitle("ادعم", false) },
      {
        name: "description",
        content: "اختر نوع الدعم وهدفه: يتيم، مجموعة، منطقة، دولة، أو مؤسسة.",
      },
    ],
  }),
  component: SupportPage,
});

const STEPS = ["نوع الدعم", "الهدف", "الاختيار", "المبلغ"] as const;
const AMOUNTS = [10, 25, 50, 100];

function SupportPage() {
  const { orphan, name, kind: presetKind, c: mapCountry, r: mapRegion } = Route.useSearch();
  const navigate = Route.useNavigate();
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

  const options = useMemo(() => {
    if (!catalog || !targetType) return [];
    switch (targetType) {
      case "group":
        return catalog.groups
          .filter((g) => g.country === activeCountry)
          .map((g) => ({
            value: g.id,
            label: g.name,
            hint: `${g.region ?? ""} · ${g.children} طفل`,
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
  }, [catalog, targetType, activeCountry]);

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
      },
    });
    setBusy(false);
    setResult(
      res.ok
        ? {
            ok: true,
            text: "سُجّل دعمك. سنُعلمك حين يُفتح التحصيل، وتتابعه من «بواباتي».",
          }
        : { ok: false, text: res.error ?? "تعذّر التسجيل." },
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
          className="h-[60dvh] min-h-[26rem]"
          intro={{
            title: "أين تريد أن تدعم؟",
            text: "اختر دولةً ثم منطقة، أو تابع بالخطوات أدناه.",
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
              ادعم {ctx.regionName ? "هذه المنطقة" : "هذه الدولة"}
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
        <h1 className="text-3xl font-extrabold">ادعم</h1>
        <p className="mt-2 text-muted-foreground">
          أربع خطوات قصيرة. يمكنك الرجوع إلى أيّها بالضغط عليها.
        </p>

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="الخطوات">
          {STEPS.map((s, i) => (
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
            مسار الدعم يتجهّز الآن، وسيُفتح قريباً. يمكنك في الأثناء تصفّح{" "}
            <Link to="/orphans" className="underline">
              دليل الأيتام
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
              شكراً لك
            </p>
            <p className="celebrate-text mx-auto mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
              {result.text}
            </p>
            <Button asChild size="lg" className="celebrate-text mt-6">
              <Link to="/workspaces">بواباتي</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <Section title="١. نوع الدعم">
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(KIND_INFO) as SupportKind[]).map((k) => (
                  <Choice
                    key={k}
                    selected={kind === k}
                    onClick={() => setKind(k)}
                    title={KIND_INFO[k].label}
                    text={KIND_INFO[k].text}
                  />
                ))}
              </div>
            </Section>

            {kind && (
              <Section title="٢. إلى من يذهب؟">
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(TARGET_INFO) as TargetType[]).map((t) => (
                    <Choice
                      key={t}
                      selected={targetType === t}
                      onClick={() => {
                        setTargetType(t);
                        setTarget(t === "orphan" ? (orphan ?? "") : "");
                      }}
                      title={TARGET_INFO[t].label}
                      text={TARGET_INFO[t].text}
                    />
                  ))}
                </div>
              </Section>
            )}

            {kind && targetType && (
              <Section title="٣. الاختيار">
                {targetType !== "country" && catalog.countries.length > 1 && (
                  <div className="mb-4 max-w-xs">
                    <Label htmlFor="sp-country">الدولة</Label>
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
                      الطفل المختار: <strong>{name ?? "من الدليل"}</strong>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      اختر الطفل من{" "}
                      <Link to="/orphans" className="font-medium text-primary underline">
                        دليل الأيتام
                      </Link>
                      ، ثم اضغط «ادعم» في ملفّه.
                    </p>
                  )
                ) : options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا خيارات متاحة هنا بعد.</p>
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
              <Section title="٤. المبلغ">
                <div className="flex flex-wrap gap-2">
                  {AMOUNTS.map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant={amount === a ? "default" : "outline"}
                      onClick={() => setAmount(a)}
                    >
                      {a} €
                    </Button>
                  ))}
                  <Input
                    aria-label="مبلغ آخر"
                    type="number"
                    min={1}
                    className="w-28"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="mt-4">
                  <Label htmlFor="sp-note">ملاحظة (اختياري)</Label>
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
                      سجّل دعمي — {amount} €
                    </Button>
                  ) : (
                    <Button asChild size="lg">
                      <Link to="/auth">سجّل الدخول لإتمام الدعم</Link>
                    </Button>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    يُسجَّل الآن تعهّداً، ولا يُخصم شيء حتى يُفتح التحصيل الإلكتروني.
                  </p>
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
