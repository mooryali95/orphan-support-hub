import { describe, expect, it } from "vitest";
import {
  clampView,
  dirOfKey,
  MAX_ZOOM,
  nearestInDirection,
  panBy,
  pinchOf,
  sameView,
  toWorld,
  zoomAround,
} from "./gesture";

const size = { w: 1000, h: 500 };
const world = { w: 1000, h: 520 };
const full = { x: 0, y: 0, w: 1000, h: 500 };

describe("إيماءات الخارطة", () => {
  it("التكبير حول نقطةٍ يُبقي ما تحتها ثابتاً", () => {
    const at = { x: 300, y: 100 };
    const before = toWorld(full, size, at);
    const v = zoomAround(full, 2, at, size);
    const after = toWorld(v, size, at);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(v.w).toBeCloseTo(500);
    expect(v.h).toBeCloseTo(250);
  });

  it("التبعيد بمعامل < 1 يكبّر الإطار، والمعامل المنعدم لا يقسم على صفر", () => {
    expect(zoomAround(full, 0.5, { x: 0, y: 0 }, size).w).toBeCloseTo(2000);
    expect(Number.isFinite(zoomAround(full, 0, { x: 0, y: 0 }, size).w)).toBe(true);
  });

  it("السحب بالبكسل ينقل بنسبة الإطار", () => {
    const v = panBy({ x: 100, y: 100, w: 500, h: 250 }, 100, -50, size);
    expect(v.x).toBeCloseTo(50); // 100px من 1000 = 10% من 500
    expect(v.y).toBeCloseTo(125);
    expect(v.w).toBe(500);
  });

  it("القيد: لا أقرب من الحدّ، لا أبعد من الكلّ، والمركز داخل العالم", () => {
    const tiny = clampView({ x: 400, y: 200, w: 1, h: 0.5 }, world, full);
    expect(tiny.w).toBeCloseTo(world.w / MAX_ZOOM);
    expect(tiny.h / tiny.w).toBeCloseTo(0.5);
    const huge = clampView({ x: -5000, y: -5000, w: 9000, h: 4500 }, world, full);
    expect(huge.w).toBeCloseTo(full.w);
    const lost = clampView({ x: 5000, y: 5000, w: 200, h: 100 }, world, full);
    expect(lost.x + lost.w / 2).toBeCloseTo(world.w);
    expect(lost.y + lost.h / 2).toBeCloseTo(world.h);
  });

  it("حدٌّ أقرب مُعطى يسمح بالتقريب أبعد من الحدّ العامّ، ولا يرفعه", () => {
    const close = clampView({ x: 500, y: 250, w: 2, h: 1 }, world, full, 5);
    expect(close.w).toBeCloseTo(5);
    const loose = clampView({ x: 500, y: 250, w: 2, h: 1 }, world, full, 500);
    expect(loose.w).toBeCloseTo(500);
  });

  it("القرصة: مركزٌ ومسافة", () => {
    const p = pinchOf({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(p.center).toEqual({ x: 15, y: 20 });
    expect(p.dist).toBe(50);
  });

  it("إطاران متقاربان يُعدّان واحداً", () => {
    expect(sameView(full, { ...full, x: 1 })).toBe(true);
    expect(sameView(full, { ...full, x: 100 })).toBe(false);
    expect(sameView(null, null)).toBe(true);
    expect(sameView(full, null)).toBe(false);
  });
});

describe("لوحة المفاتيح على الدول", () => {
  const pts = [
    { id: "here", x: 0, y: 0 },
    { id: "east", x: 10, y: 1 },
    { id: "east-far", x: 30, y: 0 },
    { id: "north", x: 0, y: -10 },
    { id: "diag", x: 8, y: -9 }, // زاوية ~48°: خارج مخروط «يمين» ومخروط «أعلى»
    { id: "west", x: -5, y: 0 },
  ];
  const at = (p: { x: number; y: number }) => p;
  const from = { x: 0, y: 0 };

  it("يختار الأقرب داخل المخروط ويتجاهل القطريّ", () => {
    expect(nearestInDirection(from, pts, at, "right")?.id).toBe("east");
    expect(nearestInDirection(from, pts, at, "up")?.id).toBe("north");
    expect(nearestInDirection(from, pts, at, "left")?.id).toBe("west");
  });

  it("لا مرشّح في الاتّجاه ← null، والنقطة نفسها لا تُحسب", () => {
    expect(nearestInDirection(from, pts, at, "down")).toBeNull();
    expect(nearestInDirection(from, [pts[0]!], at, "right")).toBeNull();
  });

  it("الأسهم تُترجم، وغيرها لا", () => {
    expect(dirOfKey("ArrowLeft")).toBe("left");
    expect(dirOfKey("ArrowDown")).toBe("down");
    expect(dirOfKey("Enter")).toBeNull();
  });
});
