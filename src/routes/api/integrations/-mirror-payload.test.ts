import { describe, expect, it } from "vitest";

import { replayNonce } from "@/lib/integrations/auth";

import {
  cursorIssue,
  invalidRefs,
  isIsoTimestamp,
  MAX_ISSUES,
  validateMirrorRecords,
  withoutIdempotencyKey,
} from "./-mirror-payload";

describe("فحص دفعة المرآة", () => {
  it("دفعة العقد السليمة تمرّ في كل كيان", () => {
    expect(
      validateMirrorRecords("groups", [
        {
          external_ref: "class-7",
          name: "مجموعة السلام",
          region: "تيرانا",
          updated_at: "2026-11-01T08:00:00.000Z",
        },
      ]),
    ).toEqual([]);
    expect(
      validateMirrorRecords("students", [
        {
          external_ref: "st-1",
          display_name: "طالب أ",
          gender: "female",
          age: 10,
          group_ref: "class-7",
        },
        { external_ref: 42, display_name: "طالب ب", age: "9" },
        { external_ref: "st-3", display_name: "بلا عمر", age: "" },
      ]),
    ).toEqual([]);
    expect(
      validateMirrorRecords("trait_dimensions", [
        { key: "NAFS", label_ar: "حفظ النفس", sort_order: 2 },
        { key: "AQL" },
      ]),
    ).toEqual([]);
    expect(
      validateMirrorRecords("traits", [
        { external_ref: "tr-1", dimension_key: "NAFS", name_ar: "الصبر", elements: ["يهدأ"] },
      ]),
    ).toEqual([]);
    expect(
      validateMirrorRecords("trait_scores", [
        {
          external_ref: "ev-1",
          student_ref: "st-1",
          trait_ref: "tr-1",
          score: 7,
          scale_max: 10,
          observed_at: "2026-10-01T00:00:00Z",
        },
        {
          external_ref: "ev-2",
          student_ref: "st-1",
          trait_ref: "tr-1",
          score: "82.5",
          observed_at: "2026-10-01",
        },
      ]),
    ).toEqual([]);
  });

  it("عمرٌ لا يُقرأ عدداً يُردّ بموضعه ومرجعه", () => {
    expect(
      validateMirrorRecords("students", [
        { external_ref: "st-1", display_name: "سليم", age: 9 },
        { external_ref: "st-2", display_name: "فاسد", age: "تسع" },
        { external_ref: "st-3", display_name: "كسر", age: 9.5 },
        { external_ref: "st-4", display_name: "بعيد", age: 400 },
      ]),
    ).toEqual([
      { index: 1, ref: "st-2", field: "age", reason: "not_an_integer" },
      { index: 2, ref: "st-3", field: "age", reason: "not_an_integer" },
      { index: 3, ref: "st-4", field: "age", reason: "out_of_range" },
    ]);
  });

  it("الدرجة: عددٌ غير سالب لا يتجاوز سقفه، والسقف موجب", () => {
    const score = (extra: Record<string, unknown>) =>
      validateMirrorRecords("trait_scores", [
        {
          external_ref: "ev",
          student_ref: "s",
          trait_ref: "t",
          observed_at: "2026-10-01T00:00:00Z",
          ...extra,
        },
      ]).map((i) => `${i.field}:${i.reason}`);
    expect(score({ score: 11, scale_max: 10 })).toEqual(["score:above_scale_max"]);
    // بلا سقفٍ مُرسَل فالسقف 100 كما في القاعدة
    expect(score({ score: 101 })).toEqual(["score:above_scale_max"]);
    expect(score({ score: 100 })).toEqual([]);
    expect(score({ score: -1 })).toEqual(["score:out_of_range"]);
    expect(score({ score: "ممتاز" })).toEqual(["score:not_a_number"]);
    expect(score({ score: 5, scale_max: 0 })).toEqual(["scale_max:out_of_range"]);
    expect(score({ score: 5, scale_max: "عشرة" })).toEqual(["scale_max:not_a_number"]);
    expect(score({ score: 5, observed_at: "أمس" })).toEqual(["observed_at:not_a_timestamp"]);
    // غياب الدرجة أو وقتها ليس خطأ دفعة: القاعدة تتخطّى السجلّ وتذكره في skipped
    expect(score({ observed_at: "" })).toEqual([]);
  });

  it("بُعدٌ بلا اسمٍ ولا مفتاح يُردّ: الاسم إلزامي في الجدول", () => {
    expect(validateMirrorRecords("trait_dimensions", [{ external_ref: "d-1" }])).toEqual([
      { index: 0, ref: "d-1", field: "label_ar", reason: "label_required" },
    ]);
    expect(validateMirrorRecords("trait_dimensions", [{ key: "DEEN", sort_order: "أول" }])).toEqual(
      [{ index: 0, ref: "DEEN", field: "sort_order", reason: "not_an_integer" }],
    );
  });

  it("سجلٌّ ليس كائناً، ومرجعٌ ليس نصّاً، يُردّان", () => {
    expect(validateMirrorRecords("groups", ["class-7", null, ["x"]]).map((i) => i.reason)).toEqual([
      "not_an_object",
      "not_an_object",
      "not_an_object",
    ]);
    expect(
      validateMirrorRecords("students", [{ external_ref: { id: 1 }, display_name: "أ" }]),
    ).toEqual([{ index: 0, ref: null, field: "external_ref", reason: "not_text" }]);
    expect(
      validateMirrorRecords("groups", [{ external_ref: "g", updated_at: "2026-02-31T00:00:00Z" }]),
    ).toEqual([{ index: 0, ref: "g", field: "updated_at", reason: "not_a_timestamp" }]);
  });

  it("سجلٌّ بلا مرجع ليس خطأ دفعة: القاعدة تتخطّاه", () => {
    expect(validateMirrorRecords("students", [{ display_name: "بلا مرجع" }])).toEqual([]);
  });

  it("الأخطاء المُعادة محدودة العدد", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ external_ref: `s${i}`, age: "x" }));
    expect(validateMirrorRecords("students", many)).toHaveLength(MAX_ISSUES);
  });

  it("التواريخ: ISO 8601 بتاريخٍ موجود", () => {
    for (const ok of [
      "2026-11-01",
      "2026-11-01T08:00:00Z",
      "2026-11-01T08:00:00.123Z",
      "2026-11-01 08:00:00+02",
      "2026-11-01T08:00:00+02:00",
      "2028-02-29T00:00:00Z",
    ])
      expect(isIsoTimestamp(ok), ok).toBe(true);
    for (const bad of ["", "أمس", "01/11/2026", "2026-13-01", "2027-02-29", 1793000000, null])
      expect(isIsoTimestamp(bad), String(bad)).toBe(false);
  });

  it("معرّفات الحذف والمطابقة نصوصٌ أو أعداد", () => {
    expect(invalidRefs(["a", 7, "b"])).toEqual([]);
    expect(invalidRefs(["a", { id: 1 }, null, "", ["x"]])).toEqual([1, 2, 3, 4]);
  });

  it("المؤشّر: وقتٌ مقروء ومرجعٌ نصّي، وغيابه مقبول", () => {
    expect(cursorIssue(undefined)).toBeNull();
    expect(cursorIssue({ at: "2026-11-01T08:00:00Z", ref: "class-7" })).toBeNull();
    expect(cursorIssue({ at: "الآن" })?.field).toBe("cursor.at");
    expect(cursorIssue({ ref: { id: 1 } })?.field).toBe("cursor.ref");
    expect(cursorIssue("2026-11-01")?.field).toBe("cursor");
  });
});

