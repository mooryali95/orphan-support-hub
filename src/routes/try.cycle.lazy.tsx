import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  FileCheck2,
  FileUp,
  HandHeart,
  Heart,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { TryChildCard } from "@/components/try/TryChildCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { countryName } from "@/lib/countries";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { loadGifts, TRY_CURRENCY, TRY_EVENT } from "@/lib/try-demo";
import {
  allUploaded,
  allVerified,
  CYCLE_CHILD_ID,
  CYCLE_DOCS,
  CYCLE_EVENT,
  cycleChild,
  emptyCycle,
  loadCycle,
  saveCycle,
  withLog,
  type Cycle,
  type CycleDoc,
} from "@/lib/try-cycle";
import { cn } from "@/lib/utils";

const COUNTRIES = ["SN", "AL", "EG", "KE", "BA", "ID"] as const;

const COPY = defineCopy("routes/try.cycle", {
  ar: {
    eyebrow: "العرض التفاعلي",
    title: "الدورة الكاملة",
    lead: "ملفّ طفلٍ واحد تراه ينتقل عبر كلّ الأدوار: جهة الرعاية تُدخله، والإدارة توثّقه وتعتمده، فيُنشر في الدليل، فيكفله داعم، فيصل تقرير الشهر الأوّل. الخطوات نفسها في المنصّة الحقيقية — بلا انتظارٍ ولا خادم.",
    restart: "ابدأ الدورة من جديد",
    roles: {
      org: "جهة الرعاية",
      admin: "الإدارة",
      directory: "الدليل",
      supporter: "الكافل",
      office: "المكتب",
    },
    steps: [
      "إدخال الملفّ ومستنداته",
      "التوثيق والاعتماد",
      "النشر في الدليل",
      "الكفالة",
      "تقرير الشهر الأوّل",
    ],
    name: "اسم الطفل (مستعار في العرض)",
    age: "العمر",
    country: "الدولة",
    need: "الحاجة الشهرية",
    story: "ما تغطّيه الكفالة",
    storyHint: "مثال: الدراسة والغذاء والرعاية الصحية",
    docs: {
      death_certificate: "شهادة وفاة الوالد",
      birth_certificate: "شهادة الميلاد",
      guardianship_proof: "إثبات الولاية",
      photo_consent: "موافقة الوليّ على الصورة",
    } satisfies Record<CycleDoc, string>,
    upload: "ارفع",
    uploaded: "رُفع",
    submit: "أرسل الملفّ للمراجعة",
    submitHint: "يُرسل حين يكتمل الاسم وتُرفع المستندات الأربعة.",
    queued: "وصل الملفّ إلى «طابور الاعتماد» لدى الإدارة.",
    verify: "وثّق",
    verified: "موثّق",
    approve: "اعتمد وانشر في الدليل",
    approveHint: "يُعتمد حين تُوثَّق المستندات كلّها — كما في المنصّة الحقيقية.",
    published: "نُشر الملفّ في الدليل بشارة «ملف موثّق».",
    openFile: "افتح ملفّه وادعمه",
    findInDirectory: "ستجده أيضاً أوّل «دليل التجربة».",
    waitingSponsor: "بانتظار كافل — افتح ملفّه واختر المبلغ.",
    sponsored: (a: string) => `كُفل الطفل: ${a} شهرياً. وصل الإشعار للمكتب والجهة.`,
    sendReport: "أرسل تقرير الشهر الأوّل",
    reportSent: "وصل التقرير إلى «أثري» عند الكافل، ومعه مستند التسليم.",
    toImpact: "افتح «أثري» عند الكافل",
    toHall: "شاهده في قاعة الأثر",
    locked: "تُفتح بعد الخطوة السابقة.",
    audit: "سجلّ التدقيق",
    auditNone: "لا شيء بعد.",
    who: {
      org: "جهة الرعاية",
      admin: "الإدارة",
      supporter: "الكافل",
      office: "المكتب",
    },
    what: {
      upload: (d: string) => `رفعت ${d}`,
      submit: "أرسلت الملفّ للمراجعة",
      verify: (d: string) => `وثّقت ${d}`,
      publish: "اعتمدت الملفّ ونشرته",
      sponsor: "كفل الطفل",
      report: "أرسل تقرير الشهر الأوّل",
    },
  },
  en: {
    eyebrow: "Interactive demo",
    title: "The full cycle",
    lead: "One child's file moving through every role: the care organization enters it, the administration verifies and approves it, it is published in the directory, a supporter sponsors it, and the first monthly report arrives. The same steps as the real platform, without waiting or a server.",
    restart: "Restart the cycle",
    roles: {
      org: "Care organization",
      admin: "Administration",
      directory: "Directory",
      supporter: "Supporter",
      office: "Office",
    },
    steps: [
      "Enter the file and its documents",
      "Verify and approve",
      "Publish in the directory",
      "Sponsorship",
      "First monthly report",
    ],
    name: "Child's name (pseudonym in the demo)",
    age: "Age",
    country: "Country",
    need: "Monthly need",
    story: "What the sponsorship covers",
    storyHint: "e.g. schooling, food and healthcare",
    docs: {
      death_certificate: "Parent's death certificate",
      birth_certificate: "Birth certificate",
      guardianship_proof: "Proof of guardianship",
      photo_consent: "Guardian's photo consent",
    } satisfies Record<CycleDoc, string>,
    upload: "Upload",
    uploaded: "Uploaded",
    submit: "Send the file for review",
    submitHint: "Sends once the name is filled and all four documents are uploaded.",
    queued: "The file reached the administration's approval queue.",
    verify: "Verify",
    verified: "Verified",
    approve: "Approve and publish",
    approveHint: "Approval needs every document verified, as on the real platform.",
    published: "The file is published in the directory with a 'documented file' badge.",
    openFile: "Open the file and sponsor",
    findInDirectory: "It is also first in the trial directory.",
    waitingSponsor: "Waiting for a sponsor: open the file and choose an amount.",
    sponsored: (a: string) =>
      `Sponsored: ${a} a month. The office and the organization were notified.`,
    sendReport: "Send the first monthly report",
    reportSent: "The report reached the supporter's My impact, with its delivery document.",
    toImpact: "Open the supporter's My impact",
    toHall: "See it in the impact hall",
    locked: "Opens after the previous step.",
    audit: "Audit log",
    auditNone: "Nothing yet.",
    who: {
      org: "Care organization",
      admin: "Administration",
      supporter: "Supporter",
      office: "Office",
    },
    what: {
      upload: (d: string) => `uploaded ${d}`,
      submit: "sent the file for review",
      verify: (d: string) => `verified ${d}`,
      publish: "approved and published the file",
      sponsor: "sponsored the child",
      report: "sent the first monthly report",
    },
  },
});

