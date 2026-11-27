import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { SponsorshipLedger } from "@/lib/ledger.functions";

// the page outside a router and a server: links become anchors, server functions are inert
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", null, children),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["middleware"] = () => chain;
    chain["inputValidator"] = () => chain;
    chain["handler"] = () => async () => null;
    return chain;
  },
  createIsomorphicFn: () => ({
    client: () => ({ server: () => () => "ar" }),
    server: () => ({ client: () => () => "ar" }),
  }),
}));
vi.mock("@/components/profile/OrphanProfilePanel", () => ({ OrphanProfilePanel: () => null }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const { SponsorshipChildPage } = await import("./SponsorshipChildPage");

const ID = "11111111-1111-4111-8111-111111111111";
const ORPHAN = "22222222-2222-4222-8222-222222222222";

/* what a leaking screen could show: none of it may reach the sponsor */
const SECRET_REASON = "SECRET-ALERT-REASON-name-mismatch";
const SECRET_FIELD = "SECRET-FIELD-VALUE-1999-01-01";
const SECRET_RAISER = "SECRET-RAISED-BY-staff";

const ledger: SponsorshipLedger = {
  sponsorship: {
    id: ID,
    amount: 50,
    currency: "EUR",
    status: "active",
    type: "monthly",
    started_at: "2026-09-02T00:00:00Z",
    next_charge_at: "2026-12-02T00:00:00Z",
    is_anonymous: false,
    message: null,
    message_status: "pending",
    created_at: "2026-09-01T00:00:00Z",
  },
  orphan: { id: ORPHAN, code: "C-7", display_name: "Amina", country: "SN", age_band: "6-9" },
  months: [
    {
      month: "2026-10",
      upcoming: false,
      due: 50,
      paid: 50,
      payment_status: "paid",
      delivery_status: "delivered",
      delivered_at: "2026-10-12T00:00:00Z",
    },
    {
      month: "2026-11",
      upcoming: false,
      due: 50,
      paid: 50,
      payment_status: "paid",
      delivery_status: "transferred",
      delivered_at: null,
    },
  ],
  totals: { paid: 100, months_paid: 2, months_delivered: 1 },
};

function render() {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  qc.setQueryData(["ledger", ID], { ok: true, ledger });
  // a verification row carrying admin-only fields, as a careless projection might
  qc.setQueryData(["public-verification", ORPHAN], {
    level: "under_review",
    accepts: false,
    verified_month: null,
    reason: SECRET_REASON,
    field_value: SECRET_FIELD,
    raised_by: SECRET_RAISER,
  });
  qc.setQueryData(["reports", ORPHAN], { ok: true, reports: [] });
  qc.setQueryData(
    ["sponsor-qualification", ORPHAN],
    JSON.stringify({ allowed: true, programs: [], growth: [] }),
  );
  qc.setQueryData(["my-sponsorships"], { sponsorships: [], error: null });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(SponsorshipChildPage, { sponsorshipId: ID }),
    ),
  );
}

describe("صفحة الطفل وملفٌّ قيد المراجعة", () => {
  const html = render();

  it("says only the generic review copy, and the sponsorship continues", () => {
    expect(html).toContain("هذا الملفّ قيد مراجعةٍ دورية");
    expect(html).toContain("كفالتك مستمرّة");
    expect(html).toContain("قيد التحقق");
  });

  it("shows no alert reason, field value or who raised it", () => {
    for (const s of [SECRET_REASON, SECRET_FIELD, SECRET_RAISER]) expect(html).not.toContain(s);
  });

  it("states evidence by month counts and shows the photo honesty caption", () => {
    expect(html).toContain("1 من 2 من الأشهر المدفوعة");
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\d+\s*%/);
    expect(html).toContain("لم تُعرض الصورة حمايةً لخصوصية الطفل");
    expect(html).toContain("رسالتك قيد المراجعة");
  });
});
