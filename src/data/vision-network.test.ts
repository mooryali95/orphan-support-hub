import { describe, expect, it } from "vitest";

import { WAMY_COUNTRIES } from "@/data/wamy-network";
import { parseLinks } from "@/lib/vision-links.functions";

import { flagOf, NETWORK, simFor } from "./vision-network";

describe("vision network", () => {
  it("lists every public WAMY presence and never an unconfirmed one", () => {
    const pub = WAMY_COUNTRIES.filter((c) => c.presence.status !== "unconfirmed");
    expect(NETWORK.map((n) => n.code).sort()).toEqual(pub.map((c) => c.code).sort());
  });
  it("derives stable virtual figures, larger for offices than field presence", () => {
    expect(simFor("AL", "office")).toEqual(simFor("AL", "office"));
    expect(simFor("XX", "office").groups).toBeGreaterThanOrEqual(simFor("XX", "field").groups);
    for (const n of NETWORK) expect(n.sim.funded).toBeLessThanOrEqual(100);
  });
  it("flags from codes and parses only well-formed links", () => {
    expect(flagOf("AL")).toBe("🇦🇱");
    expect(
      parseLinks([
        { country: "AL", platform: "x", synced_at: "t", groups: "3", orphans: 9 },
        { country: "bad" },
        null,
      ]),
    ).toEqual([{ country: "AL", platform: "x", syncedAt: "t", groups: 3, orphans: 9 }]);
    expect(parseLinks({})).toEqual([]);
  });
});
