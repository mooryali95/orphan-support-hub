import { describe, expect, it } from "vitest";

import { USER_DATA_PREFIXES } from "./client-state";
import { orphanIdOfPath, parseDraft, SPONSOR_DRAFT_PREFIX } from "./sponsor-draft";

const ID = "a3000000-0000-4000-8000-000000000013";
const NOW = 1_800_000_000_000;
const draft = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    orphanId: ID,
    name: "Arta S.",
    amount: "30",
    message: "مرحبا يا بطل",
    anonymous: true,
    currency: "EUR",
    at: NOW - 60_000,
    ...over,
  });

describe("ما اختاره الزائر قبل الدخول (UX-09)", () => {
  it("يُستعاد المبلغ والرسالة وإخفاء الاسم كما كانت", () => {
    expect(parseDraft(draft(), ID, NOW)).toMatchObject({
      amount: "30",
      message: "مرحبا يا بطل",
      anonymous: true,
      name: "Arta S.",
    });
  });

  it("نوع العطاء يعود كما اختير: «مرّة واحدة» لا تصير شهرية بعد الدخول", () => {
    expect(parseDraft(draft({ cadence: "one_time" }), ID, NOW)?.cadence).toBe("one_time");
    expect(parseDraft(draft({ cadence: "monthly" }), ID, NOW)?.cadence).toBe("monthly");
    // مسودّةٌ حُفظت قبل هذا الحقل، أو بقيمةٍ غريبة: الشهري كما كان افتراض النموذج
    expect(parseDraft(draft(), ID, NOW)?.cadence).toBe("monthly");
    expect(parseDraft(draft({ cadence: "weekly" }), ID, NOW)?.cadence).toBe("monthly");
  });

  it("لا يُستعاد لطفلٍ آخر، ولا بعد ساعتين، ولا التالف", () => {
    expect(parseDraft(draft(), "a3000000-0000-4000-8000-000000000004", NOW)).toBeNull();
    expect(parseDraft(draft({ at: NOW - 3 * 3600_000 }), ID, NOW)).toBeNull();
    expect(parseDraft(draft({ amount: "30; drop" }), ID, NOW)).toBeNull();
    expect(parseDraft("{not json", ID, NOW)).toBeNull();
    expect(parseDraft(null, ID, NOW)).toBeNull();
  });

  it("رابط العودة يدلّ على الطفل، وما سواه لا", () => {
    expect(orphanIdOfPath(`/orphans/${ID}`)).toBe(ID);
    expect(orphanIdOfPath(`/orphans/${ID}?x=1#sponsor-form`)).toBe(ID);
    expect(orphanIdOfPath("/orphans")).toBeNull();
    expect(orphanIdOfPath("/orphans/not-a-uuid")).toBeNull();
    expect(orphanIdOfPath("/dashboard")).toBeNull();
  });

  it("تُمحى مع بيانات العمل عند الخروج وتبدّل المستخدم", () => {
    expect(USER_DATA_PREFIXES.some((p) => SPONSOR_DRAFT_PREFIX.startsWith(p))).toBe(true);
  });
});
