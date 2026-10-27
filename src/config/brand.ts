import raw from "./brand.json";

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
  themeColor: raw.themeColor,
  description: raw.descriptionTemplate.replace("{name}", raw.name),
} as const;

/** عنوان صفحة: «القسم — الاسم — الشعار». */
export function pageTitle(section: string, withSlogan = true): string {
  return withSlogan ? `${section} — ${BRAND.name} — ${BRAND.slogan}` : `${section} — ${BRAND.name}`;
}
