/**
 * البيانات المنظّمة (JSON-LD) — الطريق الوحيد لوضع JSON داخل <script>.
 *
 * TanStack تكتب أبناء `scripts` في رأس الصفحة كما هي (`__html`) بلا
 * تهريب، و`JSON.stringify` يترك `</script>` على حاله. فاسمٌ يُدخله مكتبٌ
 * أو مصدرٌ مستورد مثل `Ali</script><script>…` كان يُغلق الكتلة ويُشغّل
 * سكربتاً لكلّ زائر — المشرف منهم — فيقرأ جلسته من المتصفّح (APP-01).
 *
 * فيُهرَّب هنا كلّ ما يكسر سياق HTML: `<` و`>` و`&`، ومعها فاصلا السطر
 * والفقرة (U+2028/U+2029) اللذان يكسران JavaScript القديم. والتهريب
 * بـ`\uXXXX` يُبقي JSON صالحاً يقرؤه المحلِّل بالقيمة نفسها.
 */
import { BRAND, brandFor } from "@/config/brand";

const UNSAFE = /[<>&\u2028\u2029]/g;

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(
    UNSAFE,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * the platform as a site and whose it is: the owning organisation as its publisher, by the names
 * in brand.json. Ownership only; nothing here claims accreditation, audit or figures.
 */
export function siteJsonLd(locale: string) {
  const b = brandFor(locale);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: b.name,
    alternateName: locale === "ar" ? b.nameLatin : BRAND.name,
    description: b.description,
    inLanguage: locale,
    publisher: {
      "@type": "Organization",
      name: b.ownerName,
      alternateName: b.ownerShort,
    },
  };
}

/** عنصر `scripts` لرأس المسار، مهرَّباً. */
export function jsonLdScript(value: unknown): { type: "application/ld+json"; children: string } {
  return { type: "application/ld+json", children: serializeJsonLd(value) };
}
