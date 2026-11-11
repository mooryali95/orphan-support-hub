import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSentryDsn, reportersFromEnv, setErrorReporters } from "./error-reporter";
import { runWithRequestContext } from "./request-context";
import { classifyError, logServerError, publicError, sanitizeFailure } from "./server-log";

describe("APP-11: لا تصل رسائل القاعدة الخام إلى المتصفّح", () => {
  it("رسائل Postgres/PostgREST تُصنَّف برمزٍ ثابت", () => {
    expect(classifyError('duplicate key value violates unique constraint "ux_payments"')).toBe(
      "conflict",
    );
    expect(classifyError("new row violates row-level security policy for table x")).toBe(
      "forbidden",
    );
    expect(classifyError({ code: "42501", message: "permission denied for table orphans" })).toBe(
      "forbidden",
    );
    expect(classifyError('invalid input syntax for type uuid: "x"')).toBe("invalid_input");
    expect(classifyError("Could not find the function public.f(_a) in the schema cache")).toBe(
      "unavailable",
    );
    expect(classifyError("something odd")).toBe("internal");
  });

  it("الرسالة العربية المكتوبة في الهجرات ورموز RAISE تبقى كما هي", () => {
    expect(publicError("لا تُترك الجهة بلا مالك", "r1")).toBe("لا تُترك الجهة بلا مالك");
    expect(publicError("last_owner", "r1")).toBe("last_owner");
  });

  it("الخام يصير رسالةً عربية بمرجع الطلب، بلا اسم قيدٍ أو جدول", () => {
    const out = publicError(
      'duplicate key value violates unique constraint "ux_payments"',
      "abc123",
    );
    expect(out).not.toMatch(/ux_payments|duplicate/);
    expect(out).toContain("abc123");
  });

  it("نتيجة ok:false تُنقّى وتحمل مرجعها، والنجاح لا يُمسّ", () => {
    const res = sanitizeFailure({ ok: false, error: "permission denied for table x" }, "ref-1");
    expect(res).toMatchObject({ ok: false, errorCode: "forbidden", errorRef: "ref-1" });
    expect(String((res as { error: string }).error)).not.toContain("table x");
    const ok = { ok: true, error: null };
    expect(sanitizeFailure(ok, "r")).toBe(ok);
  });
});

describe("ARC-05: سجلّ الخادم المنظَّم", () => {
  afterEach(() => {
    setErrorReporters(null);
    vi.restoreAllMocks();
  });

  it("كلّ فشلٍ سطر JSON واحد بمعرّف الطلب والرمز والرسالة الخام", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reported: unknown[] = [];
    setErrorReporters([(e) => void reported.push(e)]);
    await runWithRequestContext({ requestId: "req-42" }, async () => {
      logServerError("serverFn.saveThing", { code: "23505", message: "duplicate key value" });
    });
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toMatchObject({
      level: "error",
      event: "serverFn.saveThing",
      request_id: "req-42",
      code: "conflict",
      sqlstate: "23505",
      message: "duplicate key value",
    });
    expect(reported).toHaveLength(1);
  });

  it("المُبلِّغ مقيّدٌ بالبيئة: بلا متغيّر لا مُبلِّغ، ولا اعتماد على مزوّدٍ بعينه", () => {
    expect(reportersFromEnv({})).toHaveLength(0);
    expect(reportersFromEnv({ ERROR_REPORT_WEBHOOK_URL: "https://hooks.example/x" })).toHaveLength(
      1,
    );
    expect(reportersFromEnv({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/123" })).toHaveLength(1);
  });

  it("DSN Sentry يُفكّ إلى نقطة الاستقبال، والمشوَّه يُهمَل", () => {
    expect(parseSentryDsn("https://pub@o1.ingest.sentry.io/123")).toEqual({
      endpoint: "https://o1.ingest.sentry.io/api/123/envelope/",
      key: "pub",
    });
    expect(parseSentryDsn("not a dsn")).toBeNull();
  });
});
