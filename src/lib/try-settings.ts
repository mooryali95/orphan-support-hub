/**
 * «الإعدادات» في العرض التفاعلي: مصادر الدول ولغاتها للقراءة وحدها، على عيّنة.
 * منصّات المكاتب أسماءٌ مستعارة (DEMO-…) بلا عنوانٍ ولا مزامنةٍ حقيقية، فلا حالة اتّصالٍ
 * حيّة تُدّعى. يُسجَّل بنداءٍ صريح (`registerSettingsDemos`)، لأنّ الحزمة `sideEffects: false`.
 */
import { registerDemo } from "@/lib/data-port";
import { languagesOf } from "@/lib/country-languages";
import type { SourceRow, SourcesOverview } from "@/lib/integrity.functions";
import type { ReviewLocale } from "@/lib/ui-i18n-admin.functions";

/** دول التركيز الخمس، كما في التحقّق النموذجي. */
const CODES = ["LK", "PK", "TH", "SD", "SN"] as const;
const STATUS: SourceRow["status"][] = ["active", "trial", "onboarding", "trial", "onboarding"];

export function demoSources(): SourcesOverview {
  const sources: SourceRow[] = CODES.map((code, i) => ({
    key: `demo-${code.toLowerCase()}`,
    name: `DEMO-OFFICE-${code}`,
    country: code,
    country_name: code,
    country_status: "active",
    emergency_note: null,
    status: STATUS[i] ?? "onboarding",
    base_url: null,
    last_sync_at: null,
    last_error: null,
    last_reconcile_at: null,
    mirrored: 40 - i * 6,
    locked: 3 + i,
    open_discrepancies: i % 3,
    batches: 5 - i,
    checklist: {
      key_issued: i < 4,
      first_sync: i < 3,
      reconciled: i < 2,
      org_linked: i < 4,
      office_reviewed: i < 1,
      regions_mapped: i < 3,
    },
  }));
  return {
    sources,
    pending_unlocks: 2,
    open_discrepancies: sources.reduce((n, s) => n + s.open_discrepancies, 0),
    locked_total: sources.reduce((n, s) => n + s.locked, 0),
  };
}

export function demoLocales(): ReviewLocale[] {
  const byCode = new Map<string, string[]>();
  for (const c of CODES)
    for (const l of languagesOf(c)) {
      if (l === "ar" || l === "en") continue;
      byCode.set(l, [...(byCode.get(l) ?? []), c]);
    }
  return [...byCode].map(([code, countries], i) => ({
    code,
    name: displayName(code),
    dir: code === "ur" ? "rtl" : "ltr",
    status: i === 0 ? "live" : "draft",
    countries,
    counts: { draft: 120 - i * 10, reviewed: 60 - i * 8, published: i === 0 ? 400 : 0 },
  }));
}

function displayName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function registerSettingsDemos() {
  registerDemo("settings.sources", async () => JSON.stringify(demoSources()));
  registerDemo("settings.locales", async () => ({
    ok: true,
    data: { locales: demoLocales(), total: 600, bundled: [] },
  }));
}
