/**
 * أدوار العرض التفاعلي ومساراتها، وجولة «وضع العرض».
 *
 * كلّ دورٍ له واجهةٌ داخل `/try` (فلا يغادر الحاضر غلاف التجربة)، والجولة تمرّ بها
 * بترتيب الدورة الحقيقية: الجهة تُدخل، والإدارة توثّق، والكافل يكفل، والمكتب يتابع،
 * والمشرف يزور، وصاحب القرار يرى الشبكة.
 */
export type TryRole =
  "supporter" | "org" | "admin" | "office" | "supervisor" | "guardian" | "decider";

export const ROLE_PATH = {
  supporter: "/try/support",
  org: "/try/cycle",
  admin: "/try/admin",
  office: "/try/office",
  supervisor: "/try/supervisor",
  guardian: "/try/guardian",
  decider: "/try/decider",
} as const satisfies Record<TryRole, string>;

/** الدور الذي تخصّه الصفحة، أو `null` لصفحات رحلة الكافل (الاختيار والدعم والأثر) */
export function roleOf(path: string): Exclude<TryRole, "supporter"> | null {
  const p = path.replace(/\/+$/, "");
  if (p === "/try/cycle") return "org";
  if (p === "/try/admin") return "admin";
  if (p === "/try/office") return "office";
  if (p === "/try/supervisor") return "supervisor";
  if (p === "/try/guardian") return "guardian";
  if (p === "/try/decider") return "decider";
  return null;
}

/** محطّات وضع العرض بالترتيب. `child`: صفحة الطفل الذي نُشر في الدورة (أو أوّل طفلٍ إن لم يُنشر) */
export const TOUR = [
  { to: "/try", role: null },
  { to: "/try/cycle", role: "org" },
  { to: "/try/admin", role: "admin" },
  { to: "child", role: "supporter" },
  { to: "/try/office", role: "office" },
  { to: "/try/supervisor", role: "supervisor" },
  { to: "/try/impact", role: "supporter" },
  { to: "/try/decider", role: "decider" },
] as const satisfies ReadonlyArray<{ to: string; role: TryRole | null }>;

/** موقع الصفحة في الجولة (صفحة الطفل المنشور في الدورة هي محطّة الكفالة) */
export function tourIndex(path: string): number {
  const p = path.replace(/\/+$/, "") || "/try";
  if (/^\/try\/try-/.test(p)) return 3;
  return TOUR.findIndex((s) => s.to === p);
}

export const PRESENT_KEY = "kh:try-present";
export const PRESENT_EVENT = "try-present-change";

export function presenting(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PRESENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPresenting(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(PRESENT_KEY, "1");
    else window.sessionStorage.removeItem(PRESENT_KEY);
  } catch {
    /* محجوب: الوضع يبقى في هذه الصفحة */
  }
  window.dispatchEvent(new Event(PRESENT_EVENT));
}
