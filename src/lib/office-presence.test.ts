import { describe, expect, it } from "vitest";

import { networkPaint } from "@/components/map/network-layer";
import { applyRegister, COUNTRIES } from "@/lib/hall/model";

import { registeredOffices, withRegister, type RegisterRow } from "./office-presence";

const research = networkPaint("network", { showUnconfirmed: true });
// a field country, an unconfirmed one and the headquarters, as the research file draws them
const field = [...research].find(([, k]) => k === "field")?.[0];
const unconfirmed = [...research].find(([, k]) => k === "unconfirmed")?.[0];
const hq = [...research].find(([, k]) => k === "hq")?.[0];

describe("سجلّ المكاتب فوق ملفّ البحث", () => {
  it("المعتمد الفعّال وحده يُحتسب: التجريبي والموقوف لا يغيّران شيئاً", () => {
    const rows: RegisterRow[] = [
      { country: "AA", demo: false, active: true },
      { country: "BB", demo: true, active: false },
      { country: "CC", demo: false, active: false },
    ];
    expect([...registeredOffices(rows)]).toEqual(["AA"]);
  });

  it("يرفع الدولة إلى «مكتب»، ولا يمسّ المقرّ ولا الأصل", () => {
    expect(field && unconfirmed && hq).toBeTruthy();
    const rows: RegisterRow[] = [field!, unconfirmed!, hq!, "US"].map((country) => ({
      country,
      demo: false,
      active: true,
    }));
    const out = withRegister(research, rows);
    expect(out.get(field!)).toBe("office");
    expect(out.get(unconfirmed!)).toBe("office");
    expect(out.get(hq!)).toBe("hq");
    expect(out.get("US")).toBe("office");
    expect(research.get(field!)).toBe("field");
  });

  it("القاعة والخريطة بعد السجلّ نفسه: كلّ دولةٍ في القاعة بحالتها على الخريطة", () => {
    const rows: RegisterRow[] = [field!, unconfirmed!].map((country) => ({
      country,
      demo: false,
      active: true,
    }));
    applyRegister((base) => withRegister(base, rows));
    try {
      const map = withRegister(research, rows);
      for (const c of COUNTRIES) expect(c.st, c.code).toBe(map.get(c.code));
    } finally {
      applyRegister((base) => new Map(base));
    }
    // وبعد الإعادة: ملفّ البحث وحده من جديد
    for (const c of COUNTRIES) expect(c.st, c.code).toBe(research.get(c.code));
  });
});
