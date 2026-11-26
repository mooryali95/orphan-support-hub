import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * منفذ البيانات: كل عمليةٍ تناديها شاشةٌ حقيقية باسمٍ عبر `useDataFn` لها نسخةٌ
 * تجريبية مسجّلة في وحدات التجربة، والكود الحقيقي لا يستورد وحدة تجربة. فتبقى
 * التجربة مطابقةً للحقيقي، ويُحذف مجلّدها يوم الإطلاق دون أن ينكسر شيء.
 */
const ROOT = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
const isDemo = (f: string) =>
  /[/\\](lib[/\\]try-|routes[/\\]try\.|components[/\\]try[/\\])/.test(f);

const used = new Set<string>();
const registered = new Set<string>();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!isDemo(f) && !f.endsWith("data-port.ts"))
    for (const m of src.matchAll(/useDataFn\(\s*"([a-z0-9_.-]+)"/gi)) used.add(m[1]!);
  for (const m of src.matchAll(/registerDemo\(\s*"([a-z0-9_.-]+)"/gi)) registered.add(m[1]!);
}

describe("منفذ البيانات", () => {
  // بعد حذف التجربة (`npm run trial:remove`) لا نسخ تجريبية، والمنفذ يعيد الخادم دائماً
  it.skipIf(!files.some(isDemo))("كل عمليةٍ في شاشةٍ حقيقية لها نسخةٌ تجريبية", () => {
    expect([...used].filter((n) => !registered.has(n)).sort()).toEqual([]);
  });

  it("لا يسجّل نسخةً تجريبية إلا ملفٌّ من ملفات التجربة", () => {
    const outside = files
      .filter((f) => !isDemo(f) && /registerDemo\(/.test(readFileSync(f, "utf8")))
      .filter((f) => !f.endsWith("data-port.ts"));
    expect(outside).toEqual([]);
  });
});
