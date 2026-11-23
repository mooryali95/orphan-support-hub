import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Gift, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { FxNote, PayCurrencyChoice } from "@/components/sponsorship/PayCurrency";
import { KafalaPromise } from "@/components/try/KafalaPromise";
import { TryChildMissing } from "@/components/try/TryChildMissing";
import { TryReportPreview } from "@/components/try/TryReportPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageTitle } from "@/config/brand";
import { useGivingCopy } from "@/config/giving-tracks";
import { currencyName } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { copyOf, defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { amountAfterSwitch, presetKeyOf, presetsIn, quoteFor } from "@/lib/pay-options";
import {
  cleanDedication,
  coverageAfter,
  gapOf,
  localTryChild,
  TRY_CURRENCY,
  type TryChild,
  tryChild,
  tryPayOptions,
} from "@/lib/try-demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/try/$childId")({
  // طفلٌ ليس في التجربة يُرسم داخل الصفحة نفسها (TryChildMissing): يبقى الزائر في رحلته.
  loader: ({ params }) => ({ child: tryChild(params.childId) ?? null }),
  head: ({ loaderData, match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: loaderData?.child
        ? [
            {
              title: pageTitle(
                copyOf(COPY, l).pageTitle(localTryChild(loaderData.child, l).name),
                false,
                l,
              ),
            },
          ]
        : [],
    };
  },
  component: TryChildRoute,
});

const COPY = defineCopy("routes/try.childId", {
  ar: {
    pageTitle: (name: string) => `${name} · جرّب المنصّة`,
    impactOnce: (name: string) => `عطاءٌ لمرّة واحدة يصل ${name} بمستندٍ يثبت تسليمه`,
    impactCompletes: (name: string) => `أنت من يُكمل حاجة ${name} الشهرية`,
    impactCovers: (percent: number, name: string) => `يغطّي ${percent}% من حاجة ${name} الشهرية`,
    age: pluralOf(
      {
        one: "سنة واحدة",
        two: "سنتان",
        few: "{0} سنوات",
        many: "{0} سنة",
        other: "{0} سنة",
      },
      0,
      "ar",
    ),
    coveredLead: "غُطّي",
    coveredOf: "من",
    coveredTail: "شهرياً",
    coverage: (name: string) => `تغطية حاجة ${name}`,
    completesTo: (name: string, from: number) => `بعطائك تكتمل حاجة ${name}: من ${from}% إلى 100%.`,
    raisesTo: (from: number, to: number) => `بعطائك ترتفع التغطية من ${from}% إلى ${to}%.`,
    coversTitle: "ما تغطّيه الكفالة",
    coversText: (covers: string) =>
      `${covers}، عبر جهةٍ ميدانية تعمل تحت مظلّة الندوة تسلّم كل شهرٍ بمستند، ويعود إليك تقرير الأثر.`,
    gateNote:
      "في المنصّة الحقيقية تبقى صورة الطفل ومكانه الدقيق خلف بوابة إذنٍ تحميه؛ وهذا الملف افتراضي بالكامل.",
    sponsor: (name: string) => `اكفل ${name}`,
    cadence: "نوع العطاء",
    monthly: "شهرياً",
    oneTime: "مرّة واحدة",
    amount: (currency: string) => `المبلغ (${currency})`,
    fullRest: "المتبقّي كاملاً",
    leftToComplete: (amount: string) => `بقي ${amount} لتكتمل الحاجة: أكمِلها`,
    dedicate: "اجعلها صدقةً جارية عن غيرك",
    dedicateWhom: "عمّن؟ (والدٌ، قريبٌ، من تحبّ)",
    dedicatePlaceholder: "والدي رحمه الله",
    supportNow: "ادعم الآن",
    start: "ابدأ الكفالة",
    minAmount: (min: string) => `أقلّ مبلغٍ ${min}.`,
    activation: "تُفعَّل الكفالة بعد تأكيد الدفع، ويُسجَّل كل تحويلٍ وتسليمٍ بمستند.",
    another: "اختر طفلاً آخر",
    otherKinds: (name: string) => `أو ادعم ${name} بغير الكفالة المادية، من الخريطة:`,
  },
  en: {
    pageTitle: (name: string) => `${name} · Try the platform`,
    impactOnce: (name: string) => `A one-time gift that reaches ${name} with proof of delivery`,
    impactCompletes: (name: string) => `You complete ${name}'s monthly need`,
    impactCovers: (percent: number, name: string) => `Covers ${percent}% of ${name}'s monthly need`,
    age: pluralOf({ one: "{0} year old", other: "{0} years old" }),
    coveredLead: "",
    coveredOf: "of",
    coveredTail: "covered each month",
    coverage: (name: string) => `Coverage of ${name}'s need`,
    completesTo: (name: string, from: number) =>
      `Your gift completes ${name}'s need: from ${from}% to 100%.`,
    raisesTo: (from: number, to: number) => `Your gift raises coverage from ${from}% to ${to}%.`,
    coversTitle: "What the sponsorship covers",
    coversText: (covers: string) =>
      `${covers}, through a field organization working under WAMY's umbrella that documents each monthly delivery and sends you an impact report.`,
    gateNote:
      "On the live platform, the child's photo and exact location stay behind a protective access gate. This file is entirely fictional.",
    sponsor: (name: string) => `Sponsor ${name}`,
    cadence: "Type of gift",
    monthly: "Monthly",
    oneTime: "One-time",
    amount: (currency: string) => `Amount (${currency})`,
    fullRest: "Full remainder",
    leftToComplete: (amount: string) => `${amount} more completes the need. Give the full amount`,
    dedicate: "Give it as ongoing charity on behalf of someone",
    dedicateWhom: "On whose behalf? (a parent, a relative, a loved one)",
    dedicatePlaceholder: "My late father",
    supportNow: "Give now",
    start: "Start sponsorship",
    minAmount: (min: string) => `The minimum amount is ${min}.`,
    activation:
      "The sponsorship is activated once payment is confirmed, and every transfer and delivery is documented.",
    another: "Choose another child",
    otherKinds: (name: string) => `Or support ${name} in another way, from the map:`,
  },
});

