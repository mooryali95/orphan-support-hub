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

import { lerpView, spring, zoomLevel } from "./camera";

describe("نابض الكاميرا", () => {
  it("يبدأ من صفر وينتهي عند واحد، بتجاوزٍ خفيف لا يزيد عن ٣٪", () => {
    const s = spring();
    expect(s.at(0)).toBeCloseTo(0, 6);
    expect(s.at(s.duration + 1)).toBe(1);
    let peak = 0;
    for (let t = 0; t <= s.duration; t += 4) peak = Math.max(peak, s.at(t));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.03);
  });

  it("سريعٌ بما يكفي ليُحَسّ استجابةً لا رحلة", () => {
    expect(spring().duration).toBeLessThan(700);
  });
});

describe("الإطار بين إطارين", () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const b = { x: 40, y: 20, w: 25, h: 12.5 };
  it("طرفاه هما الإطاران", () => {
    expect(lerpView(a, b, 0)).toEqual(a);
    const end = lerpView(a, b, 1);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.w).toBeCloseTo(b.w);
  });
  it("العرض هندسيّ: في المنتصف ×٢ لا متوسّطٌ حسابي", () => {
    expect(lerpView(a, b, 0.5).w).toBeCloseTo(50);
  });
  it("مستوى التكبير", () => {
    expect(zoomLevel(b, a)).toBeCloseTo(4);
  });
});
