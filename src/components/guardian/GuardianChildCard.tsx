import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CONSENT_AR,
  consentEnrollment,
  setPhotoConsent,
  type GuardianChild,
} from "@/lib/guardian.functions";
import { CONSENT_EN, CONSENT_SQ, t, type Lang } from "@/lib/i18n";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { arNoun, SESSIONS } from "@/lib/plural";

/**
 * بطاقة الطفل للوليّ: أين وصل، وما التالي، وما ينتظر موافقته — بجملٍ
 * قصيرة وخطٍّ أكبر. ونصّ الموافقة يُعرض كاملاً قبل الضغط، بالعربية
 * المحفوظة حرفياً، وتحته ترجمته إن اختيرت الألبانية.
 *
 * الاتجاه يتبع لغة الواجهة، وما يأتي من القاعدة (الاسم، البرنامج) يتبع
 * لغته هو (`dir="auto"`) — فلا تنقلب الأرقام ولا علامات الترقيم في الألبانية.
 */
export function GuardianChildCard({ child, lang }: { child: GuardianChild; lang: Lang }) {
  const qc = useQueryClient();
  // الكتابة عبر منفذ البيانات: نسخة التجربة لا تنادي الخادم.
  const consent = useDataFn("guardian.consent", consentEnrollment);
  const photo = useDataFn("guardian.photo", setPhotoConsent);
  const childrenKey = useDataKey(["guardian-children"]);
  const [confirm, setConfirm] = useState<null | {
    key: string;
    label: string;
    run: () => Promise<{ ok: boolean }>;
  }>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dir = lang === "ar" ? "rtl" : "ltr";

  // النافذة تأخذ التركيز حين تُفتح: قارئ الشاشة ولوحة المفاتيح يبدآن منها.
  useEffect(() => {
    if (confirm) panelRef.current?.focus();
  }, [confirm]);
  const e = child.enrollment;
  const pct = e && e.total > 0 ? Math.round((e.accepted / e.total) * 100) : 0;

  async function doConfirm() {
    if (!confirm) return;
    setBusy(true);
    const res = await confirm.run();
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      toast.error(
        lang === "ar" ? "تعذّر الحفظ" : lang === "en" ? "Could not save" : "Ruajtja dështoi",
      );
      return;
    }
    toast.success(t("saved", lang));
    await qc.invalidateQueries({ queryKey: childrenKey });
  }

  const photoOptions: Array<["face_hidden" | "granted" | "withdrawn", string]> = [
    ["face_hidden", t("photoHidden", lang)],
    ["granted", t("photoFull", lang)],
    ["withdrawn", t("photoWithdraw", lang)],
  ];

  const press = "min-h-11 transition-transform duration-150 active:scale-[0.97]";

  return (
    <article
      dir={dir}
      lang={lang}
      className="rounded-3xl bg-card p-6 text-base shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06),0_2px_4px_0_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 dir="auto" className="text-xl leading-snug font-bold">
          {child.name}
        </h2>
        <bdi dir="ltr" className="font-mono text-xs tabular-nums text-muted-foreground">
          {child.code}
        </bdi>
      </header>

      <section className="mt-5" aria-labelledby={`${ids}-p`}>
        <h3 id={`${ids}-p`} className="text-sm font-semibold">
          {t("progress", lang)}
        </h3>
        {e ? (
          <>
            <p dir="auto" className="mt-1 text-sm leading-7 text-muted-foreground">
              {e.program}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={e.total}
              aria-valuenow={e.accepted}
              aria-label={t("progress", lang)}
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-secondary"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 flex items-baseline justify-between gap-2 text-sm">
              <span>
                {lang === "ar" ? (
                  <>
                    <strong className="tabular-nums">{e.accepted}</strong> من{" "}
                    <span className="tabular-nums">{e.total}</span> {arNoun(e.total, SESSIONS)}{" "}
                    مقبولة
                  </>
                ) : (
                  <>
                    <strong className="tabular-nums">{e.accepted}</strong> {t("sessionsOf", lang)}{" "}
                    <span className="tabular-nums">{e.total}</span>
                  </>
                )}
              </span>
              <span className="text-muted-foreground tabular-nums">{pct}%</span>
            </p>
            {e.next && (
              <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                {t("nextSession", lang)}:{" "}
                <strong dir="auto" className="inline-block">
                  {e.next}
                </strong>
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{t("notEnrolled", lang)}</p>
        )}
      </section>

      {child.pending_consents.length > 0 && (
        <section className="mt-5 rounded-2xl border border-bridge/40 bg-bridge/5 p-2">
          <h3 className="px-2 pt-2 text-sm font-semibold">{t("needsYou", lang)}</h3>
          <ul className="mt-1">
            {child.pending_consents.map((c) => (
              <li
                key={c.role_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-2"
              >
                <span dir="auto" className="min-w-0 flex-1 text-sm leading-7">
                  {c.program}
                </span>
                <Button
                  size="lg"
                  className={press}
                  onClick={() =>
                    setConfirm({
                      key: "enrollment:granted",
                      label: c.program,
                      run: () => consent({ data: { roleId: c.role_id } }),
                    })
                  }
                >
                  {t("agree", lang)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {t("photos", lang)}
          <Badge variant="secondary">
            {child.photo_consent === "granted"
              ? t("photoFull", lang)
              : child.photo_consent === "face_hidden"
                ? t("photoHidden", lang)
                : t("photoNone", lang)}
          </Badge>
        </h3>
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
                variant={s === "withdrawn" ? "ghost" : "outline"}
                className={s === "withdrawn" ? `${press} text-destructive` : press}
                onClick={() =>
                  setConfirm({
                    key: `photo:${s}`,
                    label,
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
          ref={panelRef}
          tabIndex={-1}
          role="alertdialog"
          aria-labelledby={`${ids}-c`}
          onKeyDown={(ev) => ev.key === "Escape" && !busy && setConfirm(null)}
          className="mt-5 rounded-2xl border-2 border-primary/60 p-4 outline-none transition-[opacity,translate] duration-200 ease-[var(--ease-out)] starting:translate-y-1 starting:opacity-0"
        >
          {/* ما يوافق عليه بالاسم قبل نصّ الموافقة: لا موافقة على مجهول. */}
          <p id={`${ids}-c`} dir="auto" className="text-sm font-semibold">
            {confirm.label}
          </p>
          <p className="mt-2 text-base leading-8" dir="rtl" lang="ar">
            {CONSENT_AR[confirm.key]}
          </p>
          {lang !== "ar" && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground" dir="ltr" lang={lang}>
              {(lang === "sq" ? CONSENT_SQ : CONSENT_EN)[confirm.key]}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t("statementNote", lang)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={busy}
              className={`${press} flex-1 sm:flex-none`}
              onClick={doConfirm}
            >
              <Check className="size-4" strokeWidth={2} aria-hidden="true" /> {t("agree", lang)}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={busy}
              className="min-h-11"
              onClick={() => setConfirm(null)}
            >
              <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
              {t("notNow", lang)}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
