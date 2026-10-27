import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAccessRequests } from "@/lib/protection.functions";
import { AccessDecision } from "@/components/protection/AccessDecision";
import type { AccessRequestRow } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

type Tab = "pending" | "approved";

/**
 * طابور الإذن بالاطّلاع.
 *
 * القرار هنا **إذنٌ برؤية ملفّ طفل**، فيُعرض معه ما يُقرَّر به: السبب
 * الذي كتبه الطالب كاملاً، وكم يكفل اليوم. ولا يُعرض حكمٌ آليّ: الإدارة
 * تقرأ وتقرّر.
 */
export function AccessQueue() {
  const fetchList = useServerFn(listAccessRequests);

  const [tab, setTab] = useState<Tab>("pending");
  const [days, setDays] = useState("180");

  const { data, isPending } = useQuery({
    queryKey: ["access-requests", tab],
    queryFn: () => fetchList({ data: { status: tab } }),
  });

  const rows = data?.requests ?? [];

  return (
    <section aria-labelledby="access-heading">
      <h2 id="access-heading" className="text-sm font-bold">
        الإذن بالاطّلاع على الملفّات
      </h2>
      <p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">
        الدليل يعرض بطاقةً: اسماً مستعاراً وبلداً وفئةً عمرية. أمّا قصّة الطفل وصورته ومدينته فخلف
        إذنٍ منكم — والإذن مؤقّت، ويُسحب متى لزم.
      </p>

      <div className="mt-4 flex gap-1 border-b border-border">
        {(
          [
            ["pending", "بانتظار القرار"],
            ["approved", "أذونات قائمة"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "-mb-px border-b-2 border-shore-need px-4 py-2 text-sm font-bold text-shore-need"
                : "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div className="mt-4 w-40">
          <Label htmlFor="access-days" className="text-xs">
            مدّة الإذن بالأيام
          </Label>
          <Input
            id="access-days"
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 h-9"
          />
        </div>
      )}

      {isPending ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {tab === "pending" ? "لا طلبات بانتظار القرار." : "لا أذونات قائمة."}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{row.orphan_name}</h3>
                    <Badge variant="secondary">{row.orphan_code}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {row.requester_email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    طُلب في {formatDate(row.created_at)}
                    {row.expires_at && ` — ينقضي ${formatDate(row.expires_at)}`}
                  </p>
                </div>
                <Badge variant={row.sponsorships > 0 ? "default" : "outline"}>
                  {row.sponsorships > 0 ? `يكفل ${row.sponsorships}` : "لا يكفل أحداً"}
                </Badge>
              </div>

              {/* السبب كاملاً لا مقتطعاً: عليه يُبنى القرار. */}
              <p className="mt-3 whitespace-pre-line rounded-xl bg-secondary/60 p-3 text-sm leading-7">
                {row.reason}
              </p>

              <AccessDecision
                row={row}
                mode={tab}
                days={Math.max(1, Math.min(365, Number(days) || 180))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
