import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, continentOf, countryName, normalize, resolveCountry } from "./countries";

describe("دول العالم", () => {
  it("القائمة تغطّي العالم بلا تكرار", () => {
    expect(COUNTRY_CODES.length).toBeGreaterThanOrEqual(245);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });

  it("كل رمزٍ صالح في ISO له اسمٌ عربي", () => {
    const unnamed = COUNTRY_CODES.filter((c) => c !== "XK" && countryName(c, "ar") === c);
    expect(unnamed).toEqual([]);
  });

  it.each([
    ["ألبانيا", "AL"],
    ["البانيا", "AL"],
    ["Albania", "AL"],
    ["Shqipëria", "AL"],
    ["al", "AL"],
    ["السعودية", "SA"],
    ["المملكة العربية السعودية", "SA"],
    ["Türkiye", "TR"],
    ["مصر", "EG"],
  ])("«%s» ← %s", (text, code) => expect(resolveCountry(text)).toBe(code));

  it("ما لا يُعرف يبقى null", () => {
    expect(resolveCountry("مدينة خيالية")).toBeNull();
    expect(resolveCountry("")).toBeNull();
  });

  it("القارّات", () => {
    expect(continentOf("AL")).toBe("EU");
    expect(continentOf("YE")).toBe("AS");
    expect(continentOf("SD")).toBe("AF");
  });

  it("التطبيع العربي", () => {
    expect(normalize("الإمارات")).toBe(normalize("امارات"));
  });
});
