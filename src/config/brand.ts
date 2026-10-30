import raw from "./brand.json";
import { THEME_COLOR } from "./brand-colors";

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
} as const;

/** نصوص الهوية بلغة الواجهة؛ الاسم اللاتيني في الإنجليزية. */
/** لغةٌ غير العربية تأخذ الاسم اللاتيني والنصوص الإنجليزية حتى تُترجم. */
export function brandFor(locale: string) {
  if (locale === "ar") return BRAND;
  return {
    ...BRAND,
    name: raw.nameLatin,
    tagline: raw.en.tagline,
    slogan: raw.en.slogan,
    description: raw.en.descriptionTemplate.replace("{name}", raw.nameLatin),
  };
}

/** عنوان صفحة: «القسم — الاسم — الشعار». */
export function pageTitle(section: string, withSlogan = true, locale = "ar"): string {
  const b = brandFor(locale);
  return withSlogan ? `${section} — ${b.name} — ${b.slogan}` : `${section} — ${b.name}`;
}
