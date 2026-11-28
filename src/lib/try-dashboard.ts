/**
 * لوحة الكافل في العرض التفاعلي: ما بقي من أقسام `/dashboard` بلا نظير، على أطفال التجربة
 * الخياليين وحدهم (`TRY_CHILDREN`): «من أتابعهم»، و«مقترحون لك»، و«أين ذهبت هذه الدفعة؟».
 * لا صورة ولا مدينة ولا معرّف قابل للدفع، وكل شيء في ذاكرة الصفحة.
 * يُسجَّل بنداءٍ صريح (`registerDashboardDemos`)، لأنّ الحزمة `sideEffects: false`.
 * (من ملفّات التجربة في `trial.manifest.json`.)
 */
import type { SponsorPreferences, SuggestedOrphan } from "@/integrations/supabase/types.extra";
import { registerDemo } from "@/lib/data-port";
import type { PaymentLookup } from "@/lib/ledger.functions";
import type { Locale } from "@/lib/locale";
import type { MyAccessRow, ScopeCatalog } from "@/lib/scopes.functions";
import { localTryChild, TRY_CHILDREN, TRY_CURRENCY } from "@/lib/try-demo";
import { trySponsorships } from "@/lib/try-sponsor-center";

/** رقم الفاتورة النموذجي الذي يُعرض في نصّ البحث نفسه، فيجرّبه الزائر. */
export const TRY_INVOICE = "INV-2026-000123";

const SCOPES = {
  ar: { updates: "أخبار الشهر", reports: "التقارير الدورية", pkg: "متابعة أساسية" },
  en: { updates: "Monthly news", reports: "Periodic reports", pkg: "Basic follow-up" },
};

export function registerDashboardDemos(locale: Locale = "ar") {
  const s = locale === "ar" ? SCOPES.ar : SCOPES.en;
  const kids = TRY_CHILDREN.map((c) => localTryChild(c, locale));

  const access: MyAccessRow[] = kids.slice(2, 3).map((c) => ({
    id: `try-access-${c.id}`,
    orphan_id: c.id,
    orphan: c.name,
    code: c.code,
    status: "approved",
    requested_package: "basic",
    granted_scopes: ["updates", "reports"],
    expires_at: "2027-03-01T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
  }));
  const catalog: ScopeCatalog = {
    scopes: [
      { key: "updates", label: s.updates, description: s.updates, sensitivity: 1 },
      { key: "reports", label: s.reports, description: s.reports, sensitivity: 1 },
    ],
    packages: [{ key: "basic", label: s.pkg, description: s.pkg, scopes: ["updates", "reports"] }],
  };
  registerDemo("access.mine", async () => access.map((r) => ({ ...r })));
  registerDemo("access.catalog", async () => catalog);

  let prefs: SponsorPreferences = {
    monthly_budget: 80,
    preferred_region: null,
    city: null,
    full_name: null,
  };
  const suggestions = (): SuggestedOrphan[] =>
    kids.slice(3, 6).map((c) => {
      const gap = Math.max(0, c.need - c.funded);
      return {
        id: c.id,
        code: c.code,
        display_name: c.name,
        gender: null,
        birth_date: null,
        city: null,
        region: c.country,
        story: c.covers,
        photo_url: null,
        education_stage: c.stage,
        monthly_need: c.need,
        funded_monthly: c.funded,
        currency: TRY_CURRENCY,
        status: "approved",
        org_id: null,
        created_at: "2026-01-01T00:00:00Z",
        gap,
        building: true,
        completes: (prefs?.monthly_budget ?? 0) >= gap,
        in_region: false,
      } as SuggestedOrphan;
    });
  registerDemo("matching.suggestions", async () => ({
    ok: true as const,
    error: null,
    suggestions: suggestions(),
  }));
  registerDemo("matching.prefs", async () => ({
    ok: true,
    error: null,
    preferences: prefs,
    regions: [...new Set(kids.map((c) => c.country))],
  }));
  registerDemo(
    "matching.savePrefs",
    async ({
      data,
    }: {
      data: { monthlyBudget: number | null; preferredRegion: string | null };
    }) => {
      prefs = {
        monthly_budget: data.monthlyBudget,
        preferred_region: data.preferredRegion,
        city: null,
        full_name: null,
      };
      return { ok: true as const, error: null, preferences: prefs };
    },
  );

  registerDemo(
    "ledger.lookupPayment",
    async ({ data }: { data: { ref: string } }): Promise<PaymentLookup> => {
      const first = trySponsorships(locale)[0];
      if (!first || data.ref.trim().toUpperCase() !== TRY_INVOICE) return { found: false };
      return {
        found: true,
        invoice_no: TRY_INVOICE,
        provider: null,
        provider_payment_id: null,
        amount: first.amount,
        currency: first.currency,
        status: "paid",
        paid_at: first.started_at ?? "2026-10-01T00:00:00Z",
        sponsorship_id: first.id,
        month: "2026-10",
        orphan: first.orphan?.display_name ?? "",
        orphan_code: first.orphan?.code ?? "",
        month_receipt: null,
        delivery_status: "delivered",
        anchor: null,
      } as PaymentLookup;
    },
  );
}
