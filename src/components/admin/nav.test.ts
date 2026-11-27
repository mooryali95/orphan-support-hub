import { describe, expect, it } from "vitest";

import { AGING_KEYS } from "@/lib/trust-center";
import { adminHref, isTab, JOB_TABS, JOBS, resolveAdminSearch, TAB_ALIASES, TABS } from "./nav";

describe("تنقّل الإدارة بستّ مهامّ", () => {
  it("ستّ مهامّ، وكل شاشةٍ في مهمّةٍ واحدة", () => {
    expect(JOBS).toEqual(["today", "countries", "quality", "money", "people", "settings"]);
    expect(new Set(TABS).size).toBe(TABS.length);
    for (const j of JOBS) expect(JOB_TABS[j].length).toBeGreaterThan(0);
  });

  it("بلا تبويب تهبط على «اليوم» بلا تحويل", () => {
    expect(resolveAdminSearch({})).toEqual({ tab: "today", redirect: null });
  });

  it("المفاتيح القديمة تُحوَّل إلى مرشّح «اليوم» المقابل", () => {
    expect(resolveAdminSearch({ tab: "inbox" })).toEqual({ tab: "today", redirect: {} });
    expect(resolveAdminSearch({ tab: "queue" }).redirect).toEqual({ kind: "orphan" });
    expect(resolveAdminSearch({ tab: "access" }).redirect).toEqual({ kind: "access" });
    expect(resolveAdminSearch({ tab: "integrity" }).redirect).toEqual({ kind: "integrity" });
  });

  it("وسائر المفاتيح القديمة إلى مقابلها، مع بقيّة العنوان", () => {
    expect(resolveAdminSearch({ tab: "monitoring", sample: 1 }).redirect).toEqual({
      tab: "health",
      sample: 1,
    });
    expect(resolveAdminSearch({ tab: "overview" }).redirect).toEqual({ tab: "report" });
    expect(resolveAdminSearch({ tab: "home" }).redirect).toEqual({});
    expect(resolveAdminSearch({ tab: "platform" }).redirect).toEqual({
      tab: "data",
      area: "countries",
    });
  });

  it("رابط «مصادر التحقق» من مركز الثقة يفتح درج الدولة نفسها", () => {
    expect(resolveAdminSearch({ tab: "data", area: "sources", country: "LK" })).toEqual({
      tab: "countries",
      redirect: { tab: "countries", country: "LK" },
    });
    // وبقية خانات «بناء البيانات» تبقى كما هي.
    expect(resolveAdminSearch({ tab: "data", area: "regions" }).redirect).toBeNull();
  });

  it("المفاتيح الحالية لا تُحوَّل، والمجهول يهبط على «اليوم»", () => {
    for (const t of TABS) expect(resolveAdminSearch({ tab: t }).redirect).toBeNull();
    expect(resolveAdminSearch({ tab: "nonsense" })).toEqual({ tab: "today", redirect: {} });
  });

  it("كل مفتاحٍ قديم يصل شاشةً موجودة", () => {
    for (const a of Object.values(TAB_ALIASES)) expect(isTab(a.tab)).toBe(true);
    // ما كانت تقود إليه النظرة الشاملة (`AdminTab`) كلّه يصل.
    for (const k of [
      "inbox",
      "queue",
      "access",
      "integrity",
      "countries",
      "languages",
      "monitoring",
      "overview",
      "orphans",
      "sponsors",
    ])
      expect(isTab(resolveAdminSearch({ tab: k }).tab)).toBe(true);
  });

  it("الروابط تُكتب بعد التحويل", () => {
    expect(adminHref("queue")).toBe("/admin?kind=orphan");
    expect(adminHref("inbox")).toBe("/admin");
    expect(adminHref("monitoring", { sample: 1 })).toBe("/admin?tab=health&sample=1");
    expect(adminHref("trust")).toBe("/admin?tab=trust");
  });

  it("فئات العمر هي فئات مركز الثقة", () => {
    expect(AGING_KEYS).toEqual(["lt1", "d1_3", "d3_7", "gt7"]);
  });
});
