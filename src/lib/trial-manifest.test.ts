import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { TRIAL_ENABLED } from "@/lib/trial-gate";
import { trialSlots } from "@/lib/trial-slots";

/**
 * وضع التجربة يُحذف بأمرٍ واحد (`npm run trial:remove`، docs/trial-mode.ar.md) لأنّ لا ملفّ
 * خارج `trial.manifest.json` يستورد ملفّاً منه: لا `from`، ولا `import()`، ولا `vi.mock`. ما
 * تعرضه الشاشات الحقيقية من التجربة يأتيها بالاسم من `@/lib/trial-slots`، وما تعرفه عن وجودها
 * من `@/lib/trial-gate`. (والبرهان الكامل: مهمّة «حذف التجربة» في CI تحذفها فعلاً وتبني.)
 */
const ROOT = join(__dirname, "../..");
const manifest = JSON.parse(readFileSync(join(ROOT, "trial.manifest.json"), "utf8")) as {
  files: string[];
};

const globToRegExp = (glob: string) =>
  new RegExp(
    `^${glob
      .split("**")
      .map((part) =>
        part
          .split("*")
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*"),
      )
      .join(".*")}$`,
  );
const patterns = manifest.files.map(globToRegExp);
const isTrialFile = (rel: string) => patterns.some((re) => re.test(rel));

const SKIP = new Set(["node_modules", ".git", "dist", ".output"]);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

const all = ["src", "scripts"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !f.endsWith("routeTree.gen.ts"))
  .map(rel);
const real = all.filter((f) => !isTrialFile(f));
const trial = all.filter(isTrialFile);

const SPEC =
  /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']|\bvi\.(?:do)?(?:un)?mock\(\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/gm;
const EXT = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];

/** the files a specifier may name, relative to the root (bare packages name none) */
function targets(file: string, spec: string): string[] {
  const base = spec.startsWith("@/")
    ? join("src", spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(file), spec)
      : null;
  if (base === null) return [];
  return EXT.map((e) => (base + e).split(sep).join("/"));
}

describe("حذف التجربة بأمرٍ واحد", () => {
  it("يرى الملفّات الحقيقية", () => {
    expect(real.length).toBeGreaterThan(100);
  });

  it("لا ملفّ خارج trial.manifest.json يستورد ملفّاً منه", () => {
    const leaks: string[] = [];
    for (const f of real) {
      for (const m of readFileSync(join(ROOT, f), "utf8").matchAll(SPEC)) {
        const spec = m.slice(1).find(Boolean)!;
        if (targets(f, spec).some(isTrialFile)) leaks.push(`${f} → ${spec}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("مدخل التجربة الذي تسأل عنه البوّابة والفتحات من ملفّات التجربة", () => {
    for (const f of ["src/lib/trial-gate.ts", "src/lib/trial-slots.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      const [, entry] = /import\.meta\.glob(?:<[^>]+>)?\(\s*"([^"]+)"/.exec(src) ?? [];
      expect(entry, f).toBeDefined();
      expect(isTrialFile(rel(join(ROOT, dirname(f), entry!))), f).toBe(true);
    }
  });

  it.skipIf(trial.length === 0)("كلّ نمطٍ في البيان يطابق ملفّاً موجوداً", () => {
    for (const [i, re] of patterns.entries())
      expect(
        trial.some((f) => re.test(f)) || existsSync(join(ROOT, manifest.files[i]!)),
        manifest.files[i],
      ).toBe(true);
  });

  it("البوّابة والفتحات تريان التجربة ما دامت ملفّاتها، ولا تريانها بعد حذفها", () => {
    expect(TRIAL_ENABLED).toBe(trial.length > 0);
    expect(trialSlots !== null).toBe(trial.length > 0);
    if (trialSlots) expect(typeof trialSlots.ProposalOffer).toBe("function");
  });
});
