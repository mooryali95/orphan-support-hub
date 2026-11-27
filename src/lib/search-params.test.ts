import { describe, expect, it } from "vitest";
import {
  compact,
  searchMatch,
  searchOneOf,
  searchPositive,
  searchString,
  searchUuid,
} from "./search-params";

describe("search params", () => {
  it("keeps valid values and drops invalid ones", () => {
    expect(searchUuid("3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b")).toBeDefined();
    expect(searchUuid("nope")).toBeUndefined();
    expect(searchString("a".repeat(121), 120)).toBeUndefined();
    expect(searchString(5)).toBeUndefined();
    expect(searchMatch("SD", /^[A-Z]{2}$/)).toBe("SD");
    expect(searchMatch("sd", /^[A-Z]{2}$/)).toBeUndefined();
    expect(searchOneOf("in_kind", ["qualification", "in_kind"] as const)).toBe("in_kind");
    expect(searchOneOf("x", ["qualification"] as const)).toBeUndefined();
  });

  it("coerces positive numbers within the cap", () => {
    expect(searchPositive("40", 100)).toBe(40);
    expect(searchPositive(40, 100)).toBe(40);
    expect(searchPositive(0, 100)).toBeUndefined();
    expect(searchPositive("", 100)).toBeUndefined();
    expect(searchPositive(101, 100)).toBeUndefined();
  });

  it("drops undefined keys", () => {
    expect(compact({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect("b" in compact({ a: 1, b: undefined })).toBe(false);
  });
});
