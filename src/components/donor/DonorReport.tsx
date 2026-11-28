import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { PanelSkeleton } from "@/components/admin/PanelState";
import { Failed } from "@/components/admin/overview/parts";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { Name } from "@/components/kit/Name";
import { Button } from "@/components/ui/button";
import { brandFor } from "@/config/brand";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate, formatMoney, formatMoneyTotals, totalsByCurrency } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { entityTypeLabel } from "@/lib/plural";
import { getDonorDashboard, getDonorPledges, useWorkspaceLabels } from "@/lib/workspaces.functions";

export const REPORT_COPY = defineCopy("components/donor/DonorReport", {
  ar: {
    title: "تقرير الأثر",
    back: "العودة إلى الجهة",
    print: "طباعة أو حفظ PDF",
    issued: (d: string) => `صدر في ${d}`,
    denied: "لا تملك الاطّلاع على هذه الجهة.",
    portals: "بواباتي",
    failed: "تعذّرت قراءة التقرير",
    failedText: "الأرقام غائبة الآن، وليست صفراً.",
    retry: "أعد المحاولة",
    total: "مجموع الدعم بلا الملغى",
    pledges: "التعهّدات",
    delivered: "سُلّم موثّقاً",
    byKind: "حسب النوع",
    empty: "لا تعهّدات لهذه الجهة بعد.",
    target: "الهدف",
    kind: "النوع",
    amount: "المبلغ",
    delivery: "التسليم",
    documented: (d: string) => `موثّق ${d}`,
    pending: "لم يُسلَّم بعد",
    noTarget: "هدف عام",
    note: "«موثّق» يعني أن مكتب المنطقة سجّل التسليم ورفع مستنده؛ والمستند محفوظ في المنصّة ويُطلب للاطّلاع، ولا يمرّ بمراجعةٍ مستقلّة قبل وسمه. المبالغ بعملة كل تعهّد، ولا تُجمع عملتان في رقم واحد. لا يحمل هذا التقرير أسماء الأطفال الحقيقية ولا صورهم.",
  },
  en: {
    title: "Impact report",
    back: "Back to the entity",
    print: "Print or save as PDF",
    issued: (d: string) => `Issued on ${d}`,
    denied: "You cannot view this entity.",
    portals: "My portals",
    failed: "The report could not be read",
    failedText: "The figures are missing right now, not zero.",
    retry: "Try again",
    total: "Total support, excluding cancelled",
    pledges: "Pledges",
    delivered: "Delivered and documented",
    byKind: "By kind",
    empty: "This entity has no pledges yet.",
    target: "Target",
    kind: "Kind",
    amount: "Amount",
    delivery: "Delivery",
    documented: (d: string) => `Documented ${d}`,
    pending: "Not delivered yet",
    noTarget: "General target",
    note: '"Documented" means the regional office recorded the delivery and uploaded its document; the document is kept on the platform and available on request, and is not independently reviewed before it is marked. Amounts are in each pledge\'s currency, and two currencies are never added into one figure. This report carries no real child names or photos.',
  },
});

/**
 * تقرير الأثر للجهة المانحة، لمجلس إدارتها. يُطبع أو يُحفظ PDF من المتصفّح.
 * يقرأ عبر منفذ البيانات، فيرسمه العرض التفاعلي ببيانات نموذجية والصفحة الحقيقية من الخادم.
 * لا يحمل اسم طفلٍ حقيقياً ولا صورة: الأهداف بأسمائها العامّة.
 */
