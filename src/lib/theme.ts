/**
 * المظهر (فاتح/داكن) — ككعكة اللغة: الخادم يقرؤها فيخرج <html> بصنفه الصحيح
 * قبل أوّل رسم، فلا وميض ولا سكربت مضمَّن (CSP بلا unsafe-inline).
 * ألوان الوضعين كلاهما في src/config/brand.json.
 */
import { createIsomorphicFn } from "@tanstack/react-start";

export type Theme = "light" | "dark";
export const THEME_COOKIE = "kh_theme";

export function parseTheme(cookieHeader: string | null | undefined): Theme {
  const m = /(?:^|;\s*)kh_theme=(light|dark)(?:;|$)/.exec(cookieHeader ?? "");
  return m?.[1] === "dark" ? "dark" : "light";
}

export const readTheme = createIsomorphicFn()
  .server(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    return parseTheme(getRequest().headers.get("cookie"));
  })
  .client(async () => parseTheme(document.cookie));

/** يبدّل المظهر في مكانه بلا إعادة تحميل، ويوقف الانتقالات لحظةً فلا تتدرّج الصفحة كلّها. */
export function applyTheme(next: Theme) {
  document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", next === "dark");
  root.style.colorScheme = next;
  window.setTimeout(() => root.classList.remove("theme-switching"), 60);
}
