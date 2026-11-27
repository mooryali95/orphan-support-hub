import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Building2,
  CreditCard,
  FileCheck2,
  Fingerprint,
  HandCoins,
  Landmark,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Eyebrow, useNum, useT, VisionShell } from "@/components/vision/VisionKit";
import { pageTitle } from "@/config/brand";
import {
  DonateForm,
  Feed,
  useCurrencyName,
  useMoney,
  usePlace,
  useVision,
} from "@/components/vision/VisionStore";
import { feeSplit, MONEY, type MoneyStage } from "@/data/vision-demo";
import { formatMoneyExact } from "@/lib/currency";
import { totals, VISION_CURRENCY } from "@/lib/vision-engine";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vision/payments")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: PaymentsPage,
});

const COPY = defineCopy("routes/vision.payments", {
  ar: {
    label: "تكاملية الدفع",
    title: "رحلة المال: أين يصل، وكيف",
    lead: "من ضغطة الداعم إلى يد المشرف في تيرانا، ثم أثرٌ يعود. كلّ محطةٍ تكتب سجلّها، ولا يُكتب مبلغٌ مرّتين ولا يُمحى إثبات.",
    accountsH: "أين يستقرّ المال",
    accountsLead: "أربعة حساباتٍ فقط، ولكلٍّ دوره. المنصّة لا تحتفظ بمال: تسجّل وتطابق وتُثبت.",
    acDonor: "الداعم",
    acDonorNote: "بطاقة أو تحويل",
    acProvider: "مزوّد الدفع",
    acProviderNote: "Creem: بائعٌ مسجَّل يتحمّل الضريبة",
    acWamy: "حساب الندوة",
    acWamyNote: "يستقرّ فيه كلّ مال، بعملة المنصّة الموحّدة",
    acOffice: "حساب مكتب ألبانيا",
    acOfficeNote: "صرفٌ شهري: باليورو",
    acField: "المجموعة",
    acFieldNote: "جلسات ومستلزمات بإثبات",
    routeH: "طريقا التحصيل",
    card: "بطاقة",
    cardSteps: [
      "صفحة دفع Creem المستضافة، لا تمرّ البطاقة بالمنصّة",
      "حدثٌ موقَّع من Creem يُتحقَّق من توقيعه قبل أيّ قيد",
      "قيدٌ ذرّي: لا تكرار، والعملة المخالفة تُرفع للإدارة",
      "فاتورة بلا ثغرات وتفعيل الكفالة",
    ],
    bank: "تحويل بنكي",
    bankSteps: [
      "تعليمات التحويل بمرجعٍ فريد لكل كفالة",
      "يصل المبلغ إلى حساب الندوة مباشرةً",
      "المسؤول يطابق: المبلغ، والعملة، وتاريخ القيد، والمرجع البنكي",
      "فرقٌ في المبلغ لا يمرّ إلا بإقرارٍ وملاحظة، ثم الفاتورة والتفعيل",
    ],
    simH: "حاسبة المبلغ",
    liveH: "جرّبها الآن",
    ledgerH: "سجلّ حساب الندوة (تجريبي)",
    ledgerEmpty: "لا تبرّعات بعد. أرسل تبرّعاً من النموذج وسيُقيَّد هنا بفاتورته.",
    viaCard: "بطاقة عبر Creem",
    viaBank: "تحويل بنكي",
    confirm: "طابِق التحويل",
    settledTag: "مُقيَّد",
    simLead: "كيف يُقرأ تبرّعٌ واحد في السجلّ.",
    amount: "المبلغ",
    feeLabel: "رسوم المنصّة (افتراض)",
    gross: "المحصَّل",
    fee: "الرسوم",
    net: "الصافي للميدان",
    eurNote: "يُصرف لمكتب ألبانيا بما يعادله باليورو بسعر يوم الصرف، ويُسجَّل الصرف بعملته.",
    providerNote: "رسوم Creem بحسب عقده وتُخصم قبل التحويل إلى حساب الندوة؛ لا تُحسب هنا.",
    stationsH: "المحطّات السبع",
    live: "يعمل اليوم",
    waiting: "بانتظار موافقة Creem",
    next: "مع التكامل",
    writes: "يُكتب:",
    guardsH: "ضماناتٌ مبنيّة في القاعدة",
    guards: [
      ["مفتاح تكرار", "الضغطة المكرّرة والحدث المعاد لا يُنشئان دفعةً ثانية"],
      ["توقيع الحدث", "لا يُقبل حدثٌ من المزوّد بلا توقيعٍ صحيح"],
      ["فواتير بلا ثغرات", "رقمٌ لكل سنة يُحجز داخل المعاملة نفسها"],
      ["إثباتٌ مجمَّد", "مستند الوصول لا يُستبدل ولا يُحذف بعد التأكيد"],
      ["بنود المال", "تحصيلٌ بعد الانتهاء أو بعملةٍ مخالفة يصل صندوق الإدارة لا السجلّ"],
      ["مطابقةٌ كل ساعة", "الإلغاء في موعده، واستئناف الموقوف، وإغلاق الجلسات المهجورة"],
    ],
    todayH: "اليوم، وبعد التكامل",
    todayLead:
      "التحصيل والفواتير والصرف والإثبات تعمل الآن في هذه المنصّة، والدفع بالبطاقة ينتظر موافقة Creem. ما يأتي مع التكامل: أن يتسلّم التشغيل (الرواد) الصرف آليًا ويعيد الأثر موقَّعًا، وأن تقرأ لوحة القرار المجاميع مباشرةً.",
  },
  en: {
    label: "Payment integration",
    title: "The money journey: where it lands, and how",
    lead: "From the supporter's tap to the supervisor's hands in Tirana, then impact that returns. Every station writes its record; nothing is booked twice and no proof is erased.",
    accountsH: "Where the money rests",
    accountsLead:
      "Four accounts only, each with its role. The platform holds no money: it records, reconciles and proves.",
    acDonor: "Supporter",
    acDonorNote: "Card or transfer",
    acProvider: "Payment provider",
    acProviderNote: "Creem: merchant of record handling tax",
    acWamy: "WAMY account",
    acWamyNote: "Where all money settles: in the platform's unified currency",
    acOffice: "Albania office account",
    acOfficeNote: "Monthly disbursement: in EUR",
    acField: "The group",
    acFieldNote: "Sessions and supplies, with proof",
    routeH: "Two collection routes",
    card: "Card",
    cardSteps: [
      "Creem's hosted checkout: the card never touches the platform",
      "A signed event from Creem, verified before anything is recorded",
      "Atomic recording: no duplicates; a wrong currency goes to the administration",
      "A gapless invoice and the sponsorship activated",
    ],
    bank: "Bank transfer",
    bankSteps: [
      "Transfer instructions with a unique reference per sponsorship",
      "The amount lands directly in WAMY's account",
      "An officer reconciles amount, currency, value date and bank reference",
      "A different amount passes only with an explicit note, then invoice and activation",
    ],
    simH: "Amount calculator",
    liveH: "Try it now",
    ledgerH: "WAMY account ledger (sandbox)",
    ledgerEmpty:
      "No donations yet. Send one from the form and it is recorded here with its invoice.",
    viaCard: "Card via Creem",
    viaBank: "Bank transfer",
    confirm: "Reconcile transfer",
    settledTag: "Recorded",
    simLead: "How one donation reads in the ledger.",
    amount: "Amount",
    feeLabel: "Platform fee (assumption)",
    gross: "Collected",
    fee: "Fee",
    net: "Net to the field",
    eurNote:
      "Disbursed to the Albania office as the EUR equivalent on the day of transfer, recorded in its currency.",
    providerNote:
      "Creem's fees follow its contract and are deducted before payout to WAMY; they are not computed here.",
    stationsH: "The seven stations",
    live: "Live today",
    waiting: "Awaiting Creem approval",
    next: "With the integration",
    writes: "Writes:",
    guardsH: "Safeguards built into the database",
    guards: [
      ["Idempotency key", "A repeated tap or a replayed event never creates a second payment"],
      ["Signed events", "No provider event is accepted without a valid signature"],
      ["Gapless invoices", "A per-year number reserved inside the same transaction"],
      ["Frozen proof", "A delivery document can't be replaced or deleted once confirmed"],
      [
        "Money issues",
        "A charge after the end or in a wrong currency goes to the admin inbox, not the ledger",
      ],
      [
        "Hourly reconciliation",
        "Cancellations on time, paused sponsorships resumed, abandoned checkouts closed",
      ],
    ],
    todayH: "Today, and after the integration",
    todayLead:
      "Collection, invoices, disbursement and proof run in this platform now; card payment awaits Creem's approval. What comes with the integration: operations (Rowad) receives disbursements automatically and returns signed impact, and the decision board reads aggregates directly.",
  },
});

