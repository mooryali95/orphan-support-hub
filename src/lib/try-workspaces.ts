/**
 * «بواباتي» في العرض التفاعلي: أدوارٌ نموذجية تملأ الشاشة الحقيقية نفسها عبر منفذ البيانات.
 * لا شيء هنا يصل الخادم، ولا اسم جهةٍ حقيقية: الجهة المانحة نموذجية ظاهرة الصفة.
 * (من ملفّات التجربة في `trial.manifest.json`.)
 */
import { registerDemo } from "@/lib/data-port";
import type { DonorDashboard, DonorPledge, Workspaces } from "@/lib/workspaces.functions";

/** معرّف الجهة المانحة النموذجية: تفتحها صفحة `/try/donor/$id`. */
export const TRY_DONOR_ID = "try-donor-1";

/** أسماء نموذجية بلغتين: لا يظهر اسمٌ عربي في الواجهة الإنجليزية. */
const NAMES = {
  ar: { office: "مكتب نموذجي", donor: "جهة مانحة نموذجية" },
  en: { office: "Sample office", donor: "Sample donor entity" },
};
const namesFor = (locale: string) => (locale === "ar" ? NAMES.ar : NAMES.en);

const workspacesFor = (locale: string): Workspaces => ({
  admin: true,
  offices: [
    {
      id: "try-office",
      name: namesFor(locale).office,
      role: "manager",
      country: "LK",
      region: null,
    },
  ],
  donor_entities: [
    { id: TRY_DONOR_ID, name: namesFor(locale).donor, status: "approved", role: "owner" },
  ],
  care_org: true,
  care_org_status: "approved",
  guardian: true,
  supervisor: true,
  translator_locales: [],
  pledges: 2,
});

const donorFor = (locale: string): DonorDashboard => ({
  entity: {
    id: TRY_DONOR_ID,
    name: namesFor(locale).donor,
    type: "foundation",
    status: "approved",
  },
  by_kind: { qualification: 2, in_kind: 1 },
  by_target: { region: 2, orphan: 1 },
  members: 3,
});

// تعهّداتٌ نموذجية بلا أسماء أطفال: الهدف منطقةٌ أو رمز ملفٍّ نموذجي.
const PLEDGES: DonorPledge[] = [
  {
    id: "try-pledge-1",
    kind: "qualification",
    target_type: "region",
    target: "LKA-1",
    amount: 4800,
    currency: "USD",
    status: "active",
    created_at: "2026-06-01T00:00:00Z",
    country: "LK",
    delivered_at: null,
  },
  {
    id: "try-pledge-2",
    kind: "qualification",
    target_type: "region",
    target: "PAK-2",
    amount: 3000,
    currency: "USD",
    status: "fulfilled",
    created_at: "2026-03-10T00:00:00Z",
    country: "PK",
    delivered_at: "2026-09-20T00:00:00Z",
  },
  {
    id: "try-pledge-3",
    kind: "in_kind",
    target_type: "orphan",
    target: "try-01",
    amount: 250,
    currency: "USD",
    status: "pending",
    created_at: "2026-10-02T00:00:00Z",
    country: "SN",
    delivered_at: null,
  },
];

/**
 * يسجّل نسخ «بواباتي» التجريبية. تناديه صفحة `/try/workspaces` صراحةً
 * (`package.json` يعلن `sideEffects: false`، فالاستيراد المجرّد يُحذف من الحزمة).
 */
export function registerWorkspacesDemos(locale = "ar") {
  registerDemo("workspaces.mine", async () => ({
    ok: true as const,
    error: null,
    workspaces: workspacesFor(locale),
  }));
  registerDemo("workspaces.countryAccess", async () => ({
    ok: true as const,
    data: { countries: ["LK"] },
  }));
  registerDemo("workspaces.donorInvitations", async () => []);
}

/** نسخ لوحة الجهة المانحة التجريبية. تناديها صفحة `/try/donor/$entityId` صراحةً. */
export function registerDonorDemos(locale = "ar") {
  registerDemo("donor.dashboard", async ({ data }: { data: { entityId: string } }) =>
    data.entityId === TRY_DONOR_ID
      ? { ok: true as const, error: null, dashboard: donorFor(locale) }
      : { ok: false as const, error: "not_found", dashboard: null },
  );
  registerDemo("donor.pledges", async ({ data }: { data: { entityId: string } }) =>
    data.entityId === TRY_DONOR_ID ? PLEDGES : [],
  );
}
