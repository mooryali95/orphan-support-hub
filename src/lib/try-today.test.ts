import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildQueue } from "@/components/admin/today/queue";
import { ADMIN_ACCESS } from "@/lib/golden-record";

// نلتقط ما تسجّله وحدات التجربة بدل منفذ البيانات، لنناديه مباشرةً.
const registry = vi.hoisted(() => new Map<string, (input?: unknown) => Promise<unknown>>());
vi.mock("@/lib/data-port", () => ({
  registerDemo: (name: string, fn: (input?: unknown) => Promise<unknown>) => registry.set(name, fn),
}));

await import("@/lib/try-today");

const call = <T>(name: string, input?: unknown) => registry.get(name)!(input) as Promise<T>;

describe("«اليوم» في العرض التفاعلي", () => {
  it("كل عمليةٍ تناديها شاشات «اليوم» لها نسخةٌ تجريبية", () => {
    const src = ["TodayQueue.tsx", "TodayTiles.tsx", "useToday.ts"]
      .map((f) => readFileSync(join(__dirname, "../components/admin/today", f), "utf8"))
      .join("\n");
    const used = [...src.matchAll(/useDataFn\(\s*"([a-z0-9_.-]+)"/gi)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(4);
    for (const n of used) expect(registry.has(n), n).toBe(true);
  });

  it("البنود رموزٌ مستعارة بلا معرّف دفعٍ حقيقي", async () => {
    const inbox = await call<Array<{ title: string; subtitle: string }>>("today.inbox");
    expect(inbox.length).toBeGreaterThan(0);
    for (const it of inbox) expect(it.title).toMatch(/^DEMO-/);
  });

  it("فيه ما رفعه الزائر نفسه: يظهر بلا زرّ حسم، والحسم يُرفض بالعينين", async () => {
    const res = await call<{ ok: true; data: Array<{ id: string; mine?: boolean }> }>(
      "golden.conflicts",
      { data: { country: null } },
    );
    const items = buildQueue({ conflicts: res.data as never }, ADMIN_ACCESS);
    const own = items.find((i) => i.settle_block_reason === "own_upload");
    expect(own).toBeDefined();
    const forced = await call<{ ok: boolean; error?: string }>("golden.resolveConflict", {
      data: { id: own!.id, choice: "accept" },
    });
    expect(forced).toMatchObject({ ok: false, error: "four_eyes_required" });
  });
});
