import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * APP-09: اقتراحات الفائض نداءان بلا دخول (`previewSponsorship`) أو قبل
 * الإنشاء (`createSponsorship`). كانا يقرآن بمفتاح الخدمة ويعيدان الصفّ
 * كما هو — المنطقة والمرحلة معه — فيتجاوزان حجب الحشد الصغير.
 *
 * هنا يُحاكى مصدرٌ لم تُطبَّق عليه هجرة الحجب بعد (يُعيد «Kukes») فيُثبت
 * أن الخادم نفسه لا يمرّر ما لا تعرضه البطاقة، وأنه لا يقرأ بمفتاح الخدمة.
 */
const mocks = vi.hoisted(() => ({ adminRpc: vi.fn(), publicRpc: vi.fn(), userRpc: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.adminRpc, from: vi.fn() },
}));
vi.mock("@/integrations/supabase/types.extra", () => ({ withM5: (c: unknown) => c }));
vi.mock("@/lib/protection.functions", () => ({
  publicClient: () => ({ rpc: mocks.publicRpc }),
}));

import { createSponsorship, getFundingState, previewSponsorship } from "./sponsorships.functions";

const LEAKY_ROW = {
  id: "a9200000-0000-4000-8000-00000000000c",
  code: "XE-LONE",
  display_name: "طفل",
  country: "ألبانيا",
  region: "Kukes",
  education_stage: "grade_5",
  city: "Kukes",
  photo_url: "https://x.test/p.jpg",
  currency: "EUR",
  monthly_need: 100,
  funded_monthly: 40,
  gap: 60,
};

function rpcImpl(name: string) {
  if (name === "orphan_funding_state") return { data: { gap: 20, currency: "EUR" }, error: null };
  if (name === "suggest_orphans_for_amount") return { data: [LEAKY_ROW], error: null };
  return { data: null, error: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const call = (fn: unknown, args: unknown): Promise<Loose> =>
  (fn as (a: unknown) => Promise<Loose>)(args);

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [mocks.adminRpc, mocks.publicRpc, mocks.userRpc]) {
    m.mockImplementation(async (name: string) => rpcImpl(name));
  }
});

function expectMasked(suggestions: Array<Record<string, unknown>>) {
  expect(suggestions).toHaveLength(1);
  const s = suggestions[0]!;
  for (const k of ["region", "education_stage", "city", "photo_url", "country"]) {
    expect(s).not.toHaveProperty(k);
  }
  expect(JSON.stringify(suggestions)).not.toContain("Kukes");
  expect(s).toMatchObject({ id: LEAKY_ROW.id, display_name: "طفل", gap: 60, currency: "EUR" });
}

describe("اقتراحات الفائض لا تكشف موقع الطفل (APP-09)", () => {
  it("المعاينة بلا دخول: لا منطقة ولا مرحلة، ولا مفتاح خدمة", async () => {
    const res = await call(previewSponsorship, {
      data: { orphanId: "a9200000-0000-4000-8000-00000000000b", amount: 200 },
    });
    expect(res.ok).toBe(true);
    expectMasked(res.suggestions);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.publicRpc).toHaveBeenCalledWith("suggest_orphans_for_amount", expect.anything());
  });

  it("الإنشاء قبل الإقرار: الاقتراحات بجلسة الكافل ومحجوبة", async () => {
    const orphanQuery = {
      select: () => orphanQuery,
      eq: () => orphanQuery,
      maybeSingle: async () => ({
        data: { id: "a9200000-0000-4000-8000-00000000000b", currency: "EUR", status: "approved" },
        error: null,
      }),
    };
    const res = await call(createSponsorship, {
      data: {
        orphanId: "a9200000-0000-4000-8000-00000000000b",
        amount: 200,
        type: "monthly",
        isAnonymous: false,
        confirmExcess: false,
      },
      context: {
        userId: "u1",
        supabase: { from: () => orphanQuery, rpc: mocks.userRpc },
      },
    });
    expect(res.needsExcessConfirmation).toBe(true);
    expectMasked(res.suggestions);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("حال التمويل للزائر لا تُقرأ بمفتاح الخدمة", async () => {
    const res = await call(getFundingState, {
      data: { orphanId: "a9200000-0000-4000-8000-00000000000b" },
    });
    expect(res.ok).toBe(true);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});
