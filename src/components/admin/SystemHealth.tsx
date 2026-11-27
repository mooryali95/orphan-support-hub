import { DispatchHealthPanel } from "@/components/admin/DispatchHealthPanel";
import { OpsHealthPanel } from "@/components/admin/OpsHealthPanel";
import { MirrorStatusPanel } from "@/components/integrations/MirrorStatusPanel";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/admin/SystemHealth", {
  ar: {
    title: "صحّة النظام",
    lead: "التشغيل، والإرسال، ومرآة البيانات في بطاقةٍ واحدة: ما يعمل، وما تأخّر، وما يحتاج تدخّلاً.",
  },
  en: {
    title: "System health",
    lead: "Operations, dispatch and the data mirror in one card: what's running, what's behind and what needs attention.",
  },
});

/**
 * صحّة النظام: لوحات التشغيل والإرسال والمرآة معاً بدل ثلاث شاشات. كلٌّ يقرأ ما كان
 * يقرأه (عدّاد الإرسال يبقى بالعميل المميّز بعد فحص `is_admin` وحده).
 */
export function SystemHealth() {
  const c = useCopy(COPY);
  return (
    <section
      aria-labelledby="system-health-title"
      className="border-border bg-card mt-8 rounded-3xl border p-4 sm:p-6"
    >
      <h3 id="system-health-title" className="text-lg font-bold">
        {c.title}
      </h3>
      <p className="text-muted-foreground mt-1 text-sm leading-7 text-pretty">{c.lead}</p>
      <div className="divide-border [&>*]:pt-2 mt-2 divide-y">
        <OpsHealthPanel />
        <DispatchHealthPanel />
        <MirrorStatusPanel />
      </div>
    </section>
  );
}
