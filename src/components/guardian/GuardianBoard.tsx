import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { PanelSkeleton } from "@/components/admin/PanelState";
import { Failed } from "@/components/admin/overview/parts";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { GuardianChildCard } from "@/components/guardian/GuardianChildCard";
import { Name } from "@/components/kit/Name";
import { Badge } from "@/components/ui/badge";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatMoney, fundingPercent, isolate } from "@/lib/format";
import { getGuardianChildren } from "@/lib/guardian.functions";
import { readLang, saveLang, type Lang } from "@/lib/i18n";
import { getGuardianWorkspace } from "@/lib/impact.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

export const GUARDIAN_COPY = defineCopy("components/guardian/GuardianBoard", {
  ar: {
    title: "مساحة ولي الأمر",
    intro: "أين وصل من ترعاهم، وما المطلوب منك.",
    langGroup: "لغة بطاقات الأطفال",
    childrenH: "من ترعاهم",
    filesH: "الملفّات وتغطيتها",
    emptyH: "لا ملفات مرتبطة بحسابك",
    emptyP:
      "تربط الإدارة حسابك بملف من تحت رعايتك بعد التحقّق من الوصاية. راجع الجهة الميدانية التي رفعت الملفّ.",
    failed: "تعذّرت قراءة ملفّاتك",
    failedText: "الملفّات غائبة الآن، وليست فارغة.",
    retry: "أعد المحاولة",
    monthly: (funded: string, need: string) => `${funded} من ${need} شهرياً`,
    coverage: (name: string) => `تغطية احتياج ${name} الشهري`,
    status: {
      draft: "مسودة",
      submitted: "بانتظار المراجعة",
      under_review: "قيد المراجعة",
      approved: "معتمد",
      rejected: "مرفوض",
      fully_sponsored: "مكفول بالكامل",
      archived: "مؤرشف",
    } as Record<string, string>,
  },
  en: {
    title: "Guardian space",
    intro: "Where the children in your care stand, and what is asked of you.",
    langGroup: "Language of the child cards",
    childrenH: "Children in your care",
    filesH: "Files and their coverage",
    emptyH: "No files linked to your account",
    emptyP:
      "The administration links your account to a file in your care after verifying guardianship. Contact the field organization that uploaded the file.",
    failed: "Your files could not be read",
    failedText: "The files are missing right now, not empty.",
    retry: "Try again",
    monthly: (funded: string, need: string) => `${funded} of ${need} monthly`,
    coverage: (name: string) => `Coverage of ${name}'s monthly need`,
    status: {
      draft: "Draft",
      submitted: "Awaiting review",
      under_review: "Under review",
      approved: "Approved",
      rejected: "Rejected",
      fully_sponsored: "Fully sponsored",
      archived: "Archived",
    } as Record<string, string>,
  },
});

/**
 * مساحة ولي الأمر: بطاقات من يرعاهم وتغطية ملفّاتهم. تقرأ عبر منفذ البيانات، فيرسمها
 * العرض التفاعلي ببطاقاتٍ خيالية والصفحة الحقيقية من الخادم. لا شيء هنا عن الكفلاء:
 * من يكفل وبكم علاقةٌ بين الكافل والمنصّة، وكشفها لولي الأمر يُنشئ التزاماً لم يطلبه أحد.
 */
export function GuardianBoard({
  shell,
  extras,
}: {
  shell: (p: { title: string; description: string; children: ReactNode }) => ReactNode;
  /** ما يُرسم تحت بطاقة الملفّ في الصفحة الحقيقية وحدها (الأثر)؛ يغيب في العرض. */
  extras?: (o: { id: string; display_name: string }) => ReactNode;
}) {
  const c = useCopy(GUARDIAN_COPY);
  const locale = useLocale();
  const uiLang: Lang = locale === "ar" ? "ar" : "en";
  const fetchWorkspace = useDataFn("guardian.workspace", getGuardianWorkspace);
  const fetchChildren = useDataFn("guardian.children", getGuardianChildren);
  const ws = useQuery({
    queryKey: useDataKey(["guardian-workspace"]),
    queryFn: () => fetchWorkspace(),
  });
  const kids = useQuery({
    queryKey: useDataKey(["guardian-children"]),
    queryFn: () => fetchChildren(),
  });
  const [lang, setLang] = useState<Lang>(uiLang);
  // المحفوظ يُقبل إن كان بين ما يُعرض (لغة الواجهة أو الألبانية)، وإلّا فلغة الواجهة:
  // عربيةٌ محفوظة لا تُبقي البطاقة عربيةً في واجهةٍ إنجليزية بلا زرٍّ يعيدها.
  useEffect(() => {
    const saved = readLang(uiLang);
    setLang(saved === uiLang || saved === "sq" ? saved : uiLang);
  }, [uiLang]);

  const children = kids.data ?? [];
  const orphans = ws.data?.orphans ?? [];
  const failed = ws.isError || kids.isError || ws.data?.ok === false;

  return shell({
    title: c.title,
    description: c.intro,
    children: (
      <>
        <div className="mb-6 flex justify-end">
          <div
            role="group"
            aria-label={c.langGroup}
            className="flex rounded-md border border-input p-1 text-sm"
          >
            {([uiLang, "sq"] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => {
                  setLang(l);
                  saveLang(l);
                }}
                className={
                  lang === l
                    ? "min-h-11 rounded bg-primary px-4 text-primary-foreground"
                    : "min-h-11 px-4"
                }
              >
                {l === "ar" ? "العربية" : l === "en" ? "English" : "Shqip"}
              </button>
            ))}
          </div>
        </div>

        {ws.isPending || kids.isPending ? (
          <PanelSkeleton shape="cards" count={2} />
        ) : failed ? (
          <Failed
            title={c.failed}
            text={c.failedText}
            retry={c.retry}
            onRetry={() => {
              void ws.refetch();
              void kids.refetch();
            }}
          />
        ) : children.length === 0 && orphans.length === 0 ? (
          <div
            data-panel-state="empty"
            className="rounded-3xl border border-dashed border-border bg-card p-12 text-center"
          >
            <Users className="mx-auto size-8 text-bridge" aria-hidden="true" />
            <p className="mt-4 font-medium">{c.emptyH}</p>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.emptyP}</p>
          </div>
        ) : (
          <>
            {children.length > 0 && (
              <section aria-label={c.childrenH} className="mb-8 space-y-4">
                {children.map((ch) => (
                  <GuardianChildCard key={ch.id} child={ch} lang={lang} />
                ))}
              </section>
            )}
            {orphans.length > 0 && (
              <section aria-label={c.filesH} className="space-y-4">
                {orphans.map((o) => {
                  const percent = fundingPercent(o.monthly_need, o.funded_monthly);
                  return (
                    <article key={o.id} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">
                          <Name>{o.display_name}</Name>
                        </h2>
                        <Badge variant="secondary">{c.status[o.status] ?? o.status}</Badge>
                        <bdi dir="ltr" className="text-xs tabular-nums text-muted-foreground">
                          {o.code}
                        </bdi>
                      </div>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {c.monthly(
                          formatMoney(o.funded_monthly, o.currency),
                          formatMoney(o.monthly_need, o.currency),
                        )}
                      </p>
                      <CrossingProgress
                        percent={percent}
                        className="mt-3 max-w-sm"
                        label={c.coverage(isolate(o.display_name))}
                      />
                      {extras?.(o)}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </>
    ),
  });
}
