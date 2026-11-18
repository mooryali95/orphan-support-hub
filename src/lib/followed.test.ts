import { describe, expect, it } from "vitest";

import { loadFollowed, toggleFollowed } from "./followed";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe("أتابعهم", () => {
  it("يضيف الأحدث أولاً ثم يزيل", () => {
    const s = mem();
    toggleFollowed({ id: "a", name: "سارة" }, s);
    expect(toggleFollowed({ id: "b", name: "يوسف" }, s).map((x) => x.id)).toEqual(["b", "a"]);
    expect(toggleFollowed({ id: "a", name: "سارة" }, s).map((x) => x.id)).toEqual(["b"]);
  });
  it("لا يتجاوز اثني عشر، ويتسامح مع تخزينٍ تالف أو ممنوع", () => {
    const s = mem();
    for (let i = 0; i < 15; i++) toggleFollowed({ id: String(i), name: "x" }, s);
    expect(loadFollowed(s)).toHaveLength(12);
    s.setItem("followed-children:v1", "{bad");
    expect(loadFollowed(s)).toEqual([]);
    expect(loadFollowed(null)).toEqual([]);
  });
});
