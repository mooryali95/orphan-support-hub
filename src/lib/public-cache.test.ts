import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedPublic, clearPublicCache } from "./public-cache";

describe("cachedPublic", () => {
  beforeEach(() => clearPublicCache());

  it("serves a fresh hit without calling the loader again", async () => {
    const load = vi.fn(async () => 1);
    let t = 0;
    expect(await cachedPublic("k", 1000, load, undefined, () => t)).toBe(1);
    t = 999;
    expect(await cachedPublic("k", 1000, load, undefined, () => t)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    t = 1000;
    await cachedPublic("k", 1000, load, undefined, () => t);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const load = vi.fn(async () => "x");
    const [a, b] = await Promise.all([
      cachedPublic("k", 1000, load),
      cachedPublic("k", 1000, load),
    ]);
    expect([a, b]).toEqual(["x", "x"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not keep results the caller rejects (errors)", async () => {
    const load = vi.fn(async () => ({ error: "down" }));
    const keep = (v: { error: string | null }) => !v.error;
    await cachedPublic("k", 1000, load, keep);
    await cachedPublic("k", 1000, load, keep);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a rejected load", async () => {
    await expect(
      cachedPublic("k", 1000, async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    expect(await cachedPublic("k", 1000, async () => 2)).toBe(2);
  });
});
