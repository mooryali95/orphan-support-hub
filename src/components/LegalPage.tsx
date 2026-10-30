import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/locale";

/**
 * قالب الصفحات القانونية.
 *
 * النصّ القانوني يُقرأ لا يُتصفَّح: عرض محدود، وسطر مريح، وعناوين تسمح
 * بالقفز إلى البند المطلوب. و`prose` مضبوطة يدوياً هنا بدل إضافة اعتماد
 * على مكوّن تنسيق كامل لثلاث صفحات.
 */
export function LegalPage({
  title,
  updated,
  intro,
  binding = false,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  /** نصٌّ ملزِم (الخصوصية والشروط): الترجمة تُنبّه أن العربية هي المرجع. */
  binding?: boolean;
  children: ReactNode;
}) {
  const locale = useLocale();
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="text-muted-foreground mt-2 text-xs">
        {locale === "en" ? "Last updated" : "آخر تحديث"}: {formatDate(updated, locale)}
      </p>
      {locale === "en" && binding && (
        <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs leading-6">
          This English version is provided for convenience. If it differs from the Arabic, the
          Arabic version prevails.
        </p>
      )}
      {intro && <p className="mt-5 text-sm leading-8">{intro}</p>}
      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-sm leading-8 [&_li]:leading-7 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <div
        className="space-y-3 [&_table]:w-full [&_table]:text-sm [&_td]:border-border [&_td]:border-b [&_td]:py-2 [&_th]:border-border [&_th]:border-b [&_th]:py-2 [&_th]:text-start [&_th]:font-bold"
        // الجدول القانوني قد يفيض على الجوال، فيُمرَّر داخل حاويته
        // ولا يدفع الصفحة كلّها أفقياً.
        style={{ overflowX: "auto" }}
      >
        {children}
      </div>
    </section>
  );
}
