import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Gift, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { KafalaPromise } from "@/components/try/KafalaPromise";
import { TryReportPreview } from "@/components/try/TryReportPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageTitle } from "@/config/brand";
import { amountPresets } from "@/lib/amount-presets";
import { formatMoney } from "@/lib/format";
import { cleanDedication, coverageAfter, gapOf, TRY_CURRENCY, tryChild } from "@/lib/try-demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/try/$childId")({
  loader: ({ params }) => {
    const child = tryChild(params.childId);
    if (!child) throw notFound();
    return { child };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: pageTitle(`${loaderData.child.name} · جرّب المنصّة`, false) }]
      : [],
  }),
  component: TryChildPage,
});

function TryChildPage() {
  const { child } = Route.useLoaderData();
  const navigate = useNavigate();
  const gap = gapOf(child);
  const pct = Math.round((child.funded / child.need) * 100);
  const [cadence, setCadence] = useState<"monthly" | "one_time">("monthly");
  const [amount, setAmount] = useState(String(gap > 0 ? gap : 50));
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 5;
  const [gifting, setGifting] = useState(false);
  const [dedication, setDedication] = useState("");
  /* the bar answers the amount as it is typed: where the child's need stands after this gift */
  const after = valid ? coverageAfter(child, value, cadence) : pct;
  const completes = cadence === "monthly" && gap > 0 && value >= gap;
  const left = cadence === "monthly" && valid && value < gap ? gap - value : 0;
  const impact =
    cadence === "one_time"
      ? `عطاءٌ لمرّة واحدة يصل ${child.name} بمستندٍ يثبت تسليمه`
      : completes
        ? `أنت من يُكمل حاجة ${child.name} الشهرية`
        : value > 0
          ? `يغطّي ${Math.min(100, Math.round((value / child.need) * 100))}% من حاجة ${child.name} الشهرية`
          : null;

  function start(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void navigate({
      to: "/try/pay",
      search: {
        child: child.id,
        amount: value,
        cadence,
        ...(gifting && cleanDedication(dedication) ? { for: cleanDedication(dedication) } : {}),
      },
    });
  }
  /* مجموعة اختيارٍ واحد: السهمان ينقلان الاختيار والتركيز معاً كما في أزرار الراديو */
  function cadenceKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = cadence === "monthly" ? "one_time" : "monthly";
    setCadence(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-cadence="${next}"]`)?.focus();
  }

  /* على الجوال النموذج تحت الملف بشاشتين: شريطٌ ثابت يوصل إليه ما دام تحت مرمى النظر */
  const formRef = useRef<HTMLElement>(null);
  const [formBelow, setFormBelow] = useState(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setFormBelow(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  function toForm() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    formRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById("try-amount")?.focus({ preventScroll: true });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
      <article className="try-rise overflow-hidden rounded-2xl border border-border bg-card">
        <MuralImage
          photoUrl={null}
          displayName={child.name}
          register={registerFor("", pct)}
          className="aspect-[16/7] w-full bg-secondary"
          priority
        />
        <div className="p-6 md:p-8">
          <p className="text-xs tabular-nums text-muted-foreground">{child.code}</p>
          <h1 className="mt-2 text-4xl leading-[1.3] font-bold md:text-[2.75rem]">{child.name}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden="true" />
              {child.country}
            </span>
            <span>{child.age} سنوات</span>
            <span>{child.stage}</span>
          </p>
          <div className="mt-7 rounded-xl bg-secondary/60 p-5">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                غُطّي{" "}
                <b className="tabular-nums">{formatMoney(child.funded, TRY_CURRENCY, "ar")}</b> من{" "}
                <b className="tabular-nums">{formatMoney(child.need, TRY_CURRENCY, "ar")}</b> شهرياً
              </span>
              <span className="numeral text-2xl text-foreground">{after}%</span>
            </div>
            <CrossingProgress percent={after} className="mt-3" label={`تغطية حاجة ${child.name}`} />
            <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">
              {after > pct
                ? completes
                  ? `بعطائك تكتمل حاجة ${child.name}: من ${pct}% إلى 100%.`
                  : `بعطائك ترتفع التغطية من ${pct}% إلى ${after}%.`
                : ""}
            </p>
          </div>
          <h2 className="mt-8 text-lg font-bold">ما تغطّيه الكفالة</h2>
          <p className="mt-1 leading-8 text-muted-foreground">
            {child.covers}، عبر جهة رعايةٍ معتمدة تسلّم كل شهرٍ بمستند، ويعود إليك تقرير الأثر.
          </p>
          <p className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs leading-6 text-muted-foreground">
            في المنصّة الحقيقية تبقى صورة الطفل ومكانه الدقيق خلف بوابة إذنٍ تحميه؛ وهذا الملف
            افتراضي بالكامل.
          </p>
        </div>
      </article>

      <aside
        id="sponsor-form"
        ref={formRef}
        aria-labelledby="sponsor-form-title"
        className="try-rise h-fit scroll-mt-20 rounded-2xl border border-border bg-card p-6 shadow-soft md:p-7 lg:sticky lg:top-24"
        style={{ animationDelay: "0.12s" }}
      >
        <h2 id="sponsor-form-title" className="text-xl font-bold">
          اكفل {child.name}
        </h2>
        {/* نموذجٌ حقيقي: Enter في خانة المبلغ يبدأ الكفالة، كما يتوقّع من يكتب على لوحة المفاتيح */}
        <form onSubmit={start} noValidate>
          <div
            role="radiogroup"
            aria-label="نوع العطاء"
            onKeyDown={cadenceKey}
            className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
          >
            {(["monthly", "one_time"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={cadence === k}
                tabIndex={cadence === k ? 0 : -1}
                data-cadence={k}
                onClick={() => setCadence(k)}
                className={cn(
                  "min-h-11 rounded-lg text-sm font-bold transition-colors",
                  cadence === k
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "monthly" ? "شهرياً" : "مرّة واحدة"}
              </button>
            ))}
          </div>
          <Label htmlFor="try-amount" className="mt-5 block">
            المبلغ (يورو)
          </Label>
          <Input
            id="try-amount"
            name="amount"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={6}
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : "try-amount-error"}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            className="mt-2 text-lg tabular-nums"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {gap > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(gap))}
                className="inline-flex min-h-11 items-center rounded-md border border-bridge px-4 text-sm font-medium text-bridge-ink hover:bg-bridge/10"
              >
                المتبقّي كاملاً
              </button>
            )}
            {amountPresets(child.need, gap).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="inline-flex min-h-11 min-w-14 items-center justify-center rounded-md border border-input px-4 text-sm tabular-nums hover:bg-secondary"
              >
                {v}
              </button>
            ))}
          </div>
          {impact && (
            <p
              aria-live="polite"
              className={cn(
                "mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm leading-7",
                completes
                  ? "bg-primary/10 font-bold text-primary"
                  : "bg-bridge/8 font-medium text-bridge-ink",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  completes ? "bg-primary" : "bg-bridge",
                )}
              />
              {impact}
            </p>
          )}
          {left > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(gap))}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
            >
              بقي {formatMoney(left, TRY_CURRENCY, "ar")} لتكتمل حاجته: أكمِلها
            </button>
          )}

          {/* صدقةٌ جارية عن غيره: اسمٌ يكتبه الداعم، يظهر في أثره وبطاقته، ولا يغيّر شيئاً في الكفالة */}
          <div className="mt-4 rounded-xl border border-border p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={gifting}
                onChange={(e) => setGifting(e.target.checked)}
                className="size-5 accent-[var(--primary)]"
              />
              <Gift className="size-4 text-muted-foreground" aria-hidden="true" />
              اجعلها صدقةً جارية عن غيرك
            </label>
            {gifting && (
              <div className="mt-2">
                <Label htmlFor="try-dedication" className="text-xs text-muted-foreground">
                  عمّن؟ (والدٌ، قريبٌ، من تحبّ)
                </Label>
                <Input
                  id="try-dedication"
                  name="dedication"
                  autoComplete="off"
                  enterKeyHint="go"
                  value={dedication}
                  maxLength={40}
                  onChange={(e) => setDedication(e.target.value)}
                  placeholder="والدي رحمه الله"
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <KafalaPromise className="mt-5" />
          <Button type="submit" size="lg" className="mt-3 w-full" disabled={!valid}>
            {cadence === "one_time" ? "ادعم الآن" : "ابدأ الكفالة"}
          </Button>
          {!valid && (
            <p id="try-amount-error" role="alert" className="mt-2 text-xs text-destructive">
              أقلّ مبلغٍ 5 يورو.
            </p>
          )}
        </form>
        <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" aria-hidden="true" />
          تُفعَّل الكفالة بعد تأكيد الدفع، ويُسجَّل كل تحويلٍ وتسليمٍ بمستند.
        </p>
        <TryReportPreview child={child} amount={valid ? value : gap || 50} />
        <Link
          to="/try"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          اختر طفلاً آخر
        </Link>
      </aside>

      {formBelow && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <Button type="button" size="lg" className="w-full" onClick={toForm}>
            اكفل {child.name}
          </Button>
        </div>
      )}
    </div>
  );
}
