import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** N5: تنبيهٌ عالٍ في تبعيات التشغيل يمنع الدمج، والتقرير الكامل يبقى للعلم. */
describe("dependency audit gate", () => {
  const ci = fs.readFileSync(path.resolve(__dirname, "../../.github/workflows/ci.yml"), "utf8");

  it("fails CI on high runtime advisories", () => {
    const step = ci.split(/\n\s*- name: /).find((s) => s.includes("bun audit --prod"));
    expect(step).toBeDefined();
    expect(step).toContain("--audit-level=high");
    expect(step).not.toContain("continue-on-error");
    expect(step).not.toContain("|| true");
  });

  it("keeps the full audit as an informational report", () => {
    expect(ci).toMatch(/bun audit 2>&1 \|\| true/);
  });
});
