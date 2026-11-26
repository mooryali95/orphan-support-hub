import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  authorityNow,
  effectiveOwner,
  FIELD_RULES,
  fieldsFrom,
  goldenTemplate,
  readGoldenSheet,
  verifiedShare,
} from "./golden-record";

const MIGRATION = readFileSync("supabase/migrations/20261126100000_golden_record.sql", "utf8");
const SEED = MIGRATION.slice(
  MIGRATION.indexOf("INSERT INTO public.field_authority"),
  MIGRATION.indexOf("ON CONFLICT (field) DO NOTHING"),
);

describe("مصفوفة السلطة", () => {
  it("تطابق ما تبذره الهجرة حقلاً حقلاً", () => {
    const seed = [
      ...SEED.matchAll(
        /\('([a-z_]+)',\s*'([a-z]+)',\s*'([a-z]+)',\s*(?:'([a-z]+)'|NULL),\s*'([a-z]+)',/g,
      ),
    ].map((m) => [m[1], m[2], m[3], m[4] ?? null, m[5]]);
    expect(seed).toEqual(FIELD_RULES.map((r) => [r.field, r.group, r.owner, r.verifier, r.risk]));
  });

  it("حقل المكتب للندوة ما لم يكن المكتب فعّالاً", () => {
    expect(effectiveOwner("office", "none")).toBe("wamy");
    expect(effectiveOwner("office", "shadow")).toBe("wamy");
    expect(effectiveOwner("office", "active")).toBe("office");
    expect(effectiveOwner("wamy", "active")).toBe("wamy");
  });

  it("السلطة الآن بحسب الوضع", () => {
    const at = (mode: "none" | "shadow" | "active") =>
      Object.fromEntries(authorityNow(mode).map((a) => [a.group, [a.owner, a.verifier]]));
    expect(at("none")["current"]).toEqual(["wamy", null]);
    expect(at("none")["identity"]).toEqual(["wamy", null]);
    expect(at("shadow")["current"]).toEqual(["wamy", "office"]);
    expect(at("active")["current"]).toEqual(["office", "wamy"]);
    expect(at("active")["finance"]).toEqual(["platform", "wamy"]);
  });

  it("لا مصدر يرسل المال، والندوة لا ترسل التقارير", () => {
    expect(fieldsFrom("wamy").map((r) => r.field)).not.toContain("sponsorship");
    expect(fieldsFrom("office").map((r) => r.field)).not.toContain("sponsorship");
    expect(fieldsFrom("wamy").map((r) => r.field)).not.toContain("progress_report");
    expect(fieldsFrom("office").map((r) => r.field)).toContain("progress_report");
  });
});

describe("ملف الرفع", () => {
  it("يقرأ العناوين العربية ويحوّل القيم", () => {
    const s = readGoldenSheet(
      "المعرف,تاريخ الرصد,الاسم,الجنس,تاريخ الميلاد,مؤهل للكفالة,التقرير,عمود غريب\n" +
        "W-1,01/11/2026,ضحى,أنثى,١٥/٠٣/٢٠١٥,نعم,س,x\n" +
        ",,بلا معرف,ذكر,,,,\n" +
        "W-2,,سالم,؟,2015-02-31,,,\n",
      "wamy",
    );
    expect(s.ignored).toEqual(["التقرير", "عمود غريب"]);
    expect(s.records[0]).toEqual({
      external_ref: "W-1",
      observed_at: "2026-11-01T00:00:00Z",
      fields: {
        display_name: "ضحى",
        gender: "female",
        birth_date: "2015-03-15",
        sponsorship_eligible: true,
      },
    });
    expect(s.missingRef).toEqual([3]);
    expect(s.invalid).toEqual([
      { line: 4, field: "gender" },
      { line: 4, field: "birth_date" },
    ]);
    expect(s.records[1]).toEqual({ external_ref: "W-2", fields: { display_name: "سالم" } });
  });

  it("القالب يحمل حقول المصدر وحدها", () => {
    expect(goldenTemplate("office")).toContain("التقرير");
    expect(goldenTemplate("wamy")).not.toContain("التقرير");
  });
});

describe("نسبة التوثيق", () => {
  it("لا تحسب الإرث، ولا نسبة بلا ملفّات مُدارة", () => {
    expect(
      verifiedShare({ verified: 3, single_source: 1, conflict: 0, stale: 0, legacy: 50 }),
    ).toBe(75);
    expect(
      verifiedShare({ verified: 0, single_source: 0, conflict: 0, stale: 0, legacy: 9 }),
    ).toBeNull();
  });
});
