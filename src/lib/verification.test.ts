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
