import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * مسار الدخول من الندوة: الجلسة تُفتح للحساب المربوط بمعرّف الندوة (`sub`) لا لبريد
 * الرمز، والرمز المستعمل يُرفض، ولا شيء يُفتح بلا كعكة الربط بالمتصفّح.
 */
const ISS = "https://youth.wamy.example";
const SECRET = "a-shared-secret-that-is-long-enough-123";

const state = {
  rpc: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  createUser: vi.fn(),
};

vi.mock("@/lib/integrations/client", () => ({ guardApiRate: async () => null }));
vi.mock("@/lib/env.server", () => ({
  serverConfig: () => ({
    features: { sso: { ready: true } },
    env: { WAMY_SSO_ISSUER: ISS },
  }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...a: unknown[]) => state.rpc(...a),
    auth: {
      admin: {
        getUserById: (...a: unknown[]) => state.getUserById(...a),
        generateLink: (...a: unknown[]) => state.generateLink(...a),
        createUser: (...a: unknown[]) => state.createUser(...a),
      },
    },
  },
}));

const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b;
  let s = "";
  bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function token(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64url(JSON.stringify({ alg: "HS256" }))}.${b64url(
    JSON.stringify({
      iss: ISS,
      aud: "kahatayn",
      sub: "wamy-42",
      email,
      email_verified: true,
      iat: now,
      exp: now + 60,
      jti: "launch-abcdef",
    }),
  )}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head)));
  return `${head}.${b64url(sig)}`;
}

const req = (origin: string | null = new URL(ISS).origin) =>
  new Request("https://kahatayn.example/api/sso/wamy", {
    method: "POST",
    headers: origin ? { origin } : {},
  });

beforeEach(() => {
  process.env["WAMY_SSO_SECRET"] = SECRET;
  delete process.env["WAMY_SSO_JWKS_URL"];
  for (const f of Object.values(state)) f.mockReset();
  state.rpc.mockImplementation(async (fn: string) =>
    fn === "sso_claim_jti"
      ? { data: true, error: null }
      : { data: { ok: true, user_id: "user-A", linked: "existing" }, error: null },
  );
  state.getUserById.mockResolvedValue({ data: { user: { email: "a@wamy.example" } }, error: null });
  state.generateLink.mockImplementation(async ({ email }: { email: string }) => ({
    data: {
      user: { id: email === "a@wamy.example" ? "user-A" : "user-B" },
      properties: { hashed_token: "hashed" },
    },
    error: null,
  }));
});

describe("الدخول من الندوة", () => {
  it("يفتح الجلسة لحساب المعرّف المربوط، لا لبريد الرمز", async () => {
    const { handle } = await import("./launch.server");
    const res = await handle(req(), await token("b@wamy.example"));
    expect(state.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "a@wamy.example" });
    expect(res.headers.get("location")).toMatch(/\/sso#n=[0-9a-f-]{36}&next=/);
    expect(res.headers.get("set-cookie")).toMatch(/kh_sso_nonce=.*HttpOnly.*SameSite=Lax/);
    expect(res.headers.get("location")).not.toContain("hashed");
    expect(state.rpc).toHaveBeenCalledWith(
      "sso_handoff_put",
      expect.objectContaining({ _token_hash: "hashed" }),
    );
  });

  it("يرفض نموذجاً من موقعٍ آخر أو بلا مصدر", async () => {
    const { handle } = await import("./launch.server");
    for (const o of ["https://evil.example", null]) {
      const res = await handle(req(o), await token("a@wamy.example"));
      expect(res.headers.get("location")).toMatch(/#error=origin_denied$/);
    }
    expect(state.generateLink).not.toHaveBeenCalled();
  });

  it("يرفض إن لم يطابق صاحب الرابط الحساب المربوط", async () => {
    state.generateLink.mockResolvedValue({
      data: { user: { id: "user-B" }, properties: { hashed_token: "hashed" } },
      error: null,
    });
    const { handle } = await import("./launch.server");
    const res = await handle(req(), await token("a@wamy.example"));
    expect(res.headers.get("location")).toMatch(/#error=session_failed$/);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("يرفض الرمز المستعمل", async () => {
    state.rpc.mockResolvedValueOnce({ data: false, error: null });
    const { handle } = await import("./launch.server");
    const res = await handle(req(), await token("a@wamy.example"));
    expect(res.headers.get("location")).toMatch(/#error=token_used$/);
  });
});
