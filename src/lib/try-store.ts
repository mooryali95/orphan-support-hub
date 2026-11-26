/**
 * مخزن التجربة في المتصفّح: `sessionStorage` — يختفي بإغلاق المتصفّح، فالتجربة لا تترك
 * أثراً دائماً على الجهاز. وإن منعه المتصفّح (وضعٌ خاص، إعدادٌ يحجب
 * التخزين، مساحةٌ ممتلئة) فذاكرة هذا التبويب. بذلك تكتمل الوضع التجريبي من الاختيار
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
  "try-cycle:v1",
  "try-access:v1",
  "try-visits:v1",
  "try-office:v1",
  "try-sponsor-center:v1",
  "try-verification:v1",
  "try-story:v1",
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

/** كلّ مفاتيح التجربة في الجلسة: الحاضرة منها هي نفسها مفاتيحها الدائمة القديمة. */
export const TRIAL_SESSION_KEYS = LEGACY_TRIAL_KEYS;

/**
 * «ابدأ من جديد»: يمحو التجربة كلّها من الجلسة — العطاءات، والتعهّدات، وحالة
 * القاعة والرؤية، والمقترحات المحمولة إلى الحساب — ثم يُعلم الصفحات المفتوحة
 * لتعيد القراءة. لا شيء حقيقيّ يُمسّ: البيانات الحقيقية ليست في المتصفّح.
 */
export function resetTrialSession(
  store: Pick<Storage, "removeItem"> | null = typeof window === "undefined"
    ? null
    : window.sessionStorage,
) {
  for (const key of TRIAL_SESSION_KEYS) {
    try {
      store?.removeItem(key);
    } catch {
      /* محجوب: لا شيء يُمحى */
    }
  }
  memory.clear();
  if (typeof window !== "undefined") {
    for (const name of [
      "try-demo-change",
      "try-handoff-change",
      "vision-sync",
      "try-cycle-change",
      "try-access-change",
      "try-role-change",
    ])
      window.dispatchEvent(new Event(name));
  }
}