const STAGE_ICON: Record<string, typeof Sparkles> = {
  choose: Sparkles,
  collect: CreditCard,
  settle: Landmark,
  allocate: HandCoins,
  disburse: Building2,
  deliver: FileCheck2,
  return: BadgeCheck,
};

function PaymentsPage() {
  const c = useCopy(COPY);
  return (
    <VisionShell>
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <Eyebrow label={c.label} title={c.title} lead={c.lead} />
        <Accounts />
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Routes />
          <Simulator />
        </div>
        <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1fr]" aria-labelledby="live-h">
          <h2 id="live-h" className="sr-only">
            {c.liveH}
          </h2>
          <DonateForm />
          <Ledger />
        </section>
        <Feed limit={10} className="mt-6" />
        <Stations />
        <Guards />
        <aside className="mx-auto mt-12 max-w-3xl rounded-3xl bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-6 text-ivory md:p-8">
          <h2 className="text-xl font-bold">{c.todayH}</h2>
          <p className="mt-2 leading-8 text-ivory/80">{c.todayLead}</p>
        </aside>
      </section>
    </VisionShell>
  );
}

/** الحسابات الخمسة بخطٍّ ذهبيّ يسري فيه المال — من البداية إلى الميدان. */
function Accounts() {
  const c = useCopy(COPY);
  const nodes = [
    [Users, c.acDonor, c.acDonorNote],
    [CreditCard, c.acProvider, c.acProviderNote],
    [Landmark, c.acWamy, c.acWamyNote],
    [Building2, c.acOffice, c.acOfficeNote],
    [HandCoins, c.acField, c.acFieldNote],
  ] as const;
  return (
    <section className="mt-12" aria-labelledby="accounts-h">
      <h2 id="accounts-h" className="text-center text-2xl font-extrabold text-wine">
        {c.accountsH}
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-center text-sm text-muted-foreground">
        {c.accountsLead}
      </p>
      <ol className="relative mt-8 grid gap-4 md:grid-cols-5">
        <span
          aria-hidden="true"
          className="money-river absolute inset-x-[10%] top-9 hidden h-0.5 md:block"
        />
        {nodes.map(([Icon, name, note], i) => (
          <li
            key={name}
            style={{ ["--i" as string]: i }}
            className="stagger-in relative flex flex-col items-center text-center"
          >
            <span
              className={cn(
                "relative grid size-[4.5rem] place-items-center rounded-full shadow-[0_12px_28px_-14px_rgb(107_29_46/0.6)]",
                i === 2
                  ? "bg-wine text-gold ring-4 ring-gold/40"
                  : "bg-white text-wine ring-1 ring-wine/10",
              )}
            >
              <Icon className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-3 font-bold text-wine">{name}</p>
            <p className="mt-0.5 max-w-[12rem] text-xs text-muted-foreground">{note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Routes() {
  const c = useCopy(COPY);
  const [route, setRoute] = useState<"card" | "bank">("card");
  const steps = route === "card" ? c.cardSteps : c.bankSteps;
  return (
    <section className="rounded-3xl border border-wine/10 bg-white p-6" aria-labelledby="routes-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="routes-h" className="text-xl font-extrabold text-wine">
          {c.routeH}
        </h2>
        <div role="tablist" className="flex rounded-full bg-wine/5 p-1">
          {(
            [
              ["card", CreditCard, c.card],
              ["bank", Banknote, c.bank],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={route === key}
              onClick={() => setRoute(key)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm transition-colors",
                route === key ? "bg-wine text-ivory" : "text-wine-ink hover:bg-wine/5",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <ol key={route} className="mt-6 space-y-0">
        {steps.map((s, i) => (
          <li
            key={s}
            style={{ ["--i" as string]: i }}
            className="stagger-in relative flex gap-4 pb-5 last:pb-0"
          >
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute start-[0.95rem] top-9 bottom-0 w-px bg-gold/50"
              />
            )}
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft font-serif text-wine">
              {i + 1}
            </span>
            <p className="pt-1 text-sm leading-7">{s}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Simulator() {
  const c = useCopy(COPY);
  const num = useNum();
  const [amount, setAmount] = useState(5000);
  const { state, dispatch } = useVision();
  const pct = state.feePercent;
  const setPct = (n: number) => dispatch({ type: "setFee", pct: n });
  const { fee, net } = feeSplit(amount, pct);
  const locale = useLocale();
  const currency = useCurrencyName();
  const money = (n: number) => formatMoneyExact(n, VISION_CURRENCY, locale);
  return (
    <section
      className="rounded-3xl bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] p-6 text-ivory"
      aria-labelledby="sim-h"
    >
      <h2 id="sim-h" className="text-xl font-extrabold">
        {c.simH}
      </h2>
      <p className="text-xs text-gold-soft">{c.simLead}</p>
      <label className="mt-5 block text-sm">
        {c.amount} ({currency})
        <input
          type="number"
          min={50}
          max={1_000_000}
          step={50}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-serif text-2xl text-gold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-gold"
        />
      </label>
      <label className="mt-4 block text-sm">
        <span className="flex justify-between">
          {c.feeLabel}
          <span className="tabular-nums text-gold">{pct}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-gold)]"
        />
      </label>
      <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
        {(
          [
            [c.gross, amount, ""],
            [c.fee, fee, "text-ivory/70"],
            [c.net, net, "text-gold text-lg font-bold"],
          ] as const
        ).map(([k, v, cls]) => (
          <div key={k} className="flex items-baseline justify-between">
            <dt>{k}</dt>
            <dd className={cn("font-serif tabular-nums", cls)}>{money(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-6 text-ivory/65">{c.eurNote}</p>
      <p className="mt-2 text-xs leading-6 text-ivory/50">{c.providerNote}</p>
    </section>
  );
}

function Ledger() {
  const c = useCopy(COPY);
  const money = useMoney();
  const place = usePlace();
  const { state, dispatch } = useVision();
  const t = totals(state);
  return (
    <section className="rounded-3xl border border-wine/10 bg-white p-5">
      <h3 className="text-lg font-bold text-wine">{c.ledgerH}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            [t.raised, c.gross],
            [t.fees, c.fee],
            [t.net, c.net],
          ] as const
        ).map(([v, k]) => (
          <div key={k} className="rounded-xl bg-wine/[0.04] px-2 py-3">
            <dd className="font-serif text-lg text-wine tabular-nums">{money(v)}</dd>
            <dt className="text-xs text-muted-foreground">{k}</dt>
          </div>
        ))}
      </dl>
      {state.donations.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{c.ledgerEmpty}</p>
      ) : (
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {state.donations.slice(0, 20).map((d) => (
            <li key={d.id} className="vision-rise rounded-xl border border-wine/10 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-wine">
                  {d.donor} · {place(d.target.id)}
                </span>
                <span className="font-serif tabular-nums">{money(d.amount)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {d.method === "card" ? c.viaCard : c.viaBank}
                  {d.status === "settled" && (
                    <>
                      {" · "}
                      <span dir="ltr" className="inline-block font-mono">
                        {d.invoice}
                      </span>
                      {" · "}
                      {c.net}: {money(d.net)}
                    </>
                  )}
                </span>
                {d.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "confirmTransfer", id: d.id })}
                    className="transition-transform active:scale-[0.97] min-h-9 rounded-full bg-wine px-3 text-xs font-semibold text-ivory"
                  >
                    {c.confirm}
                  </button>
                ) : (
                  <span className="rounded-full bg-gold-soft px-2 py-0.5 font-semibold text-wine-ink">
                    {c.settledTag}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stations() {
  const c = useCopy(COPY);
  const tr = useT();
  const label = (s: MoneyStage["state"]) =>
    s === "live" ? c.live : s === "waiting" ? c.waiting : c.next;
  return (
    <section className="mt-14" aria-labelledby="stations-h">
      <h2 id="stations-h" className="text-center text-2xl font-extrabold text-wine">
        {c.stationsH}
      </h2>
      <ol className="relative mx-auto mt-8 max-w-3xl">
        <span
          aria-hidden="true"
          className="money-river-v absolute start-[1.65rem] top-4 bottom-4 w-0.5"
        />
        {MONEY.map((m, i) => {
          const Icon = STAGE_ICON[m.key] ?? Sparkles;
          return (
            <li
              key={m.key}
              style={{ ["--i" as string]: i }}
              className="stagger-in relative flex gap-5 pb-6 last:pb-0"
            >
              <span className="relative z-10 grid size-[3.3rem] shrink-0 place-items-center rounded-full bg-white text-wine shadow-[0_10px_24px_-12px_rgb(107_29_46/0.6)] ring-1 ring-wine/10">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <article className="flex-1 rounded-2xl border border-wine/10 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gold-ink">{tr(m.who)}</p>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      m.state === "live" && "bg-[#e6f1ea] text-[#24603f]",
                      m.state === "waiting" && "bg-gold-soft text-wine-ink",
                      m.state === "next" && "bg-wine/8 text-wine",
                    )}
                  >
                    {label(m.state)}
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-wine">{tr(m.title)}</h3>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{tr(m.text)}</p>
                <p className="mt-3 rounded-xl bg-ivory px-3 py-2 text-xs leading-6">
                  <span className="font-semibold text-wine">{c.writes}</span> {tr(m.record)}
                </p>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Guards() {
  const c = useCopy(COPY);
  const icons = [Fingerprint, ShieldCheck, FileCheck2, FileCheck2, HandCoins, RefreshCcw];
  return (
    <section className="mt-14" aria-labelledby="guards-h">
      <h2 id="guards-h" className="text-center text-2xl font-extrabold text-wine">
        {c.guardsH}
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {c.guards.map(([h, text], i) => {
          const Icon = icons[i] ?? ShieldCheck;
          return (
            <li key={h} className="rounded-2xl border border-wine/10 bg-white p-5">
              <Icon className="size-5 text-gold" aria-hidden="true" />
              <h3 className="mt-2 font-bold text-wine">{h}</h3>
              <p className="mt-1 text-sm leading-7 text-muted-foreground">{text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
