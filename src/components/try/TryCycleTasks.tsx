import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileCheck2, ScrollText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  allVerified,
  CYCLE_CHILD_ID,
  CYCLE_DOCS,
  CYCLE_EVENT,
  emptyCycle,
  loadCycle,
  saveCycle,
  withLog,
  type Cycle,
} from "@/lib/try-cycle";
import { loadGifts, TRY_EVENT } from "@/lib/try-demo";

const DOC: Record<(typeof CYCLE_DOCS)[number], string> = {
  death_certificate: "شهادة وفاة الوالد",
  birth_certificate: "شهادة الميلاد",
  guardianship_proof: "إثبات الولاية",
  photo_consent: "موافقة الوليّ على الصورة",
};

/** حال «الدورة الكاملة» وكفالتها، تُقرأ من الجلسة وتتجدّد بأيّ تغيير في أيّ دور */
export function useCycle() {
  const [c, setC] = useState<Cycle>(emptyCycle);
  const [sponsored, setSponsored] = useState(false);
  useEffect(() => {
    const read = () => {
      setC(loadCycle());
      setSponsored(loadGifts().some((g) => g.childId === CYCLE_CHILD_ID));
    };
    read();
    window.addEventListener(CYCLE_EVENT, read);
    window.addEventListener(TRY_EVENT, read);
    return () => {
      window.removeEventListener(CYCLE_EVENT, read);
      window.removeEventListener(TRY_EVENT, read);
    };
  }, []);
  return { c, sponsored, update: (next: Cycle) => (setC(next), saveCycle(next)) };
}

const card =
  "rounded-2xl border border-bridge/60 bg-bridge/8 p-5 shadow-soft [&_h3]:text-lg [&_h3]:font-bold";

function Waiting({
  text,
  to,
  cta,
}: {
  text: string;
  to: "/try/cycle" | "/try/admin";
  cta: string;
}) {
  return (
    <p className="text-sm leading-7 text-muted-foreground">
      {text}{" "}
      <Link to={to} className="font-bold text-primary underline-offset-4 hover:underline">
        {cta}
      </Link>
    </p>
  );
}

/**
 * مهمّة الإدارة من الدورة: ملفّ الجهة في الطابور، تُوثَّق مستنداته واحداً واحداً ثم يُعتمد ويُنشر.
 * الحال نفسها التي تقرؤها صفحة الدورة والدليل: ما يُوثَّق هنا يظهر هناك.
 */
export function CycleAdminTask() {
  const { c, update } = useCycle();
  const name = c.child.name.trim();
  return (
    <section aria-labelledby="cycle-admin" className={card}>
      <p className="text-xs font-bold text-bridge-ink">من الدورة الكاملة · ملفّ جهتك</p>
      <h3 id="cycle-admin" className="mt-1">
        {name ? `ملفّ «${name}»` : "لا ملفّ في الطابور بعد"}
      </h3>
      <div className="mt-3">
        {c.stage === "draft" ? (
          <Waiting
            text="تُدخل الجهة الميدانية الملفّ ومستنداته أوّلاً، ثم يصل هنا."
            to="/try/cycle"
            cta="ادخل بدور الجهة"
          />
        ) : c.stage === "submitted" ? (
          <div className="space-y-3">
            <ul className="grid gap-2 sm:grid-cols-2">
              {CYCLE_DOCS.map((d) => (
                <li
                  key={d}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>{DOC[d]}</span>
                  {c.docs[d].verified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-shore-thrive">
                      <FileCheck2 className="size-3.5" aria-hidden="true" />
                      موثّق
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        update(
                          withLog(
                            { ...c, docs: { ...c.docs, [d]: { uploaded: true, verified: true } } },
                            "الإدارة",
                            `وثّقت ${DOC[d]}`,
                          ),
                        )
                      }
                    >
                      وثّق
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Button
              disabled={!allVerified(c)}
              onClick={() =>
                update(
                  withLog(
                    { ...c, stage: "published", publishedAt: new Date().toISOString() },
                    "الإدارة",
                    "اعتمدت الملفّ ونشرته",
                  ),
                )
              }
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              اعتمد وانشر في الدليل
            </Button>
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-shore-thrive">
              <ShieldCheck className="size-4" aria-hidden="true" />
              معتمد ومنشور — يراه الكافل الآن في الدليل
            </span>
            <Link
              to="/try/$childId"
              params={{ childId: CYCLE_CHILD_ID }}
              className="inline-flex items-center gap-1 font-bold text-primary underline-offset-4 hover:underline"
            >
              افتحه بعين الكافل
              <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

/** مهمّة المكتب من الدورة: بعد الكفالة يُرسل تقرير الشهر الأوّل، فيظهر في «أثري» عند الكافل. */
export function CycleOfficeTask() {
  const { c, sponsored, update } = useCycle();
  const name = c.child.name.trim();
  return (
    <section aria-labelledby="cycle-office" className={card}>
      <p className="text-xs font-bold text-bridge-ink">من الدورة الكاملة · تقرير المتابعة</p>
      <h3 id="cycle-office" className="mt-1">
        {name ? `تقرير «${name}» الشهري` : "لا طفل في الدورة بعد"}
      </h3>
      <div className="mt-3">
        {c.stage !== "published" ? (
          <Waiting
            text="يصل هنا بعد أن تعتمد الإدارة الملفّ وينشر."
            to={c.stage === "draft" ? "/try/cycle" : "/try/admin"}
            cta={c.stage === "draft" ? "ابدأ بدور الجهة" : "اعتمده بدور الإدارة"}
          />
        ) : !sponsored ? (
          <p className="text-sm leading-7 text-muted-foreground">
            منشورٌ وينتظر كافلاً.{" "}
            <Link
              to="/try/$childId"
              params={{ childId: CYCLE_CHILD_ID }}
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              اكفله بدور الكافل
            </Link>
          </p>
        ) : c.reportSent ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-shore-thrive">
              <ScrollText className="size-4" aria-hidden="true" />
              أُرسل — وصل إلى «أثري» عند الكافل
            </span>
            <Link
              to="/try/impact"
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              شاهده في «أثري»
            </Link>
          </p>
        ) : (
          <Button
            onClick={() =>
              update(withLog({ ...c, reportSent: true }, "المكتب", "أرسل تقرير الشهر الأوّل"))
            }
          >
            <ScrollText className="size-4" aria-hidden="true" />
            أرسل تقرير الشهر الأوّل
          </Button>
        )}
      </div>
    </section>
  );
}
