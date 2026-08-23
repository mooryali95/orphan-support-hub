import type { EmailProvider, OutgoingEmail, SendResult } from "./types";

/**
 * محوّل Resend.
 *
 * واجهة واحدة: `POST https://api.resend.com/emails` بترويسة
 * `Authorization: Bearer <key>`.
 */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const resendProvider: EmailProvider = {
  id: "resend",

  isConfigured() {
    return Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM"));
  },

  async send(mail: OutgoingEmail): Promise<SendResult> {
    const key = env("RESEND_API_KEY");
    const from = env("EMAIL_FROM");
    if (!key || !from)
      return { ok: false, error: "RESEND_API_KEY أو EMAIL_FROM ناقص", retryable: false };

    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
      });
    } catch (e) {
      // تعذّر الوصول أصلاً: يُعاد لاحقاً، فالخطأ في الشبكة لا في الرسالة.
      return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
    }

    const body = await res.text();
    if (!res.ok) {
      // 4xx خطأ في الرسالة نفسها فإعادتها تُنتج الخطأ ذاته؛ و5xx و429
      // عارضان فيُعادان. التمييز يمنع طابوراً يدور على رسالة ميّتة.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}`, retryable };
    }

    const parsed = JSON.parse(body || "{}") as { id?: string };
    return { ok: true, id: parsed.id ?? "" };
  },
};
