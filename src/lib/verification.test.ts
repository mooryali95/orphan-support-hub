import { describe, expect, it } from "vitest";
import {
  missingChecks,
  PLEDGE_TRANSITIONS,
  verificationLevel,
  type Verification,
} from "./verification";

const base: Verification = {
  death: false,
  identity: false,
  guardianship: false,
  consent: false,
  followup: false,
  documents: 0,
  verified_documents: 0,
};

describe("verification", () => {
  it("is full only when every check is met", () => {
    const all = {
      ...base,
      death: true,
      identity: true,
      guardianship: true,
      consent: true,
      followup: true,
    };
    expect(verificationLevel(all)).toBe("full");
    expect(verificationLevel({ ...all, followup: false })).toBe("partial");
    expect(verificationLevel(base)).toBe("none");
    expect(verificationLevel(null)).toBe("none");
  });

  it("lists what is missing in order", () => {
    expect(missingChecks({ ...base, death: true, consent: true })).toEqual([
      "identity",
      "guardianship",
      "followup",
    ]);
  });

  it("pledge transitions match the database rule", () => {
    expect(PLEDGE_TRANSITIONS["pending"]).toEqual(["active", "cancelled"]);
    expect(PLEDGE_TRANSITIONS["cancelled"]).toEqual([]);
  });
});

describe("admin console sample data", () => {
  it("builds every kind with stable rows and pages like admin_records", async () => {
    const { RECORD_KINDS } = await import("@/lib/admin-console.functions");
    const { sampleRows, samplePage } = await import("@/lib/admin-console-sample");
    for (const kind of RECORD_KINDS) {
      const rows = sampleRows(kind);
      expect(rows.length).toBeGreaterThan(20);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      expect(sampleRows(kind)).toBe(rows);
      const page = samplePage(rows, { page: 0, pageSize: 10 });
      expect(page.rows).toHaveLength(10);
      expect(Object.values(page.counts).reduce((a, b) => a + b, 0)).toBe(rows.length);
    }
  });
});
