import { describe, expect, it, vi } from "vitest";

// العرض يحمل حقول البحث نفسها في المنصّة (search-payload.test.ts)، بلا حقلٍ خاصّ.
const CHILD = ["code", "country", "id", "name", "status"];
const FORBIDDEN = /photo|lat|lng|location|address|geo|reason|signal|field_value|guardian/i;

const registry = vi.hoisted(() => new Map<string, (input?: unknown) => Promise<unknown>>());
vi.mock("@/lib/data-port", () => ({
  registerDemo: (name: string, fn: (input?: unknown) => Promise<unknown>) => registry.set(name, fn),
}));

describe("حمولة البحث في العرض", () => {
  it("نتائج العيّنة بالحقول نفسها، بلا حقلٍ خاصّ", async () => {
    const { demoSearch, setVerificationActor } = await import("@/lib/try-verification");
    setVerificationActor(null);
    for (const q of ["DEMO", "de", "a"]) {
      const r = demoSearch(q);
      for (const c of r.children) expect(Object.keys(c).sort()).toEqual(CHILD);
      const all = [...r.children, ...r.sponsors, ...r.sponsorships, ...r.transfers];
      for (const row of all) for (const key of Object.keys(row)) expect(key).not.toMatch(FORBIDDEN);
    }
    expect(demoSearch("DEMO").children.length).toBeGreaterThan(0);
  });
});