function TryChildRoute() {
  const { child } = Route.useLoaderData();
  return child ? <TryChildPage data={child} /> : <TryChildMissing />;
}

function TryChildPage({ data }: { data: TryChild }) {
  const locale = useLocale();
  const c = useCopy(COPY);
  const child = localTryChild(data, locale);
  const navigate = useNavigate();
  const giving = useGivingCopy();
  const gap = gapOf(child);
  const pct = Math.round((child.funded / child.need) * 100);
  const [cadence, setCadence] = useState<"monthly" | "one_time">("monthly");
  /* عملة الدفع: عملة الملف افتراضاً، أو عملة بلد الطفل، أو العملة الموحّدة. المبلغ يُكتب بها،
     وما يُقيَّد لحاجة الطفل (بعملة الملف) هو ما تجيب به الشرائط والنسب أدناه. */
  const co = child.co;
  const payOptions = useMemo(() => tryPayOptions({ co }), [co]);
  const [payCurrency, setPayCurrency] = useState(payOptions.needCurrency);
  const presets = presetsIn(payOptions, payCurrency, child.need, gap);
  const [amount, setAmount] = useState(String(gap > 0 ? gap : 50));
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 5;
  const quote = valid ? quoteFor(payOptions, value, payCurrency) : null;
  /* what reaches the child's need, in the file currency */
  const credited = quote?.credited.amount ?? 0;
  function switchCurrency(next: string) {
    if (next === payCurrency) return;
    // typed by hand: the number stays; picked from the suggestions: the same suggestion
    setAmount(
      amountAfterSwitch(
        presetKeyOf(presets, value),
        amount,
        presetsIn(payOptions, next, child.need, gap),
      ),
    );
    setPayCurrency(next);
  }
  const [gifting, setGifting] = useState(false);
  const [dedication, setDedication] = useState("");
  /* the bar answers the amount as it is typed: where the child's need stands after this gift */
  const after = valid ? coverageAfter(child, credited, cadence) : pct;
  const completes = cadence === "monthly" && gap > 0 && credited >= gap;
  const left =
    cadence === "monthly" && valid && presets.gap !== null && credited < gap
      ? presets.gap - value
      : 0;
  const impact =
    cadence === "one_time"
      ? c.impactOnce(child.name)
      : completes
        ? c.impactCompletes(child.name)
        : credited > 0
          ? c.impactCovers(Math.min(100, Math.round((credited / child.need) * 100)), child.name)
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
        ...(payCurrency !== payOptions.needCurrency ? { cur: payCurrency } : {}),
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
            <span>{c.age(child.age)}</span>
            <span>{child.stage}</span>
          </p>
          <div className="mt-7 rounded-xl bg-secondary/60 p-5">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {c.coveredLead}{" "}
                <b className="tabular-nums">{formatMoney(child.funded, TRY_CURRENCY, locale)}</b>{" "}
                {c.coveredOf}{" "}
                <b className="tabular-nums">{formatMoney(child.need, TRY_CURRENCY, locale)}</b>{" "}
                {c.coveredTail}
              </span>
              <span className="numeral text-2xl text-foreground">{after}%</span>
            </div>
            <CrossingProgress percent={after} className="mt-3" label={c.coverage(child.name)} />
            <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">
              {after > pct
                ? completes
                  ? c.completesTo(child.name, pct)
                  : c.raisesTo(pct, after)
                : ""}
            </p>
          </div>
          <h2 className="mt-8 text-lg font-bold">{c.coversTitle}</h2>
          <p className="mt-1 leading-8 text-muted-foreground">{c.coversText(child.covers)}</p>
          <p className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs leading-6 text-muted-foreground">
            {c.gateNote}
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
          {c.sponsor(child.name)}
        </h2>
        {/* نموذجٌ حقيقي: Enter في خانة المبلغ يبدأ الكفالة، كما يتوقّع من يكتب على لوحة المفاتيح */}
        <form onSubmit={start} noValidate>
          <div
            role="radiogroup"
            aria-label={c.cadence}
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
                {k === "monthly" ? c.monthly : c.oneTime}
              </button>
            ))}
          </div>
          <PayCurrencyChoice
            options={payOptions.options}
            value={payCurrency}
            onChange={switchCurrency}
            className="mt-5"
          />
          <Label htmlFor="try-amount" className="mt-5 block">
            {c.amount(currencyName(payCurrency, locale))}
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
            {presets.gap !== null && (
              <button
                type="button"
                onClick={() => setAmount(String(presets.gap))}
                className="inline-flex min-h-11 items-center rounded-md border border-bridge px-4 text-sm font-medium text-bridge-ink hover:bg-bridge/10"
              >
                {c.fullRest}
              </button>
            )}
            {presets.amounts.map((v) => (
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
          <FxNote quote={quote} childName={child.name} className="mt-3" />
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
              onClick={() => setAmount(String(presets.gap))}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
            >
              {c.leftToComplete(formatMoney(left, payCurrency, locale))}
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
              {c.dedicate}
            </label>
            {gifting && (
              <div className="mt-2">
                <Label htmlFor="try-dedication" className="text-xs text-muted-foreground">
                  {c.dedicateWhom}
                </Label>
                <Input
                  id="try-dedication"
                  name="dedication"
                  autoComplete="off"
                  enterKeyHint="go"
                  value={dedication}
                  maxLength={40}
                  onChange={(e) => setDedication(e.target.value)}
                  placeholder={c.dedicatePlaceholder}
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <KafalaPromise className="mt-5" />
          <Button type="submit" size="lg" className="mt-3 w-full" disabled={!valid}>
            {cadence === "one_time" ? c.supportNow : c.start}
          </Button>
          {!valid && (
            <p id="try-amount-error" role="alert" className="mt-2 text-xs text-destructive">
              {c.minAmount(formatMoney(5, payCurrency, locale))}
            </p>
          )}
        </form>
        <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" aria-hidden="true" />
          {c.activation}
        </p>
        <TryReportPreview child={child} amount={valid && credited > 0 ? credited : gap || 50} />
        <div className="mt-4 rounded-xl border border-border p-3">
          <p className="text-sm leading-6 text-muted-foreground">{c.otherKinds(child.name)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["qualification", "in_kind"] as const).map((k) => (
              <Link
                key={k}
                to="/try/support"
                search={{ c: child.co, kind: k, child: child.id }}
                className="inline-flex min-h-11 items-center rounded-full border border-input px-4 text-sm font-bold transition-colors hover:border-primary/50 hover:bg-secondary/60"
              >
                {giving.tracks[k].name}
              </Link>
            ))}
          </div>
        </div>
        <Link
          to="/try"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          {c.another}
        </Link>
      </aside>

      {formBelow && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <Button type="button" size="lg" className="w-full" onClick={toForm}>
            {c.sponsor(child.name)}
          </Button>
        </div>
      )}
    </div>
  );
}
