import { describe, expect, it } from "vitest";
import { findCountry, shapeGeo } from "./geo";
import { toMapStats } from "@/components/map/demo-stats";

const rows = [
  {
    country: "ألبانيا",
    total: 16,
    sponsored: null,
    small: false,
    regions: [
      { region: "Tirana", total: 8, sponsored: null, small: false },
      { region: "Kukës", total: null, sponsored: null, small: true },
    ],
  },
  { country: "دولة مجهولة", total: null, sponsored: null, small: true, regions: [] },
];

describe("مصدر الجغرافيا الواحد", () => {
  const geo = shapeGeo(rows, true);

  it("يردّ نصّ البلد في القاعدة إلى رمزه، ويحفظ النصّ للفلترة", () => {
    expect(geo.countries[0]).toMatchObject({ value: "ألبانيا", code: "AL", total: 16 });
    expect(findCountry(geo, "AL")?.value).toBe("ألبانيا");
    expect(findCountry(geo, "ألبانيا")?.code).toBe("AL");
  });

  it("الخارطة تأخذ ما له رمزٌ فقط، والصغير يبقى بلا رقم", () => {
    const stats = toMapStats(geo);
    expect(Object.keys(stats)).toEqual(["AL"]);
    expect(stats["AL"]!.regions["Kukës"]).toMatchObject({ small: true, total: null });
  });
});
