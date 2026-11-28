import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Printer } from "lucide-react";
import { useEffect, useState } from "react";

import {
  useMoney,
  useOfficeMoney,
  usePlace,
  useVision,
  VisionStoreProvider,
} from "@/components/vision/VisionStore";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, intlOf, useCopy, useLocale } from "@/lib/locale";
import type { Donation, VisionState } from "@/lib/vision-engine";

export const Route = createFileRoute("/vision/receipt/$id")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: () => (
    <VisionStoreProvider>
      <Receipt />
    </VisionStoreProvider>
  ),
});

const COPY = defineCopy("routes/vision.receipt", {
  ar: {
    title: "إيصال تبرّع",
    back: "عودة",
    print: "اطبع أو احفظ PDF",
    brand: "منصّة الرؤية والتوجهات",
    org: "الندوة العالمية للشباب الإسلامي",
    watermark: "تجريبي: ليس إيصالاً رسمياً",
    invoice: "رقم الفاتورة",
    date: "التاريخ",
    donor: "الداعم",
    to: "الوجهة",
    method: "طريقة الدفع",
    card: "بطاقة عبر Creem",
    bank: "تحويل بنكي",
    gross: "المبلغ",
    fee: "رسوم المنصّة",
    net: "الصافي للميدان",
    path: "أين ذهب",
    fingerprint: "البصمة (SHA-256)",
    fpNote: "تُحسب من رقم الفاتورة والمبلغ والوجهة والتاريخ؛ أيّ تغييرٍ فيها يغيّر البصمة.",
    pending: "التحويل بانتظار المطابقة، ويصدر الإيصال بعدها.",
    missing: "لم نجد هذا التبرّع في بيئتك التجريبية.",
    toolbar: "أدوات الإيصال",
    thanks: "جزاك الله خيراً. أثر دعمك يصلك من منصّة التشغيل.",
  },
  en: {
    title: "Donation receipt",
    back: "Back",
    print: "Print or save as PDF",
    brand: "Vision and Directions platform",
    org: "World Assembly of Muslim Youth",
    watermark: "Sandbox: not an official receipt",
    invoice: "Invoice",
    date: "Date",
    donor: "Supporter",
    to: "Destination",
    method: "Payment method",
    card: "Card via Creem",
    bank: "Bank transfer",
    gross: "Amount",
    fee: "Platform fee",
    net: "Net to the field",
    path: "Where it went",
    fingerprint: "Fingerprint (SHA-256)",
    fpNote: "Computed from the invoice, amount, destination and date; any change alters it.",
    pending: "The transfer awaits reconciliation; the receipt is issued afterwards.",
    missing: "This donation isn't in your sandbox.",
    toolbar: "Receipt tools",
    thanks: "Thank you. The impact of your support reaches you from operations.",
  },
});

