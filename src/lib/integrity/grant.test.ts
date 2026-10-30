import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "./canonical";
import { signGrant, verifyGrant, type GrantPayload } from "./grant";

async function pair() {
  return (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
}
const payload = (over: Partial<GrantPayload> = {}): GrantPayload => ({
  iss: "kahatayn",
  aud: "rowad:AL",
  sub: "students/st-1",
  op: "update",
  fields: ["class_id"],
  request_id: "r1",
  approved_by: ["a", "b"],
  exp: Math.floor(Date.now() / 1000) + 900,
  jti: "j1",
  ...over,
});

describe("الإذن الموقّع", () => {
  it("يُقبل بتوقيعه وجمهوره", async () => {
    const k = await pair();
    const t = await signGrant(payload(), k.privateKey);
    const r = await verifyGrant(t, k.publicKey, { aud: "rowad:AL" });
    expect(r.ok && r.payload.sub).toBe("students/st-1");
  });

  it("يُرفض المعدَّل، ولدولةٍ أخرى، والمنتهي، وبمفتاحٍ آخر", async () => {
    const k = await pair();
    const other = await pair();
    const t = await signGrant(payload(), k.privateKey);
    const [h, , s] = t.split(".");
    const forged = `${h}.${btoa(JSON.stringify(payload({ op: "delete" }))).replace(/=+$/, "")}.${s}`;
    expect(await verifyGrant(forged, k.publicKey, { aud: "rowad:AL" })).toMatchObject({
      ok: false,
    });
    expect(await verifyGrant(t, k.publicKey, { aud: "rowad:XK" })).toMatchObject({
      reason: "bad_audience",
    });
    expect(await verifyGrant(t, other.publicKey, { aud: "rowad:AL" })).toMatchObject({
      reason: "bad_signature",
    });
    const old = await signGrant(payload({ exp: 1 }), k.privateKey);
    expect(await verifyGrant(old, k.publicKey, { aud: "rowad:AL" })).toMatchObject({
      reason: "expired",
    });
  });
});

describe("البصمة المعيارية", () => {
  it("ترتيب المفاتيح لا يغيّرها، والقيمة تغيّرها", async () => {
    const a = await sha256Hex(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] }));
    const b = await sha256Hex(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
    const c = await sha256Hex(canonicalJson({ a: [{ x: 1, y: 3 }], b: 1 }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
