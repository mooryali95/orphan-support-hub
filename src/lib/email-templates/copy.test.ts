import { describe, expect, it } from "vitest";

import { authEmailLocale, EMAIL_COPY, emailLocale } from "./copy";

describe("email locale", () => {
  it("reads the recipient locale, Arabic by default", () => {
    expect(emailLocale("en")).toBe("en");
    expect(emailLocale("en-GB")).toBe("en");
    expect(emailLocale("ar")).toBe("ar");
    expect(emailLocale("sq")).toBe("ar");
    expect(emailLocale(undefined)).toBe("ar");
  });

  it("reads lang from the auth link's return address", () => {
    const back = encodeURIComponent("https://site.example/orphans?lang=en");
    expect(authEmailLocale(`https://auth.example/verify?token=t&redirect_to=${back}`)).toBe("en");
    expect(authEmailLocale("https://auth.example/verify?token=t")).toBe("ar");
    expect(authEmailLocale("not a url")).toBe("ar");
    expect(authEmailLocale(null)).toBe("ar");
  });

  it("gives every notification kind a frame in both languages", () => {
    expect(Object.keys(EMAIL_COPY.en.kinds).sort()).toEqual(
      Object.keys(EMAIL_COPY.ar.kinds).sort(),
    );
  });
});
