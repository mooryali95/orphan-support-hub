import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ adminFrom: vi.fn(), schema: vi.fn() }));
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
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.adminFrom } }));
vi.mock("@/integrations/supabase/types.extra", () => ({
  withDispatch: (client: unknown) => client,
  withPhase4: (client: unknown) => client,
}));
vi.mock("@/lib/schema-preflight.server", () => ({ checkDispatchSchema: mocks.schema }));

import { listMySponsorships } from "./sponsorships.functions";
import { getDispatchHealth } from "./monitoring.functions";

function invoke(fn: unknown, context: unknown): Promise<any> {
  return (fn as (args: { context: unknown }) => Promise<unknown>)({ context });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schema.mockResolvedValue({ ready: true, missing: [] });
});

describe("Sponsorship child-protection regression", () => {
  it("returns the sponsor's active sponsorship without requesting protected columns", async () => {
    const rows = [{ id: "s1", status: "active", orphan: { id: "o1", display_name: "طفل" } }];
    let denied = false;
    const eq = vi.fn().mockImplementation(() => ({
      order: async () => ({ data: denied ? null : rows, error: denied ? { message: "permission denied" } : null }),
    }));
    const select = vi.fn().mockImplementation((columns: string) => {
      denied = /\b(city|photo_url)\b/.test(columns);
      return { eq };
    });
    const result = await invoke(listMySponsorships, { userId: "sponsor-1", supabase: { from: () => ({ select }) } });
    expect(result.error).toBeNull();
    expect(result.sponsorships).toEqual(rows);
    expect(eq).toHaveBeenCalledWith("sponsor_id", "sponsor-1");
  });
});

function adminContext(admin: boolean) {
  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: admin, error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table !== "dispatch_runs") throw new Error("User client cannot count other recipients");
        return { select: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
      }),
    },
  };
}

describe("Global notification queue monitoring", () => {
  it("counts pending and failed emails across all recipients, not only the admin", async () => {
    const queue = [
      { user: "admin", state: "pending" },
      { user: "sponsor-1", state: "pending" },
      { user: "sponsor-2", state: "failed" },
    ];
    mocks.adminFrom.mockReturnValue({ select: () => ({ eq: async (_column: string, state: string) => ({ count: queue.filter((row) => row.state === state).length, error: null }) }) });
    const result = await invoke(getDispatchHealth, adminContext(true));
    expect(result.allowed).toBe(true);
    expect(result.health.queue).toEqual({ pending: 2, failed: 1 });
    expect(result.health.alerts).toHaveLength(1);
  });

  it("denies non-admin callers before privileged reads", async () => {
    const result = await invoke(getDispatchHealth, adminContext(false));
    expect(result).toEqual({ allowed: false });
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.schema).not.toHaveBeenCalled();
  });

  it("does not report a failed queue count as a healthy zero", async () => {
    mocks.adminFrom.mockReturnValue({ select: () => ({ eq: async () => ({ count: null, error: { message: "database unavailable" } }) }) });
    await expect(invoke(getDispatchHealth, adminContext(true))).rejects.toThrow();
  });
});