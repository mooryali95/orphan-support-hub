import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PackageCheck, PackageOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getOfficeOpenPledges,
  recordPledgeDelivery,
  type OpenPledge,
  useWorkspaceLabels,
} from "@/lib/workspaces.functions";
import { EmptyState } from "@/components/kit/EmptyState";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/offices/OfficePledges", {
  ar: {
    title: "تعهّدات بانتظار التسليم",
    emptyTitle: "لا تعهّدات مفتوحة",
    emptyText: "حين يدعم أحدٌ منطقة المكتب أو مجموعاتها يظهر هنا لتجهيزه وتسليمه.",
    uploadFailed: "تعذّر رفع المستند",
    recordFailed: "تعذّر التسجيل",
    delivered: "سُجّل التسليم وأُبلغ الداعم",
    preparing: "بدأ التجهيز وأُبلغ الداعم",
    preparingBadge: "قيد التجهيز",
    startPreparing: "بدء التجهيز",
    proof: "مستند التسليم",
    confirm: "تأكيد التسليم",
  },
  en: {
    title: "Pledges awaiting delivery",
    emptyTitle: "No open pledges",
    emptyText:
      "When someone supports the office's area or its groups, it appears here to prepare and deliver.",
    uploadFailed: "The document could not be uploaded",
    recordFailed: "It could not be recorded",
    delivered: "Delivery recorded and the supporter notified",
    preparing: "Preparation started and the supporter notified",
    preparingBadge: "Being prepared",
    startPreparing: "Start preparing",
    proof: "Delivery document",
    confirm: "Confirm delivery",
  },
});

/**
 * تعهّدات منطقة المكتب: يُعلَن التجهيز، ثم يُثبَت التسليم بمستند،
 * فيُبلَّغ الداعم في الحالتين.
 */
export function OfficePledges({ officeId, canWrite }: { officeId: string; canWrite: boolean }) {
  const t = useCopy(COPY);
  const fetchOpen = useServerFn(getOfficeOpenPledges);
  const { data: pledges = [] } = useQuery({
    queryKey: ["office-pledges", officeId],
    queryFn: () => fetchOpen({ data: { officeId } }),
  });

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{t.title}</h2>
      {pledges.length === 0 ? (
        <EmptyState className="mt-3" title={t.emptyTitle} text={t.emptyText} />
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-background">
          {pledges.map((p) => (
            <Row key={p.id} p={p} officeId={officeId} canWrite={canWrite} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ p, officeId, canWrite }: { p: OpenPledge; officeId: string; canWrite: boolean }) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const labels = useWorkspaceLabels();
  const record = useServerFn(recordPledgeDelivery);
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(stage: "preparing" | "delivered") {
    setBusy(true);
    try {
      let proofPath: string | undefined;
      if (stage === "delivered") {
        if (!file) return;
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        proofPath = `${officeId}/pledge-${p.id}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("office-media").upload(proofPath, file);
        if (error) {
          toast.error(t.uploadFailed);
          return;
        }
      }
      const res = await record({
        data: { pledgeId: p.id, officeId, stage, ...(proofPath ? { proofPath } : {}) },
      });
      if (!res.ok) {
        toast.error(t.recordFailed);
        return;
      }
      toast.success(stage === "delivered" ? t.delivered : t.preparing);
      await qc.invalidateQueries({ queryKey: ["office-pledges", officeId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="font-medium">
          {p.target ?? labels.target[p.target_type]}{" "}
          <span className="text-xs text-muted-foreground">
            · {labels.kind[p.kind]} · {labels.target[p.target_type]}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(p.amount, p.currency, locale)} · {formatDate(p.created_at, locale)}
          {p.last_stage === "preparing" && (
            <Badge variant="secondary" className="ms-2">
              {t.preparingBadge}
            </Badge>
          )}
        </p>
      </div>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {p.last_stage !== "preparing" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("preparing")}>
              <PackageOpen className="size-4" /> {t.startPreparing}
            </Button>
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            aria-label={t.proof}
            className="w-52"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button size="sm" disabled={busy || !file} onClick={() => act("delivered")}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            {t.confirm}
          </Button>
        </div>
      )}
    </li>
  );
}
