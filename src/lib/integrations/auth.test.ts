import { describe, expect, it } from "vitest";

import { digest, hashSecret, newClientKey, newSecret, secretMatches, timestampFresh } from "./auth";

describe("مصادقة شركاء التكامل", () => {
  it("السرّ المولَّد يُطابق تجزيئه، ويختلف عن غيره", () => {
    const a = newSecret();
    expect(secretMatches(a.secret, a.salt, a.hash)).toBe(true);
    expect(secretMatches(a.secret + "x", a.salt, a.hash)).toBe(false);
  });

  it("الملح يُغيّر التجزيء: سرّان متطابقان لا يتشابه تجزيؤهما", () => {
    const a = newSecret();
    const b = newSecret();
    expect(hashSecret("same-secret", a.salt)).not.toBe(hashSecret("same-secret", b.salt));
  });

  it("ولا يُطابق سرٌّ صحيحٌ بملحٍ آخر", () => {
    const a = newSecret();
    const b = newSecret();
    expect(secretMatches(a.secret, b.salt, a.hash)).toBe(false);
  });

  it("تجزيءٌ مشوَّه يُرفض ولا يُسقط الطلب", () => {
    const a = newSecret();
    expect(secretMatches(a.secret, a.salt, "")).toBe(false);
    expect(secretMatches(a.secret, a.salt, "zz")).toBe(false);
    expect(secretMatches(a.secret, a.salt, "ab")).toBe(false);
  });

  it("المفاتيح والأسرار مولَّدة لا متوقَّعة", () => {
    expect(newClientKey()).not.toBe(newClientKey());
    expect(newSecret().secret).not.toBe(newSecret().secret);
    expect(newSecret().secret.startsWith("sk_live_")).toBe(true);
    expect(newClientKey().startsWith("ck_live_")).toBe(true);
  });

  it("البادئة تُعرض ولا تكشف: جزءٌ من السرّ لا كلُّه", () => {
    const a = newSecret();
    expect(a.secret.startsWith(a.prefix)).toBe(true);
    expect(a.prefix.length).toBeLessThan(a.secret.length);
  });
});

describe("نافذة ختم الوقت — بلا نافذةٍ يُعاد الطلب الملتقَط أبداً", () => {
  const now = 1_800_000_000_000;

  it("الآن مقبول، بالثواني وبالمللي ثانية", () => {
    expect(timestampFresh(String(now), now)).toBe(true);
    expect(timestampFresh(String(Math.floor(now / 1000)), now)).toBe(true);
  });

  it("وداخل النافذة في الاتّجاهين — ساعة الشريك قد تسبق", () => {
    expect(timestampFresh(String(now - 4 * 60_000), now)).toBe(true);
    expect(timestampFresh(String(now + 4 * 60_000), now)).toBe(true);
  });

  it("وخارجها مرفوض في الاتّجاهين", () => {
    expect(timestampFresh(String(now - 6 * 60_000), now)).toBe(false);
    expect(timestampFresh(String(now + 6 * 60_000), now)).toBe(false);
  });

  it("والغائب والمشوَّه مرفوضان", () => {
    expect(timestampFresh(null, now)).toBe(false);
    expect(timestampFresh("", now)).toBe(false);
    expect(timestampFresh("أمس", now)).toBe(false);
    expect(timestampFresh("NaN", now)).toBe(false);
  });
});

describe("بصمة الحمولة", () => {
  it("ثابتةٌ للحمولة نفسها، مختلفةٌ لغيرها", () => {
    expect(digest('{"a":1}')).toBe(digest('{"a":1}'));
    expect(digest('{"a":1}')).not.toBe(digest('{"a":2}'));
  });

  it("وتميّز فرقاً دقيقاً — وعليها يُبنى رفضُ إعادة استعمال مفتاح التكرار", () => {
    expect(digest('{"records":[]}')).not.toBe(digest('{"records":[ ]}'));
  });
});

describe("حدّ حجم الجسم", () => {
  it("يرفض بترويسة الطول قبل القراءة", async () => {
    const { readBodyCapped } = await import("./client");
    const req = new Request("https://x.test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(3 * 1024 * 1024) },
    });
    expect((await readBodyCapped(req)).ok).toBe(false);
  });
  it("يرفض بالطول الفعلي حين تغيب الترويسة أو تكذب", async () => {
    const { readBodyCapped } = await import("./client");
    const big = "x".repeat(2048);
    const req = new Request("https://x.test", { method: "POST", body: big });
    expect((await readBodyCapped(req, 1024)).ok).toBe(false);
  });
  it("يقبل ما تحت الحدّ ويعيده كما هو", async () => {
    const { readBodyCapped } = await import("./client");
    const req = new Request("https://x.test", { method: "POST", body: '{"a":1}' });
    const res = await readBodyCapped(req);
    expect(res.ok && res.text).toBe('{"a":1}');
  });
});
