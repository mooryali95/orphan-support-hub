import { describe, expect, it } from "vitest";
import { classifyPasskeyError, deviceKind, deviceLabel, passkeyFriendlyName } from "./passkey-core";

describe("تصنيف أخطاء البصمة", () => {
  it.each([
    [{ code: "passkey_disabled", message: "Passkey sign-in is not enabled" }, "disabled"],
    [{ code: "webauthn_challenge_expired" }, "expired"],
    [{ code: "webauthn_challenge_not_found" }, "expired"],
    [{ code: "webauthn_credential_not_found" }, "none"],
    [{ code: "webauthn_credential_exists" }, "duplicate"],
    [{ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }, "duplicate"],
    [{ code: "email_not_confirmed" }, "unconfirmed"],
    [{ code: "ERROR_CEREMONY_ABORTED", message: "Ceremony aborted" }, "cancelled"],
    [{ name: "NotAllowedError", message: "The operation either timed out…" }, "cancelled"],
    [{ name: "AbortError" }, "cancelled"],
    [{ message: "User cancelled the request" }, "cancelled"],
    [{ code: "webauthn_verification_failed" }, "failed"],
    [new Error("boom"), "failed"],
    [null, "failed"],
    [undefined, "failed"],
  ])("%j ← %s", (err, want) => expect(classifyPasskeyError(err)).toBe(want));

  it("يقرأ سبب الخطأ الملفوف", () => {
    const wrapped = {
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: { name: "NotAllowedError" },
    };
    expect(classifyPasskeyError(wrapped)).toBe("cancelled");
  });

  it("سببٌ يشير إلى نفسه لا يُدخل في حلقة", () => {
    const self: { cause?: unknown } = {};
    self.cause = self;
    expect(classifyPasskeyError(self)).toBe("failed");
  });
});

describe("نوع الجهاز", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit", "iphone"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "ipad"],
    // آيباد حديث يتنكّر في هيئة ماك لكنه يحمل Mobile
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Mobile/15E148 Safari", "ipad"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari", "mac"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["Mozilla/5.0 (X11; CrOS x86_64)", "linux"],
    ["", "other"],
  ])("%s ← %s", (ua, want) => expect(deviceKind(ua)).toBe(want));
});

describe("اسم الجهاز بلغة الواجهة", () => {
  it("عربي وإنجليزي وألباني", () => {
    expect(deviceLabel("iphone", "ar")).toBe("آيفون");
    expect(deviceLabel("other", "en")).toBe("This device");
    expect(deviceLabel("other", "sq")).toBe("Kjo pajisje");
  });
  it("لغةٌ بلا جدول تعود إلى الإنجليزية", () => {
    expect(deviceLabel("mac", "tr")).toBe("Mac");
    expect(deviceLabel("other", "fr-CA")).toBe("This device");
  });
  it("الاسم الودود يحمل التاريخ ولا يتجاوز ١٢٠ حرفاً", () => {
    const name = passkeyFriendlyName("android", "en", new Date("2026-10-31T00:00:00Z"));
    expect(name).toMatch(/^Android · /);
    expect(name).toContain("Oct");
    expect(name.length).toBeLessThanOrEqual(120);
  });
  it("العربية بأرقامٍ لاتينية", () => {
    const name = passkeyFriendlyName("iphone", "ar", new Date("2026-10-31T00:00:00Z"));
    expect(name).toMatch(/^آيفون · /);
    expect(name).toMatch(/31/);
  });
});
