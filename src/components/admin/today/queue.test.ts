import { describe, expect, it } from "vitest";

import {
  ADMIN_ACCESS,
  matchesQuery,
  type Conflict,
  type CountryAccess,
  type DataAlert,
} from "@/lib/golden-record";

import {
  ageBucket,
  agingCounts,
  applyFilters,
  buildQueue,
  filtersFrom,
  groupOf,
  isOverdue,
  NO_FILTERS,
  stripCounts,
} from "./queue";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const conflict = (o: Partial<Conflict> & { mine?: boolean }): Conflict & { mine?: boolean } => ({
  id: "c1",
  orphan_id: "o1",
  code: "K-1024",
  name: "Sample",
  country: "LK",
  field: "birth_date",
  field_group: "identity",
  kind: "critical_change",
  risk: "critical",
  current: "2015-01-01",
  proposed: "2009-01-01",
  wamy: "2009-01-01",
  office: null,
  created_at: ago(5),
  ...o,
});
const alert = (o: Partial<DataAlert> & { mine?: boolean }): DataAlert & { mine?: boolean } => ({
  id: "a1",
  orphan_id: "o1",
  code: "K-1024",
  name: "Sample",
  country: "LK",
  field: "birth_date",
  signal: "age_shift",
  severity: "critical",
  role: "office",
  source: "demo",
  detail: {},
  hits: 1,
  created_at: ago(30),
  updated_at: ago(29),
  ...o,
});

const LK_SUP: CountryAccess = {
  admin: false,
  countries: [{ code: "LK", name_ar: "سريلانكا", role: "supervisor" }],
};
const LK_ENTRY: CountryAccess = {
  admin: false,
  countries: [{ code: "LK", name_ar: "سريلانكا", role: "data_entry" }],
};

describe("طابور «اليوم»: تلميح العينين", () => {
  it("ما رفعتَه بنفسك لا يُحسم منك — حتى للإدارة", () => {
    const [it] = buildQueue({ conflicts: [conflict({ mine: true })] }, ADMIN_ACCESS);
    expect(it!.can_settle).toBe(false);
    expect(it!.settle_block_reason).toBe("own_upload");
    expect(groupOf(it!, NOW)).toBe("waiting");
  });

  it("وتنبيهٌ رفعتَه كذلك", () => {
    const [it] = buildQueue({ alerts: [alert({ mine: true })] }, LK_SUP);
    expect(it).toMatchObject({ can_settle: false, settle_block_reason: "own_upload" });
  });

  it("الفرق غير الحرج بين المصدرين يحسمه رافعه", () => {
    const [it] = buildQueue(
      { conflicts: [conflict({ kind: "disagreement", risk: "medium", mine: true })] },
      LK_SUP,
    );
    expect(it!.can_settle).toBe(true);
  });

  it("ما رفعه غيرك يحسمه المشرف", () => {
    const [it] = buildQueue({ conflicts: [conflict({ mine: false })] }, LK_SUP);
    expect(it!.can_settle).toBe(true);
  });

  it("المصدر الذي لا يقول من رفع لا يخترع تلميحاً (والقاعدة تحرس)", () => {
    const [it] = buildQueue({ conflicts: [conflict({})] }, ADMIN_ACCESS);
    expect(it!.mine).toBeNull();
    expect(it!.can_settle).toBe(true);
  });

  it("مدخل البيانات لا يحسم، وما خارج دوله ليس له", () => {
    const [a, b] = buildQueue(
      { conflicts: [conflict({ id: "x" }), conflict({ id: "y", country: "PK" })] },
      LK_ENTRY,
    );
    expect(a).toMatchObject({ can_settle: false, settle_block_reason: "scope" });
    expect(b).toMatchObject({ can_settle: false, settle_block_reason: "scope" });
  });

  it("صندوق القرارات للإدارة وحدها", () => {
    const inbox = [
      { kind: "transfer" as const, id: "t1", title: "T", subtitle: "", created_at: ago(1) },
    ];
    expect(buildQueue({ inbox }, ADMIN_ACCESS)[0]!.can_settle).toBe(true);
    expect(buildQueue({ inbox }, LK_SUP)[0]!.can_settle).toBe(false);
  });
});

