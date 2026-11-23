import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Inbox, Loader2, X } from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { AccessDecision } from "@/components/protection/AccessDecision";
import { TransferReconcile } from "@/components/admin/TransferReconcile";
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
import { openPrivateFile } from "@/hooks/usePrivateFile";
import { reviewOrganization } from "@/lib/admin.functions";
import { ORG_DOC_LABELS, ORG_MISSING_LABELS, type OrgDocKind } from "@/lib/org.functions";
import { formatDate } from "@/lib/format";
import { reviewProgressReport } from "@/lib/impact.functions";
import {
  decideCircleRole,
  getDecisionContext,
  getDecisionInbox,
  INBOX_LABELS,
  reviewOfficeReport,
  resolveMoneyIssue,
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
  legal_name: "الاسم القانوني",
  registration_number: "رقم التسجيل",
  address: "العنوان",
  legal_rep_name: "الممثّل القانوني",
  legal_rep_title: "صفته",
  kyc_email: "بريد التحقّق",
  kyc_phone: "هاتف التحقّق",
  owner_email: "حساب مقدّم الطلب",
  decision_note: "آخر قرار",
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
    enabled: item.kind !== "access" && item.kind !== "transfer" && item.kind !== "money_issue",
  });
  const ctx = raw ? (JSON.parse(raw) as Record<string, unknown> | null) : null;
  const { data: access } = useQuery({
    queryKey: ["access-requests", "pending"],
    queryFn: () => fetchAccess({ data: { status: "pending" } }),
    enabled: item.kind === "access",
  });
  const accessRow = access?.requests.find((r) => r.id === item.id);

  const orgMissing =
    item.kind === "org" && ctx && Array.isArray(ctx["missing"]) ? (ctx["missing"] as string[]) : [];

  async function decide(approve: boolean) {
    // الجهة المرفوضة تُصحّح ما يُقال لها؛ والقاعدة ترفض الرفض بلا سبب.
    if (item.kind === "org" && !approve && note.trim().length < 3) {
      toast.error("اكتب سبب الإعادة لتعرف الجهة ما تُصحّح");
      return;
    }
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

      {item.kind === "money_issue" ? (
        <MoneyIssueDecision item={item} onDone={onDone} />
      ) : item.kind === "transfer" ? (
        // التحويل لا يُعتمد بزرّ: يُطابَق بما وصل (UX-15).
        <div className="mt-6">
          <TransferReconcile sponsorshipId={item.id} onDone={onDone} />
        </div>
      ) : item.kind === "access" ? (
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
                .slice(0, item.kind === "org" ? 24 : 14)
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
                    <dt className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</dt>
                    <dd className="whitespace-pre-line break-words">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
          </dl>
          {item.kind === "org" && ctx && (
            <OrgEvidence
              documents={(ctx["documents"] as OrgDoc[] | undefined) ?? []}
              missing={orgMissing}
            />
          )}
          <Textarea
            rows={2}
            aria-label="ملاحظة القرار"
            placeholder={
              item.kind === "org" ? "سبب الإعادة (إلزامي عند الرفض)" : "ملاحظة القرار (اختياري)"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || orgMissing.length > 0} onClick={() => decide(true)}>
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

type OrgDoc = { id: string; kind: OrgDocKind; file_name: string | null; storage_path: string };

/** وثائق التحقّق وما ينقص: لا يُعتمد طلبٌ لم تُفتح وثيقته (PRD-16). */
function OrgEvidence({ documents, missing }: { documents: OrgDoc[]; missing: string[] }) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
      <h3 className="text-xs font-bold text-muted-foreground">وثائق التحقّق</h3>
      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">لم تُرفع وثيقة بعد.</p>
      ) : (
        <ul className="space-y-1">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <span className="flex-1">
                {ORG_DOC_LABELS[d.kind] ?? d.kind}
                <span className="ms-2 text-xs text-muted-foreground" dir="auto">
                  {d.file_name}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!(await openPrivateFile("org-documents", d.storage_path)))
                    toast.error("تعذّر فتح الوثيقة");
                }}
              >
                <ExternalLink className="size-3" aria-hidden="true" /> فتح
              </Button>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <p role="note" className="text-xs font-medium text-bridge-ink">
          لا يُعتمد قبل: {missing.map((m) => ORG_MISSING_LABELS[m] ?? m).join("، ")}
        </p>
      )}
    </div>
  );
}

/**
 * بندٌ ماليّ: لا «اعتماد» ولا «رفض» — يُعالَج خارج الصندوق (ردٌّ لدى المزوّد،
 * إلغاءٌ من لوحته، تحقّقٌ من توقّف التحصيل) ثم يُغلق بملاحظةٍ تقول ما فُعل.
 */
function MoneyIssueDecision({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const resolve = useServerFn(resolveMoneyIssue);
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 space-y-4">
      <p className="rounded-xl bg-secondary/60 p-3 text-sm leading-7">{item.subtitle}</p>
      <p className="text-xs leading-6 text-muted-foreground">
        التحصيل بعد انتهاء الكفالة لم يُقيَّد ولم يُعِد الكفالة؛ ردّه من لوحة المزوّد يُغلق البند
        تلقائياً حين يصل حدث الردّ. والإلغاء لدى المزوّد يُعاد كل ساعة، فإن تعذّر ثلاثاً فألغِه من
        لوحته.
      </p>
      <Textarea
        rows={2}
        aria-label="ما فُعل"
        placeholder="ما فُعل (إلزامي) — مثلاً: رُدّ المبلغ من لوحة المزوّد"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        disabled={busy || note.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          const res = await resolve({ data: { id: item.id, note: note.trim() } });
          setBusy(false);
          if (!res.ok) return void toast.error("تعذّر إغلاق البند");
          toast.success("أُغلق البند");
          await qc.invalidateQueries({ queryKey: ["decision-inbox"] });
          onDone();
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        أُغلق — عولج
      </Button>
    </div>
  );
}
