import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCcw, TriangleAlert } from "lucide-react";

import { StatTile } from "@/components/kit/StatTile";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import {
  getMirrorStatus,
  listApprovedOrgs,
  setPlatformOrg,
  type MirrorStatus,
} from "@/lib/integrations.functions";

const ENTITY_LABELS: Record<string, string> = {
  groups: "المجموعات",
  students: "الطلاب",
  trait_dimensions: "أبعاد السمات",
  traits: "السمات",
  trait_scores: "الدرجات",
};

/**
 * حالة المزامنة مع منصّات التشغيل: آخر دفعة لكل كيان، والمؤشّر الذي
 * تستأنف منه، والانحراف الذي كشفته المطابقة.
 */
export function MirrorStatusPanel() {
  const fetchStatus = useServerFn(getMirrorStatus);
  const fetchOrgs = useServerFn(listApprovedOrgs);
  const link = useServerFn(setPlatformOrg);
  const qc = useQueryClient();
  const { data: raw } = useQuery({ queryKey: ["mirror-status"], queryFn: () => fetchStatus() });
  const { data: orgs } = useQuery({ queryKey: ["approved-orgs"], queryFn: () => fetchOrgs() });
  const s = raw ? (JSON.parse(raw) as MirrorStatus | null) : null;
  if (!s) return null;

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RefreshCcw className="size-5 text-primary" aria-hidden="true" /> مزامنة منصّات التشغيل
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="مجموعات" value={String(s.counts["groups"] ?? 0)} />
        <StatTile label="طلاب" value={String(s.counts["students"] ?? 0)} />
        <StatTile
          label="حُذفوا هناك"
          value={String(s.counts["students_deleted_upstream"] ?? 0)}
          tone="gold"
        />
        <StatTile label="سمات" value={String(s.counts["traits"] ?? 0)} />
        <StatTile label="درجات" value={String(s.counts["scores"] ?? 0)} />
      </div>

      {s.platforms.map((p) => (
        <div key={p.key} className="mt-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {p.name} <span className="text-xs text-muted-foreground">({p.country})</span>
            </p>
            <label className="flex items-center gap-2 text-xs">
              الجهة المسؤولة عن أطفالها:
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={p.org_id ?? ""}
                onChange={async (e) => {
                  const res = await link({ data: { platform: p.key, orgId: e.target.value } });
                  if (res.ok) toast.success("رُبطت الجهة");
                  await qc.invalidateQueries({ queryKey: ["mirror-status"] });
                }}
              >
                <option value="" disabled>
                  — اختر —
                </option>
                {(orgs?.orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!p.org_id && (
            <p className="mt-2 flex items-center gap-1 text-xs text-bridge-ink">
              <TriangleAlert className="size-3.5" /> بلا جهةٍ مسؤولة لا تُستقبل دفعات الطلاب.
            </p>
          )}
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-start font-medium">الكيان</th>
                <th className="py-1 text-start font-medium">آخر دفعة</th>
                <th className="py-1 text-start font-medium">المؤشّر</th>
                <th className="py-1 text-start font-medium">الانحراف</th>
              </tr>
            </thead>
            <tbody>
              {s.state
                .filter((r) => r.source === p.key)
                .map((r) => (
                  <tr key={r.entity} className="border-t border-border/60">
                    <td className="py-1.5">{ENTITY_LABELS[r.entity] ?? r.entity}</td>
                    <td className="py-1.5">{r.last_run_at ? formatDate(r.last_run_at) : "—"}</td>
                    <td className="py-1.5 text-xs">
                      {r.cursor_at ? formatDate(r.cursor_at) : "—"}
                    </td>
                    <td className="py-1.5">
                      {r.drift ? (
                        r.drift.missing_here.length + r.drift.missing_upstream.length === 0 ? (
                          <Badge variant="secondary">متطابق</Badge>
                        ) : (
                          <Badge className="bg-bridge text-white">
                            {r.drift.missing_here.length} ناقص هنا ·{" "}
                            {r.drift.missing_upstream.length} زائد
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">لم تُطابَق</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
