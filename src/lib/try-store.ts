/**
 * مخزن التجربة في المتصفّح: `sessionStorage` — يختفي بإغلاق المتصفّح، فالتجربة لا تترك
 * أثراً دائماً على الجهاز. وإن منعه المتصفّح (وضعٌ خاص، إعدادٌ يحجب
 * التخزين، مساحةٌ ممتلئة) فذاكرة هذا التبويب. بذلك تكتمل الرحلة الافتراضية من الاختيار
 * إلى «أثري» ما دام التبويب مفتوحاً، بدل أن يُحتفى بعطاءٍ ثم تظهر الصفحة التالية فارغة.
 * لا شيء هنا يصل خادماً.
 */
export type TryStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memory = new Map<string, string>();

/** wraps a browser store so that what it refuses to keep stays in this tab's memory */
export function withMemory(inner: TryStore | null, kept: Map<string, string> = memory): TryStore {
  return {
    getItem(key) {
      const held = kept.get(key);
      if (held !== undefined) return held;
      try {
        return inner?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        if (!inner) throw new Error("no store");
        inner.setItem(key, value);
        kept.delete(key);
      } catch {
        kept.set(key, value);
      }
    },
    removeItem(key) {
      kept.delete(key);
      try {
        inner?.removeItem(key);
      } catch {
        /* nothing to clear */
      }
    },
  };
}

/**
 * مفاتيح التجربة التي كانت تُحفظ دائمةً في `localStorage` قبل نقلها إلى الجلسة.
 * تُمحى مرّةً من كلّ متصفّح، فلا تبقى بيانات تجربةٍ قديمة على الجهاز.
 */
export const LEGACY_TRIAL_KEYS = [
  "try-demo:v1",
  "try-support:v1",
  "kh:try-handoff:v1",
  "kh:try-handoff:resume",
  "kh:try-handoff:left",
  "vision-engine:v1",
  "vision-persona:v1",
  "vision-inbox-seen:v1",
  "hall-replayed:v1",
] as const;

let purged = false;
/** يمحو بيانات التجربة الدائمة القديمة مرّةً في التبويب. */
export function purgeLegacyTrialStorage(store: Pick<Storage, "removeItem"> | null) {
  if (purged || !store) return;
  purged = true;
  for (const key of LEGACY_TRIAL_KEYS) {
    try {
      store.removeItem(key);
    } catch {
      /* التخزين محجوب: لا شيء يُمحى */
    }
  }
}

/** the trial's store in this browser; `null` on the server */
export function tryStore(): TryStore | null {
  if (typeof window === "undefined") return null;
  try {
    purgeLegacyTrialStorage(window.localStorage);
  } catch {
    /* محجوب */
  }
  let inner: TryStore | null;
  try {
    inner = window.sessionStorage;
  } catch {
    inner = null;
  }
  return withMemory(inner);
}