export function DonorReport({
  entityId,
  backTo,
  embedded = false,
}: {
  entityId: string;
  backTo: string;
  /** داخل صفحةٍ لها `main` (العرض التفاعلي): يُرسم قسماً لا معلَماً رئيسياً ثانياً. */
  embedded?: boolean;
}) {
  const Root = embedded ? "section" : "main";
  const c = useCopy(REPORT_COPY);
  const locale = useLocale();
  const brand = brandFor(locale);
  const labels = useWorkspaceLabels();
  const fetchDash = useDataFn("donor.dashboard", getDonorDashboard);
  const fetchPledges = useDataFn("donor.pledges", getDonorPledges);
  const dashQ = useQuery({
    queryKey: useDataKey(["donor", entityId]),
    queryFn: () => fetchDash({ data: { entityId } }),
  });
  const pledgesQ = useQuery({
    queryKey: useDataKey(["donor-pledges", entityId]),
    queryFn: () => fetchPledges({ data: { entityId } }),
  });

  let body;
  if (dashQ.isPending || pledgesQ.isPending) {
    body = <PanelSkeleton shape="cards" count={3} className="mt-8" />;
  } else if (dashQ.isError || pledgesQ.isError) {
    body = (
      <div className="mt-8">
        <Failed
          title={c.failed}
          text={c.failedText}
          retry={c.retry}
          onRetry={() => {
            void dashQ.refetch();
            void pledgesQ.refetch();
          }}
        />
      </div>
    );
  } else if (!dashQ.data?.dashboard) {
    body = (
      <p role="alert" className="mt-8 text-sm">
        {c.denied}{" "}
        <Link to="/workspaces" className="underline">
          {c.portals}
        </Link>
      </p>
    );
  } else {
    const d = dashQ.data.dashboard;
    const pledges = pledgesQ.data ?? [];
    const delivered = pledges.filter((p) => p.delivered_at).length;
    const live = pledges.filter((p) => p.status !== "cancelled");
    const cur = pledges[0]?.currency ?? "EUR";
    const total = formatMoneyTotals(totalsByCurrency(live), cur);
    const byKind = (k: "qualification" | "in_kind") =>
      formatMoneyTotals(totalsByCurrency(live.filter((p) => p.kind === k)), cur);
    const type = locale === "ar" ? entityTypeLabel(d.entity.type) : d.entity.type;
    body = (
      <>
        <h1 className="mt-8 text-2xl font-extrabold">
          {c.title}: <Name>{d.entity.name}</Name>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[type, c.issued(formatDate(new Date().toISOString(), locale))]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              [c.total, total],
              [c.pledges, String(pledges.length)],
              [c.delivered, String(delivered)],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded-xl border border-border p-4">
              <p className="text-xl font-extrabold tabular-nums text-primary">{v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-8 font-bold">{c.byKind}</h2>
        <p className="mt-1 text-sm">
          {labels.kind["qualification"]}: {byKind("qualification")} · {labels.kind["in_kind"]}:{" "}
          {byKind("in_kind")}
        </p>

        {pledges.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm">
            {c.empty}
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-start font-medium">{c.target}</th>
                  <th className="py-2 text-start font-medium">{c.kind}</th>
                  <th className="py-2 text-start font-medium">{c.amount}</th>
                  <th className="py-2 text-start font-medium">{c.delivery}</th>
                </tr>
              </thead>
              <tbody>
                {pledges.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2">
                      {p.target ?? c.noTarget}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({labels.target[p.target_type] ?? p.target_type})
                      </span>
                    </td>
                    <td className="py-2">{labels.kind[p.kind] ?? p.kind}</td>
                    <td className="py-2 tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                    <td className="py-2">
                      {p.delivered_at
                        ? c.documented(formatDate(p.delivered_at, locale))
                        : c.pending}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="mt-10 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
          {c.note}
        </footer>
      </>
    );
  }

  return (
    <Root
      id={embedded ? undefined : "main"}
      aria-label={embedded ? c.title : undefined}
      tabIndex={embedded ? undefined : -1}
      className="mx-auto max-w-3xl bg-background px-4 py-10 sm:px-6 print:max-w-none print:bg-white print:p-0 print:text-black"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={backTo as "/"}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          {c.back}
        </Link>
        <Button className="min-h-11" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" /> {c.print}
        </Button>
      </div>

      <header className="flex items-center justify-between border-b-2 border-primary pb-4">
        <div>
          <p className="font-serif text-2xl font-bold text-primary">{brand.name}</p>
          <p className="text-xs text-bridge-ink">{brand.tagline}</p>
        </div>
        <KahataynMark className="h-14 w-auto" />
      </header>
      {body}
    </Root>
  );
}
