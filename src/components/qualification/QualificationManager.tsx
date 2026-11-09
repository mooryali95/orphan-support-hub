import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserPlus, FileCheck2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QUALIFICATION_JOURNEY } from "@/lib/qualification.functions";
import {
  getOrphanEnrollments,
  getEnrollmentDetail,
  assignEnrollmentRole,
  recordEnrollmentConsent,
  setEnrollmentStage,
} from "@/lib/qualification-ops.functions";
import { ENROLLMENT_ROLE_LABELS, CONSENT_ROLES } from "@/lib/qualification-ops.functions";
import type { EnrollmentRoleKind, QualificationStage } from "@/integrations/supabase/types.extra";
import { TraitAssessmentForm } from "./TraitAssessmentForm";
import { formatDate } from "@/lib/format";

const ROLES: EnrollmentRoleKind[] = ["supervisor", "jurist", "guardian", "trustee", "mentor"];

/**
 * تشغيل بناء الأهلية من لوحة الجهة.
 *
 * كل فعلٍ هنا محروسٌ في القاعدة، لا في هذا المكوّن: الأزرار تُظهر ما
 * يُتوقَّع أن يُقبل، والقاعدة هي من يقبل أو يرفض. فتعطيل زرٍّ راحةٌ
 * للمستخدم لا حاجزٌ أمنيّ.
 */
export function QualificationManager({ orphanId }: { orphanId: string }) {
  const queryClient = useQueryClient();
  const listEnrollments = useServerFn(getOrphanEnrollments);

  const { data, isPending } = useQuery({
    queryKey: ["orphan-enrollments", orphanId],
    queryFn: () => listEnrollments({ data: { orphanId } }),
  });

  if (isPending) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        جارٍ التحميل…
      </div>
    );
  }

  const enrollments = data?.enrollments ?? [];

  if (enrollments.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        لا برنامج بناء أهلية على هذا الملف بعد. تُنشئه الإدارة من الكتالوج.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {enrollments.map((e) => (
        <EnrollmentBoard
          key={e.enrollment_id}
          enrollmentId={e.enrollment_id}
          program={e.program}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["orphan-enrollments", orphanId] });
            void queryClient.invalidateQueries({ queryKey: ["enrollment", e.enrollment_id] });
          }}
        />
      ))}
    </div>
  );
}

