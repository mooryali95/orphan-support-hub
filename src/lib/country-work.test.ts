import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  bulkEligible,
  matchesQuery,
  MAX_BULK,
  readGoldenSheet,
  rowIssues,
  sourcesDiffer,
  topFailure,
  type ChildFileField,
} from "./golden-record";

const SQL = readFileSync("supabase/migrations/20261127200000_country_work_center.sql", "utf8");

describe("الحسم الجماعي", () => {
  it("الفرق غير الحرج وحده يُحسم جماعياً", () => {
    expect(bulkEligible({ kind: "disagreement", risk: "low" })).toBe(true);
    expect(bulkEligible({ kind: "disagreement", risk: "medium" })).toBe(true);
    expect(bulkEligible({ kind: "disagreement", risk: "critical" })).toBe(false);
    expect(bulkEligible({ kind: "critical_change", risk: "medium" })).toBe(false);
    expect(bulkEligible({ kind: "held_locked", risk: "low" })).toBe(false);
  });
  it("حدّ الدفعة والخيارات كما في القاعدة", () => {
    expect(SQL).toContain(`cardinality(_ids) > ${MAX_BULK}`);
    expect(SQL).toContain("_choice NOT IN ('use_wamy', 'use_office', 'keep')");
    expect(SQL).toContain("critical_not_bulk");
  });
  it("أشيع سبب رفضٍ يُسمّى", () => {
    expect(
      topFailure({
        ok: true,
        done: 1,
        failed: 3,
        results: [
          { id: "a", ok: true, code: null },
          { id: "b", ok: false, code: "conflict_closed" },
          { id: "c", ok: false, code: "conflict_closed" },
          { id: "d", ok: false, code: "orphan_locked" },
        ],
      }),
    ).toBe("conflict_closed");
    expect(topFailure({ ok: true, done: 1, failed: 0, results: [] })).toBeNull();
  });
});

describe("البحث", () => {
  it("يتسامح مع الهمزة والتشكيل والأرقام الهندية", () => {
    expect(matchesQuery("احمد", "KH-0042", "أَحمد الطيب")).toBe(true);
    expect(matchesQuery("kh-٠٠٤٢", "KH-0042")).toBe(true);
    expect(matchesQuery("مريم", "KH-0042", "حمزة")).toBe(false);
    expect(matchesQuery("  ", null)).toBe(true);
  });
});

describe("معاينة الرفع", () => {
  it("مشكلات كل سطرٍ مجمّعة ومرتّبة", () => {
    const sheet = readGoldenSheet(
      "المعرف,تاريخ الميلاد,الجنس\n,2014-01-01,أنثى\nw-2,غير معروف,شيء\nw-3,2013-02-02,ذكر\n",
      "wamy",
    );
    expect(rowIssues(sheet)).toEqual([
      { line: 2, missingRef: true, fields: [] },
      { line: 3, missingRef: false, fields: ["birth_date", "gender"] },
    ]);
  });
});

describe("ملف الطفل", () => {
  const f = (w: string | null, o: string | null): ChildFileField => ({
    field: "city",
    field_group: "current",
    risk: "low",
    owner: "office",
    value: w,
    from_role: "wamy",
    applied_at: null,
    pinned: false,
    wamy: w === null ? null : { value: w, observed_at: "2026-11-01", source: "wamy" },
    office: o === null ? null : { value: o, observed_at: "2026-11-02", source: "x" },
    open_conflict: false,
  });
  it("اختلاف المصدرين بعد التطبيع", () => {
    expect(sourcesDiffer(f("كسلا", "القضارف"))).toBe(true);
    expect(sourcesDiffer(f("أم درمان", "ام درمان"))).toBe(false);
    expect(sourcesDiffer(f("كسلا", null))).toBe(false);
  });
  it("النطاق قبل أي قراءة في القاعدة", () => {
    const body = SQL.slice(SQL.indexOf("FUNCTION public.country_child_file"));
    expect(body.indexOf("country_can(_country, 'read')")).toBeLessThan(
      body.indexOf("SELECT * INTO _o"),
    );
  });
});