async function fingerprint(d: Donation) {
  const raw = [d.invoice, d.amount, d.net, d.target.kind, d.target.id, d.at].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function trail(s: VisionState, invoice: string) {
  return s.events
    .filter(
      (e) => e.args["invoice"] === invoice && (e.kind === "allocated" || e.kind === "disbursed"),
    )
    .reverse();
}

function Receipt() {
  const c = useCopy(COPY);
  const { id } = Route.useParams();
  const { state, ready } = useVision();
  const money = useMoney();
  const officeMoney = useOfficeMoney();
  const place = usePlace();
  const locale = useLocale();
  const d = state.donations.find((x) => x.id === id);
  const [fp, setFp] = useState("");
  useEffect(() => {
    if (d?.status === "settled") void fingerprint(d).then(setFp);
  }, [d]);

  return (
    <div className="theme-light min-h-dvh bg-ivory px-4 py-8 text-foreground print:bg-white print:p-0">
      <nav
        aria-label={c.toolbar}
        className="mx-auto mb-6 flex max-w-2xl items-center justify-between print:hidden"
      >
        <Link
          to="/vision/me"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-wine"
        >
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          {c.back}
        </Link>
        {d?.status === "settled" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wine px-5 text-sm font-semibold text-ivory active:scale-[0.97]"
          >
            <Printer className="size-4" aria-hidden="true" />
            {c.print}
          </button>
        )}
      </nav>

      <main
        id="main"
        className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_30px_60px_-24px_rgb(43_11_20/0.35)] print:rounded-none print:shadow-none"
      >
        {!ready ? (
          <div className="h-96 animate-pulse" />
        ) : !d ? (
          <h1 className="p-10 text-center font-sans text-base font-normal text-muted-foreground">
            {c.missing}
          </h1>
        ) : (
          <>
            <header className="flex items-center gap-4 bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-6 text-ivory print:[print-color-adjust:exact]">
              <span
                aria-hidden="true"
                className="grid size-14 place-items-center rounded-full bg-ivory font-serif text-2xl text-wine"
              >
                هـ
              </span>
              <div className="flex-1">
                <p className="text-xs text-gold-soft">{c.org}</p>
                <h1 className="text-xl font-extrabold">{c.title}</h1>
                <p className="text-xs text-ivory/70">{c.brand}</p>
              </div>
            </header>
            <p
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 -rotate-12 text-center font-serif text-5xl text-wine/[0.06] select-none"
            >
              {c.watermark}
            </p>
            <p className="bg-gold-soft px-6 py-2 text-center text-xs font-semibold text-wine-ink print:[print-color-adjust:exact]">
              {c.watermark}
            </p>
            {d.status !== "settled" ? (
              <p className="p-10 text-center text-muted-foreground">{c.pending}</p>
            ) : (
              <div className="space-y-6 p-6 md:p-8">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  {(
                    [
                      [
                        c.invoice,
                        <span key="i" dir="ltr" className="font-mono">
                          {d.invoice}
                        </span>,
                      ],
                      [
                        c.date,
                        new Intl.DateTimeFormat(intlOf(locale), {
                          dateStyle: "long",
                          timeStyle: "short",
                        }).format(d.at),
                      ],
                      [c.donor, d.donor],
                      [c.to, place(d.target.id)],
                      [c.method, d.method === "card" ? c.card : c.bank],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <dl className="rounded-2xl bg-wine/[0.04] p-4 text-sm">
                  {(
                    [
                      [c.gross, d.amount, ""],
                      [c.fee, d.fee, "text-muted-foreground"],
                      [c.net, d.net, "text-lg font-bold text-wine"],
                    ] as const
                  ).map(([k, v, cls]) => (
                    <div key={k} className="flex items-baseline justify-between py-1">
                      <dt>{k}</dt>
                      <dd className={`font-serif tabular-nums ${cls}`}>{money(v)}</dd>
                    </div>
                  ))}
                </dl>
                <section aria-labelledby="receipt-path">
                  <h2 id="receipt-path" className="text-sm font-bold text-wine">
                    {c.path}
                  </h2>
                  <ol className="mt-2 space-y-1.5 text-sm">
                    {trail(state, d.invoice).map((e) => (
                      <li key={e.id} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-gold"
                        />
                        {e.kind === "disbursed"
                          ? `${place(String(e.args["city"]))} · ${officeMoney(Number(e.args["eur"]))}`
                          : `${place(String(e.args["group"] ?? e.args["city"]))} · ${money(Number(e.args["amount"]))}`}
                      </li>
                    ))}
                  </ol>
                </section>
                <section aria-labelledby="receipt-fp" className="border-t border-wine/10 pt-4">
                  <h2 id="receipt-fp" className="text-xs font-semibold text-muted-foreground">
                    {c.fingerprint}
                  </h2>
                  <p dir="ltr" className="mt-1 font-mono text-[11px] break-all text-wine">
                    {fp || "…"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.fpNote}</p>
                </section>
                <p className="text-center font-serif text-lg text-wine">{c.thanks}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
