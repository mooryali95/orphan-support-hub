import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * حدّ التجربة والحقيقة.
 *
 * بيانات التجربة (أطفال افتراضيون، دفع محاكى، عيّنات) تعيش في وحداتها. هذا
 * الفحص يفشل إن استوردها مسار حقيقي: بوابات ما بعد الدخول، أو دوال الخادم،
 * أو واجهات API — فلا يدخل معرّف تجريبي مسار مالٍ حقيقي.
 */
const DEMO_MODULES = [
  /@\/lib\/try-world/,
  /@\/lib\/try-evidence/,
  /@\/lib\/try-demo/,
  /@\/lib\/hall\/trial/,
  /@\/components\/try\//,
  /@\/components\/vision\//,
];

/**
 * جسور مقصودة ومراجَعة: بطاقة «ما اخترته في التجربة» تعرض مقترحاً (بلد ومبلغ)
 * ولا تُنشئ شيئاً؛ الداعم يختار طفلاً حقيقياً ويؤكّد بنفسه.
 */
const ALLOWED_BRIDGES: Record<string, string[]> = {
  "routes/_authenticated/dashboard.tsx": ["@/components/try/TrialProposal"],
};

const ROOT = join(__dirname, "..");
const REAL_ROOTS = ["routes/_authenticated", "routes/api"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const realFiles = [
  ...REAL_ROOTS.flatMap((r) => walk(join(ROOT, r))),
  ...readdirSync(join(ROOT, "lib"))
    .filter((f) => f.endsWith(".functions.ts"))
    .map((f) => join(ROOT, "lib", f)),
].filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));

describe("demo/real boundary", () => {
  it("covers real files", () => {
    expect(realFiles.length).toBeGreaterThan(10);
  });

  it.each(realFiles.map((f) => [f.slice(ROOT.length + 1), f]))(
    "%s imports no demo module",
    (rel, file) => {
      const imports = [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1]!,
      );
      const allowed = ALLOWED_BRIDGES[rel] ?? [];
      const leaked = imports.filter(
        (i) => DEMO_MODULES.some((re) => re.test(i)) && !allowed.includes(i),
      );
      expect(leaked).toEqual([]);
    },
  );
});

describe("immersive hall follows its source", () => {
  it("opens the trial only from an explicit ?try=1, never from the platform-wide mode", () => {
    // the switch lives in lib/hall/source.ts; neither it nor the page may read the platform mode
    const hall = readFileSync(join(ROOT, "routes/hall.lazy.tsx"), "utf8");
    const source = readFileSync(join(ROOT, "lib/hall/source.ts"), "utf8");
    expect(hall).not.toMatch(/isTrial\(/);
    expect(hall + source).not.toMatch(/config\/platform/);
    expect(source).toMatch(/search\.try === 1 \? "trial"/);
  });
});
