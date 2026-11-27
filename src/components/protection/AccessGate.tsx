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
import { formatDate, isolate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const MIN_REASON = 20;

const COPY = defineCopy("components/protection/AccessGate", {
  ar: {
    sendFailed: "تعذّر إرسال الطلب",
    granted: "لك اطّلاعٌ على هذا الملفّ",
    sent: "أُرسل طلبك إلى الإدارة",
    pendingH: "طلبك قيد المراجعة",
    pendingP: (d: string) =>
      `أُرسل طلبك في ${d} وتنظر فيه الإدارة. وحين يُقبل تُفتح لك تفاصيل الملفّ من هذه الصفحة نفسها.`,
    revokedH: "سُحب إذنك على هذا الملفّ",
    rejectedH: "لم يُقبل طلبك",
    stillSponsor:
      "وكفالتك ممكنةٌ من هذه الصفحة دون الاطّلاع على التفاصيل: الملفّ وثّقته جهة ميدانية تعمل تحت مظلّة الندوة، والإدارة راجعته قبل نشره.",
    hiddenH: "تفاصيل الملفّ محجوبة",
    hiddenP: (n: string) =>
      `قصّة ${n} وصورته ومدينته وتفصيل احتياجه لا تُعرض في صفحةٍ مفتوحة. وللاطّلاع عليها يلزم حسابٌ ثمّ إذنٌ من الإدارة، لأنّ ملفّ طفلٍ ليس صفحةً تُتصفَّح.`,
    signInTo: "الدخول لطلب الاطّلاع",
    requestH: "اطلب الاطّلاع على الملفّ",
    requestA: (n: string) =>
      `قصّة ${n} وصورته ومدينته وتفصيل احتياجه خلف إذنٍ من الإدارة. اكتب سبب طلبك، وهو سؤالٌ من حقّ الطفل أن يُسأل، ثم تنظر فيه الإدارة. والإذن حين يُمنح`,
    temporary: "مؤقّت",
    requestB: "، ويُسحب متى لزم.",
    whatSee: "ماذا تريد أن ترى؟",
    pickPkg: "اختر حزمة؛ والإدارة تقرّر ما يُمنح فعلاً، وقد تعدّله.",
    why: "لماذا تريد الاطّلاع؟",
    whyPh: "مثال: أنوي كفالة هذا الملفّ وأحتاج معرفة تفصيل احتياجه قبل القرار.",
    tooShort: (min: number, n: number) => `اكتب ${min} حرفاً على الأقلّ (${n} حتى الآن).`,
    saved: "يُحفظ سببك مع الطلب، وتقرؤه الإدارة عند البتّ.",
    submit: "إرسال الطلب",
  },
  en: {
    sendFailed: "The request could not be sent",
    granted: "You now have access to this file",
    sent: "Your request was sent to the administration",
    pendingH: "Your request is under review",
    pendingP: (d: string) =>
      `You sent your request on ${d} and the administration is reviewing it. Once approved, the file's details open for you right on this page.`,
    revokedH: "Your access to this file was withdrawn",
    rejectedH: "Your request was not approved",
    stillSponsor:
      "You can still sponsor from this page without seeing the details: the file was documented by a field organization working under WAMY's umbrella and reviewed by the administration before publishing.",
    hiddenH: "File details are protected",
    hiddenP: (n: string) =>
      `${n}'s story, photo, city and detailed needs aren't shown on an open page. Seeing them takes an account and then permission from the administration; because a child's file isn't a page to browse.`,
    signInTo: "Sign in to request access",
    requestH: "Request access to the file",
    requestA: (n: string) =>
      `${n}'s story, photo, city and detailed needs sit behind permission from the administration. Tell us why you're asking; it's a question the child deserves to have asked, and the administration will review it. When granted, access is`,
    temporary: "temporary",
    requestB: ", and can be withdrawn whenever needed.",
    whatSee: "What would you like to see?",
    pickPkg:
      "Choose a package; the administration decides what is actually granted, and may adjust it.",
    why: "Why would you like access?",
    whyPh:
      "For example: I plan to sponsor this child and need to know their detailed needs before deciding.",
    tooShort: (min: number, n: number) => `Write at least ${min} characters (${n} so far).`,
    saved: "Your reason is saved with the request and read by the administration when deciding.",
    submit: "Send request",
  },
});

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
  const locale = useLocale();
  const t = useCopy(COPY);
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
        toast.error(res.error ?? t.sendFailed);
        return;
      }
      toast.success(res.status === "approved" ? t.granted : t.sent);
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
          {t.pendingH}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {t.pendingP(formatDate(access.created_at, locale))}
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
          {revoked ? t.revokedH : t.rejectedH}
        </h2>
        {access.decision_note && (
          <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm leading-7">
            {access.decision_note}
          </p>
        )}
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{t.stillSponsor}</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className={shell} aria-labelledby="gate-title">
        <h2 id="gate-title" className="flex items-center gap-2 text-lg font-bold">
          <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
          {t.hiddenH}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          {t.hiddenP(isolate(orphanName))}
        </p>
        <Button
          className="mt-5"
          onClick={() => navigate({ to: "/auth", search: { redirect: `/orphans/${orphanId}` } })}
        >
          {t.signInTo}
        </Button>
      </section>
    );
  }

  const short = reason.trim().length < MIN_REASON;

  return (
    <section className={shell} aria-labelledby="gate-title">
      <h2 id="gate-title" className="flex items-center gap-2 text-lg font-bold">
        <ShieldCheck className="size-5 text-shore-thrive" aria-hidden="true" />
        {t.requestH}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
        {t.requestA(isolate(orphanName))} <strong className="text-foreground">{t.temporary}</strong>
        {t.requestB}
      </p>

      <form onSubmit={onSubmit} className="mt-5 max-w-2xl">
        {(catalog?.packages ?? []).length > 0 && (
          <fieldset className="mb-5">
            <legend className="text-sm font-medium">{t.whatSee}</legend>
            <p className="text-xs text-muted-foreground">{t.pickPkg}</p>
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
                  <span className="mt-2 block text-xs text-muted-foreground">
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
          {t.why}
        </Label>
        <Textarea
          id="access-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-2"
          placeholder={t.whyPh}
          aria-describedby="access-reason-hint"
        />
        <p id="access-reason-hint" className="mt-2 text-xs text-muted-foreground">
          {short ? t.tooShort(MIN_REASON, reason.trim().length) : t.saved}
        </p>
        <Button type="submit" className="mt-4" disabled={busy || short}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t.submit}
        </Button>
      </form>
    </section>
  );
}
