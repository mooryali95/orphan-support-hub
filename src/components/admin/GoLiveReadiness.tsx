import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, CircleHelp, FlaskConical } from "lucide-react";

import { PLATFORM_MODE } from "@/config/platform";
import { getPaymentsReady } from "@/lib/admin.functions";
import { goLiveSteps, readyToGoLive } from "@/lib/go-live";
import { getOperatingLinks } from "@/lib/vision-links.functions";

/**
 * «جاهزية الاعتماد»: ما بقي قبل تحويل المنصّة من التجربة إلى الحقيقي. كلّ شرطٍ من
 * حال المنصّة الفعلية؛ والتحويل نفسه سطرٌ واحد في src/config/platform.ts.
 */
export function GoLiveReadiness({ published }: { published: number }) {
  const paymentsFn = useServerFn(getPaymentsReady);
  const { data: pay } = useQuery({ queryKey: ["payments-ready"], queryFn: () => paymentsFn() });
  const { data: links } = useQuery({
    queryKey: ["operating-links"],
    queryFn: () => getOperatingLinks(),
  });
  const steps = goLiveSteps({
    published,
    linked: new Set((links ?? []).map((l) => l.country)).size,
    payments: pay ? pay.ready : null,
  });
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
            جاهزية الاعتماد
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {live
              ? "المنصّة في الوضع الحقيقي."
              : "المنصّة في وضع التجربة: أزرار الكفالة العامّة تقود إلى /try."}
          </p>
        </div>
        <span
          className={
            live || ready
              ? "rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
              : "inline-flex items-center gap-1.5 rounded-full bg-bridge/12 px-3 py-1 text-xs font-bold text-bridge-ink"
          }
        >
          {!live && !ready && <FlaskConical className="size-3.5" aria-hidden="true" />}
          {live ? "حقيقي" : ready ? "جاهزة للتحويل" : "تجربة"}
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
                    : {s.done === true ? "متحقّق" : s.done === null ? "غير معروف" : "لم يتحقّق"}
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
          {ready
            ? 'الشروط متحقّقة. التحويل: PLATFORM_MODE = "live" في src/config/platform.ts، ثم النشر.'
            : "حين تتحقّق الشروط الثلاثة يصير التحويل سطراً واحداً في src/config/platform.ts."}
        </p>
      )}
    </section>
  );
}
