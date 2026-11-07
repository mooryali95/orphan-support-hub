import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Inbox, Loader2, X } from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { AccessDecision } from "@/components/protection/AccessDecision";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { reviewOrganization } from "@/lib/admin.functions";
import { formatDate } from "@/lib/format";
import { reviewProgressReport } from "@/lib/impact.functions";
import {
  decideCircleRole,
  getDecisionContext,
  getDecisionInbox,
  INBOX_LABELS,
  reviewOfficeReport,
  reviewOrphanEdit,
  setPledgeStatus,
  type InboxItem,
} from "@/lib/inbox.functions";
import { listAccessRequests } from "@/lib/protection.functions";
import { setDonorEntityStatus } from "@/lib/workspaces.functions";

/**
 * صندوق القرارات: كل ما ينتظر الإدارة في قائمةٍ واحدة، والقرار في لوحٍ
 * جانبي يحمل السياق كاملاً. ملفّ الطفل وحده يُحال إلى طابور الاعتماد،
 * لأن قراره قراءةُ وثائق لا سطر.
 */
export function DecisionInbox({
  onOpenQueue,
  onOpenIntegrity,
}: {
  onOpenQueue: () => void;
  onOpenIntegrity: () => void;
}) {
  const fetchInbox = useServerFn(getDecisionInbox);
  const { data: items = [], isPending } = useQuery({
    queryKey: ["decision-inbox"],
    queryFn: () => fetchInbox(),
  });
  const [open, setOpen] = useState<InboxItem | null>(null);

  if (isPending) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Inbox className="size-5 text-bridge-ink" aria-hidden="true" />
        ينتظر قرارك
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="لا شيء ينتظر قرارك"
          text="كل ما يُرفع يظهر هنا أوّلاً بأول."
        />
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`}>
              <button
                type="button"
                // طلبات الفكّ والاختلافات لها صفحتها: موافقتان ونافذة، لا «اعتماد» بضغطة.
                onClick={() =>
                  it.kind === "orphan"
                    ? onOpenQueue()
                    : it.kind === "unlock" || it.kind === "discrepancy"
                      ? onOpenIntegrity()
                      : setOpen(it)
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-secondary/40"
              >
                <Badge variant="secondary" className="shrink-0">
                  {INBOX_LABELS[it.kind]}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {it.subtitle}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(it.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-xl">
          {open && <DecisionPanel item={open} onDone={() => setOpen(null)} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  code: "الرمز",
  title: "العنوان",
  body: "التفاصيل",
  summary: "الملخّص",
  period: "الفترة",
  education_note: "التعليم",
  living_note: "المعيشة",
  health_note: "الصحّة",
  city: "المدينة",
  region: "المنطقة",
  country_code: "الدولة",
  license_number: "رقم الترخيص",
  contact_email: "بريد التواصل",
  contact_phone: "هاتف التواصل",
  about: "نبذة",
  entity_type: "الصفة",
  country: "البلد",
  members: "الأعضاء",
  office: "المكتب",
  metrics: "المؤشّرات",
  attachments_count: "المرفقات",
  kind: "النوع",
  target_type: "الهدف",
  amount: "المبلغ",
  currency: "العملة",
  note: "ملاحظة",
  status: "الحالة",
  created_at: "أُنشئ",
  story: "القصّة",
  need: "الاحتياج",
  role: "الدور",
  person_name: "صاحب الدور",
  expires_at: "ينقضي",
  proposed: "المقترح",
  published: "المنشور الآن",
  needs_text: "نصوص الاحتياج",
  via: "القناة",
  person_email: "بريده",
  person_contact: "التواصل",
  program: "البرنامج",
  org: "الجهة",
  assigned_by_email: "أسنده",
};

function DecisionPanel({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const qc = useQueryClient();
  const fetchContext = useServerFn(getDecisionContext);
  const fetchAccess = useServerFn(listAccessRequests);
  const org = useServerFn(reviewOrganization);
  const donor = useServerFn(setDonorEntityStatus);
  const report = useServerFn(reviewProgressReport);
  const office = useServerFn(reviewOfficeReport);
  const pledge = useServerFn(setPledgeStatus);
  const circle = useServerFn(decideCircleRole);
  const edit = useServerFn(reviewOrphanEdit);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: raw } = useQuery({
    queryKey: ["decision-context", item.kind, item.id],
    queryFn: () => fetchContext({ data: { kind: item.kind, id: item.id } }),
    enabled: item.kind !== "access",
  });
  const ctx = raw ? (JSON.parse(raw) as Record<string, unknown> | null) : null;
  const { data: access } = useQuery({
    queryKey: ["access-requests", "pending"],
    queryFn: () => fetchAccess({ data: { status: "pending" } }),
    enabled: item.kind === "access",
  });
  const accessRow = access?.requests.find((r) => r.id === item.id);

  async function decide(approve: boolean) {
    setBusy(true);
    const n = note.trim() || undefined;
    const res =
      item.kind === "org"
        ? await org({
            data: { id: item.id, decision: approve ? "approved" : "rejected", reason: n },
          })
        : item.kind === "donor"
          ? await donor({ data: { entityId: item.id, status: approve ? "approved" : "suspended" } })
          : item.kind === "progress_report"
            ? await report({
                data: { id: item.id, decision: approve ? "approved" : "rejected", note: n },
              })
            : item.kind === "office_report"
              ? await office({ data: { id: item.id, publish: approve } })
              : item.kind === "pledge"
                ? await pledge({ data: { id: item.id, status: approve ? "active" : "cancelled" } })
                : item.kind === "circle_role" || item.kind === "circle_role_renewal"
                  ? await circle({ data: { id: item.id, approve, note: n } })
                  : item.kind === "orphan_edit"
                    ? await edit({ data: { id: item.id, approve, note: n } })
                    : // نوعٌ لا قرار له هنا: لا يُمرَّر إلى إجراءٍ آخر بالخطأ.
                      { ok: false as const };
    setBusy(false);
    if (!res.ok) {
      toast.error("تعذّر تنفيذ القرار");
      return;
    }
    toast.success(approve ? "اعتُمد" : "رُفض");
    await qc.invalidateQueries({ queryKey: ["decision-inbox"] });
    await qc.invalidateQueries({ queryKey: ["admin-overview"] });
    onDone();
  }

  const approveLabel: Partial<Record<InboxItem["kind"], string>> = {
    office_report: "نشر",
    pledge: "فتح التعهّد (وصل المال)",
    circle_role: "اعتماد لسنة",
    circle_role_renewal: "تجديد لسنة",
    orphan_edit: "نشر التعديل",
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{item.title}</SheetTitle>
        <SheetDescription>
          {INBOX_LABELS[item.kind]} · {formatDate(item.created_at)}
        </SheetDescription>
      </SheetHeader>

      {item.kind === "access" ? (
        accessRow ? (
          <div className="mt-6">
            <p className="whitespace-pre-line rounded-xl bg-secondary/60 p-3 text-sm leading-7">
              {accessRow.reason}
            </p>
            <AccessDecision row={accessRow} mode="pending" days={180} />
          </div>
        ) : (
          <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
        )
      ) : (
        <div className="mt-6 space-y-4">
          <dl className="space-y-2 rounded-xl border border-border p-4 text-sm">
            {ctx &&
              Object.entries(ctx)
                .filter(([k, v]) => v !== null && v !== "" && k in FIELD_LABELS)
                .slice(0, 14)
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
                    <dt className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</dt>
                    <dd className="whitespace-pre-line break-words">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
          </dl>
          <Textarea
            rows={2}
            placeholder="ملاحظة القرار (اختياري)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => decide(true)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {approveLabel[item.kind] ?? "اعتماد"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
              <X className="size-4" /> {item.kind === "office_report" ? "إعادة مسودّة" : "رفض"}
            </Button>
          </div>
          {item.kind === "office_report" && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ExternalLink className="size-3" /> صور التقرير في خزنة المكتب الخاصّة ولا تُعرض هنا.
            </p>
          )}
        </div>
      )}
    </>
  );
}
