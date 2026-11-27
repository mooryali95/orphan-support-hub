import { describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => new Map<string, (input?: unknown) => Promise<unknown>>());
vi.mock("@/lib/data-port", () => ({
  registerDemo: (name: string, fn: (input?: unknown) => Promise<unknown>) => registry.set(name, fn),
}));

const { registerChildUpdateDemos, tryChildUpdates } = await import("@/lib/try-child-updates");

describe("تحديثات الطفل في التجربة", () => {
  it("كلّ وسيطٍ رسمٌ مولَّد موسومٌ نموذجاً، لا صورة", () => {
    const items = tryChildUpdates("try-01", new Date("2026-11-20T00:00:00Z"));
    expect(items.length).toBeGreaterThan(3);
    for (const u of items) {
      expect(u.sample).toBe(true);
      for (const url of [u.url, u.poster_url])
        if (url) expect(url.startsWith("data:image/svg+xml")).toBe(true);
    }
    expect(items.some((u) => u.kind === "video" && u.poster_url && !u.url)).toBe(true);
  });

  it("الطابور يحترم العينين: ما رفعتَه لا تحسمه", async () => {
    registerChildUpdateDemos();
    for (const n of [
      "sponsor.childUpdates",
      "childUpdates.queue",
      "childUpdates.children",
      "childUpdates.upload",
      "childUpdates.submit",
      "childUpdates.review",
    ])
      expect(registry.has(n), n).toBe(true);
    const q = (await registry.get("childUpdates.queue")!({ data: { country: null } })) as {
      data: Array<{ id: string; mine: boolean }>;
    };
    const mine = q.data.find((u) => u.mine)!;
    const other = q.data.find((u) => !u.mine)!;
    expect(await registry.get("childUpdates.review")!({ data: { id: mine.id } })).toMatchObject({
      ok: false,
      error: "four_eyes_required",
    });
    expect(await registry.get("childUpdates.review")!({ data: { id: other.id } })).toMatchObject({
      ok: true,
    });
  });
});
