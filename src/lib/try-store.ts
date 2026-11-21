/**
 * مخزن التجربة في المتصفّح: `localStorage`، وإن منعه المتصفّح (وضعٌ خاص، إعدادٌ يحجب
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

/** the trial's store in this browser; `null` on the server */
export function tryStore(): TryStore | null {
  if (typeof window === "undefined") return null;
  let inner: TryStore | null;
  try {
    inner = window.localStorage;
  } catch {
    inner = null;
  }
  return withMemory(inner);
}
