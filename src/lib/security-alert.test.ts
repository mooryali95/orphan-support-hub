import { describe, expect, it } from "vitest";

import {
  DEFAULT_SECURITY_THRESHOLD,
  securityAlertFrom,
  securityThresholdFrom,
} from "./security-alert";

describe("security events alert (N6)", () => {
  it("reads the threshold with a safe default", () => {
    expect(securityThresholdFrom(undefined)).toBe(DEFAULT_SECURITY_THRESHOLD);
    expect(securityThresholdFrom("10")).toBe(10);
    expect(securityThresholdFrom("0")).toBe(DEFAULT_SECURITY_THRESHOLD);
    expect(securityThresholdFrom("x")).toBe(DEFAULT_SECURITY_THRESHOLD);
  });

  it("alerts above the threshold only", () => {
    expect(securityAlertFrom({ count: 3, threshold: 50, alert: false }).alert).toBe(false);
    expect(securityAlertFrom({ count: 51, threshold: 50, alert: false }).alert).toBe(true);
    expect(securityAlertFrom({ count: 1, threshold: 50, alert: true }).alert).toBe(true);
    expect(securityAlertFrom(null)).toEqual({ count: 0, threshold: 50, alert: false });
  });
});
