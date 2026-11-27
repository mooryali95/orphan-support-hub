/**
 * تنقّل الإدارة بستّ مهامّ بدل خمسة أقسامٍ وخمسةٍ وعشرين لساناً: اليوم، الدول، جودة
 * البيانات، المال، الناس، الإعدادات. المفاتيح القديمة (`?tab=inbox`…) تبقى روابط صالحة:
 * تُحوَّل هنا إلى مقابلها الجديد، فلا ينكسر رابطٌ محفوظ أو مُرسَل.
 *
 * صافٍ بلا React، ليُختبر وحده (nav.test.ts).
 */

export const JOBS = ["today", "countries", "quality", "money", "people", "settings"] as const;
export type Job = (typeof JOBS)[number];

export type Tab =
  | "today"
  | "countries"
  | "trust"
  | "data"
  | "report"
  | "transfers"
  | "pledges"
  | "rec_payments"
  | "sponsorships"
  | "sponsors"
  | "orphans"
  | "rec_orgs"
  | "rec_offices"
  | "rec_supervisors"
  | "rec_documents"
  | "rec_access"
  | "supervisors"
  | "offices"
  | "country_sources"
  | "languages"
  | "integrations"
  | "health"
  | "golive";

/** كل مهمّةٍ وشاشاتها؛ الأولى منها ما يُفتح حين تُختار المهمّة. */
export const JOB_TABS: Record<Job, readonly Tab[]> = {
  today: ["today"],
  countries: ["countries"],
  quality: ["trust", "data", "report"],
  money: ["transfers", "pledges", "rec_payments", "sponsorships"],
  people: [
    "sponsors",
    "orphans",
    "rec_orgs",
    "offices",
    "rec_offices",
    "supervisors",
    "rec_supervisors",
    "rec_documents",
    "rec_access",
  ],
  settings: ["country_sources", "languages", "integrations", "health", "golive"],
};

export const TABS: readonly Tab[] = JOBS.flatMap((j) => JOB_TABS[j]);

export const isTab = (v: unknown): v is Tab => typeof v === "string" && TABS.includes(v as Tab);

export const jobOf = (tab: Tab): Job => JOBS.find((j) => JOB_TABS[j].includes(tab)) ?? "today";

/** مفتاحٌ قديم ← مقابله. `kind` مرشّح «اليوم»، و`area` خانة «بناء البيانات». */
export const TAB_ALIASES: Readonly<Record<string, { tab: Tab; kind?: string; area?: string }>> = {
  home: { tab: "today" },
  inbox: { tab: "today" },
  queue: { tab: "today", kind: "orphan" },
  access: { tab: "today", kind: "access" },
  integrity: { tab: "today", kind: "integrity" },
  overview: { tab: "report" },
  platform: { tab: "data", area: "countries" },
  monitoring: { tab: "health" },
};

type Search = Record<string, unknown>;

/**
 * التبويب الذي يُعرض، والعنوان الجديد إن كان المفتاح قديماً (`redirect`، يُستبدل به
 * العنوان بلا قيدٍ في التاريخ). بلا `tab` تهبط الإدارة على «اليوم» بلا تحويل.
 */
export function resolveAdminSearch(search: Search): { tab: Tab; redirect: Search | null } {
  const raw = search["tab"];
  if (raw === undefined || raw === null || raw === "") return { tab: "today", redirect: null };
  // «مصادر التحقق» صارت درج الدول: الرابط القديم من «مركز الثقة» يفتح الدولة نفسها.
  if (raw === "data" && search["area"] === "sources") {
    const next: Search = { ...search, tab: "countries" };
    delete next["area"];
    return { tab: "countries", redirect: next };
  }
  if (isTab(raw)) return { tab: raw, redirect: null };
  const alias = typeof raw === "string" ? TAB_ALIASES[raw] : undefined;
  const target = alias ?? { tab: "today" as const };
  const next: Search = { ...search };
  if (target.tab === "today") delete next["tab"];
  else next["tab"] = target.tab;
  if (target.kind) next["kind"] = target.kind;
  if (target.area) next["area"] = target.area;
  return { tab: target.tab, redirect: next };
}

/** رابط شاشةٍ من مفتاحٍ قديم أو جديد، بعد التحويل. */
export function adminHref(key: string, extra: Search = {}): string {
  const { tab, redirect } = resolveAdminSearch({ tab: key, ...extra });
  const s = redirect ?? { ...extra, ...(tab === "today" ? {} : { tab }) };
  const qs = Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `/admin?${qs}` : "/admin";
}
