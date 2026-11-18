import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { MapPin, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { amountPresets } from "@/lib/amount-presets";
import { formatMoney } from "@/lib/format";
import { gapOf, TRY_CURRENCY, tryChild } from "@/lib/try-demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/try/$childId")({
  loader: ({ params }) => {
    const child = tryChild(params.childId);
    if (!child) throw notFound();
    return { child };
  },
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
  const impact =
    cadence === "one_time"
      ? `عطاءٌ لمرّة واحدة يصل ${child.name} بمستندٍ يثبت تسليمه`
      : value >= gap && gap > 0
        ? `يُكمل حاجة ${child.name} الشهرية كاملةً`
        : value > 0
          ? `يغطّي ${Math.min(100, Math.round((value / child.need) * 100))}% من حاجة ${child.name} الشهرية`
          : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
      <article className="try-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
        <MuralImage
          photoUrl={null}
          displayName={child.name}
          register={registerFor("", pct)}
          className="aspect-[16/7] w-full bg-secondary"
          priority
        />
        <div className="p-6">
          <p className="text-xs tabular-nums text-muted-foreground">{child.code}</p>
          <h1 className="mt-1 text-3xl font-bold">{child.name}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden="true" />
              {child.country}
            </span>
            <span>{child.age} سنوات</span>
            <span>{child.stage}</span>
          </p>
          <div className="mt-6 rounded-2xl bg-secondary/60 p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                غُطّي{" "}
                <b className="tabular-nums">{formatMoney(child.funded, TRY_CURRENCY, "ar")}</b> من{" "}
                <b className="tabular-nums">{formatMoney(child.need, TRY_CURRENCY, "ar")}</b> شهرياً
              </span>
              <span className="font-bold tabular-nums text-bridge-ink">{pct}%</span>
            </div>
            <CrossingProgress percent={pct} className="mt-3" label={`تغطية حاجة ${child.name}`} />
          </div>
          <h2 className="mt-6 font-bold">ما تغطّيه الكفالة</h2>
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
        className="try-rise h-fit rounded-3xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-24"
        style={{ animationDelay: "0.12s" }}
      >
        <h2 className="text-xl font-bold">اكفل {child.name}</h2>
        <div
          role="radiogroup"
          aria-label="نوع العطاء"
          className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
        >
          {(["monthly", "one_time"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={cadence === k}
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
          inputMode="numeric"
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
            className="mt-4 flex items-center gap-2 rounded-xl bg-bridge/8 px-3 py-2 text-sm font-medium leading-7 text-bridge-ink"
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-bridge" />
            {impact}
          </p>
        )}
        <Button
          size="lg"
          className="mt-5 w-full"
          disabled={!valid}
          onClick={() =>
            void navigate({
              to: "/try/pay",
              search: { child: child.id, amount: value, cadence },
            })
          }
        >
          {cadence === "one_time" ? "ادعم الآن" : "ابدأ الكفالة"}
        </Button>
        {!valid && <p className="mt-2 text-xs text-destructive">أقلّ مبلغٍ 5 يورو.</p>}
        <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" aria-hidden="true" />
          تُفعَّل الكفالة بعد تأكيد الدفع، ويُسجَّل كل تحويلٍ وتسليمٍ بمستند.
        </p>
        <Link
          to="/try"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          اختر طفلاً آخر
        </Link>
      </aside>
    </div>
  );
}