function EnrollmentBoard({
  enrollmentId,
  program,
  onChanged,
}: {
  enrollmentId: string;
  program: string;
  onChanged: () => void;
}) {
  const fetchDetail = useServerFn(getEnrollmentDetail);
  const assign = useServerFn(assignEnrollmentRole);
  const consent = useServerFn(recordEnrollmentConsent);
  const advance = useServerFn(setEnrollmentStage);

  const { data, isPending } = useQuery({
    queryKey: ["enrollment", enrollmentId],
    queryFn: () => fetchDetail({ data: { enrollmentId } }),
  });

  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<EnrollmentRoleKind | null>(null);

  if (isPending) {
    return (
      <div className="rounded-xl border border-border p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const detail = data?.detail;
  if (!detail) {
    return (
      <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        {data?.error ?? "تعذّر تحميل الالتحاق."}
      </p>
    );
  }

  const idx = QUALIFICATION_JOURNEY.findIndex((s) => s.stage === detail.stage);
  const next = QUALIFICATION_JOURNEY[idx + 1];
  const hasSupervisor = detail.roles.some((r) => r.role === "supervisor");
  const hasConsent = detail.roles.some(
    (r) => CONSENT_ROLES.includes(r.role as (typeof CONSENT_ROLES)[number]) && r.consent_at,
  );

  async function run(action: () => Promise<{ ok: boolean; error: string | null }>, done: string) {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر التنفيذ");
        return;
      }
      toast.success(done);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-bold">{program}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            المرحلة: {QUALIFICATION_JOURNEY[idx]?.label ?? detail.stage}
          </p>
        </div>
        {next && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  advance({
                    data: { enrollmentId, stage: next.stage as QualificationStage },
                  }),
                `تقدّم البرنامج إلى «${next.label}»`,
              )
            }
          >
            <ArrowLeft className="ltr:-scale-x-100 size-4" aria-hidden="true" />
            تقدّم إلى «{next.label}»
          </Button>
        )}
      </div>

      {/* الشرطان — يُذكران قبل المحاولة لا بعد رفضها */}
      {next && (!hasConsent || !hasSupervisor) && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-bridge-bright/12 p-3 text-xs leading-6 text-bridge-ink"
        >
          لا يتقدّم البرنامج قبل
          {!hasConsent && <strong> توثيق إذن الولي أو الوصي</strong>}
          {!hasConsent && !hasSupervisor && " و"}
          {!hasSupervisor && <strong> إسناد مشرف</strong>}.
        </p>
      )}

      {/* الأدوار */}
      <div className="mt-4">
        <p className="text-[11px] font-bold text-muted-foreground">الأدوار</p>
        <ul className="mt-2 space-y-2">
          {ROLES.map((role) => {
            const held = detail.roles.find((r) => r.role === role);
            const needsConsent = CONSENT_ROLES.includes(role as (typeof CONSENT_ROLES)[number]);
            return (
              <li
                key={role}
                className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2 last:border-0"
              >
                <span className="w-16 text-sm font-medium">{ENROLLMENT_ROLE_LABELS[role]}</span>
                {held ? (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {held.person_name ?? "—"}
                      {held.has_account && " (له حساب)"}
                    </span>
                    {needsConsent &&
                      (held.consent_at ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="size-3" aria-hidden="true" />
                          إذن موثَّق {formatDate(held.consent_at)}
                        </Badge>
                      ) : (
                        <ConsentForm
                          busy={busy}
                          onSubmit={(doc) =>
                            void run(
                              () => consent({ data: { roleId: held.id, document: doc } }),
                              "وُثّق الإذن",
                            )
                          }
                        />
                      ))}
                  </>
                ) : adding === role ? (
                  <RoleForm
                    busy={busy}
                    onCancel={() => setAdding(null)}
                    onSubmit={(v) =>
                      void run(async () => {
                        const res = await assign({
                          data: {
                            enrollmentId,
                            role,
                            personName: v.name || undefined,
                            personEmail: v.email || undefined,
                            personContact: v.contact || undefined,
                          },
                        });
                        if (res.ok) setAdding(null);
                        return res;
                      }, `أُسند ${ENROLLMENT_ROLE_LABELS[role]}`)
                    }
                  />
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setAdding(role)}>
                    <UserPlus className="size-3.5" aria-hidden="true" /> إسناد
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* القياس — للمشرف وحده، والقاعدة هي الحكم */}
      {detail.is_supervisor && (
        <div className="mt-5 border-t border-border pt-4">
          <TraitAssessmentForm
            enrollmentId={enrollmentId}
            assessments={detail.assessments}
            onDone={onChanged}
          />
        </div>
      )}
      {!detail.is_supervisor && (
        <p className="mt-5 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
          القياس يكتبه المشرف المعتمَد لهذا الالتحاق — إدارة الملف لا تُخوّل الحكم عليه.
        </p>
      )}
    </div>
  );
}

function RoleForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (v: { name: string; email: string; contact: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");

  return (
    <form
      className="flex flex-1 flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, contact });
      }}
    >
      <div className="min-w-32 flex-1">
        <Label htmlFor="rn" className="text-[11px]">
          الاسم
        </Label>
        <Input
          id="rn"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-8"
          required
        />
      </div>
      <div className="min-w-40 flex-1">
        <Label htmlFor="re" className="text-[11px]">
          البريد (إن كان له حساب)
        </Label>
        <Input
          id="re"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-8"
        />
      </div>
      <div className="min-w-28 flex-1">
        <Label htmlFor="rc" className="text-[11px]">
          وسيلة تواصل
        </Label>
        <Input
          id="rc"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="mt-1 h-8"
        />
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        حفظ
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}

function ConsentForm({ busy, onSubmit }: { busy: boolean; onSubmit: (doc: string) => void }) {
  const [doc, setDoc] = useState("");
  return (
    <form
      className="flex flex-1 items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(doc);
      }}
    >
      <div className="min-w-40 flex-1">
        <Label htmlFor="cd" className="text-[11px]">
          مرجع وثيقة الإذن
        </Label>
        <Input
          id="cd"
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          placeholder="مثال: consent-2026-08.pdf"
          className="mt-1 h-8"
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        <FileCheck2 className="size-3.5" aria-hidden="true" /> توثيق الإذن
      </Button>
    </form>
  );
}