describe("طابور «اليوم»: المهلة والأعمار والمرشّحات", () => {
  it("المهلة بحسب النوع: التنبيه الحرج ٢٤ ساعة، والتعارض ٧٢", () => {
    const [a] = buildQueue({ alerts: [alert({ created_at: ago(25) })] }, ADMIN_ACCESS);
    const [c] = buildQueue({ conflicts: [conflict({ created_at: ago(25) })] }, ADMIN_ACCESS);
    expect(isOverdue(a!, NOW)).toBe(true);
    expect(isOverdue(c!, NOW)).toBe(false);
    expect(groupOf(a!, NOW)).toBe("overdue");
    expect(groupOf(c!, NOW)).toBe("today");
  });

  it("فئات العمر حدودها حدود `admin_trust_aging`", () => {
    expect(ageBucket(ago(23), NOW)).toBe("lt1");
    expect(ageBucket(ago(24), NOW)).toBe("d1_3");
    expect(ageBucket(ago(72), NOW)).toBe("d3_7");
    expect(ageBucket(ago(168), NOW)).toBe("gt7");
  });

  it("عدّاد الأعمار يعدّ الحرج وحده، كمركز الثقة", () => {
    const items = buildQueue(
      {
        alerts: [alert({ id: "a", created_at: ago(2) }), alert({ id: "b", severity: "info" })],
        conflicts: [conflict({ id: "c", created_at: ago(200) })],
      },
      ADMIN_ACCESS,
    );
    expect(agingCounts(items, NOW)).toEqual({ lt1: 1, d1_3: 0, d3_7: 0, gt7: 1 });
  });

  it("المرشّحات من العنوان، والمجهول يُهمل", () => {
    expect(
      filtersFrom({ kind: "conflict", country: "lk", sev: "x", age: "gt7", settle: "1" }),
    ).toEqual({
      ...NO_FILTERS,
      kind: "conflict",
      age: "gt7",
      settle: true,
    });
  });

  it("المرشّحات تعمل معاً، والعدّ يطابق القائمة", () => {
    const items = buildQueue(
      {
        alerts: [alert({ id: "a" }), alert({ id: "b", country: "PK", severity: "warning" })],
        conflicts: [conflict({ id: "c", mine: true })],
      },
      ADMIN_ACCESS,
    );
    const f = (p: Partial<typeof NO_FILTERS>) =>
      applyFilters(items, { ...NO_FILTERS, ...p }, matchesQuery, NOW).map((i) => i.id);
    expect(f({})).toHaveLength(3);
    expect(f({ country: "PK" })).toEqual(["b"]);
    expect(f({ sev: "critical" }).sort()).toEqual(["a", "c"]);
    expect(f({ settle: true }).sort()).toEqual(["a", "b"]);
    expect(f({ kind: "golden" })).toHaveLength(3);
  });

  it("لا يتكرّر بندٌ وصل من مصدرين", () => {
    const items = buildQueue({ alerts: [alert({}), alert({})] }, ADMIN_ACCESS);
    expect(items).toHaveLength(1);
  });
});

describe("شريط بوّابة الدولة: لا تسرّب بين الدول", () => {
  const items = buildQueue(
    {
      conflicts: [
        conflict({ id: "lk", country: "LK", created_at: ago(24 * 30) }),
        conflict({ id: "pk", country: "PK", created_at: ago(24 * 60) }),
        conflict({ id: "pk2", country: "PK", created_at: ago(1) }),
      ],
    },
    ADMIN_ACCESS,
  );

  it("مشرف سريلانكا لا يرى متأخّر باكستان ولا آخر رفعها", () => {
    const s = stripCounts(items, LK_SUP, NOW);
    expect(s.overdue).toBe(1);
    expect(s.latest).toBe(ago(24 * 30));
  });

  it("والإدارة ترى الدول كلّها", () => {
    const s = stripCounts(items, ADMIN_ACCESS, NOW);
    expect(s.overdue).toBe(2);
    expect(s.latest).toBe(ago(1));
  });

  it("بندٌ بلا دولة لا يُحسب لفريق دولة", () => {
    const s = stripCounts([{ ...items[0]!, country_code: null }], LK_SUP, NOW);
    expect(s).toEqual({ overdue: 0, latest: null });
  });
});
