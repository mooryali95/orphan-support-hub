import { describe, expect, it } from "vitest";
import { rankSearch, type SearchItem } from "./map-search";

const item = (label: string, kind: SearchItem["kind"] = "country", alt: string[] = []) =>
  ({ key: label, label, alt, kind, go: () => {} }) satisfies SearchItem;

describe("بحث الخارطة", () => {
  const items = [
    item("كوسوفو"),
    item("ألبانيا", "country", ["Albania", "AL"]),
    item("تيرانا", "region"),
  ];

  it("يطابق الاسم العربي من بدايته", () => {
    expect(rankSearch(items, "ألب").map((x) => x.label)).toEqual(["ألبانيا"]);
  });
  it("يطابق الاسم الإنجليزي والرمز", () => {
    expect(rankSearch(items, "alb")[0]?.label).toBe("ألبانيا");
    expect(rankSearch(items, "AL")[0]?.label).toBe("ألبانيا");
  });
  it("بلا نصٍّ يعرض الأوائل، وبلا تطابق لا شيء", () => {
    expect(rankSearch(items, "").length).toBe(3);
    expect(rankSearch(items, "زززز")).toEqual([]);
  });
});
