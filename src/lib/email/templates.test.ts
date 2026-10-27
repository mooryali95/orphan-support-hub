import { describe, expect, it } from "vitest";

import { renderMonthlyDigest, renderNotificationEmail } from "./templates";
import { BRAND } from "@/config/brand";

const base = {
  to: "sponsor@example.test",
  kind: "report_published",
  title: "تقرير جديد",
  body: "صدر تقرير الأثر لفترة 2026-03.",
  link: "/dashboard",
  baseUrl: "https://ioco.app",
};

describe("renderNotificationEmail", () => {
  it("يبني الرابط المطلق من الرابط النسبي", () => {
    const mail = renderNotificationEmail(base);
    expect(mail.html).toContain("https://ioco.app/dashboard");
    expect(mail.text).toContain("https://ioco.app/dashboard");
  });

  // شرطة مائلة زائدة في الأصل تُنتج «//dashboard».
  it("لا يُكرّر الشرطة عند تركيب الرابط", () => {
    const mail = renderNotificationEmail({ ...base, baseUrl: "https://ioco.app/" });
    expect(mail.html).not.toContain("app//dashboard");
  });

  it("يُخرج نصّاً عادياً إلى جانب HTML", () => {
    const mail = renderNotificationEmail(base);
    // بعض العملاء لا يعرض HTML، وبعض المستخدمين يمنعه.
    expect(mail.text.length).toBeGreaterThan(10);
    expect(mail.text).not.toContain("<");
  });

  // الاتجاه لا يُورَّث إلى الجداول في بعض العملاء، فيُصرَّح عليها أيضاً.
  it("يُصرّح بالاتجاه على الجسم والجداول معاً", () => {
    const mail = renderNotificationEmail(base);
    expect(mail.html).toContain('<body dir="rtl"');
    expect(mail.html).toContain('<table dir="rtl"');
  });

  // Gmail يُسقط <style> في بعض السياقات، فالأنماط على العناصر نفسها.
  it("لا يعتمد على صفحة أنماط ولا على صور خارجية", () => {
    const mail = renderNotificationEmail(base);
    expect(mail.html).not.toContain("<style");
    expect(mail.html).not.toContain("<img");
  });

  it("يهرّب HTML الوارد في العنوان والنصّ", () => {
    const mail = renderNotificationEmail({
      ...base,
      title: 'تقرير <script>alert("x")</script>',
      body: "نصّ فيه <b>وسم</b> & رمز",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp;");
  });

  it("يعمل بلا رابط فلا يظهر زرّ مكسور", () => {
    const mail = renderNotificationEmail({ ...base, link: null, body: null });
    expect(mail.html).not.toContain('href="null"');
    expect(mail.html).not.toContain("undefined");
    expect(mail.subject).toContain(`${BRAND.name}`);
  });

  // نصّ الدفعة الفاشلة يجب ألّا يُفزع: المزوّد يُعيد المحاولة تلقائياً.
  it("يضيف سطر سياق حسب نوع الحدث", () => {
    const failed = renderNotificationEmail({ ...base, kind: "payment_failed" });
    expect(failed.html).toContain("لا إجراء مطلوب منك الآن");
    const other = renderNotificationEmail({ ...base, kind: "other" });
    expect(other.html).not.toContain("لا إجراء مطلوب منك الآن");
  });

  it("يختار نصّ الزرّ حسب نوع الحدث", () => {
    expect(renderNotificationEmail(base).html).toContain("اقرأ التقرير");
    expect(renderNotificationEmail({ ...base, kind: "welcome" }).html).toContain("تصفّح الملفات");
  });
});

describe("رسالة الشهر", () => {
  const zero = {
    paid: 0,
    delivered_months: 0,
    reports: 0,
    units: 0,
    traits: 0,
    pledges_delivered: 0,
  };
  it("لا تكتب سطراً قيمته صفر", () => {
    const m = renderMonthlyDigest("a@b.c", { ...zero, reports: 2 }, "https://x.test");
    expect(m.text).toContain("نُشر 2");
    expect(m.text).not.toContain("جلسة");
    expect(m.html).toContain("https://x.test/dashboard");
  });
  it("الشهر الهادئ يقول ذلك ولا يُرسل أصفاراً", () => {
    const m = renderMonthlyDigest("a@b.c", zero, "https://x.test");
    expect(m.text).toContain("لم يُسجَّل جديد");
  });
});
