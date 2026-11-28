import { describe, expect, it } from "vitest";

import { authEmailFrameFor } from "@/lib/email-templates/auth-locale.server";
import { withEmailLang } from "@/lib/email-templates/copy";
import { drainOutbox, type OutboxDeps } from "@/lib/email-outbox.server";
import { localizeNotification } from "@/lib/notification-text";

const ar = { kind: "payment_failed", title: "تعثّرت دفعة", body: "راجع وسيلة الدفع" };

describe("notification text per recipient locale", () => {
  it("keeps Arabic for Arabic readers and gives English readers English text by kind", () => {
    expect(localizeNotification(ar, "ar")).toEqual(ar);
    const en = localizeNotification(ar, "en");
    expect(en.title).toBe("A payment did not go through");
    expect(en.body).not.toMatch(/[؀-ۿ]/);
  });

  it("falls back to a generic English notice and keeps text already written in English", () => {
    expect(localizeNotification({ kind: "other", title: "تنبيه", body: null }, "en").title).toBe(
      "New notice",
    );
    const written = { kind: "welcome", title: "Welcome", body: "Hello" };
    expect(localizeNotification(written, "en")).toEqual(written);
  });

  it("sends English content, not only an English frame, to English recipients", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const deps: OutboxDeps = {
      rpc: async (fn) =>
        fn === "claim_email_batch"
          ? {
              data: [
                {
                  id: "1",
                  recipient: "a@x.test",
                  ...ar,
                  link: null,
                  unsubscribe_token: "t",
                  attempts: 1,
                  locale: "en",
                },
                {
                  id: "2",
                  recipient: "b@x.test",
                  ...ar,
                  link: null,
                  unsubscribe_token: "t",
                  attempts: 1,
                  locale: "ar",
                },
              ],
              error: null,
            }
          : { data: null, error: null },
      send: async (_to, data) => (sent.push(data), { sent: true }),
      baseUrl: "https://app.example",
      configured: true,
      siteName: "Site",
    };
    await drainOutbox(deps);
    expect(sent[0]?.["title"]).toBe("A payment did not go through");
    expect(sent[1]?.["title"]).toBe(ar.title);
  });
});

describe("auth email locale", () => {
  it("reads lang from the link, then the stored account locale, then Arabic", async () => {
    const link = (back: string) =>
      `https://auth.example/verify?redirect_to=${encodeURIComponent(back)}`;
    const never = async () => {
      throw new Error("not asked");
    };
    expect(
      (
        await authEmailFrameFor(
          { url: link(withEmailLang("https://a.example/x", "en")), email: "e" },
          never,
        )
      ).locale,
    ).toBe("en");
    expect(
      (await authEmailFrameFor({ url: link("https://a.example/x"), email: "e" }, async () => "en"))
        .locale,
    ).toBe("en");
    expect(
      (await authEmailFrameFor({ url: link("https://a.example/x"), email: "e" }, async () => null))
        .locale,
    ).toBe("ar");
  });
});
