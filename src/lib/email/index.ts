import { resendProvider } from "./resend";
import type { EmailProvider } from "./types";

export * from "./types";
export * from "./templates";

/** مزوّد لا يرسل شيئاً — الحالة الافتراضية حتى تُضبط الأسرار. */
const noopProvider: EmailProvider = {
  id: "none",
  isConfigured: () => false,
  send: async () => ({ ok: false, error: "لا مزوّد بريد مضبوط", retryable: false }),
};

export function emailProvider(): EmailProvider {
  return resendProvider.isConfigured() ? resendProvider : noopProvider;
}