describe("حارس الإعادة في بوّابة المرآة", () => {
  const url = "https://kahatayn.example/api/integrations/mirror";
  const headers = {
    "X-Api-Key": "ck_live_x",
    "X-Api-Secret": "sk_live_x",
    "X-Api-Timestamp": "1793000000",
    "Idempotency-Key": "any",
  };
  const nonceOf = (request: Request, body: string) =>
    replayNonce({
      nonce: request.headers.get("x-api-nonce"),
      timestamp: request.headers.get("x-api-timestamp"),
      method: request.method,
      path: new URL(request.url).pathname,
      body,
      idempotencyKey: request.headers.get("idempotency-key"),
    });

  it("ترويسة Idempotency-Key كانت تُسقط الحارس، وبنزعها تعود بصمة الطلب", () => {
    const body = '{"entity":"students","records":[]}';
    const request = new Request(url, { method: "POST", headers, body });
    // الثغرة: مفتاح تكرار لا تحجزه المرآة = لا أحادية = إعادةٌ مقبولة داخل النافذة
    expect(nonceOf(request, body)).toBeNull();
    const guarded = withoutIdempotencyKey(request);
    expect(guarded.headers.has("idempotency-key")).toBe(false);
    expect(guarded.method).toBe("POST");
    expect(new URL(guarded.url).pathname).toBe("/api/integrations/mirror");
    expect(guarded.headers.get("x-api-timestamp")).toBe("1793000000");
    const nonce = nonceOf(guarded, body);
    expect(nonce).toMatch(/^f:[0-9a-f]{64}$/);
    // الدفعة نفسها بالختم نفسه = الأحادية نفسها (تُرفض ثانيةً)، ودفعةٌ أخرى أحاديةٌ أخرى
    expect(nonceOf(withoutIdempotencyKey(request), body)).toBe(nonce);
    expect(nonceOf(guarded, '{"entity":"students","records":[{}]}')).not.toBe(nonce);
  });

  it("X-Api-Nonce من المُرسِل تبقى هي الأحادية", () => {
    const request = new Request(url, {
      method: "POST",
      headers: { ...headers, "X-Api-Nonce": "batch-0042" },
      body: "{}",
    });
    expect(nonceOf(withoutIdempotencyKey(request), "{}")).toBe("n:batch-0042");
  });

  it("طلبٌ بلا الترويسة يمرّ كما هو", () => {
    const request = new Request(url, { method: "POST", body: "{}" });
    expect(withoutIdempotencyKey(request)).toBe(request);
  });
});
