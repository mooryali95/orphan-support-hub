import { describe, expect, it } from "vitest";
import { DEMO_OFFICES, demoChildren, demoGeography } from "./demo-network";

describe("demo network rules", () => {
  it("contains exactly 34 country offices", () => {
    expect(DEMO_OFFICES).toHaveLength(34);
    expect(new Set(DEMO_OFFICES.map(([code]) => code)).size).toBe(34);
  });
  it("includes Albania in geography and the filtered directory", () => {
    expect(demoGeography().countries.find((c) => c.code === "AL")?.value).toBe("ألبانيا");
    expect(demoChildren({ country: "ألبانيا" }).total).toBe(8);
  });
  it("excludes Saudi sample data", () => {
    expect(demoGeography().countries.map((c) => String(c.code))).not.toContain("SA");
    expect(demoChildren({ country: "SA" }).total).toBe(0);
  });
  it("uses demo-only identities rather than payable child identifiers", () => {
    expect(demoChildren({}).rows.every((c) => c.id.startsWith("DEMO-"))).toBe(true);
  });
});
