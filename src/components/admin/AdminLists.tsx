import { useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Search } from "lucide-react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPORT_DATASETS, exportAdminCsv, listAdminRows } from "@/lib/admin.functions";
import { formatDate, formatMoney, formatMoneyTotals, fundingPercent } from "@/lib/format";

const PAGE = 50;

/**
 * قوائم الإدارة صفحاتٌ ببحث (PRD-13): كانت `admin_overview` تُعيد كلّ يتيمٍ
 * منشور وكلّ كافل في كتلةٍ واحدة، والجدول يرسمها كلّها.
 */
function usePaged(list: "orphans" | "sponsors") {
  const fetchRows = useServerFn(listAdminRows);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const res = useQuery({
    queryKey: ["admin-list", list, query, page],
    queryFn: () => fetchRows({ data: { list, q: query || undefined, page, pageSize: PAGE } }),
    placeholderData: keepPreviousData,
  });
  return {
    q,
    setQ,
    search: () => {
      setPage(0);
      setQuery(q.trim());
    },
    page,
    setPage,
    total: res.data?.total ?? 0,
    rows: res.data?.rows ?? [],
    loading: res.isPending,
    fetching: res.isFetching,
  };
}

function Toolbar({ label, paged }: { label: string; paged: ReturnType<typeof usePaged> }) {
  const id = useId();
  const pages = Math.max(1, Math.ceil(paged.total / PAGE));
  return (
    <div className="mt-8 flex flex-wrap items-end gap-3">
      <form
        role="search"
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          paged.search();
        }}
      >
        <div>
          <Label htmlFor={id} className="text-xs">
            {label}
          </Label>
          <Input
            id={id}
            value={paged.q}
            onChange={(e) => paged.setQ(e.target.value)}
            className="mt-1 w-64"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          <Search className="size-4" aria-hidden="true" /> بحث
        </Button>
      </form>
      <p className="text-muted-foreground ms-auto text-xs" aria-live="polite">
        {paged.fetching && <Loader2 className="me-1 inline size-3 animate-spin" />}
        {paged.total.toLocaleString("ar")} نتيجة — الصفحة {paged.page + 1} من {pages}
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={paged.page === 0}
          onClick={() => paged.setPage(paged.page - 1)}
        >
          السابق
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={paged.page + 1 >= pages}
          onClick={() => paged.setPage(paged.page + 1)}
        >
          التالي
        </Button>
      </div>
    </div>
  );
}

function Grid({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="border-border text-muted-foreground mt-4 rounded-2xl border border-dashed p-6 text-center text-sm">
        {empty}
      </p>
    );
  }
  return (
    <div className="border-border mt-4 overflow-x-auto rounded-2xl border">
      <table className="bg-card w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-secondary/60 border-border border-b">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="text-muted-foreground px-4 py-3 text-start text-xs font-bold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-border/60 border-b last:border-0">
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-3 align-middle tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? "" : String(v));

export function AdminOrphansList({ currency }: { currency: string }) {
  const paged = usePaged("orphans");
  return (
    <>
      <Toolbar label="ابحث بالرمز أو الاسم أو الجهة أو المدينة" paged={paged} />
      <Grid
        head={["الملف", "الجهة", "الاحتياج", "المموَّل", "المتبقّي", "الكفلاء", "التغطية"]}
        empty={paged.loading ? "يُحمَّل…" : "لا توجد ملفات منشورة."}
        rows={paged.rows.map((r) => {
          const cur = str(r["currency"]) || currency;
          const gap = num(r["gap"]);
          return [
            <div key="n">
              <p className="font-medium">{str(r["name"])}</p>
              <p className="text-muted-foreground text-xs">
                {str(r["code"])}
                {r["city"] ? ` — ${str(r["city"])}` : ""}
              </p>
            </div>,
            <span key="o" className="text-xs">
              {str(r["org"]) || "—"}
            </span>,
            formatMoney(num(r["need"]), cur),
            formatMoney(num(r["funded"]), cur),
            <span key="g" className={gap > 0 ? "text-bridge-ink font-bold" : "text-shore-thrive"}>
              {gap > 0 ? formatMoney(gap, cur) : "مكتمل"}
            </span>,
            String(num(r["sponsors"])),
            <CrossingProgress key="p" percent={fundingPercent(num(r["need"]), num(r["funded"]))} />,
          ];
        })}
      />
    </>
  );
}

export function AdminSponsorsList({ currency }: { currency: string }) {
  const paged = usePaged("sponsors");
  return (
    <>
      <Toolbar label="ابحث بالبريد أو الاسم" paged={paged} />
      <Grid
        head={["الكافل", "كفالات", "نشطة", "التزام شهري", "المسدَّد", "منذ"]}
        empty={paged.loading ? "يُحمَّل…" : "لا يوجد كفلاء بعد."}
        rows={paged.rows.map((r) => [
          <div key="s">
            <p className="font-medium">{str(r["name"]) || "—"}</p>
            <p className="text-muted-foreground text-xs" dir="ltr">
              {str(r["email"]) || "—"}
            </p>
          </div>,
          String(num(r["sponsorships"])),
          String(num(r["active"])),
          // لكلّ عملةٍ مجموعها (PRD-14)؛ والقاعدة الأقدم تُعيد المجموع وحده.
          byCur(r["monthly_by_currency"], num(r["monthly"]), currency),
          <span key="p" className="text-shore-thrive font-bold">
            {byCur(r["paid_by_currency"], num(r["paid"]), currency)}
          </span>,
          formatDate(str(r["since"]) || null),
        ])}
      />
    </>
  );
}

function byCur(value: unknown, total: number, fallback: string) {
  if (!Array.isArray(value)) return formatMoney(total, fallback);
  const totals = value.map((v: Record<string, unknown>) => ({
    currency: str(v["currency"]),
    amount: num(v["amount"]),
  }));
  return formatMoneyTotals(totals, fallback);
}

const EXPORT_LABELS: Record<(typeof EXPORT_DATASETS)[number], string> = {
  orphans: "الأيتام",
  sponsorships: "الكفالات",
  payments: "المدفوعات",
};

/** ملفّات CSV للإدارة — كلّ تصديرٍ مسجَّلٌ في الأثر، وبلا بيانات الطفل السرّية. */
export function AdminExports() {
  const run = useServerFn(exportAdminCsv);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(dataset: (typeof EXPORT_DATASETS)[number]) {
    setBusy(dataset);
    try {
      const res = await run({ data: { dataset } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`صُدّر ${res.count.toLocaleString("ar")} صفّاً`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-bold">التصدير</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        ملفّات CSV تُفتح في Excel. لا تحمل بيانات الطفل السرّية، وكلّ تصديرٍ يُسجَّل باسمك.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXPORT_DATASETS.map((d) => (
          <Button
            key={d}
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void download(d)}
          >
            {busy === d ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {EXPORT_LABELS[d]}
          </Button>
        ))}
      </div>
    </section>
  );
}
