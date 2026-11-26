import { describe, expect, it } from "vitest";

import { callRpc } from "./rpc-call";

const client = (data: unknown, error: { message: string; code?: string } | null = null) => ({
  rpc: async () => ({ data, error }),
});

describe("callRpc", () => {
  it("returns data on success", async () => {
    expect(await callRpc<number[]>(client([1, 2]), "f")).toEqual({ ok: true, data: [1, 2] });
  });

  it("marks a missing function as missing", async () => {
    const r = await callRpc(
      client(null, { message: "Could not find the function", code: "PGRST202" }),
      "f",
    );
    expect(r).toEqual({ ok: false, missing: true, error: "failed" });
  });

  it("passes short codes through and hides long messages", async () => {
    expect(await callRpc(client(null, { message: "not_admin" }), "f")).toEqual({
      ok: false,
      missing: false,
      error: "not_admin",
    });
    expect(await callRpc(client(null, { message: "duplicate key value violates" }), "f")).toEqual({
      ok: false,
      missing: false,
      error: "failed",
    });
  });

  it("maps { ok:false, code } payloads to errors", async () => {
    expect(await callRpc(client({ ok: false, code: "locked" }), "f")).toEqual({
      ok: false,
      missing: false,
      error: "locked",
    });
    expect(await callRpc(client({ ok: false }), "f")).toEqual({
      ok: false,
      missing: false,
      error: "failed",
    });
  });

  it("forwards function name and args", async () => {
    const seen: unknown[] = [];
    const c = { rpc: async (...a: unknown[]) => (seen.push(a), { data: true, error: null }) };
    await callRpc(c, "fn_x", { _a: 1 });
    expect(seen).toEqual([["fn_x", { _a: 1 }]]);
  });
});
