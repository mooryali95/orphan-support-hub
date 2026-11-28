import { describe, expect, it, vi } from "vitest";

import { JOBS } from "@/components/admin/nav";
import { buildQueue } from "@/components/admin/today/queue";
import { ADMIN_ACCESS } from "@/lib/golden-record";
import { TRY_ADMIN_SECTIONS } from "@/lib/try-admin-sections";

const registry = vi.hoisted(() => new Map<string, (input?: unknown) => Promise<unknown>>());
vi.mock("@/lib/data-port", () => ({
  registerDemo: (name: string, fn: (input?: unknown) => Promise<unknown>) => registry.set(name, fn),
}));

const { registerSettingsDemos, demoSources } = await import("@/lib/try-settings");
await import("@/lib/try-verification");

describe("أقسام الإدارة في العرض", () => {
  it("تطابق مهامّ /admin واحداً بواحد وبالترتيب", () => {
    expect([...TRY_ADMIN_SECTIONS]).toEqual([...JOBS]);
  });

  it("الإعدادات تصل بنداءٍ صريح، بلا عنوانٍ ولا مزامنةٍ حيّة", async () => {
    registerSettingsDemos();
    expect(registry.has("settings.sources")).toBe(true);
    expect(registry.has("settings.locales")).toBe(true);
    for (const s of demoSources().sources) {
      expect(s.name).toMatch(/^DEMO-/);
      expect(s.base_url).toBeNull();
      expect(s.last_sync_at).toBeNull();
    }
  });
});

describe("العينان في العرض", () => {
  it("ما رفعه الزائر من تنبيهٍ حرج لا يحسمه ولو كان مديراً", () => {
    const items = buildQueue(
      {
        alerts: [
          {
            id: "a1",
            country: "LK",
            orphan_id: null,
            code: "DEMO-1",
            name: "",
            created_at: new Date().toISOString(),
            severity: "critical",
            mine: true,
          } as never,
        ],
      },
      ADMIN_ACCESS,
    );
    expect(items[0]?.can_settle).toBe(false);
    expect(items[0]?.settle_block_reason).toBe("own_upload");
  });

  it("الحسم التجريبي يرفض تنبيهاً رفعه الزائر", async () => {
    const res = await (registry.get("golden.alerts")!({ data: { country: null } }) as Promise<{
      data: Array<{ id: string; mine?: boolean }>;
    }>);
    const own = res.data.find((a) => a.mine);
    expect(own).toBeDefined();
    const out = (await registry.get("golden.resolveAlert")!({
      data: { id: own!.id, status: "reviewed" },
    })) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toBe("four_eyes_required");
  });
});
