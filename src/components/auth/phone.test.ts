import { describe, expect, it } from "vitest";
import { normalizePhone } from "./AuthPanel";

describe("رقم الجوال", () => {
  it.each([
    ["+355 69 123 4567", "+355691234567"],
    ["00355691234567", "+355691234567"],
    ["٠٠٩٦٦٥٠١٢٣٤٥٦٧", "+966501234567"],
    ["966-50-123-4567", "+966501234567"],
  ])("%s ← %s", (raw, want) => expect(normalizePhone(raw)).toBe(want));
});
