import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CLIENT_OWNER_KEY, claimClientState, wipeUserData } from "@/lib/client-state";
import {
  CONFIDENTIAL_FIELDS,
  DRAFT_PREFIX,
  DRAFT_TTL_MS,
  loadDraft,
  saveDraft,
} from "./intake-draft";

/** مخزنٌ في الذاكرة بواجهة localStorage. */
function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const ORG_A = "0a000000-0000-4000-8000-00000000000a";
const ORG_B = "0b000000-0000-4000-8000-00000000000b";
const USER_A = "a1000000-0000-4000-8000-000000000001";
const USER_B = "b2000000-0000-4000-8000-000000000002";

/** ما كتبه org@ في المسبار: اسم عرض، ثم الخطوة «السرّية». */
const typed = {
  displayName: "طفل تجربة . ت",
  gender: "male",
  region: "Tirana",
  fullName: "الاسم الكامل السري",
  nationalId: "J12345678",
  guardianName: "وليّ سرّي",
  guardianRelation: "الأم",
  guardianPhone: "+355690000000",
  address: "شارع سرّي ١٢",
  familySize: "5",
  familyIncome: "90",
  birthDate: "2015-03-01",
  city: "Kukes",
  schoolName: "مدرسة سرّية",
  healthNotes: "ربو",
  privateNotes: "ملاحظة داخلية",
  story: "يحبّ الرسم",
  needs: [{ category: "education", title: "كتب", monthlyAmount: 20 }],
};

const SECRETS = [
  "الاسم الكامل السري",
  "J12345678",
  "وليّ سرّي",
  "+355690000000",
  "شارع سرّي",
  "ربو",
  "مدرسة سرّية",
  "Kukes",
  "2015-03-01",
  "ملاحظة داخلية",
];

describe("مسودّة ملفّ اليتيم في المتصفّح (UX-05)", () => {
  it("لا يُكتب حقلٌ سرّيّ في المتصفّح أبداً", () => {
    const s = memoryStorage();
    saveDraft(s, USER_A, ORG_A, typed);
    const raw = JSON.stringify(s.dump());
    for (const secret of SECRETS) expect(raw).not.toContain(secret);
    // وما يراه الكافل على البطاقة يبقى، فلا يضيع عمل المُدخِل كلّه.
    expect(raw).toContain("طفل تجربة . ت");
    expect(raw).toContain("يحبّ الرسم");
  });

  it("مستخدمٌ آخر أو جهةٌ أخرى لا تُستعاد لهما المسودّة", () => {
    const s = memoryStorage();
    saveDraft(s, USER_A, ORG_A, typed);
    expect(loadDraft(s, USER_B, ORG_B)).toBeNull();
    expect(loadDraft(s, USER_B, ORG_A)).toBeNull();
    expect(loadDraft(s, USER_A, ORG_B)).toBeNull();
    expect(loadDraft(s, USER_A, ORG_A)?.["displayName"]).toBe("طفل تجربة . ت");
  });

  it("المفتاح القديم المشترك (بحقوله السرّية) لا يُستعاد لأحدٍ ويُمحى", () => {
    // هذا بالضبط ما وجده المسبار بعد «خروج» org@ ودخول org2@.
    const s = memoryStorage({ [DRAFT_PREFIX]: JSON.stringify(typed) });
    expect(loadDraft(s, USER_B, ORG_B)).toBeNull();
    expect(s.getItem(DRAFT_PREFIX)).toBeNull();
  });

  it("نسخةٌ محفوظة بحقلٍ سرّي (قبل الإصلاح) تُقرأ بدونه", () => {
    const s = memoryStorage({
      [`${DRAFT_PREFIX}:${USER_A}:${ORG_A}`]: JSON.stringify({ savedAt: Date.now(), draft: typed }),
    });
    const d = loadDraft(s, USER_A, ORG_A)!;
    for (const f of CONFIDENTIAL_FIELDS) expect(d).not.toHaveProperty(f);
  });

  it("المسودّة القديمة تنتهي", () => {
    const s = memoryStorage();
    saveDraft(s, USER_A, ORG_A, typed, 0);
    expect(loadDraft(s, USER_A, ORG_A, DRAFT_TTL_MS + 1)).toBeNull();
    expect(s.dump()).toEqual({});
  });
});

describe("المحو عند الخروج وتبدّل المستخدم (UX-05)", () => {
  it("الخروج يمحو كلّ مسودّات العمل ويُبقي التفضيلات", () => {
    const s = memoryStorage({ lang: "sq", "passkey-on-device": "1" });
    saveDraft(s, USER_A, ORG_A, typed);
    s.setItem(DRAFT_PREFIX, JSON.stringify(typed));
    s.setItem("office-draft:o1", JSON.stringify({ title: "زيارة" }));
    s.setItem(CLIENT_OWNER_KEY, USER_A);
    wipeUserData(s);
    expect(s.dump()).toEqual({ lang: "sq", "passkey-on-device": "1" });
  });

  it("دخول مستخدمٍ آخر على الجهاز نفسه يمحو ما تركه الأوّل", () => {
    const s = memoryStorage();
    expect(claimClientState(s, USER_A)).toBe(false);
    saveDraft(s, USER_A, ORG_A, typed);
    // خرج org@ بإغلاق النافذة لا بالزرّ، ثم دخل org2@.
    expect(claimClientState(s, USER_B)).toBe(true);
    expect(Object.keys(s.dump())).toEqual([CLIENT_OWNER_KEY]);
    expect(s.getItem(CLIENT_OWNER_KEY)).toBe(USER_B);
  });

  it("المستخدم نفسه (تحديث الرمز، نافذةٌ ثانية) لا يفقد مسودّته", () => {
    const s = memoryStorage();
    claimClientState(s, USER_A);
    saveDraft(s, USER_A, ORG_A, typed);
    expect(claimClientState(s, USER_A)).toBe(false);
    expect(loadDraft(s, USER_A, ORG_A)).not.toBeNull();
  });
});

describe("الربط في الواجهة", () => {
  const src = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");

  it("النموذج لا يلمس المتصفّح إلا عبر وحدة المسودّة", () => {
    const form = src("components/intake/OrphanIntakeForm.tsx");
    expect(form).not.toMatch(/localStorage\.(setItem|getItem)\(/);
    expect(form).not.toContain('"ioco:orphan-intake-draft"');
  });

  it("زرّا الخروج والمستمع العامّ يمحون بيانات العمل", () => {
    for (const p of ["components/DashboardShell.tsx", "routes/_authenticated/account.tsx"]) {
      expect(src(p)).toContain("wipeBrowserUserData()");
    }
    expect(src("routes/__root.tsx")).toContain("onAuthEvent(");
  });
});
