/**
 * ما يفعله الحاضر بدور المكتب أو المشرف في العرض: قراراتٌ وزياراتٌ في الجلسة وحدها،
 * تُمحى بـ«ابدأ من جديد» وتتجدّد في كلّ الواجهات المفتوحة بحدثٍ واحد.
 */
import { useEffect, useState } from "react";

import { tryStore } from "@/lib/try-store";

export const ROLE_EVENT = "try-role-change";

export type OfficeState = {
  /** قرار المكتب على ملفٍّ جديد */
  files: Record<string, "approved" | "returned">;
  /** موضع كلّ تعهّدٍ في خطوات التنفيذ (0..3) */
  deliveries: Record<string, number>;
};

export type Visit = { childId: string; at: string; state: "good" | "follow"; note: string };

const OFFICE_KEY = "try-office:v1";
const VISITS_KEY = "try-visits:v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = tryStore()?.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as T) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown) {
  try {
    tryStore()?.setItem(key, JSON.stringify(v));
  } catch {
    /* محجوب */
  }
  window.dispatchEvent(new Event(ROLE_EVENT));
}

export const loadOffice = (): OfficeState => read(OFFICE_KEY, { files: {}, deliveries: {} });
export const saveOffice = (s: OfficeState) => write(OFFICE_KEY, s);

export function loadVisits(): Visit[] {
  const v = read<{ list: Visit[] }>(VISITS_KEY, { list: [] }).list;
  return Array.isArray(v) ? v : [];
}
export const addVisit = (v: Visit) =>
  write(VISITS_KEY, { list: [v, ...loadVisits()].slice(0, 60) });

/** يقرأ قيمةً من الجلسة ويعيد قراءتها عند أيّ تغييرٍ في أدوار العرض */
export function useTrialValue<T>(load: () => T, initial: T, events: readonly string[] = []): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    const r = () => setV(load());
    r();
    const all = [ROLE_EVENT, "try-demo-change", "try-cycle-change", ...events];
    for (const e of all) window.addEventListener(e, r);
    return () => {
      for (const e of all) window.removeEventListener(e, r);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}
