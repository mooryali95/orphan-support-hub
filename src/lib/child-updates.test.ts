import { describe, expect, it } from "vitest";

import { checkMedia, childUpdatePath, clock, groupByMonth, captionOf } from "./child-updates";

describe("child updates", () => {
  it("checks type and size before upload", () => {
    expect(checkMedia("image/jpeg", 1000)).toEqual({ ok: true, kind: "photo", ext: "jpg" });
    expect(checkMedia("image/webp", 6 * 1024 * 1024)).toEqual({
      ok: false,
      code: "file_too_large",
    });
    expect(checkMedia("video/mp4", 39 * 1024 * 1024)).toMatchObject({ ok: true, kind: "video" });
    expect(checkMedia("video/mp4", 41 * 1024 * 1024)).toMatchObject({ ok: false });
    expect(checkMedia("image/gif", 10)).toEqual({ ok: false, code: "type_unsupported" });
    expect(checkMedia("video/quicktime", 10)).toEqual({ ok: false, code: "type_unsupported" });
  });

  it("builds a path in the child's folder with no uploader file name", () => {
    expect(childUpdatePath("o1", "u1", "png")).toBe("o1/u1.png");
  });

  it("groups by month, newest first", () => {
    const g = groupByMonth([
      { at: "2026-09-03T00:00:00Z", id: "a" },
      { at: "2026-10-20T00:00:00Z", id: "b" },
      { at: "2026-10-02T00:00:00Z", id: "c" },
    ]);
    expect(g.map((x) => x.month)).toEqual(["2026-10", "2026-09"]);
    expect(g[0]!.items.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("falls back to Arabic caption and formats clip length", () => {
    expect(captionOf({ caption_ar: "ع", caption_en: null }, "en")).toBe("ع");
    expect(captionOf({ caption_ar: "ع", caption_en: "E" }, "en")).toBe("E");
    expect(clock(42)).toBe("0:42");
    expect(clock(60)).toBe("1:00");
  });
});
