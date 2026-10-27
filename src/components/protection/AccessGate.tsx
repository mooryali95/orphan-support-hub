import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Loader2, Lock, ShieldCheck, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestOrphanAccess } from "@/lib/protection.functions";
import { getScopeCatalog } from "@/lib/scopes.functions";
import { RequesterThread } from "@/components/protection/RequesterThread";
import type { MyAccess } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

const MIN_REASON = 20;

/**
 * حاجب الملفّ — الطلب وحالُه.
 *
 * القاعدة تُشرَح قبل أن تُصادَف، وحالُ الطلب يُعرض دائماً: من طلب ولم
 * يُجَب يظنّ العطبَ منعاً، ومن رُفض ولم يُخبَر يعيد الطلب أبداً.
 */
export function AccessGate({
  orphanId,
  orphanName,
  access,
  signedIn,
}: {
  orphanId: string;
  orphanName: string;
  access: MyAccess;
  signedIn: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const request = useServerFn(requestOrphanAccess);
  const [reason, setReason] = useState("");
  const [pkg, setPkg] = useState<string | null>(null);
  const fetchCatalog = useServerFn(getScopeCatalog);
  const { data: catalog } = useQuery({
    queryKey: ["scope-catalog"],
    queryFn: () => fetchCatalog(),
    enabled: signedIn,
  });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await request({
        data: { orphanId, reason: reason.trim(), ...(pkg ? { package: pkg } : {}) },
      });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر إرسال الطلب");
        return;
      }
      toast.success(
        res.status === "approved" ? "لك اطّلاعٌ على هذا الملفّ" : "أُرسل طلبك إلى الإدارة",
      );
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["orphan", orphanId] });
    } finally {
      setBusy(false);
    }
  }

  const shell = "mt-6 rounded-3xl border-2 border-dashed border-border bg-card p-6";

  if (access?.status === "pending") {
    return (
      <section className={shell} aria-labelledby="gate-title">
        <h2 id="gate-title" className="flex items-center gap-2 text-lg font-bold">
          <Clock className="size-5 text-bridge-ink" aria-hidden="true" />
          طلبك قيد المراجعة
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          أُرسل طلبك في {formatDate(access.created_at)} وتنظر فيه الإدارة. وحين يُقبل تُفتح لك
          تفاصيل الملفّ من هذه الصفحة نفسها.
        </p>
        <RequesterThread requestId={access.request_id} />
      </section>
    );
  }

  if (access?.status === "rejected" || access?.status === "revoked") {
    const revoked = access.status === "revoked";
    return (
      <section className={shell} aria-labelledby="gate-title">
        <h2 id="gate-title" className="flex items-center gap-2 text-lg font-bold">
          <ShieldX className="size-5 text-shore-need" aria-hidden="true" />
          {revoked ? "سُحب إذنك على هذا الملفّ" : "لم يُقبل طلبك"}
        </h2>
        {access.decision_note && (
          <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm leading-7">
            {access.decision_note}
          </p>
        )}
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          وكفالتك ممكنةٌ من هذه الصفحة دون الاطّلاع على التفاصيل: الملفّ موثَّقٌ من جهةٍ معتمدة،
          والإدارة راجعته قبل نشره.
        </p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className={shell} aria-labelledby="gate-title">
        <h2 id="gate-title" className="flex items-center gap-2 text-lg font-bold">
          <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
          تفاصيل الملفّ محجوبة
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          قصّة {orphanName} وصورته ومدينته وتفصيل احتياجه لا تُعرض في صفحةٍ مفتوحة. وللاطّلاع عليها
          يلزم حسابٌ ثمّ إذنٌ من الإدارة — لأنّ ملفّ طفلٍ ليس صفحةً تُتصفَّح.
        </p>
        <Button
          className="mt-5"
          onClick={() => navigate({ to: "/auth", search: { redirect: `/orphans/${orphanId}` } })}
        >
          الدخول لطلب الاطّلاع
        </Button>
      </section>
    );
  }

  const short = reason.trim().length < MIN_REASON;

  return (
    <section className={shell} aria-labelledby="gate-title">
      <h2 id="gate-title" className="flex items-center gap-2 text-lg font-bold">
        <ShieldCheck className="size-5 text-shore-thrive" aria-hidden="true" />
        اطلب الاطّلاع على الملفّ
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
        قصّة {orphanName} وصورته ومدينته وتفصيل احتياجه خلف إذنٍ من الإدارة. اكتب سبب طلبك — وهو
        سؤالٌ من حقّ الطفل أن يُسأل — ثم تنظر فيه الإدارة. والإذن حين يُمنح{" "}
        <strong className="text-foreground">مؤقّت</strong>، ويُسحب متى لزم.
      </p>

      <form onSubmit={onSubmit} className="mt-5 max-w-2xl">
        {(catalog?.packages ?? []).length > 0 && (
          <fieldset className="mb-5">
            <legend className="text-sm font-medium">ماذا تريد أن ترى؟</legend>
            <p className="text-xs text-muted-foreground">
              اختر حزمة؛ والإدارة تقرّر ما يُمنح فعلاً، وقد تعدّله.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {catalog!.packages.map((p) => (
                <label
                  key={p.key}
                  className={
                    pkg === p.key
                      ? "cursor-pointer rounded-xl border border-primary bg-primary/5 p-3"
                      : "cursor-pointer rounded-xl border border-border p-3 hover:border-primary/60"
                  }
                >
                  <input
                    type="radio"
                    name="package"
                    className="sr-only"
                    checked={pkg === p.key}
                    onChange={() => setPkg(p.key)}
                  />
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{p.description}</span>
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    {p.scopes
                      .map((k) => catalog!.scopes.find((s) => s.key === k)?.label ?? k)
                      .join(" · ")}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Label htmlFor="access-reason" className="text-sm">
          لماذا تريد الاطّلاع؟
        </Label>
        <Textarea
          id="access-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-2"
          placeholder="مثال: أنوي كفالة هذا الملفّ وأحتاج معرفة تفصيل احتياجه قبل القرار."
          aria-describedby="access-reason-hint"
        />
        <p id="access-reason-hint" className="mt-2 text-xs text-muted-foreground">
          {short
            ? `اكتب ${MIN_REASON} حرفاً على الأقلّ (${reason.trim().length} حتى الآن).`
            : "يُحفظ سببك مع الطلب، وتقرؤه الإدارة عند البتّ."}
        </p>
        <Button type="submit" className="mt-4" disabled={busy || short}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          إرسال الطلب
        </Button>
      </form>
    </section>
  );
}
