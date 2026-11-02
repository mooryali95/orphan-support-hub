import { MuralImage } from "@/components/brand/MuralImage";
import { useLocale } from "@/lib/locale";
import type { DemoChild } from "@/lib/demo-network";
import { countryName } from "@/lib/countries";

export function DemoChildCard({ child }: { child: DemoChild }) {
  const locale = useLocale();
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[16/6] bg-secondary">
        <MuralImage photoUrl={null} displayName={child.id} register="waiting" className="size-full" />
      </div>
      <div className="space-y-2 p-5">
        <p className="text-xs font-semibold text-muted-foreground">{locale === "ar" ? "ملف تجريبي — غير قابل للكفالة" : "Demo file — not available for sponsorship"}</p>
        <h2 className="text-lg font-bold" dir="ltr">{child.id}</h2>
        <p>{countryName(child.countryCode, locale)}</p>
        <p className="text-sm text-muted-foreground">{locale === "ar"
          ? `${child.gender === "male" ? "ذكر" : "أنثى"} · ${child.ageBand === "age_6_11" ? "٦–١١ سنة" : "١٢–١٤ سنة"}`
          : `${child.gender === "male" ? "Boy" : "Girl"} · ${child.ageBand === "age_6_11" ? "6–11" : "12–14"}`}</p>
      </div>
    </article>
  );
}