export const Route = createLazyFileRoute("/try/cycle")({ component: CyclePage });

function CyclePage() {
  const t = useCopy(COPY);
  const locale = useLocale();
  const [c, setC] = useState<Cycle>(emptyCycle);
  const [gift, setGift] = useState<{ amount: number } | null>(null);

  useEffect(() => {
    const read = () => {
      setC(loadCycle());
      setGift(loadGifts().find((g) => g.childId === CYCLE_CHILD_ID) ?? null);
    };
    read();
    window.addEventListener(CYCLE_EVENT, read);
    window.addEventListener(TRY_EVENT, read);
    return () => {
      window.removeEventListener(CYCLE_EVENT, read);
      window.removeEventListener(TRY_EVENT, read);
    };
  }, []);

  // الكفالة تحدث في صفحة الطفل (مسار التجربة نفسه)؛ هنا تُسجَّل في سجلّ الدورة مرّة.
  useEffect(() => {
    if (gift && !c.log.some((l) => l.what === t.what.sponsor)) {
      saveCycle(withLog(c, t.who.supporter, t.what.sponsor));
    }
  }, [gift, c, t]);

  const update = (next: Cycle) => {
    setC(next);
    saveCycle(next);
  };

  const published = c.stage === "published";
  const child = cycleChild(c);
  const step = !published ? (c.stage === "draft" ? 0 : 1) : !gift ? 3 : c.reportSent ? 5 : 4;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="try-rise text-center">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="mt-4 text-4xl leading-[1.3] font-bold md:text-5xl">{t.title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{t.lead}</p>
      </header>

      <ol className="mt-10 grid grid-cols-5 gap-2" aria-label={t.title}>
        {t.steps.map((label, i) => (
          <li key={label} className="flex flex-col items-center gap-2 text-center">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full border-2 text-sm font-bold transition-colors",
                i < step && "border-bridge bg-bridge text-white",
                i === step && "border-primary bg-primary text-primary-foreground",
                i > step && "border-border bg-background text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className="text-xs leading-5 font-bold text-muted-foreground sm:text-sm">
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          {/* ١. جهة الرعاية */}
          <Stage
            icon={<Building2 />}
            role={t.roles.org}
            title={t.steps[0]!}
            done={c.stage !== "draft"}
            active={c.stage === "draft"}
          >
            {c.stage === "draft" ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.name}>
                    <Input
                      value={c.child.name}
                      onChange={(e) =>
                        update({ ...c, child: { ...c.child, name: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label={t.country}>
                    <select
                      value={c.child.co}
                      onChange={(e) => update({ ...c, child: { ...c.child, co: e.target.value } })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {COUNTRIES.map((co) => (
                        <option key={co} value={co}>
                          {countryName(co, locale)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.age}>
                    <Input
                      type="number"
                      min={3}
                      max={17}
                      value={c.child.age}
                      onChange={(e) =>
                        update({ ...c, child: { ...c.child, age: Number(e.target.value) || 9 } })
                      }
                    />
                  </Field>
                  <Field label={`${t.need} (${TRY_CURRENCY})`}>
                    <Input
                      type="number"
                      min={40}
                      step={10}
                      value={c.child.need}
                      onChange={(e) =>
                        update({ ...c, child: { ...c.child, need: Number(e.target.value) || 120 } })
                      }
                    />
                  </Field>
                </div>
                <Field label={t.story}>
                  <Textarea
                    rows={2}
                    placeholder={t.storyHint}
                    value={c.child.story}
                    onChange={(e) => update({ ...c, child: { ...c.child, story: e.target.value } })}
                  />
                </Field>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {CYCLE_DOCS.map((d) => (
                    <li
                      key={d}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    >
                      <span>{t.docs[d]}</span>
                      {c.docs[d].uploaded ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-shore-thrive">
                          <Check className="size-3.5" aria-hidden="true" />
                          {t.uploaded}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            update(
                              withLog(
                                {
                                  ...c,
                                  docs: { ...c.docs, [d]: { uploaded: true, verified: false } },
                                },
                                t.who.org,
                                t.what.upload(t.docs[d]),
                              ),
                            )
                          }
                        >
                          <FileUp className="size-4" aria-hidden="true" />
                          {t.upload}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <div>
                  <Button
                    size="lg"
                    disabled={!c.child.name.trim() || !allUploaded(c)}
                    onClick={() =>
                      update(withLog({ ...c, stage: "submitted" }, t.who.org, t.what.submit))
                    }
                  >
                    {t.submit}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">{t.submitHint}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {c.child.name} · {countryName(c.child.co, locale)} · {c.child.age} ·{" "}
                {formatMoney(c.child.need, TRY_CURRENCY, locale)}
              </p>
            )}
          </Stage>

          {/* ٢. الإدارة */}
          <Stage
            icon={<ShieldCheck />}
            role={t.roles.admin}
            title={t.steps[1]!}
            done={published}
            active={c.stage === "submitted"}
            locked={c.stage === "draft"}
            lockedText={t.locked}
          >
            {c.stage === "submitted" ? (
              <div className="space-y-4">
                <p className="text-sm">{t.queued}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {CYCLE_DOCS.map((d) => (
                    <li
                      key={d}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm"
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
                                {
                                  ...c,
                                  docs: { ...c.docs, [d]: { uploaded: true, verified: true } },
                                },
                                t.who.admin,
                                t.what.verify(t.docs[d]),
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
                <div>
                  <Button
                    size="lg"
                    disabled={!allVerified(c)}
                    onClick={() =>
                      update(
                        withLog(
                          { ...c, stage: "published", publishedAt: new Date().toISOString() },
                          t.who.admin,
                          t.what.publish,
                        ),
                      )
                    }
                  >
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    {t.approve}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">{t.approveHint}</p>
                </div>
              </div>
            ) : published ? (
              <p className="text-sm text-muted-foreground">{t.published}</p>
            ) : null}
          </Stage>

          {/* ٣. الدليل */}
          <Stage
            icon={<Sparkles />}
            role={t.roles.directory}
            title={t.steps[2]!}
            done={Boolean(gift)}
            active={published && !gift}
            locked={!published}
            lockedText={t.locked}
          >
            {child && (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-center">
                <TryChildCard child={child} />
                <div className="space-y-3 text-sm">
                  <p>{t.published}</p>
                  <Button asChild size="lg">
                    <Link to="/try/$childId" params={{ childId: CYCLE_CHILD_ID }}>
                      <HandHeart className="size-4" aria-hidden="true" />
                      {t.openFile}
                    </Link>
                  </Button>
                  <p className="text-xs text-muted-foreground">{t.findInDirectory}</p>
                </div>
              </div>
            )}
          </Stage>

          {/* ٤. الكفالة */}
          <Stage
            icon={<Heart />}
            role={t.roles.supporter}
            title={t.steps[3]!}
            done={Boolean(gift)}
            active={published && !gift}
            locked={!published}
            lockedText={t.locked}
          >
            {published && (
              <p className="text-sm">
                {gift
                  ? t.sponsored(formatMoney(gift.amount, TRY_CURRENCY, locale))
                  : t.waitingSponsor}
              </p>
            )}
          </Stage>

          {/* ٥. المكتب */}
          <Stage
            icon={<ScrollText />}
            role={t.roles.office}
            title={t.steps[4]!}
            done={Boolean(c.reportSent)}
            active={Boolean(gift) && !c.reportSent}
            locked={!gift}
            lockedText={t.locked}
          >
            {gift &&
              (c.reportSent ? (
                <div className="space-y-3 text-sm">
                  <p>{t.reportSent}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link to="/try/impact">{t.toImpact}</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/hall" search={{ try: 1 }}>
                        {t.toHall}
                        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="lg"
                  onClick={() =>
                    update(withLog({ ...c, reportSent: true }, t.who.office, t.what.report))
                  }
                >
                  <ScrollText className="size-4" aria-hidden="true" />
                  {t.sendReport}
                </Button>
              ))}
          </Stage>
        </div>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <div className="brand-rule mb-4 h-[3px] w-10 rounded-full" aria-hidden="true" />
          <h2 className="font-bold">{t.audit}</h2>
          {c.log.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t.auditNone}</p>
          ) : (
            <ol className="mt-3 space-y-2.5 text-sm">
              {c.log.map((l) => (
                <li
                  key={`${l.at}-${l.what}`}
                  className="border-s-2 border-bridge/60 ps-3 leading-6"
                >
                  <span className="font-bold">{l.who}</span> {l.what}
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {new Date(l.at).toLocaleTimeString(locale, { numberingSystem: "latn" })}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 w-full"
            onClick={() => update(emptyCycle())}
          >
            {t.restart}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Stage({
  icon,
  role,
  title,
  done,
  active,
  locked = false,
  lockedText,
  children,
}: {
  icon: React.ReactNode;
  role: string;
  title: string;
  done: boolean;
  active: boolean;
  locked?: boolean;
  lockedText?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-5 transition-colors sm:p-6",
        active ? "border-primary/50 shadow-sm" : "border-border",
        locked && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-full [&>svg]:size-5",
            done ? "bg-bridge text-white" : "bg-primary/10 text-primary",
          )}
          aria-hidden="true"
        >
          {done ? <Check /> : icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-bridge-ink">{role}</p>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
      </div>
      <div className="mt-4">
        {locked ? <p className="text-sm text-muted-foreground">{lockedText}</p> : children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      {children}
    </label>
  );
}
