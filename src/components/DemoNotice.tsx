import { useLocale } from "@/lib/locale";

export function DemoNotice() {
  const locale = useLocale();
  return (
    <aside className="border-y border-border bg-secondary px-4 py-4 text-sm leading-7" role="note">
      <div className="mx-auto max-w-6xl">
        <strong>{locale === "ar" ? "بيانات تجريبية" : "Sample data"}</strong>
        <p>
          {locale === "ar"
            ? "المكاتب وبطاقات الأطفال والأعداد المعروضة نماذج تجريبية، وليست حالات فعلية أو جهات معتمدة. الربط بمنصات مثل الرواد لاحقًا؛ لا تُحصّل مدفوعات لهذه النماذج."
            : "Offices, child cards and counts are examples, not real cases or accredited organizations. Connections such as Rowad are planned, not live; these examples do not accept payments."}
        </p>
      </div>
    </aside>
  );
}
