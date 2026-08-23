import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrphanCard, type PublicOrphan } from "@/components/OrphanCard";
import { Input } from "@/components/ui/input";
import { listPublicOrphans } from "@/lib/orphans.functions";
import { fundingPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const orphansQuery = queryOptions({
  queryKey: ["orphans", "public"],
  queryFn: async () => {
    const res = await listPublicOrphans({ data: { limit: 60 } });
    return res.orphans as PublicOrphan[];
  },
});

export const Route = createFileRoute("/orphans")({
  head: () => ({
    meta: [
      { title: "دليل الأيتام — كافل" },
      {
        name: "description",
        content: "تصفّح ملفات الأيتام المعتمدة واختر من تكفله حسب المنطقة والاحتياج الشهري.",
      },
      { property: "og:title", content: "دليل الأيتام — كافل" },
      {
        property: "og:description",
        content: "ملفات أيتام موثّقة ومعتمدة، جاهزة للكفالة الشهرية.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(orphansQuery),
  component: OrphansPage,
});

type Filter = "all" | "open" | "full";

function OrphansPage() {
  const { data } = useSuspenseQuery(orphansQuery);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");

  const regions = useMemo(
    () => Array.from(new Set(data.map((o) => o.region).filter(Boolean))) as string[],
    [data],
  );

  const filtered = data.filter((o) => {
    const percent = fundingPercent(o.monthly_need, o.funded_monthly);
    const isFull = o.status === "fully_sponsored" || percent >= 100;
    if (filter === "open" && isFull) return false;
    if (filter === "full" && !isFull) return false;
    if (region !== "all" && o.region !== region) return false;
    if (search.trim()) {
      const q = search.trim();
      const hay = `${o.display_name} ${o.city ?? ""} ${o.code}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">دليل الأيتام</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          جميع الملفات المعروضة معتمدة من الإدارة بعد توثيقها من جهة رعاية مرخّصة. البيانات الحسّاسة
          (الاسم الكامل والهوية) محجوبة حفاظاً على خصوصية اليتيم.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو المدينة أو رقم الملف"
              className="pe-9"
            />
          </div>

          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">كل المناطق</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <div className="flex rounded-md border border-input p-1">
            {(
              [
                ["all", "الكل"],
                ["open", "بحاجة لكافل"],
                ["full", "مكفول"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{filtered.length} ملف</p>

        {filtered.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لا توجد نتائج مطابقة لبحثك.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((orphan) => (
              <OrphanCard key={orphan.id} orphan={orphan} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
