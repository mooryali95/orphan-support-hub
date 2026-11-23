import { Database, ShieldCheck } from "lucide-react";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/admin/AdminTrustStrip", {
  ar: { live: "بيانات حقيقية", secured: "جلسة محمية بعاملين" },
  en: { live: "Live data", secured: "Two-factor session" },
});

/**
 * شريط الثقة في الإدارة: يقول للمدير بوضوح إن ما أمامه حقيقي (لا عيّنة)،
 * وإن جلسته مرّت بالمصادقة الثنائية. يظهر فقط حين لا تكون العيّنة مفعّلة.
 */
export function AdminTrustStrip() {
  const t = useCopy(COPY);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold">
      <span className="border-shore-thrive/40 bg-shore-thrive/10 text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
        <span className="bg-shore-thrive size-2 rounded-full" aria-hidden="true" />
        <Database className="size-3.5" aria-hidden="true" />
        {t.live}
      </span>
      <span className="border-border bg-card text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        {t.secured}
      </span>
    </div>
  );
}
