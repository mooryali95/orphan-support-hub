import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, CircleHelp, FlaskConical } from "lucide-react";

import { PLATFORM_MODE } from "@/config/platform";
import { getPaymentsReady } from "@/lib/admin.functions";
import { goLiveSteps, readyToGoLive } from "@/lib/go-live";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { getOperatingLinks } from "@/lib/vision-links.functions";

const COPY = defineCopy("components/admin/GoLiveReadiness", {
  ar: {
    title: "جاهزية الاعتماد",
    modeLive: "المنصّة في الوضع الحقيقي.",
    modeTrial: "المنصّة في الوضع التجريبي: أزرار الكفالة العامّة تقود إلى التجربة.",
    badgeLive: "حقيقي",
    badgeReady: "جاهزة للتحويل",
    badgeTrial: "تجربة",
    stateDone: "متحقّق",
    stateUnknown: "غير معروف",
    stateOpen: "لم يتحقّق",
    whenReady: "الشروط متحقّقة. يبقى قرار التحويل إلى التشغيل الحقيقي، ثم النشر.",
    whenNot:
      "حين تتحقّق الشروط الثلاثة يصير التحويل إلى التشغيل الحقيقي خطوةً واحدة يتولّاها فريق التقنية.",
    contract: "عقد الربط مع منصّة التشغيل وقائمة التحويل متاحان لفريق التقنية.",
  },
  en: {
    title: "Go-live readiness",
    modeLive: "The platform is in live mode.",
    modeTrial: "The platform is in demo mode: the public sponsor buttons lead to the demo.",
    badgeLive: "Live",
    badgeReady: "Ready to switch",
    badgeTrial: "Trial",
    stateDone: "met",
    stateUnknown: "unknown",
    stateOpen: "not met",
    whenReady: "All conditions are met. What remains is the decision to go live, then publishing.",
    whenNot:
      "Once the three conditions are met, going live is a single step handled by the technical team.",
    contract:
      "The operating platform link contract and switch checklist are with the technical team.",
  },
});

/**
 * «جاهزية الاعتماد»: ما بقي قبل تحويل المنصّة من التجربة إلى الحقيقي. كلّ شرطٍ من
 * حال المنصّة الفعلية؛ والتحويل نفسه سطرٌ واحد في src/config/platform.ts.
 */
export function GoLiveReadiness({ published }: { published: number }) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const paymentsFn = useServerFn(getPaymentsReady);
  const { data: pay } = useQuery({ queryKey: ["payments-ready"], queryFn: () => paymentsFn() });
  const { data: links } = useQuery({
    queryKey: ["operating-links"],
    queryFn: () => getOperatingLinks(),
  });
  const steps = goLiveSteps(
    { published, links: links ?? null, payments: pay ? pay.ready : null },
    locale,
  );
  const ready = readyToGoLive(steps);
  const live = PLATFORM_MODE === "live";

  return (
    <section
      aria-labelledby="go-live"
      className="rounded-3xl border border-border bg-card p-6 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="go-live" className="font-display text-xl font-bold">
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{live ? t.modeLive : t.modeTrial}</p>
        </div>
        <span
          className={
            live || ready
              ? "rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
              : "inline-flex items-center gap-1.5 rounded-full bg-bridge/12 px-3 py-1 text-xs font-bold text-bridge-ink"
          }
        >
          {!live && !ready && <FlaskConical className="size-3.5" aria-hidden="true" />}
          {live ? t.badgeLive : ready ? t.badgeReady : t.badgeTrial}
        </span>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((s) => {
          const Icon = s.done === true ? CheckCircle2 : s.done === null ? CircleHelp : CircleDashed;
          return (
            <li key={s.key} className="flex gap-3">
              <Icon
                className={`mt-0.5 size-5 shrink-0 ${s.done === true ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span>
                <span className="block font-bold">
                  {s.title}
                  <span className="sr-only">
                    :{" "}
                    {s.done === true ? t.stateDone : s.done === null ? t.stateUnknown : t.stateOpen}
                  </span>
                </span>
                <span className="block text-sm leading-6 text-muted-foreground">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {!live && (
        <p className="mt-5 rounded-2xl bg-secondary px-4 py-3 text-sm leading-6">
          {ready ? t.whenReady : t.whenNot}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{t.contract}</p>
    </section>
  );
}
