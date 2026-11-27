import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { brandFor } from "@/config/brand";
import { formatDate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/LegalPage", {
  ar: {
    updated: "آخر تحديث",
    toc: "محتويات الصفحة",
    binding: "",
    operator: (owner: string, partnerWith: string, partner: string) =>
      `تشغّل هذه المنصّةَ ${owner}، ${partnerWith} ${partner}.`,
  },
  en: {
    updated: "Last updated",
    toc: "On this page",
    // ما يُعرض بغير العربية — الإنجليزية الآن، وغيرها حين يُترجم النصّ نفسه.
    binding:
      "This version is provided for convenience. If it differs from the Arabic, the Arabic version prevails.",
    operator: (owner: string, _partnerWith: string, partner: string) =>
      `This platform is operated by the ${owner}, in partnership with ${partner}.`,
  },
});

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
  variant = "doc",
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  /** نصٌّ ملزِم (الخصوصية والشروط): الترجمة تُنبّه أن العربية هي المرجع. */
  binding?: boolean;
  /** "doc": numbered sections with a table of contents; "faq": each section is a native disclosure. */
  variant?: "doc" | "faq";
  children: ReactNode;
}) {
  const locale = useLocale();
  const c = useCopy(COPY);
  // who operates the platform, by the names in brand.json; no legal particulars are stated here
  const brand = brandFor(locale);
  const partner = locale === "ar" ? brand.partner.name : brand.partner.nameLatin;
  type SectionProps = { title: string; id?: string; disclosure?: boolean };
  const items: Array<{ id: string; title: string }> = [];
  const sections = Children.map(children, (child, i) => {
    if (!isValidElement(child) || child.type !== Section) return child;
    const el = child as ReactElement<SectionProps>;
    const id = `section-${i + 1}`;
    items.push({ id, title: el.props.title });
    return cloneElement(el, { id, disclosure: variant === "faq" });
  });
  const toc = variant === "doc" && items.length > 2;
  return (
    <main
      id="main"
      tabIndex={-1}
      className={toc ? "mx-auto max-w-5xl px-4 py-12" : "mx-auto max-w-3xl px-4 py-12"}
    >
      <div className={toc ? "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10" : undefined}>
        {toc && (
          <nav
            aria-label={c.toc}
            className="mb-8 rounded-2xl border border-border bg-card p-4 text-sm lg:sticky lg:top-24 lg:order-none lg:mb-0 lg:h-fit lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
          >
            <p className="font-bold">{c.toc}</p>
            <ol className="mt-2 space-y-0.5">
              {items.map((it) => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className="flex min-h-11 items-center rounded-md px-2 leading-6 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {it.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          <p className="text-muted-foreground mt-2 text-xs">
            {c.updated}: <time dateTime={updated}>{formatDate(updated, locale)}</time>
          </p>
          <p className="mt-4 text-sm leading-7 font-medium" data-brand-owner>
            {c.operator(brand.ownerName, brand.partner.with, partner)}
          </p>
          {locale !== "ar" && binding && (
            <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs leading-6">{c.binding}</p>
          )}
          {intro && <p className="mt-5 text-sm leading-8">{intro}</p>}
          <div className={variant === "faq" ? "mt-8 space-y-3" : "mt-8 space-y-8"}>{sections}</div>
        </div>
      </div>
    </main>
  );
}

const SECTION_BODY =
  "space-y-3 [&_table]:w-full [&_table]:text-sm [&_td]:border-border [&_td]:border-b [&_td]:py-2 [&_th]:border-border [&_th]:border-b [&_th]:py-2 [&_th]:text-start [&_th]:font-bold";

export function Section({
  title,
  id,
  disclosure = false,
  children,
}: {
  title: string;
  /** set by LegalPage */
  id?: string;
  /** set by LegalPage for the FAQ: a native details/summary disclosure */
  disclosure?: boolean;
  children: ReactNode;
}) {
  if (disclosure) {
    return (
      <details
        id={id}
        className="group scroll-mt-24 rounded-2xl border border-border bg-card text-sm leading-8 [&_li]:leading-7 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-6"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-2 text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>{title}</span>
          <span
            aria-hidden="true"
            className="text-muted-foreground shrink-0 text-lg transition-transform group-open:rotate-45"
          >
            +
          </span>
        </summary>
        <div className={`${SECTION_BODY} px-4 pb-4`} style={{ overflowX: "auto" }}>
          {children}
        </div>
      </details>
    );
  }
  return (
    <section
      id={id}
      className="scroll-mt-24 space-y-3 text-sm leading-8 [&_li]:leading-7 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-6"
    >
      <h2 className="text-lg font-bold">{title}</h2>
      <div
        className={SECTION_BODY}
        // الجدول القانوني قد يفيض على الجوال، فيُمرَّر داخل حاويته
        // ولا يدفع الصفحة كلّها أفقياً.
        style={{ overflowX: "auto" }}
      >
        {children}
      </div>
    </section>
  );
}
