import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { demoNames, resetDemoRegistry } from "@/lib/data-port";

/**
 * فتح `/try/sponsorships/:id` مباشرةً كان يُبقي الهيكل إلى الأبد: الخادم يرسم الصفحة، فلا
 * يُعاد `beforeLoad`/`loader` في المتصفّح، والغلاف كان يستورد `try-sponsor-center` استيراداً
 * عارياً يُسقطه `sideEffects: false` من الحزمة — فلا نسخ في المنفذ، فيُنادى الخادم الحقيقي.
 * التسجيل الآن نداءٌ صريح؛ وهذا يحرسه.
 */
describe("مركز الكافل في التجربة عند الدخول المباشر", () => {
  it("الاستيراد وحده لا يسجّل شيئاً، والنداء الصريح يسجّل ما تحتاجه صفحة الكفالة مرّةً", async () => {
    resetDemoRegistry();
    const m = await import("@/lib/try-sponsor-center");
    expect(demoNames()).not.toContain("sponsor.ledger");
    m.registerSponsorCenterDemos();
    for (const n of [
      "sponsor.ledger",
      "sponsor.qualification",
      "impact.reports",
      "sponsor.manage.list",
      "sponsor.pay",
      "verify.public",
      "sponsor.childUpdates",
    ])
      expect(demoNames()).toContain(n);
    const count = demoNames().length;
    m.registerSponsorCenterDemos();
    expect(demoNames().length).toBe(count);
  });

  it("الغلاف يسجّل النسخ بنداءٍ في رأس الوحدة، ولا استيراد عارياً لوحدة تجربة", () => {
    const shell = readFileSync("src/components/try/TryShell.tsx", "utf8");
    expect(shell).toMatch(/^registerSponsorCenterDemos\(\);$/m);
    const bare: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && /^import\s+["']@\/lib\/try-/m.test(readFileSync(p, "utf8")))
          bare.push(p);
      }
    };
    walk("src");
    expect(bare).toEqual([]);
  });
});
