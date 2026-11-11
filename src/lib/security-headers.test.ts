import { describe, expect, it } from "vitest";

import { applySecurityHeaders, securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("يمنع تضمين الصفحة في إطار — بالرأسين معاً", () => {
    const h = securityHeaders("https://db.example.co");
    // frame-ancestors للمتصفّحات الحديثة، وX-Frame-Options للقديمة.
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
  });

  it("لا يسمح بـ unsafe-eval في السكربت", () => {
    const h = securityHeaders("https://db.example.co");
    expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  });

  it("يقصر إرسال النماذج على أصلنا", () => {
    // نموذج محقون يُرسل إلى خارج لولا هذا.
    expect(securityHeaders(undefined)["content-security-policy"]).toContain("form-action 'self'");
  });

  it("يسمح بالاتصال بقاعدة البيانات المضبوطة وحدها", () => {
    const h = securityHeaders("https://db.example.co/rest/v1");
    expect(h["content-security-policy"]).toContain("https://db.example.co");
    expect(h["content-security-policy"]).not.toContain("/rest/v1");
  });

  it("لا ينهار على عنوان قاعدة بيانات تالف", () => {
    const h = securityHeaders("not a url");
    expect(h["content-security-policy"]).toContain("default-src 'self'");
  });

  it("يمنع تسريب المسار عبر المُحيل", () => {
    // /orphans/<id> يكشف أن هذا الزائر يطالع ملف طفل بعينه.
    expect(securityHeaders(undefined)["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("يُغلق الأذونات التي لا تحتاجها المنصة", () => {
    const p = securityHeaders(undefined)["permissions-policy"] ?? "";
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
      expect(p).toContain(feature);
    }
  });
});

describe("applySecurityHeaders", () => {
  const res = () => new Response("ok", { status: 200 });

  it("يمنع تخزين صفحات اللوحات", () => {
    const out = applySecurityHeaders(new Request("https://x.test/dashboard"), res());
    expect(out.headers.get("cache-control")).toContain("no-store");
  });

  it("يمنع تخزين مسارات الواجهة البرمجية", () => {
    const out = applySecurityHeaders(new Request("https://x.test/api/payments/webhook"), res());
    expect(out.headers.get("cache-control")).toContain("no-store");
  });

  // «/orphans» و«/organizations» تبدآن بـ«/org»: مطابقة البادئة وحدها
  // كانت تمنع تخزين صفحتين عامّتين — وقد أمسك هذا الاختبارُ ذلك فعلاً.
  it("لا يمنع تخزين الصفحات العامة المشابهة بادئتها للخاصة", () => {
    for (const p of ["/orphans", "/orphans/abc", "/organizations", "/"]) {
      const out = applySecurityHeaders(new Request(`https://x.test${p}`), res());
      // الرأس إمّا غائب أصلاً وإمّا لا يمنع التخزين.
      expect(out.headers.get("cache-control") ?? "").not.toContain("no-store");
    }
  });

  it("يمنع تخزين مساحة الجهة نفسها ومسالكها", () => {
    for (const p of ["/org", "/org/anything"]) {
      const out = applySecurityHeaders(new Request(`https://x.test${p}`), res());
      expect(out.headers.get("cache-control") ?? "").toContain("no-store");
    }
  });

  // مسار ضبط رأسه عمداً (خريطة الموقع مثلاً) لا يُدهس.
  it("لا يدهس رأساً ضبطه المسار بنفسه", () => {
    const custom = new Response("x", { headers: { "x-frame-options": "SAMEORIGIN" } });
    const out = applySecurityHeaders(new Request("https://x.test/"), custom);
    expect(out.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  // CP-13: صفحة الطفل لا تُفهرَس حتى لزاحفٍ لا يقرأ وسوم HTML.
  it("يمنع فهرسة صفحة الطفل الواحد ويُبقي الدليل مفهرساً", () => {
    for (const p of ["/orphans/a9200000-0000-4000-8000-000000000001", "/orphans/abc/"]) {
      const out = applySecurityHeaders(new Request(`https://x.test${p}`), res());
      expect(out.headers.get("x-robots-tag")).toContain("noindex");
      expect(out.headers.get("x-robots-tag")).toContain("noimageindex");
    }
    for (const p of ["/orphans", "/orphans/", "/", "/organizations"]) {
      const out = applySecurityHeaders(new Request(`https://x.test${p}`), res());
      expect(out.headers.get("x-robots-tag")).toBeNull();
    }
  });

  it("APP-08: السكربت بأحادية الطلب لا بـ unsafe-inline", () => {
    const csp = securityHeaders("https://db.example.co", "abc123")["content-security-policy"] ?? "";
    const script = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(script).toBe("script-src 'self' 'nonce-abc123'");
  });

  it("APP-08: الأحادية تصل الرأس من applySecurityHeaders", () => {
    const out = applySecurityHeaders(new Request("https://x.test/"), res(), "n0nce");
    expect(out.headers.get("content-security-policy")).toContain("'nonce-n0nce'");
    expect(out.headers.get("content-security-policy")).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("نتائج دوالّ الخادم (/_serverFn) لا تُخزَّن", () => {
    const out = applySecurityHeaders(new Request("https://x.test/_serverFn/abc"), res());
    expect(out.headers.get("cache-control")).toContain("no-store");
  });

  it("يحفظ الحالة والجسم", async () => {
    const out = applySecurityHeaders(
      new Request("https://x.test/"),
      new Response("hello", { status: 201, statusText: "Created" }),
    );
    expect(out.status).toBe(201);
    expect(await out.text()).toBe("hello");
  });
});
