import { describe, expect, it } from "vitest";

import { isNetworkLayer, parseLayer } from "./layers";
import { kindCounts, networkPaint } from "./network-layer";

describe("طبقتا الشبكة", () => {
  it("مفتاحان جديدان في الرابط", () => {
    expect(parseLayer("network")).toBe("network");
    expect(parseLayer("needs")).toBe("needs");
    expect(isNetworkLayer("network")).toBe(true);
    expect(isNetworkLayer("waiting")).toBe(false);
  });

  it("«الشبكة» للزوّار: المقرّ والمكاتب والنشاط الميداني — بلا غير المؤكَّد", () => {
    const paint = networkPaint("network");
    expect(paint.get("SA")).toBe("hq");
    expect(paint.get("KE")).toBe("office");
    expect(paint.get("ET")).toBe("field");
    for (const code of ["SO", "YE", "PH", "IQ", "ZA", "MY", "TJ", "UG"])
      expect(paint.has(code)).toBe(false);
    expect(kindCounts(paint)).toMatchObject({ hq: 1, office: 19, field: 7, unconfirmed: 0 });
  });

  it("وللإدارة يظهر غير المؤكَّد محايداً", () => {
    expect(networkPaint("network", { showUnconfirmed: true }).get("SO")).toBe("unconfirmed");
  });

  it("«تحتاج مكتباً» تلوّن دول الأولوية وتُبقي المكاتب خلفيةً", () => {
    const paint = networkPaint("needs");
    expect(paint.get("ET")).toBe("high");
    expect(paint.get("UG")).toBe("high");
    expect(paint.get("IQ")).toBe("medium");
    expect(paint.get("SO")).toBe("data");
    expect(paint.get("NG")).toBe("covered");
  });
});
