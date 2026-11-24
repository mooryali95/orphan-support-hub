import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { EVENT_TYPES, eventLabel, isEventType, isSponsorVisible } from "./event-labels";

const MIGRATIONS = join(__dirname, "../../supabase/migrations");

/** كل نوع حدثٍ تكتبه القاعدة: write_timeline(…, 'x.y') و'pledge.' || stage وما يُنتجه الخطّ. */
function emittedTypes(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    for (const m of sql.matchAll(/write_timeline\([^,]+,\s*'([a-z_.]+)'/g)) out.add(m[1]!);
    for (const m of sql.matchAll(/SELECT\s+'(?:unit|trait)',\s*'([a-z_.]+)'/g)) out.add(m[1]!);
    if (/'pledge\.'\s*\|\|\s*d\.stage/.test(sql)) {
      const stages = /stage\s+TEXT NOT NULL CHECK \(stage IN \(([^)]*)\)/.exec(sql);
      for (const s of stages?.[1]?.match(/'[a-z_]+'/g) ?? []) out.add(`pledge.${s.slice(1, -1)}`);
    }
  }
  return out;
}

describe("أسماء الأحداث", () => {
  it("كل نوعٍ تكتبه القاعدة له اسمٌ في اللغتين", () => {
    const emitted = emittedTypes();
    // الاستخراج نفسه يعمل: لو وجد صفراً لمرّ الاختبار بلا معنى.
    expect(emitted.size).toBeGreaterThanOrEqual(6);
    for (const type of emitted) {
      expect(isEventType(type), `no label for ${type}`).toBe(true);
      expect(eventLabel(type, "ar")).not.toContain(".");
      expect(eventLabel(type, "en")).not.toBe(type);
    }
  });

  it("المجهول لا يُعرض مفتاحاً خاماً", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(eventLabel("orphan.created", "ar")).toBe("تحديثٌ في الملفّ");
    expect(eventLabel("orphan.created", "en")).toBe("File update");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("العمل الداخلي لا يصل خطّ الكافل", () => {
    expect(isSponsorVisible("report.submitted")).toBe(false);
    expect(isSponsorVisible("report.rejected")).toBe(false);
    expect(isSponsorVisible("report.published")).toBe(true);
    expect(EVENT_TYPES.filter(isSponsorVisible)).toContain("disbursement_delivered");
  });
});
