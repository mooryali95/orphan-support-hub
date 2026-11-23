import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { forgetWebGL2, hasWebGL2 } from "./webgl";

const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

/** a browser whose canvas answers `getContext("webgl2")` with `gl` (null: WebGL refused) */
function browser(gl: "ok" | "refused" | "throws", defined = true) {
  const calls = { canvases: 0, contexts: 0, lost: 0 };
  vi.stubGlobal("window", {});
  if (defined) vi.stubGlobal("WebGL2RenderingContext", class {});
  vi.stubGlobal("document", {
    createElement: () => {
      calls.canvases++;
      return {
        getContext: (kind: string) => {
          expect(kind).toBe("webgl2");
          calls.contexts++;
          if (gl === "throws") throw new Error("blocked");
          if (gl === "refused") return null;
          return {
            getExtension: (name: string) =>
              name === "WEBGL_lose_context" ? { loseContext: () => void calls.lost++ } : null,
          };
        },
      };
    },
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetWebGL2();
});

describe("فحص WebGL: مرّةٌ واحدة، وسياقه يُعاد فوراً", () => {
  it("على الخادم لا يُسأل شيء", () => {
    expect(hasWebGL2()).toBe(false);
  });

  it("متصفّحٌ لا يعرّف WebGL 2: الجواب لا، بلا لوحةٍ ولا سياق", () => {
    const calls = browser("ok", false);
    expect(hasWebGL2()).toBe(false);
    expect(calls).toEqual({ canvases: 0, contexts: 0, lost: 0 });
  });

  it("متصفّحٌ يرسم: سياقٌ واحد يُفتح ويُعاد، والجواب يُحفظ", () => {
    const calls = browser("ok");
    expect(hasWebGL2()).toBe(true);
    expect(hasWebGL2()).toBe(true);
    expect(hasWebGL2()).toBe(true);
    expect(calls).toEqual({ canvases: 1, contexts: 1, lost: 1 });
  });

  it("متصفّحٌ يرفض السياق أو يرميه: الجواب لا، ولا يُعاد السؤال", () => {
    for (const kind of ["refused", "throws"] as const) {
      forgetWebGL2();
      const calls = browser(kind);
      expect(hasWebGL2()).toBe(false);
      expect(hasWebGL2()).toBe(false);
      expect(calls).toEqual({ canvases: 1, contexts: 1, lost: 0 });
    }
  });

  it("التسخين يتخطّى المتصفّح الذي لا يرسم، والصفحة تقرأ الجواب نفسه", () => {
    const preload = read("src/lib/hall/preload.ts");
    expect(preload).toMatch(/if \(typeof window === "undefined" \|\| !hasWebGL2\(\)\) return;/);
    const page = read("src/routes/hall.lazy.tsx");
    expect(page).toContain("if (!hasWebGL2()) {");
    // the one probe lives in `./webgl`: no other file of the route opens a context to ask
    for (const f of ["src/routes/hall.lazy.tsx", "src/routes/hall.tsx", "src/lib/hall/preload.ts"])
      expect(read(f), f).not.toMatch(/getContext\(/);
  });
});

describe("التسخين نفسه", () => {
  it("بلا WebGL لا يُطلب المشهد ولا كتالوج التجربة؛ ومعه يُطلبان", async () => {
    const scene = vi.fn(() => Promise.resolve({}));
    const trial = vi.fn(() => Promise.resolve({}));
    vi.doMock("@/components/hall/hall-scene.js", scene);
    vi.doMock("@/lib/hall/trial", trial);
    const { warmHall } = await import("./preload");

    browser("refused");
    warmHall({});
    await Promise.resolve();
    expect(scene).not.toHaveBeenCalled();
    expect(trial).not.toHaveBeenCalled();

    forgetWebGL2();
    browser("ok");
    warmHall({});
    await vi.waitFor(() => expect(scene).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(trial).toHaveBeenCalledTimes(1));
    vi.doUnmock("@/components/hall/hall-scene.js");
    vi.doUnmock("@/lib/hall/trial");
  });
});
