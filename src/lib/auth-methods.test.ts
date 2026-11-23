import { describe, expect, it } from "vitest";

import { parseAuthSettings } from "@/lib/auth-methods";

describe("parseAuthSettings", () => {
  it("reads which code channels the server has enabled", () => {
    expect(parseAuthSettings({ external: { email: true, phone: false, google: false } })).toEqual({
      email: true,
      phone: false,
      google: false,
      passkey: false,
    });
    expect(
      parseAuthSettings({
        external: { email: true, phone: true, google: true },
        passkeys_enabled: true,
      }),
    ).toEqual({ email: true, phone: true, google: true, passkey: true });
  });

  it("offers the phone only when the server says so, and email unless it is switched off", () => {
    expect(parseAuthSettings({ external: {} })).toEqual({
      email: true,
      phone: false,
      google: false,
      passkey: false,
    });
    expect(parseAuthSettings({ external: { email: false } })).toEqual({
      email: false,
      phone: false,
      google: false,
      passkey: false,
    });
  });

  it("answers nothing for a reply it does not understand", () => {
    expect(parseAuthSettings(null)).toBeNull();
    expect(parseAuthSettings("ok")).toBeNull();
    expect(parseAuthSettings({ external: "all" })).toBeNull();
  });
});
