import { describe, expect, it } from "vitest";

import {
  archiveDaysFrom,
  CHILD_UPDATES_BUCKET,
  DEFAULT_ARCHIVE_DAYS,
  purgeChildUpdateMedia,
  runChildUpdatesRetention,
  type RetentionDb,
} from "./child-updates-retention";

function fakeDb(opts: { items: unknown[]; failRemove?: (paths: string[]) => boolean }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const db: RetentionDb = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "child_updates_retention_due")
        return { data: { ok: true, items: opts.items }, error: null };
      const ids = (args?.["_ids"] as string[]) ?? [];
      return { data: { ok: true, deleted: ids.length }, error: null };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          removed.push({ bucket, paths });
          return { error: opts.failRemove?.(paths) ? { message: "boom" } : null };
        },
      }),
    },
  };
  return { db, calls, removed };
}

describe("child updates retention", () => {
  it("reads the archive period from env with a safe floor", () => {
    expect(archiveDaysFrom(undefined)).toBe(DEFAULT_ARCHIVE_DAYS);
    expect(archiveDaysFrom("90")).toBe(90);
    expect(archiveDaysFrom("7")).toBe(DEFAULT_ARCHIVE_DAYS);
    expect(archiveDaysFrom("abc")).toBe(DEFAULT_ARCHIVE_DAYS);
  });

  it("removes media from the private bucket before deleting rows", async () => {
    const { db, calls, removed } = fakeDb({
      items: [
        { id: "a", reason: "rejected", paths: ["o/1.jpg"] },
        { id: "b", reason: "archived", paths: ["o/2.mp4", "o/3.jpg"] },
        { id: "c", reason: "archived", paths: [] },
      ],
    });
    const summary = await runChildUpdatesRetention(db, 400);
    expect(removed).toEqual([
      { bucket: CHILD_UPDATES_BUCKET, paths: ["o/1.jpg", "o/2.mp4", "o/3.jpg"] },
    ]);
    expect(calls.map((c) => c.fn)).toEqual([
      "child_updates_retention_due",
      "child_updates_retention_done",
    ]);
    expect(calls[1]?.args).toEqual({ _ids: ["a", "b", "c"], _archive_days: 400 });
    expect(summary).toEqual({ due: 3, deleted: 3, storageFailed: 0 });
  });

  it("keeps rows whose media could not be removed", async () => {
    const { db, calls } = fakeDb({
      items: [{ id: "a", reason: "rejected", paths: ["o/1.jpg"] }],
      failRemove: () => true,
    });
    const summary = await runChildUpdatesRetention(db);
    expect(calls.map((c) => c.fn)).toEqual(["child_updates_retention_due"]);
    expect(summary).toEqual({ due: 1, deleted: 0, storageFailed: 1 });
  });

  it("purges a rejected update's media and its poster", async () => {
    const { db, removed } = fakeDb({ items: [] });
    expect(await purgeChildUpdateMedia(db, ["o/v.mp4", "o/p.jpg", "o/v.mp4"])).toBe(true);
    expect(removed).toEqual([{ bucket: CHILD_UPDATES_BUCKET, paths: ["o/v.mp4", "o/p.jpg"] }]);
    expect(await purgeChildUpdateMedia(db, [])).toBe(true);
    expect(removed).toHaveLength(1);
  });
});
