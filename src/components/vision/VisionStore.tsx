/**
 * حالة المنظومة الحيّة لصفحات منصة الرؤية والتوجهات: محرّكٌ واحد (`vision-engine`) تقرأه
 * المنصّات الثلاث وتكتب فيه. تُحفظ في متصفّح الزائر وتتزامن بين تبويباته،
 * فتبرّعٌ في «رحلة المال» يظهر فوراً في لوحة القرار المفتوحة في تبويبٍ آخر.
 * بيئةٌ تجريبية: لا يُرسل شيءٌ منها إلى خادمٍ أو قاعدة.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ALBANIA } from "@/data/vision-demo";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import {
  type Action,
  isFunded,
  type Method,
  reduce,
  revive,
  seed,
  totals,
  type VisionEvent,
  type VisionState,
} from "@/lib/vision-engine";

const KEY = "vision-engine:v1";

type Store = {
  state: VisionState;
  ready: boolean;
  dispatch: (a: DistributiveOmit<Action, "at">) => void;
};
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const Ctx = createContext<Store | null>(null);

export function VisionStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VisionState>(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(revive(JSON.parse(raw)));
    } catch {
      /* تخزينٌ محجوب: نبدأ من البذرة */
    }
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        setState(e.newValue ? revive(JSON.parse(e.newValue)) : seed());
      } catch {
        /* تجاهل */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dispatch = useCallback((a: DistributiveOmit<Action, "at">) => {
    setState((prev) => {
      const next = reduce(prev, { ...a, at: Date.now() } as Action);
      if (next !== prev) {
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* تجاهل */
        }
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ state, ready, dispatch }), [state, ready, dispatch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVision() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useVision outside VisionStoreProvider");
  return s;
}

/* ── الصياغة: أسماء الأماكن وأحداث السجلّ ──────────────────────────── */

const COPY = defineCopy("components/vision/VisionStore", {
  ar: {
    sar: "ر.س",
    feedH: "سجلّ المنظومة الحيّ",
    feedEmpty: "لا أحداث بعد. جرّب تبرّعاً من «رحلة المال» أو من النموذج.",
    layer: { support: "الدعم", operations: "التشغيل", decision: "القرار" },
    donation: (amt: string, donor: string, place: string) =>
      `${donor} تبرّع بـ ${amt} لـ${place} (بطاقة)`,
    pending: (amt: string, donor: string, place: string) =>
      `${donor} أعلن تحويلاً بـ ${amt} لـ${place} — بانتظار المطابقة`,
    settled: (amt: string, net: string, inv: string) =>
      `قُيِّد ${amt} في حساب الندوة · الصافي ${net} · ${inv}`,
    allocGroup: (amt: string, place: string) => `خُصِّص ${amt} لـ${place}`,
    allocFull: (amt: string, place: string) => `خُصِّص ${amt} لـ${place} — اكتمل تمويلها`,
    allocPool: (amt: string, place: string) => `${amt} رصيدٌ حرّ لـ${place} ينتظر قراراً`,
    disbursed: (eur: string, place: string) => `صرفٌ إلى مكتب ألبانيا: ${eur} € لـ${place}`,
    session: (place: string, n: number, of: number) => `${place}: جلسة ${n} من ${of}`,
    cycleDone: (place: string) => `${place}: اكتملت الدورة — جاهزة للقياس البعدي`,
    measuredOps: (place: string, a: string, b: string) => `${place}: السمة من ${a} إلى ${b}`,
    measuredDec: (n: string) => `في رحلة تأهيلٍ مقيسة الآن: ${n}`,
    decision: {
      newGroup: (place: string) => `قرار: فُتحت مجموعةٌ جديدة في ${place}`,
      campaign: (place: string) => `قرار: أُطلقت حملةٌ لـ${place}`,
      redirect: (place: string, to: string) => `قرار: أُعيد توجيه فائض ${place} إلى ${to}`,
      fundGroup: (place: string) => `قرار: أُولويةٌ لتمويل ${place}`,
    } as Record<string, (a: string, b: string) => string>,
    // النموذج
    formH: "تبرّعٌ تجريبي",
    formLead: "يمرّ بالطبقات الثلاث كما سيمرّ المال الحقيقي — ولا يُحصَّل شيء.",
    donor: "اسم الداعم (مستعار)",
    donorPh: "مثال: داعمٌ من الرياض",
    amount: "المبلغ (ر.س)",
    target: "الوجهة",
    method: "طريقة الدفع",
    card: "بطاقة",
    bank: "تحويل بنكي",
    give: "تبرّع الآن",
    done: "وصل — تابِعه في لوحة القرار والتشغيل",
    reset: "إعادة البيئة إلى البداية",
    resetConfirm: "ستُمحى كلّ التبرعات والقرارات التجريبية في هذا المتصفّح. متابعة؟",
    sandbox: "بيئة تجريبية · لا مال حقيقي",
  },
  en: {
    sar: "SAR",
    feedH: "Live system log",
    feedEmpty: "No events yet. Try a donation from the money journey or the form.",
    layer: { support: "Support", operations: "Operations", decision: "Decision" },
    donation: (amt: string, donor: string, place: string) =>
      `${donor} gave ${amt} to ${place} (card)`,
    pending: (amt: string, donor: string, place: string) =>
      `${donor} declared a ${amt} transfer to ${place} — awaiting reconciliation`,
    settled: (amt: string, net: string, inv: string) =>
      `${amt} recorded in WAMY's account · net ${net} · ${inv}`,
    allocGroup: (amt: string, place: string) => `${amt} allocated to ${place}`,
    allocFull: (amt: string, place: string) => `${amt} allocated to ${place} — now fully funded`,
    allocPool: (amt: string, place: string) =>
      `${amt} free balance for ${place}, awaiting a decision`,
    disbursed: (eur: string, place: string) =>
      `Disbursed to the Albania office: €${eur} for ${place}`,
    session: (place: string, n: number, of: number) => `${place}: session ${n} of ${of}`,
    cycleDone: (place: string) => `${place}: cycle complete — ready for follow-up measurement`,
    measuredOps: (place: string, a: string, b: string) => `${place}: trait ${a} → ${b}`,
    measuredDec: (n: string) => `Now in a measured journey: ${n}`,
    decision: {
      newGroup: (place: string) => `Decision: a new group opened in ${place}`,
      campaign: (place: string) => `Decision: a campaign launched for ${place}`,
      redirect: (place: string, to: string) => `Decision: ${place}'s surplus redirected to ${to}`,
      fundGroup: (place: string) => `Decision: priority funding for ${place}`,
    } as Record<string, (a: string, b: string) => string>,
    formH: "Test donation",
    formLead: "It passes through the three layers as real money will — nothing is collected.",
    donor: "Supporter name (pseudonym)",
    donorPh: "e.g. a supporter from Riyadh",
    amount: "Amount (SAR)",
    target: "Destination",
    method: "Payment method",
    card: "Card",
    bank: "Bank transfer",
    give: "Donate now",
    done: "Received — follow it on the decision and operations boards",
    reset: "Reset the sandbox",
    resetConfirm: "All test donations and decisions in this browser will be cleared. Continue?",
    sandbox: "Sandbox · no real money",
  },
});

export function useVisionCopy() {
  return useCopy(COPY);
}

/** اسم مدينةٍ أو مجموعةٍ بلغة الواجهة. */
export function usePlace() {
  const { state } = useVision();
  const locale = useLocale();
  return (id: string) => {
    const g = state.groups.find((x) => x.id === id);
    const c = state.cities.find((x) => x.id === id) ?? ALBANIA.find((x) => x.id === id);
    const n = g?.name ?? c?.name;
    return n ? (locale === "ar" ? n.ar : n.en) : id;
  };
}

export function useMoney() {
  const locale = useLocale();
  const c = useCopy(COPY);
  return (n: number) =>
    `${new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en", { maximumFractionDigits: 0 }).format(n)} ${c.sar}`;
}

export function useEventText() {
  const c = useCopy(COPY);
  const place = usePlace();
  const money = useMoney();
  const locale = useLocale();
  const num = (n: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en").format(n);
  return (e: VisionEvent) => {
    const a = e.args;
    const s = (k: string) => String(a[k] ?? "");
    const n = (k: string) => Number(a[k] ?? 0);
    switch (e.kind) {
      case "donation":
        return c.donation(money(n("amount")), s("donor"), place(s("target")));
      case "pending":
        return c.pending(money(n("amount")), s("donor"), place(s("target")));
      case "settled":
        return c.settled(money(n("amount")), money(n("net")), s("invoice"));
      case "allocated":
        return a["pool"]
          ? c.allocPool(money(n("amount")), place(s("city")))
          : (n("full") === 1 ? c.allocFull : c.allocGroup)(money(n("amount")), place(s("group")));
      case "disbursed":
        return c.disbursed(num(n("eur")), place(s("city")));
      case "session":
        return c.session(place(s("group")), n("n"), n("of"));
      case "cycleDone":
        return c.cycleDone(place(s("group")));
      case "measured":
        return e.layer === "operations"
          ? c.measuredOps(place(s("group")), num(n("before")), num(n("after")))
          : c.measuredDec(num(n("measured")));
      case "decision":
        return (c.decision[s("kind")] ?? c.decision["campaign"]!)(
          place(s("city")),
          place(s("group")),
        );
    }
  };
}

const LAYER_DOT: Record<VisionEvent["layer"], string> = {
  support: "bg-gold",
  operations: "bg-wine",
  decision: "bg-wine-deep",
};

/** سجلّ الأحداث كما تكتبه المنظومة — الأحدث أوّلاً. */
export function Feed({
  limit = 8,
  layer,
  className,
  dark,
}: {
  limit?: number;
  layer?: VisionEvent["layer"];
  className?: string;
  dark?: boolean;
}) {
  const { state } = useVision();
  const c = useCopy(COPY);
  const text = useEventText();
  const locale = useLocale();
  const items = state.events.filter((e) => !layer || e.layer === layer).slice(0, limit);
  const time = (t: number) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(t);
  return (
    <section
      className={cn(
        "rounded-2xl p-4",
        dark ? "bg-white/5" : "border border-wine/10 bg-white",
        className,
      )}
      aria-live="polite"
    >
      <h3 className={cn("text-sm font-bold", dark ? "text-gold-soft" : "text-wine")}>{c.feedH}</h3>
      {items.length === 0 ? (
        <p className={cn("mt-3 text-sm", dark ? "text-ivory/70" : "text-muted-foreground")}>
          {c.feedEmpty}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((e) => (
            <li key={e.id} className="vision-rise flex items-start gap-2 text-sm leading-6">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-2 size-2 shrink-0 rounded-full",
                  LAYER_DOT[e.layer],
                  dark && e.layer === "decision" && "bg-gold-soft",
                )}
              />
              <span className="flex-1">
                <span
                  className={cn(
                    "me-1.5 text-xs font-semibold",
                    dark ? "text-gold-soft" : "text-gold-ink",
                  )}
                >
                  {c.layer[e.layer]}
                </span>
                {text(e)}
              </span>
              <time
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  dark ? "text-ivory/60" : "text-muted-foreground",
                )}
              >
                {time(e.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** نموذج التبرّع التجريبي: يكتب في المحرّك فتتحرّك الطبقات الثلاث. */
export function DonateForm({
  className,
  defaultTarget = "tirana",
}: {
  className?: string;
  defaultTarget?: string;
}) {
  const { state, dispatch } = useVision();
  const c = useCopy(COPY);
  const place = usePlace();
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState(5000);
  const [target, setTarget] = useState(defaultTarget);
  const [method, setMethod] = useState<Method>("card");
  const [done, setDone] = useState(false);
  const waiting = state.groups.filter((g) => !isFunded(g));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const isGroup = target.startsWith("demo-g-");
    dispatch({
      type: "donate",
      donor: donor || c.donorPh.replace(/^.*?: /, ""),
      amount,
      method,
      target: { kind: isGroup ? "group" : "city", id: target },
    });
    setDone(true);
    window.setTimeout(() => setDone(false), 3500);
  };
  const field = "mt-1 min-h-11 w-full rounded-xl border border-wine/15 bg-white px-3 text-base";
  return (
    <form
      onSubmit={submit}
      className={cn(
        "rounded-3xl border border-gold/40 bg-white p-5 shadow-[0_18px_40px_-28px_rgb(43_11_20/0.5)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-wine">{c.formH}</h3>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-wine-ink">
          {c.sandbox}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{c.formLead}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-wine-ink">
          {c.donor}
          <input
            className={field}
            value={donor}
            maxLength={40}
            placeholder={c.donorPh}
            onChange={(e) => setDonor(e.target.value)}
          />
        </label>
        <label className="text-sm font-semibold text-wine-ink">
          {c.amount}
          <input
            className={cn(field, "tabular-nums")}
            type="number"
            inputMode="numeric"
            min={10}
            max={1000000}
            step={10}
            required
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            dir="ltr"
          />
        </label>
        <label className="text-sm font-semibold text-wine-ink">
          {c.target}
          <select className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label="—">
              {state.cities.map((x) => (
                <option key={x.id} value={x.id}>
                  {place(x.id)}
                </option>
              ))}
            </optgroup>
            {waiting.length > 0 && (
              <optgroup label="✦">
                {waiting.map((g) => (
                  <option key={g.id} value={g.id}>
                    {place(g.id)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <fieldset className="text-sm font-semibold text-wine-ink">
          <legend>{c.method}</legend>
          <div className="mt-1 flex gap-2">
            {(["card", "bank"] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 font-normal",
                  method === m ? "border-wine bg-wine text-ivory" : "border-wine/15 bg-white",
                )}
              >
                <input
                  type="radio"
                  name="vision-method"
                  className="sr-only"
                  checked={method === m}
                  onChange={() => setMethod(m)}
                />
                {c[m]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="transition-transform active:scale-[0.97] min-h-11 rounded-full bg-wine px-6 font-semibold text-ivory"
        >
          {c.give}
        </button>
        <p role="status" className="text-sm font-semibold text-wine">
          {done ? c.done : ""}
        </p>
      </div>
    </form>
  );
}

export function ResetSandbox() {
  const { dispatch } = useVision();
  const c = useCopy(COPY);
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(c.resetConfirm)) dispatch({ type: "reset" });
      }}
      className="min-h-9 text-sm text-muted-foreground underline underline-offset-4 hover:text-wine"
    >
      {c.reset}
    </button>
  );
}

export { totals };
