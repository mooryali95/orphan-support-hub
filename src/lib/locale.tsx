/**
 * لغة الواجهة للكافل: العربية (الأصل) والإنجليزية.
 *
 * - اللغة في كعكة `kh_lang`، فيقرؤها الخادم قبل الرسم: `<html lang dir>`
 *   صحيحان من أوّل بايت، بلا وميض اتجاه.
 * - النصوص بجوار مكوّناتها: `const COPY = { ar: {...}, en: {...} }` ثم
 *   `useCopy(COPY)`. النوع يُلزم الإنجليزية بكل مفاتيح العربية، فلا يُنسى نصّ.
 * - ما لم يُترجم بعد (لوحات الجهة والمشرف والإدارة) يبقى عربياً عمداً: هي
 *   لفرقٍ ميدانية عربية أو ألبانية لها قاموسها في `i18n.ts`.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { createContext, useContext, type ReactNode } from "react";

import { countryName, resolveCountry } from "@/lib/countries";

export type Locale = "ar" | "en";
export const LOCALES: readonly Locale[] = ["ar", "en"];
export const LOCALE_COOKIE = "kh_lang";
export const DIR: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", en: "ltr" };
/** رمز BCP-47 لـ Intl: أرقامٌ لاتينية في العربية كما في بقية المنصّة. */
export const INTL: Record<Locale, string> = { ar: "ar-u-nu-latn", en: "en" };

export function parseLocale(cookieHeader: string | null | undefined): Locale {
  const m = /(?:^|;\s*)kh_lang=(ar|en)(?:;|$)/.exec(cookieHeader ?? "");
  return (m?.[1] as Locale | undefined) ?? "ar";
}

/** الخادم يقرأ ترويسة الطلب، والمتصفّح يقرأ document.cookie. */
export const readLocale = createIsomorphicFn()
  .server(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    return parseLocale(getRequest().headers.get("cookie"));
  })
  .client(async () => parseLocale(document.cookie));

/** تبديل اللغة: كعكة لسنة، ثم إعادة تحميلٍ كاملة لأن الاتجاه يتغيّر من الجذر. */
export function switchLocale(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
}

const Ctx = createContext<Locale>("ar");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

/** نصوص المكوّن بلغته. الإنجليزية مُلزَمة بنفس مفاتيح العربية. */
export function useCopy<T extends Record<string, unknown>>(copy: { ar: T; en: T }): T {
  return copy[useLocale()];
}

/** «البلد — المنطقة» بلغة الواجهة: البلد من رمزه، والمنطقة كما سُجّلت. */
export function placeLabel(
  country: string | null | undefined,
  region: string | null | undefined,
  locale: Locale,
): string {
  const code = locale === "en" ? resolveCountry(country) : null;
  const c = code ? countryName(code, "en") : country;
  return [c, region].filter(Boolean).join(" — ");
}
