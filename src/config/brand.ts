import raw from "./brand.json";
import { THEME_COLOR } from "./brand-colors";
import { copyOf, defineCopy } from "@/lib/locale";

/**
 * اسم المنصّة وهويتها النصّية — **المكان الوحيد**.
 *
 * لتغيير الاسم: عدّل `brand.json` ثم شغّل `bun run brand:sync`. السكربت
 * يولّد صور الشعار البريدية والأيقونات، ويكتب هجرةً تُحدّث الاسم في
 * القاعدة (رسالة الترحيب وغيرها). وفحص `brand.test.ts` يفشل إن كُتب
 * الاسم حرفياً في أي ملفٍ آخر، فلا يُنسى موضع.
 */
export const BRAND = {
  name: raw.name,
  nameLatin: raw.nameLatin,
  tagline: raw.tagline,
  slogan: raw.slogan,
  themeColor: THEME_COLOR,
  description: raw.descriptionTemplate.replace("{name}", raw.name),
  /** the partner whose logo and colours the support platform carries (see brand.json `partner`) */
  partner: raw.partner,
} as const;

// نصوص الهوية في الفهرس: تُترجم لكل لغةٍ مفعّلة كبقية الواجهة.
const BRAND_COPY = defineCopy("config/brand", {
  ar: {
    tagline: raw.tagline,
    slogan: raw.slogan,
    description: (name: string) => raw.descriptionTemplate.replace("{name}", name),
  },
  en: {
    tagline: "We sponsor… and we build",
    slogan: "Sponsor an orphan with a verified file",
    description: (name: string) =>
      `Sponsor an orphan with a file verified by an approved care organization. ${name} connects you with a real child through a transparent monthly sponsorship and regular impact reports.`,
  },
});

/** نصوص الهوية بلغة الواجهة؛ الاسم اللاتيني في غير العربية. */
export function brandFor(locale: string) {
  if (locale === "ar") return BRAND;
  const c = copyOf(BRAND_COPY, locale);
  return {
    ...BRAND,
    name: raw.nameLatin,
    tagline: c.tagline,
    slogan: c.slogan,
    description: c.description(raw.nameLatin),
  };
}

/** عنوان صفحة: «القسم — الاسم — الشعار». */
export function pageTitle(section: string, withSlogan = true, locale = "ar"): string {
  const b = brandFor(locale);
  return withSlogan ? `${section} — ${b.name} — ${b.slogan}` : `${section} — ${b.name}`;
}
