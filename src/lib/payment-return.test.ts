import { describe, expect, it } from "vitest";
import { PENDING_TTL_MS, POLL_DELAYS_MS, paymentReturnState } from "./payment-return";

describe("paymentReturnState", () => {
  const now = Date.parse("2026-11-27T12:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();

  it("maps stored rows to the four states", () => {
    expect(paymentReturnState({ status: "paid", created_at: at(0) }, now)).toBe("success");
    expect(paymentReturnState({ status: "pending", created_at: at(60_000) }, now)).toBe("pending");
    expect(paymentReturnState({ status: "failed", created_at: at(0) }, now)).toBe("failed");
    expect(paymentReturnState({ status: "refunded", created_at: at(0) }, now)).toBe("failed");
    expect(paymentReturnState(null, now)).toBe("expired");
  });

  it("treats a pending session past its time as expired", () => {
    expect(paymentReturnState({ status: "pending", created_at: at(PENDING_TTL_MS + 1) }, now)).toBe(
      "expired",
    );
  });

  it("polls with bounded backoff", () => {
    expect(POLL_DELAYS_MS.length).toBeLessThanOrEqual(8);
    expect(Math.max(...POLL_DELAYS_MS)).toBeLessThanOrEqual(30_000);
  });
});
