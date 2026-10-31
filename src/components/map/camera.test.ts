import { describe, expect, it } from "vitest";
import { fit, flight } from "./camera";

describe("كاميرا الخارطة", () => {
  const world = { x: 0, y: 0, w: 1000, h: 520 };
  const albania = fit([547.9, 155.1, 4.83, 9.36], 0.52, 1.35);

  it("الرحلة تبدأ من الموضع وتنتهي عند الهدف", () => {
    const f = flight(world, albania);
    const a = f.at(0),
      b = f.at(1);
    expect(a.x).toBeCloseTo(world.x, 3);
    expect(a.w).toBeCloseTo(world.w, 3);
    expect(b.x).toBeCloseTo(albania.x, 3);
    expect(b.w).toBeCloseTo(albania.w, 3);
  });

  it("المدّة بين 1.4 و2.6 ثانية", () => {
    const f = flight(world, albania);
    expect(f.duration).toBeGreaterThanOrEqual(1400);
    expect(f.duration).toBeLessThanOrEqual(2600);
  });

  it("الإطار يحتوي الصندوق بنسبة الحاوية", () => {
    const v = fit([10, 10, 100, 20], 0.5, 1);
    expect(v.h / v.w).toBeCloseTo(0.5);
    expect(v.w).toBeGreaterThanOrEqual(100);
    expect(v.h).toBeGreaterThanOrEqual(20);
  });
});
