import { describe, expect, it, vi } from "vitest";

import { drainOutbox, type OutboxDeps } from "./email-outbox.server";

const row = (id: string) => ({
  id,
  recipient: `${id}@example.test`,
  kind: "welcome",
  title: "أهلاً",
  body: null,
  link: "/dashboard",
  unsubscribe_token: `tok-${id}`,
  attempts: 1,
});

function deps(over: Partial<OutboxDeps> = {}) {
  const rpc = vi.fn(async (fn: string) =>
    fn === "claim_email_batch"
      ? { data: [row("a"), row("b")], error: null }
      : { data: null, error: null },
  );
  const send = vi.fn(async () => ({ sent: true }));
  return {
    rpc,
    send,
    d: { rpc, send, baseUrl: "https://app.example/", configured: true, siteName: "X", ...over },
  };
}

describe("ARC-02/APP-05: طريق البريد الواحد", () => {
  it("كلّ رسالةٍ تخرج تحمل رابط إلغاء الاشتراك بعنوان الأصل المضبوط", async () => {
    const { d, send, rpc } = deps();
    const out = await drainOutbox(d);
    expect(out).toMatchObject({ claimed: 2, sent: 2, halted: null });
    for (const call of send.mock.calls as unknown as Array<[string, Record<string, unknown>]>) {
      expect(call[1]["unsubscribeUrl"]).toMatch(/^https:\/\/app\.example\/unsubscribe\?token=tok-/);
    }
    expect(rpc).toHaveBeenCalledWith("mark_email_sent", { _ids: ["a", "b"] });
  });

  it("المطالبة من claim_email_batch وحدها (التي تكنس الإلغاء والكتم والحجب) لا قراءة مباشرة", async () => {
    const { d, rpc } = deps();
    await drainOutbox(d);
    expect(rpc.mock.calls[0]?.[0]).toBe("claim_email_batch");
  });

  it("بلا عنوان أصل لا يُرسل شيء ولا يُطالَب بشيء — ولا نطاق احتياطيّ", async () => {
    const { d, rpc, send } = deps({ baseUrl: null });
    expect((await drainOutbox(d)).halted).toBe("base_url_missing");
    expect(rpc).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("بلا مفتاح إرسال يتوقّف قبل المطالبة فلا تُستهلك محاولات", async () => {
    const { d, rpc } = deps({ configured: false });
    expect((await drainOutbox(d)).halted).toBe("email_unconfigured");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("فشل الإرسال يُعاد للطابور، والمرفوض عند المزوّد يُكتم", async () => {
    const { d, rpc, send } = deps();
    send.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ sent: false });
    const out = await drainOutbox(d);
    expect(out).toMatchObject({ sent: 0, failed: 1, suppressed: 1 });
    expect(rpc).toHaveBeenCalledWith("mark_email_failed", expect.objectContaining({ _id: "a" }));
    expect(rpc).toHaveBeenCalledWith("mark_email_suppressed", { _id: "b" });
  });
});
