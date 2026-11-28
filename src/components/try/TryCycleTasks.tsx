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
import { defineCopy, useCopy } from "@/lib/locale";
import { loadGifts, TRY_EVENT } from "@/lib/try-demo";

const COPY = defineCopy("components/try/TryCycleTasks", {
  ar: {
    docs: {
      death_certificate: "شهادة وفاة الوالد",
      birth_certificate: "شهادة الميلاد",
      guardianship_proof: "إثبات الولاية",
      photo_consent: "موافقة الوليّ على الصورة",
    },
    who: { admin: "الإدارة", office: "المكتب" },
    adminEyebrow: "من الدورة الكاملة · ملفّ جهتك",
    file: (n: string) => `ملفّ «${n}»`,
    noFile: "لا ملفّ في الطابور بعد",
    orgFirst: "تُدخل الجهة الميدانية الملفّ ومستنداته أوّلاً، ثم يصل هنا.",
    asOrg: "ادخل بدور الجهة",
    verified: "موثّق",
    verify: "وثّق",
    verifiedLog: (d: string) => `وثّقت ${d}`,
    publishedLog: "اعتمدت الملفّ ونشرته",
    publish: "اعتمد وانشر في الدليل",
    published: "معتمد ومنشور: يراه الكافل الآن في الدليل",
    asSupporter: "افتحه بعين الكافل",
    officeEyebrow: "من الدورة الكاملة · تقرير المتابعة",
    report: (n: string) => `تقرير «${n}» الشهري`,
    noChild: "لا طفل في الدورة بعد",
    afterAdmin: "يصل هنا بعد أن تعتمد الإدارة الملفّ وينشر.",
    startOrg: "ابدأ بدور الجهة",
    approveAdmin: "اعتمده بدور الإدارة",
    waiting: "منشورٌ وينتظر كافلاً.",
    sponsor: "اكفله بدور الكافل",
    sent: "أُرسل: وصل إلى «أثري» عند الكافل",
    seeImpact: "شاهده في «أثري»",
    send: "أرسل تقرير الشهر الأوّل",
  },
  en: {
    docs: {
      death_certificate: "Father's death certificate",
      birth_certificate: "Birth certificate",
      guardianship_proof: "Proof of guardianship",
      photo_consent: "Guardian's photo consent",
    },
    who: { admin: "Administration", office: "Office" },
    adminEyebrow: "From the full cycle · your organization's file",
    file: (n: string) => `${n}'s file`,
    noFile: "No file in the queue yet",
    orgFirst:
      "The care organization enters the file and its documents first, then it arrives here.",
    asOrg: "Enter as the organization",
    verified: "Verified",
    verify: "Verify",
    verifiedLog: (d: string) => `verified ${d}`,
    publishedLog: "approved and published the file",
    publish: "Approve and publish to the directory",
    published: "Approved and published. The supporter can see it in the directory now.",
    asSupporter: "Open it as the supporter",
    officeEyebrow: "From the full cycle · follow-up report",
    report: (n: string) => `${n}'s monthly report`,
    noChild: "No child in the cycle yet",
    afterAdmin: "It arrives here once administration approves and publishes the file.",
    startOrg: "Start as the organization",
    approveAdmin: "Approve it as administration",
    waiting: "Published and waiting for a sponsor.",
    sponsor: "Sponsor as the supporter",
    sent: "Sent. It has reached the supporter's My impact.",
    seeImpact: "See it in My impact",
    send: "Send the first monthly report",
  },
});

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
  const t = useCopy(COPY);
  const { c, update } = useCycle();
  const name = c.child.name.trim();
  return (
    <section aria-labelledby="cycle-admin" className={card}>
      <p className="text-xs font-bold text-bridge-ink">{t.adminEyebrow}</p>
      <h3 id="cycle-admin" className="mt-1">
        {name ? t.file(name) : t.noFile}
      </h3>
      <div className="mt-3">
        {c.stage === "draft" ? (
          <Waiting text={t.orgFirst} to="/try/cycle" cta={t.asOrg} />
        ) : c.stage === "submitted" ? (
          <div className="space-y-3">
            <ul className="grid gap-2 sm:grid-cols-2">
              {CYCLE_DOCS.map((d) => (
                <li
                  key={d}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>{t.docs[d]}</span>
                  {c.docs[d].verified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-shore-thrive">
                      <FileCheck2 className="size-3.5" aria-hidden="true" />
                      {t.verified}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        update(
                          withLog(
                            { ...c, docs: { ...c.docs, [d]: { uploaded: true, verified: true } } },
                            t.who.admin,
                            t.verifiedLog(t.docs[d]),
                          ),
                        )
                      }
                    >
                      {t.verify}
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
                    t.who.admin,
                    t.publishedLog,
                  ),
                )
              }
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t.publish}
            </Button>
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-shore-thrive">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t.published}
            </span>
            <Link
              to="/try/$childId"
              params={{ childId: CYCLE_CHILD_ID }}
              className="inline-flex items-center gap-1 font-bold text-primary underline-offset-4 hover:underline"
            >
              {t.asSupporter}
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
  const t = useCopy(COPY);
  const { c, sponsored, update } = useCycle();
  const name = c.child.name.trim();
  if (c.stage !== "published") {
    const to = c.stage === "draft" ? "/try/cycle" : "/try/admin";
    return (
      <aside
        aria-labelledby="cycle-office"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
      >
        <span id="cycle-office" className="min-w-0 flex-1">
          <span className="font-bold text-bridge-ink">{t.officeEyebrow}</span> · {t.afterAdmin}
        </span>
        <Button asChild variant="outline" className="min-h-11">
          <Link to={to}>{c.stage === "draft" ? t.startOrg : t.approveAdmin}</Link>
        </Button>
      </aside>
    );
  }
  return (
    <section aria-labelledby="cycle-office" className={card}>
      <p className="text-xs font-bold text-bridge-ink">{t.officeEyebrow}</p>
      <h3 id="cycle-office" className="mt-1">
        {name ? t.report(name) : t.noChild}
      </h3>
      <div className="mt-3">
        {c.stage !== "published" ? (
          <Waiting
            text={t.afterAdmin}
            to={c.stage === "draft" ? "/try/cycle" : "/try/admin"}
            cta={c.stage === "draft" ? t.startOrg : t.approveAdmin}
          />
        ) : !sponsored ? (
          <p className="text-sm leading-7 text-muted-foreground">
            {t.waiting}{" "}
            <Link
              to="/try/$childId"
              params={{ childId: CYCLE_CHILD_ID }}
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              {t.sponsor}
            </Link>
          </p>
        ) : c.reportSent ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-shore-thrive">
              <ScrollText className="size-4" aria-hidden="true" />
              {t.sent}
            </span>
            <Link
              to="/try/impact"
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              {t.seeImpact}
            </Link>
          </p>
        ) : (
          <Button onClick={() => update(withLog({ ...c, reportSent: true }, t.who.office, t.send))}>
            <ScrollText className="size-4" aria-hidden="true" />
            {t.send}
          </Button>
        )}
      </div>
    </section>
  );
}
