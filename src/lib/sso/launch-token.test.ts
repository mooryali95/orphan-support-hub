import { describe, expect, it } from "vitest";

import { safeNext, verifyLaunchToken, type LaunchClaims } from "./launch-token";

const ISS = "https://youth.wamy.example";
const SECRET = "a-shared-secret-that-is-long-enough-123";
const NOW = 1_800_000_000;

const b64url = (bytes: Uint8Array | string) => {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const claims = (over: Partial<LaunchClaims> = {}): LaunchClaims => ({
  iss: ISS,
  aud: "kahatayn",
  sub: "wamy-user-42",
  email: "Staff@Wamy.org",
  email_verified: true,
  iat: NOW,
  exp: NOW + 60,
  jti: "launch-0001",
  ...over,
});

async function hs256(payload: object, header: object = { alg: "HS256", typ: "JWT" }) {
  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
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

const verifyHs = (t: string) =>
  verifyLaunchToken(t, { issuer: ISS, keys: { secret: SECRET }, now: NOW });

describe("رمز الإطلاق من الندوة", () => {
  it("يقبل السرّ السابق أثناء التدوير، ولا يقبله بعد محوه", async () => {
    const t = await hs256(claims());
    const NEW = "a-brand-new-rotated-secret-long-enough-456";
    const during = await verifyLaunchToken(t, {
      issuer: ISS,
      keys: { secret: NEW, previousSecret: SECRET },
      now: NOW,
    });
    expect(during.ok).toBe(true);
    const after = await verifyLaunchToken(t, { issuer: ISS, keys: { secret: NEW }, now: NOW });
    expect(after).toEqual({ ok: false, reason: "bad_signature" });
    const short = await verifyLaunchToken(t, {
      issuer: ISS,
      keys: { secret: NEW, previousSecret: "short" },
      now: NOW,
    });
    expect(short).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("يقبل رمزاً صحيحاً ويطبّع البريد", async () => {
    const r = await verifyHs(await hs256(claims()));
    expect(r.ok && r.claims.email).toBe("staff@wamy.org");
  });

  it("يرفض التوقيع المزوَّر والخوارزمية الفارغة", async () => {
    const t = await hs256(claims());
    const forged = t.replace(/\.[^.]+$/, ".AAAA");
    expect(await verifyHs(forged)).toEqual({ ok: false, reason: "bad_signature" });
    const none = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims()))}.`;
    expect(await verifyHs(none)).toEqual({ ok: false, reason: "alg_not_allowed" });
  });

  it("يرفض المُصدِر والجمهور الخطأ، والمنتهي، والطويل العمر، والبريد غير الموثَّق", async () => {
    const cases: Array<[Partial<LaunchClaims>, string]> = [
      [{ iss: "https://evil.example" }, "wrong_issuer"],
      [{ aud: "other-app" }, "wrong_audience"],
      [{ iat: NOW - 600, exp: NOW - 120 }, "expired"],
      [{ iat: NOW, exp: NOW + 3600 }, "lifetime_too_long"],
      [{ email_verified: false }, "email_unverified"],
      [{ jti: "x" }, "claims_invalid"],
    ];
    for (const [over, reason] of cases) {
      expect(await verifyHs(await hs256(claims(over)))).toEqual({ ok: false, reason });
    }
  });

  it("يتحقّق من ES256 بمفتاح الندوة العامّ، ولا يقبل HS256 حين لا سرّ مضبوط", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const pub = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
    const head = `${b64url(JSON.stringify({ alg: "ES256", kid: "k1" }))}.${b64url(JSON.stringify(claims()))}`;
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(head),
      ),
    );
    const opts = { issuer: ISS, keys: { jwks: [pub] }, now: NOW };
    expect((await verifyLaunchToken(`${head}.${b64url(sig)}`, opts)).ok).toBe(true);
    expect(await verifyLaunchToken(await hs256(claims()), opts)).toEqual({
      ok: false,
      reason: "alg_not_allowed",
    });
  });

  it("الصفحة التالية داخلية ومن القائمة وحدها", () => {
    expect(safeNext("/country-data")).toBe("/country-data");
    expect(safeNext("/orphans/abc")).toBe("/orphans/abc");
    expect(safeNext("//evil.example")).toBe("/workspaces");
    expect(safeNext("https://evil.example")).toBe("/workspaces");
    expect(safeNext("/api/ops")).toBe("/workspaces");
    expect(safeNext(undefined)).toBe("/workspaces");
  });
});
