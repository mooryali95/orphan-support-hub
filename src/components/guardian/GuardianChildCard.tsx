import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CONSENT_AR,
  consentEnrollment,
  setPhotoConsent,
  type GuardianChild,
} from "@/lib/guardian.functions";
import { CONSENT_SQ, t, type Lang } from "@/lib/i18n";

/**
 * بطاقة الطفل للوليّ: أين وصل، وما التالي، وما ينتظر موافقته — بجملٍ
 * قصيرة وخطٍّ أكبر. ونصّ الموافقة يُعرض كاملاً قبل الضغط، بالعربية
 * المحفوظة حرفياً، وتحته ترجمته إن اختيرت الألبانية.
 */
export function GuardianChildCard({ child, lang }: { child: GuardianChild; lang: Lang }) {
  const qc = useQueryClient();
  const consent = useServerFn(consentEnrollment);
  const photo = useServerFn(setPhotoConsent);
  const [confirm, setConfirm] = useState<null | {
    key: string;
    run: () => Promise<{ ok: boolean }>;
  }>(null);
  const [busy, setBusy] = useState(false);
  const e = child.enrollment;
  const pct = e && e.total > 0 ? Math.round((e.accepted / e.total) * 100) : 0;

  async function doConfirm() {
    if (!confirm) return;
    setBusy(true);
    const res = await confirm.run();
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      toast.error("تعذّر الحفظ");
      return;
    }
    toast.success(t("saved", lang));
    await qc.invalidateQueries({ queryKey: ["guardian-children"] });
  }

  const photoOptions: Array<["face_hidden" | "granted" | "withdrawn", string]> = [
    ["face_hidden", t("photoHidden", lang)],
    ["granted", t("photoFull", lang)],
    ["withdrawn", t("photoWithdraw", lang)],
  ];

  return (
    <article className="rounded-2xl border border-border bg-card p-6 text-base">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{child.name}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{child.code}</span>
      </div>

      <section className="mt-4">
        <p className="text-sm font-semibold">{t("progress", lang)}</p>
        {e ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{e.program}</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-sm">
              {e.accepted} {t("sessionsOf", lang)} {e.total}
            </p>
            {e.next && (
              <p className="mt-2 text-sm">
                {t("nextSession", lang)}: <strong>{e.next}</strong>
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{t("notEnrolled", lang)}</p>
        )}
      </section>

      {child.pending_consents.length > 0 && (
        <section className="mt-5 rounded-xl border border-bridge/50 bg-bridge/5 p-4">
          <p className="text-sm font-semibold">{t("needsYou", lang)}</p>
          {child.pending_consents.map((c) => (
            <div key={c.role_id} className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{c.program}</span>
              <Button
                size="lg"
                onClick={() =>
                  setConfirm({
                    key: "enrollment:granted",
                    run: () => consent({ data: { roleId: c.role_id } }),
                  })
                }
              >
                {t("agree", lang)}
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="mt-5">
        <p className="text-sm font-semibold">
          {t("photos", lang)}{" "}
          <Badge variant="secondary" className="ms-1">
            {child.photo_consent === "granted"
              ? t("photoFull", lang)
              : child.photo_consent === "face_hidden"
                ? t("photoHidden", lang)
                : t("photoNone", lang)}
          </Badge>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {photoOptions
            .filter(
              ([s]) =>
                s !== child.photo_consent &&
                !(s === "withdrawn" && ["none", "withdrawn"].includes(child.photo_consent)),
            )
            .map(([s, label]) => (
              <Button
                key={s}
                variant="outline"
                onClick={() =>
                  setConfirm({
                    key: `photo:${s}`,
                    run: () => photo({ data: { orphanId: child.id, state: s } }),
                  })
                }
              >
                {label}
              </Button>
            ))}
        </div>
      </section>

      {confirm && (
        <div
          role="dialog"
          aria-label="تأكيد الموافقة"
          className="mt-5 rounded-xl border-2 border-primary p-4"
        >
          <p className="text-base leading-8" dir="rtl" lang="ar">
            {CONSENT_AR[confirm.key]}
          </p>
          {lang === "sq" && (
            <p className="mt-2 text-sm text-muted-foreground" dir="ltr" lang="sq">
              {CONSENT_SQ[confirm.key]}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("statementNote", lang)}</p>
          <div className="mt-3 flex gap-2">
            <Button size="lg" disabled={busy} onClick={doConfirm}>
              <Check className="size-4" /> {t("agree", lang)}
            </Button>
            <Button size="lg" variant="ghost" aria-label="إلغاء" onClick={() => setConfirm(null)}>
              ✕
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
