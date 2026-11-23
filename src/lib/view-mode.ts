/**
 * وضع العرض — دورٌ واحد ظاهر في كلّ لحظة.
 *
 * الحساب الواحد قد يكون مديراً وداعماً ومشرفاً معاً. كانت أبواب الأدوار كلّها
 * تظهر متجاورة، فيختلط عمل الإدارة بعطاء صاحبها الشخصي. الآن يعمل الحساب في
 * وضعٍ واحد: شريطه وأبوابه وأزراره لذلك الدور وحده، ويتبدّل الوضع من قائمة
 * التبديل صراحةً.
 *
 * هذا تنظيمٌ للواجهة لا حماية: الصلاحيات تُفحص في القاعدة كما هي (RLS ودوالّها).
 */

export type ViewMode =
  "admin" | "supporter" | "org" | "guardian" | "supervisor" | "office" | "donor" | "translator";

export type ModeSource = {
  roles: readonly string[];
  workspaces?: {
    offices?: ReadonlyArray<{ id: string; name: string }>;
    donor_entities?: ReadonlyArray<{ id: string; name: string }>;
    supervisor?: boolean;
    translator_locales?: ReadonlyArray<{ code: string }>;
  } | null;
};

/** ترتيب الأولوية: أوّل وضعٍ يملكه الحساب هو وضعه الافتراضي. */
const PRIORITY: ViewMode[] = [
  "admin",
  "org",
  "supervisor",
  "office",
  "donor",
  "guardian",
  "translator",
  "supporter",
];

/** الأوضاع التي يملكها الحساب. «الداعم» متاحٌ لكلّ حساب. */
export function availableModes({ roles, workspaces: ws }: ModeSource): ViewMode[] {
  const has: Record<ViewMode, boolean> = {
    admin: roles.includes("admin"),
    org: roles.includes("care_org"),
    guardian: roles.includes("guardian"),
    supervisor: Boolean(ws?.supervisor),
    office: (ws?.offices?.length ?? 0) > 0,
    donor: (ws?.donor_entities?.length ?? 0) > 0,
    translator: (ws?.translator_locales?.length ?? 0) > 0,
    supporter: true,
  };
  return PRIORITY.filter((m) => has[m]);
}

/** الوضع الفعّال: المحفوظ إن كان الحساب يملكه، وإلا الأعلى أولوية. */
export function resolveMode(stored: string | null | undefined, available: ViewMode[]): ViewMode {
  const wanted = available.find((m) => m === stored);
  return wanted ?? available[0] ?? "supporter";
}

/**
 * وضع الصفحة من مسارها: صفحةٌ لدورٍ آخر تُفتح بوضعها هي (من رابطٍ أو إشعار)،
 * فلا تظهر صفحة الإدارة بشريط الداعم ولا العكس. `null`: صفحةٌ مشتركة.
 */
export function modeOfPath(pathname: string): ViewMode | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/dashboard" || pathname.startsWith("/sponsorships/")) return "supporter";
  if (pathname === "/org") return "org";
  if (pathname === "/guardian") return "guardian";
  if (pathname === "/supervisor") return "supervisor";
  if (pathname.startsWith("/office/")) return "office";
  if (pathname.startsWith("/donor/")) return "donor";
  if (pathname.startsWith("/translate/")) return "translator";
  return null;
}

/** هل يُسجَّل دعمٌ شخصيّ في هذا الوضع؟ الدعم من وضع الداعم وحده. */
export const canPledgeIn = (mode: ViewMode) => mode === "supporter";

export const VIEW_MODE_KEY = "kh:view-mode";
export const VIEW_MODE_EVENT = "kh:view-mode-change";
