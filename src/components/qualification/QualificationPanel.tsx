import { CircleCheck, Circle, ShieldCheck, UserCheck, ArrowDownLeft } from "lucide-react";

import { QUALIFICATION_JOURNEY, stageReached } from "@/lib/qualification.functions";
import type { PublicQualification } from "@/integrations/supabase/types.extra";
import { formatMoney } from "@/lib/format";
import { LEVEL_LABELS } from "@/lib/supervisor.functions";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  foundational: "المستوى التأسيسي",
  applied: "المستوى التطبيقي",
  advanced: "المستوى المتقدّم",
};

/**
 * لوحة بناء الأهلية في ملفّ اليتيم.
 *
 * تعرض ما اشتُرِي وأين وصل: المفهوم والسمة المستهدفة، والمدخلات
 * والعمليات والمخرجات، ورحلة التشغيل الست.
 *
 * ولا تعرض خريطة السمات ولا السمة الجوهرية: تلك حكمٌ على طفل لا أثرٌ
 * يُعرض على غريب — والقاعدة نفسها لا تُرجعها أصلاً في العرض العام.
 */
export function QualificationPanel({ programs }: { programs: PublicQualification[] }) {
  if (programs.length === 0) return null;

  return (
    <section className="space-y-6" aria-labelledby="qualification-heading">
      <div>
        <h2 id="qualification-heading" className="text-xl font-extrabold">
          بناء الأهلية
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          الكفالة هنا اشتراكٌ في بناء أهليّة هذا الطفل، لا سدُّ احتياجٍ شهري.
          <span className="mt-1 block font-medium text-foreground">
            الأهلية = القدرة على تفهّم الخطاب + اكتساب الفعل.
          </span>
        </p>
      </div>

      {programs.map((p) => (
        <article key={p.enrollment_id} className="rounded-2xl border border-border bg-card p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">{p.program}</h3>
              {p.level && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {LEVEL_LABEL[p.level] ?? p.level}
                </p>
              )}
            </div>
            <p className="text-sm font-bold text-primary">
              {formatMoney(p.monthly_price, p.currency)}
              <span className="font-normal text-muted-foreground"> / شهرياً</span>
            </p>
          </header>

          <p className="mt-3 text-sm leading-7 text-muted-foreground">{p.summary}</p>

          {/* المفهوم والسمة — «المفهوم وسيلة، والسمة غاية» */}
          {(p.concept || p.target_trait) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              {p.concept && (
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-[11px] font-bold tracking-widest text-muted-foreground">
                    المفهوم — ما نُعلِّمه
                  </p>
                  <p className="mt-1 font-bold text-shore-need">{p.concept}</p>
                  {p.concept_intent && (
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {p.concept_intent}
                    </p>
                  )}
                </div>
              )}
              <ArrowDownLeft
                className="mx-auto hidden size-5 shrink-0 text-bridge sm:block"
                aria-hidden="true"
              />
              {p.target_trait && (
                <div className="rounded-xl bg-shore-thrive/10 p-4">
                  <p className="text-[11px] font-bold tracking-widest text-muted-foreground">
                    السمة — ما نريد أن نبنيه
                  </p>
                  <p className="mt-1 font-bold text-shore-thrive">{p.target_trait}</p>
                  {p.target_trait_summary && (
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {p.target_trait_summary}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* رحلة التشغيل */}
          <div className="mt-6">
            <p className="text-[11px] font-bold tracking-widest text-muted-foreground">
              رحلة التشغيل
            </p>
            <ol className="mt-3 space-y-0">
              {QUALIFICATION_JOURNEY.map((step, i) => {
                const done = stageReached(p.stage, step.stage);
                const current = p.stage === step.stage;
                const last = i === QUALIFICATION_JOURNEY.length - 1;
                return (
                  <li key={step.stage} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {done ? (
                        <CircleCheck
                          className={cn(
                            "size-5 shrink-0",
                            current ? "text-bridge-ink" : "text-shore-thrive",
                          )}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle className="size-5 shrink-0 text-border" aria-hidden="true" />
                      )}
                      {!last && (
                        <span
                          className={cn("w-px flex-1", done ? "bg-shore-thrive/40" : "bg-border")}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className={cn("pb-5", last && "pb-0")}>
                      <p
                        className={cn(
                          "text-sm font-bold",
                          done ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {step.label}
                        {current && (
                          <span className="ms-2 rounded-full bg-bridge/15 px-2 py-0.5 text-[11px] font-medium text-bridge-ink">
                            المرحلة الحالية
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
                        {step.question}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* ورش الجلسات — عدداً لا مضموناً: ما سلّمه الطفل وملاحظات مشرفه
              عليه من جنس الدرجات، حكمٌ عليه لا أثرٌ يُعرض على غريب. */}
          {typeof p.units_total === "number" && p.units_total > 0 && (
            <div className="mt-6 rounded-xl bg-secondary/50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold tracking-widest text-muted-foreground">
                  ورش الجلسات
                </p>
                <p className="text-sm font-bold">
                  <span className="text-shore-thrive">{p.units_accepted ?? 0}</span> من{" "}
                  {p.units_total} مقبولة
                </p>
              </div>
              <ol
                className="mt-3 flex gap-1"
                aria-label={`${p.units_accepted ?? 0} من ${p.units_total} جلسة مقبولة`}
              >
                {Array.from({ length: p.units_total }, (_, i) => (
                  <li
                    key={i}
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i < (p.units_accepted ?? 0) ? "bg-shore-thrive" : "bg-border",
                    )}
                  />
                ))}
              </ol>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                لا تُقبل جلسةٌ إلا بمخرَجٍ يُقوّمه مشرفٌ معتمَد، ولا تُقبل قبل قبول ما دونها. وما
                سلّمه الطفل لا يُعرض: يعنيك أنه بُني، لا ما كتبه.
              </p>
            </div>
          )}

          {/* المدخلات والعمليات والمخرجات */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Column title="المدخلات" items={p.inputs} tone="text-shore-need" />
            <Column title="العمليات" items={p.processes} tone="text-bridge-ink" />
            <Column title="المخرجات" items={p.deliverables} tone="text-shore-thrive" />
          </div>

          {/* الضمانتان — وجودهما لا أسماء أصحابهما */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-4">
            <Guarantee
              ok={p.has_consent}
              icon={ShieldCheck}
              yes="إذن الولي أو الوصي موثَّق"
              no="بانتظار توثيق إذن الولي"
            />
            <Guarantee
              ok={p.has_supervisor}
              icon={UserCheck}
              yes="مشرف معتمَد مُسنَد"
              no="بانتظار إسناد مشرف"
            />
          </div>

          {/* أهلية المشرف — ثقة الكافل في البرنامج ثقةٌ في مَن يحمله */}
          {p.supervisor?.assigned && (
            <div className="mt-4 rounded-xl bg-secondary/50 p-4">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground">
                أهلية المشرف
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-shore-need">
                  المستوى {LEVEL_LABELS[p.supervisor.level]}
                </span>
                {p.supervisor.independent ? (
                  <span className="rounded-full bg-shore-thrive/12 px-2.5 py-1 text-xs font-medium text-shore-thrive">
                    مشرف مستقلّ
                  </span>
                ) : (
                  <span className="rounded-full bg-bridge-bright/12 px-2.5 py-1 text-xs font-medium text-bridge-ink">
                    قيد التأهيل — إشرافه مقرونٌ بمتابعة الإدارة
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                لا يُسنَد الإشراف إلا لمعتمَدٍ من الإدارة — لا من جهة الرعاية. واسمه لا يُعرض: ما
                يعنيك أنه مؤهَّل، لا مَن هو.
              </p>
            </div>
          )}

          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            قياس السمات يبقى بين الطفل ومشرفه وجهة رعايته — لا يُعرض هنا صوناً لكرامته. وكذلك رقم
            مؤشّر المشرف: قاعدةٌ تُطبَّق على الطفل وتُخرَق على مشرفه قاعدةٌ ضعيفة.
          </p>
        </article>
      ))}
    </section>
  );
}

function Column({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={cn("text-[11px] font-bold tracking-widest", tone)}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-6 text-muted-foreground">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-bridge" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Guarantee({
  ok,
  icon: Icon,
  yes,
  no,
}: {
  ok: boolean;
  icon: typeof ShieldCheck;
  yes: string;
  no: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        ok ? "bg-shore-thrive/12 text-shore-thrive" : "bg-bridge-bright/12 text-bridge-ink",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {ok ? yes : no}
    </span>
  );
}
