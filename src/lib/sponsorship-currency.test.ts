import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * عملة الدفع عند إنشاء الكفالة: الخادم يقبل عملة الحاجة أو ما تعيده القاعدة
 * ممّا يُدفع به لهذا الطفل ويحصّل به المزوّد، ويرسل ما كتبه الكافل بعملته
 * (`charge_*`) — والمقيَّد لحاجة الطفل يُحسب بالسعر المخزَّن. والمسار القديم
 * (بلا عملة) لا يرسل عموداً جديداً.
 */
const mocks = vi.hoisted(() => ({ userRpc: vi.fn(), publicRpc: vi.fn(), insert: vi.fn() }));

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
vi.mock("@/integrations/supabase/types.extra", () => ({ withM5: (c: unknown) => c }));
vi.mock("@/lib/protection.functions", () => ({
  publicClient: () => ({ rpc: mocks.publicRpc }),
}));

import { createSponsorship, getPayOptions } from "./sponsorships.functions";

const ORPHAN = "a9200000-0000-4000-8000-00000000000b";
const OPTIONS = [
  { currency: "EUR", kind: "operating" },
  {
    currency: "USD",
    kind: "unified",
    pair: "EUR/USD",
    rate: 1.08,
    as_of: "2026-11-21",
    source: "desk:approved",
    indicative: false,
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const call = (fn: unknown, args: unknown): Promise<Loose> =>
  (fn as (a: unknown) => Promise<Loose>)(args);

let gap = 80;
let payRows: unknown = OPTIONS;
let payError: { message: string } | null = null;

function rpcImpl(name: string) {
  if (name === "orphan_funding_state") return { data: { gap, currency: "EUR" }, error: null };
  if (name === "suggest_orphans_for_amount") return { data: [], error: null };
  if (name === "sponsorship_pay_options")
    return { data: payError ? null : payRows, error: payError };
  return { data: null, error: null };
}

function context() {
  const orphanQuery = {
    select: () => orphanQuery,
    eq: () => orphanQuery,
    maybeSingle: async () => ({
      data: { id: ORPHAN, currency: "EUR", status: "approved" },
      error: null,
    }),
    insert: (row: unknown) => {
      mocks.insert(row);
      return { select: () => ({ single: async () => ({ data: { id: "s1" }, error: null }) }) };
    },
  };
  return { userId: "u1", supabase: { from: () => orphanQuery, rpc: mocks.userRpc } };
}

const input = (over: Record<string, unknown>) => ({
  data: {
    orphanId: ORPHAN,
    amount: 54,
    type: "monthly",
    isAnonymous: false,
    confirmExcess: false,
    ...over,
  },
  context: context(),
});

const ENV = [
  "PAYMENT_PROVIDER",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_PRODUCT_MONTHLY",
  "CREEM_PRODUCT_ONETIME",
  "CREEM_PRODUCT_CURRENCY",
];

beforeEach(() => {
  vi.clearAllMocks();
  gap = 80;
  payRows = OPTIONS;
  payError = null;
  for (const m of [mocks.userRpc, mocks.publicRpc]) {
    m.mockImplementation(async (name: string) => rpcImpl(name));
  }
  // مزوّدٌ إلكتروني بمنتجين بالدولار: الموحّدة ممّا يُحصَّل به.
  process.env["PAYMENT_PROVIDER"] = "creem";
  process.env["CREEM_API_KEY"] = "creem_test_key";
  process.env["CREEM_WEBHOOK_SECRET"] = "whsec";
  process.env["CREEM_PRODUCT_MONTHLY"] = "prod_m";
  process.env["CREEM_PRODUCT_ONETIME"] = "prod_o";
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

describe("عملة الدفع عند إنشاء الكفالة", () => {
  it("بلا عملة: المسار القديم، ولا عمود تحصيلٍ يُرسل", async () => {
    const res = await call(createSponsorship, input({ amount: 50 }));
    expect(res).toEqual({ ok: true, sponsorshipId: "s1" });
    const row = mocks.insert.mock.calls[0]![0];
    expect(row).toMatchObject({ amount: 50, currency: "EUR", status: "pending_payment" });
    expect(row).not.toHaveProperty("charge_currency");
    expect(row).not.toHaveProperty("charge_amount");
    expect(mocks.userRpc).not.toHaveBeenCalledWith("sponsorship_pay_options", expect.anything());
  });

  it("عملة الحاجة نفسها تُعامل كالغائبة", async () => {
    await call(createSponsorship, input({ amount: 50, currency: "EUR" }));
    expect(mocks.insert.mock.calls[0]![0]).not.toHaveProperty("charge_currency");
  });

  it("بالموحّدة: يُرسل ما كتبه الكافل بعملته، والمقيَّد بالسعر المخزَّن", async () => {
    const res = await call(createSponsorship, input({ amount: 54, currency: "USD" }));
    expect(res.ok).toBe(true);
    expect(mocks.insert.mock.calls[0]![0]).toMatchObject({
      amount: 50,
      currency: "EUR",
      charge_currency: "USD",
      charge_amount: 54,
    });
  });

  it("«المتبقّي كاملاً» بالموحّدة لا يُعدّ تجاوزاً، وما فوقه يُسأل عنه", async () => {
    // gap 80 EUR → 87 USD → 80.55 EUR credited: within one payment unit of the gap
    const fill = await call(createSponsorship, input({ amount: 87, currency: "USD" }));
    expect(fill.ok).toBe(true);
    // 88 USD → 81.48 EUR: 1.48 over, more than one dollar's worth
    const over = await call(createSponsorship, input({ amount: 88, currency: "USD" }));
    expect(over.needsExcessConfirmation).toBe(true);
    expect(over.gap).toBe(80);
    expect(over.excess).toBeCloseTo(1.48, 2);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("بعملة الحاجة: أيّ زيادةٍ عن المتبقّي تُسأل كما كان قبل العملة الموحّدة", async () => {
    const over = await call(createSponsorship, input({ amount: 81 }));
    expect(over.needsExcessConfirmation).toBe(true);
    gap = 80.55;
    const fraction = await call(createSponsorship, input({ amount: 81 }));
    expect(fraction.needsExcessConfirmation).toBe(true);
  });

  it("عملةٌ لا تُدفع بها لهذا الطفل تُرفض قبل الإدراج", async () => {
    const res = await call(createSponsorship, input({ amount: 54, currency: "GBP" }));
    expect(res.ok).toBe(false);
    expect(res.error).toContain("GBP");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("هجرةٌ لم تُطبَّق (الدالّة غائبة): الموحّدة تُرفض ولا يُحصَّل شيءٌ بعملةٍ أخرى", async () => {
    payError = { message: "function public.sponsorship_pay_options(uuid) does not exist" };
    const res = await call(createSponsorship, input({ amount: 54, currency: "USD" }));
    expect(res.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("مزوّدٌ لا يحصّل بالعملة: لا تُقبل", async () => {
    process.env["CREEM_PRODUCT_CURRENCY"] = "EUR";
    const res = await call(createSponsorship, input({ amount: 54, currency: "USD" }));
    expect(res.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("التحويل اليدوي: عملة الحاجة وحدها", async () => {
    delete process.env["PAYMENT_PROVIDER"];
    const res = await call(createSponsorship, input({ amount: 54, currency: "USD" }));
    expect(res.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("الشهرية بعملةٍ أخرى مبلغٌ صحيح بلا كسور", async () => {
    const res = await call(createSponsorship, input({ amount: 54.5, currency: "USD" }));
    expect(res.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
    const once = await call(
      createSponsorship,
      input({ amount: 54.5, currency: "USD", type: "one_time" }),
    );
    expect(once.ok).toBe(true);
  });
});

describe("عملات الدفع المعروضة", () => {
  const ask = () => call(getPayOptions, { data: { orphanId: ORPHAN, currency: "EUR" } });

  it("عملة الحاجة ثم الموحّدة بسعرها حين يحصّل بها المزوّد", async () => {
    const o = await ask();
    expect(o.options.map((x: { currency: string }) => x.currency)).toEqual(["EUR", "USD"]);
    expect(o.rates).toEqual([
      {
        base: "EUR",
        quote: "USD",
        rate: 1.08,
        asOf: "2026-11-21",
        source: "desk:approved",
        indicative: false,
      },
    ]);
  });

  it("سعرٌ استرشادي (بذرة الهجرة): لا تُعرض به عملةٌ ولا يُحصَّل به", async () => {
    payRows = OPTIONS.map((o) =>
      "rate" in o ? { ...o, source: "seed:indicative", indicative: true } : o,
    );
    const o = await ask();
    expect(o.options.map((x: { currency: string }) => x.currency)).toEqual(["EUR"]);
    expect(o.rates).toEqual([]);
    const res = await call(createSponsorship, input({ amount: 54, currency: "USD" }));
    expect(res.ok).toBe(false);
    payRows = OPTIONS;
  });

  it("التحويل اليدوي أو مزوّدٌ بلا منتجٍ بالعملة: عملة الحاجة وحدها بلا أسعار", async () => {
    delete process.env["PAYMENT_PROVIDER"];
    expect(await ask()).toEqual({
      needCurrency: "EUR",
      options: [{ currency: "EUR", kind: "operating" }],
      rates: [],
    });
    process.env["PAYMENT_PROVIDER"] = "creem";
    delete process.env["CREEM_PRODUCT_ONETIME"];
    expect((await ask()).options).toHaveLength(1);
  });

  it("تعذّر القراءة: عملة الحاجة وحدها كما كان", async () => {
    payError = { message: "boom" };
    expect(await ask()).toEqual({
      needCurrency: "EUR",
      options: [{ currency: "EUR", kind: "need" }],
      rates: [],
    });
  });
});
