/**
 * لغات الواجهة — العربية الأم، والإنجليزية لغة الرجوع، وأي لغةٍ تُفعَّل لدولةٍ مرتبطة.
 *
 * - اللغة في كعكة `kh_lang`، فيقرؤها الخادم قبل الرسم: `<html lang dir>`
 *   صحيحان من أوّل بايت، بلا وميض اتجاه.
 * - العربية والإنجليزية في الكود بجوار مكوّناتهما:
 *   `const COPY = defineCopy("ns", { ar: {...}, en: {...} })` ثم `useCopy(COPY)`.
 *   النوع يُلزم الإنجليزية بكل مفاتيح العربية، فلا يُنسى نصّ.
 * - كل لغةٍ أخرى (الألبانية…) ترجمةٌ منشورة في القاعدة، مفتاحها
 *   `ns.path` كما في `src/i18n/catalog.json`. تُطبَّق فوق الإنجليزية: ما لم
 *   يُنشر بعد، أو تغيّر أصله منذ تُرجم، يظهر بالإنجليزية — لا فراغ أبداً.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { createContext, useContext, type ReactNode } from "react";

import { countryName, resolveCountry } from "@/lib/countries";

/** رمز لغة ISO 639 (ar، en، sq…). العربية والإنجليزية في الكود، والباقي من القاعدة. */
export type Locale = string;
export type BaseLocale = "ar" | "en";
export const BASE_LOCALES: readonly BaseLocale[] = ["ar", "en"];
export const LOCALE_COOKIE = "kh_lang";

const RTL = new Set(["ar", "fa", "ur", "he", "ps", "ckb", "dv", "yi", "sd", "ug", "ku"]);
export function dirOf(locale: Locale): "rtl" | "ltr" {
  return RTL.has(locale.split("-")[0]!) ? "rtl" : "ltr";
}
/** رمز Intl: أرقامٌ لاتينية في العربية كما في بقية المنصّة. */
export function intlOf(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-latn" : locale;
}
/** اسم اللغة بلغتها («shqip»، «English»، «العربية»). */
export function nativeName(locale: Locale): string {
  try {
    const n = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
    return n.charAt(0).toLocaleUpperCase(locale) + n.slice(1);
  } catch {
    return locale;
  }
}

export function parseLocale(cookieHeader: string | null | undefined): Locale {
  const m = /(?:^|;\s*)kh_lang=([a-z]{2,3})(?:;|$)/.exec(cookieHeader ?? "");
  return m?.[1] ?? "ar";
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

/* ── الترجمات المنشورة ─────────────────────────────────────────────── */

/** مفتاح ← نصّ. القوالب بمواضع مرقّمة: «Faqja {0} nga {1}». */
export type Messages = Record<string, string>;

// مخزنٌ بحسب اللغة لا بحسب المستخدم: المنشور واحدٌ للجميع، فمشاركته بين
// الطلبات على الخادم آمنة. يملؤه الجذر قبل الرسم (الخادم) وعند الإماهة (المتصفّح).
const store = new Map<Locale, Messages>();
const memo = new WeakMap<object, Map<string, unknown>>();

export function setMessages(locale: Locale, messages: Messages) {
  if (store.get(locale) === messages) return;
  store.set(locale, messages);
}

export type CopyDef<T> = { ns: string; ar: T; en: T };

/** صيغ الجمع بفئات CLDR (zero، one، two، few، many، other). «{0}» العدد، و«{1}»… بقية المعاملات. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type PluralFn = ((...args: Array<number | string>) => string) & {
  __plural: PluralForms;
  __by: number;
};

function fill(text: string, args: unknown[]) {
  return text.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i] ?? ""));
}

/**
 * نصٌّ يتبع الجمع بقواعد اللغة نفسها. `by` موضع العدد بين المعاملات
 * (الافتراضي الأوّل). كل لغةٍ تملأ فئاتها: الألبانية one/other، والعربية ستّاً.
 */
export function pluralOf(forms: PluralForms, by = 0, lang = "en"): PluralFn {
  const rules = new Intl.PluralRules(lang);
  const fn = ((...args: Array<number | string>) => {
    const n = Number(args[by]);
    return fill(forms[rules.select(n)] ?? forms.other, args);
  }) as PluralFn;
  fn.__plural = forms;
  fn.__by = by;
  return fn;
}

/** تعريف نصوص مكوّن: مساحة اسمٍ ثابتة تصير بادئة مفاتيحه في الفهرس. */
export function defineCopy<T extends Record<string, unknown>>(
  ns: string,
  copy: { ar: T; en: T },
): CopyDef<T> {
  return { ns, ...copy };
}

let currentLocale = "en";
function overlay(value: unknown, key: string, msgs: Messages): unknown {
  if (typeof value === "string") return msgs[key] ?? value;
  if (typeof value === "function" && "__plural" in value) {
    // الجمع بفئات اللغة الهدف: ما ترجمه المراجع من فئاتها، و«other» إلزامي.
    const other = msgs[`${key}.other`];
    if (other === undefined) return value;
    const forms: PluralForms = { other };
    for (const c of ["zero", "one", "two", "few", "many"] as const) {
      const t = msgs[`${key}.${c}`];
      if (t !== undefined) forms[c] = t;
    }
    return pluralOf(forms, (value as PluralFn).__by, currentLocale);
  }
  if (typeof value === "function") {
    const t = msgs[key];
    if (t === undefined) return value;
    return (...args: unknown[]) => fill(t, args);
  }
  if (Array.isArray(value)) return value.map((v, i) => overlay(v, `${key}.${i}`, msgs));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = overlay(v, `${key}.${k}`, msgs);
    return out;
  }
  return value;
}

/** النصوص بلغةٍ ما: العربية والإنجليزية كما في الكود، وغيرهما فوق الإنجليزية. */
export function copyOf<T>(def: CopyDef<T>, locale: Locale): T {
  if (locale === "ar" || locale === "en") return def[locale];
  const msgs = store.get(locale);
  if (!msgs) return def.en;
  let byLocale = memo.get(def);
  if (!byLocale) memo.set(def, (byLocale = new Map()));
  const cacheKey = `${locale}:${Object.keys(msgs).length}`;
  if (!byLocale.has(cacheKey)) {
    currentLocale = locale;
    byLocale.set(cacheKey, overlay(def.en, def.ns, msgs));
  }
  return byLocale.get(cacheKey) as T;
}

/* ── السياق ───────────────────────────────────────────────────────── */

const Ctx = createContext<Locale>("ar");

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages?: Messages | undefined;
  children: ReactNode;
}) {
  if (messages) setMessages(locale, messages);
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

/** نصوص المكوّن بلغته. */
export function useCopy<T>(def: CopyDef<T>): T {
  return copyOf(def, useLocale());
}

/** «البلد — المنطقة» بلغة الواجهة: البلد من رمزه، والمنطقة كما سُجّلت. */
export function placeLabel(
  country: string | null | undefined,
  region: string | null | undefined,
  locale: Locale,
): string {
  const code = locale !== "ar" ? resolveCountry(country) : null;
  const c = code ? countryName(code, locale) : country;
  return [c, region].filter(Boolean).join(" — ");
}
