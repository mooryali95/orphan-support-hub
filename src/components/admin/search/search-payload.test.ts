import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// البحث الموحّد لا يحمل صورةً خاصة ولا موقعاً ولا سبب تنبيه، في المنصّة وفي العرض.
const CHILD = ["code", "country", "id", "name", "status"];
const FORBIDDEN = /photo|lat|lng|location|address|geo|reason|signal|field_value|guardian/i;

const dir = join(__dirname, "../../../../supabase/migrations");
const lastSearch = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .filter((s) => /FUNCTION public\.admin_search\(/.test(s))
  .at(-1)!;
const body = lastSearch.slice(lastSearch.search(/FUNCTION public\.admin_search\(/));
const fn = body.slice(0, body.indexOf("$$;", body.indexOf("$$") + 2));

const keysAfter = (label: string) => {
  const at = fn.search(new RegExp(`'${label}', (COALESCE|CASE)`));
  expect(at, label).toBeGreaterThan(0);
  const obj = fn.slice(fn.indexOf("jsonb_build_object(", at), fn.indexOf(") AS x", at));
  return [...obj.matchAll(/'([a-z_]+)',/g)].map((m) => m[1]!).sort();
};

describe("حمولة البحث في الإدارة", () => {
  it("صفّ الطفل في admin_search حقول البطاقة العامّة وحدها", () => {
    expect(keysAfter("children")).toEqual(CHILD);
  });

  it("لا حقل خاصّ في أيّ صنفٍ من النتائج", () => {
    for (const k of ["children", "sponsors", "sponsorships", "transfers"])
      for (const key of keysAfter(k)) expect(key, `${k}.${key}`).not.toMatch(FORBIDDEN);
  });
});
