import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
vi.mock("@/integrations/supabase/types.extra", () => ({ withPhase7: (c: unknown) => c }));

import { FAIL_CLOSED, clientIp, hitRateLimit, identityOf } from "./rate-limit";

const req = (headers: Record<string, string>) => new Request("https://x.test/", { headers });

describe("APP-10: تحديد المعدّل", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("العنوان من cf-connecting-ip وحده: لا x-forwarded-for ولا وكيل المتصفّح", async () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
    expect(clientIp(req({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }))).toBe(
      "9.9.9.9",
    );
    const a = await identityOf(req({ "cf-connecting-ip": "9.9.9.9", "user-agent": "A" }));
    const b = await identityOf(req({ "cf-connecting-ip": "9.9.9.9", "user-agent": "B" }));
    expect(a).toBe(b);
    const c = await identityOf(req({ "cf-connecting-ip": "8.8.8.8" }));
    expect(c).not.toBe(a);
  });

  it("المستخدم المسجَّل يُعدّ بمعرّفه", async () => {
    expect(await identityOf(req({}), "u1")).toBe("u:u1");
  });

  it("تعذّر العدّ يُغلق المسارات الحسّاسة ويُبقي البحث مفتوحاً", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    for (const b of ["auth", "checkout", "api", "api_client", "cron", "intake"] as const) {
      expect(FAIL_CLOSED.has(b)).toBe(true);
      expect((await hitRateLimit(b, "a:x")).allowed).toBe(false);
    }
    expect((await hitRateLimit("search", "a:x")).allowed).toBe(true);
  });

  it("الحكم من القاعدة يُمرَّر كما هو", async () => {
    rpc.mockResolvedValue({
      data: { allowed: false, hits: 11, limit: 10, reset_at: "2030-01-01T00:00:00Z" },
      error: null,
    });
    expect(await hitRateLimit("auth", "a:x")).toMatchObject({ allowed: false, hits: 11 });
  });
});
