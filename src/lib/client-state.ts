/**
 * ما يتركه المستخدم في متصفّحه — ومتى يُمحى (UX-05).
 *
 * أجهزة المكاتب والميدان مشتركة: من يخرج ثم يدخل غيره على الجهاز نفسه
 * كان يجد مسودّة ملفّ طفلٍ أدخلها الأوّل (اسمه الكامل وهويّته وجوال وليّه
 * وعنوانه) تُستعاد في حسابه، بل يرسلها باسم جهةٍ أخرى. فكلّ ما يحمل بيانات
 * عملٍ يُمحى عند الخروج وعند تبدّل المستخدم، ومعه ذاكرة الاستعلامات.
 *
 * وما لا يخصّ أحداً يبقى: لغة الواجهة، وعلامات البصمة على هذا الجهاز.
 */

/** بادئات مفاتيح بيانات العمل في المتصفّح — كلّ جديدٍ منها يُضاف هنا. */
export const USER_DATA_PREFIXES = [
  // مسودّة ملفّ اليتيم (والمفتاح القديم غير المقيّد بمستخدم معها).
  "ioco:orphan-intake-draft",
  // مسودّة تقرير المكتب الميداني.
  "office-draft:",
  // ما اختاره الزائر في نموذج الكفالة قبل الدخول (المبلغ ورسالته للطفل).
  "kh:sponsor-draft:",
  // آخر مبلغٍ وعملةٍ أكّدهما الداعم (src/lib/last-gift.ts).
  "kh:last-gift",
] as const;

/** صاحب ما في هذا المتصفّح من بيانات عمل — به يُعرف تبدّل المستخدم. */
export const CLIENT_OWNER_KEY = "ioco:client-owner";

type KeyedStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

function browserStorages(): KeyedStorage[] {
  if (typeof window === "undefined") return [];
  const out: KeyedStorage[] = [];
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      out.push(get());
    } catch {
      /* التخزين محجوب: لا شيء فيه يُمحى */
    }
  }
  return out;
}

/** يمحو بيانات العمل من مخزنٍ واحد، ويُبقي التفضيلات. */
export function wipeUserData(storage: KeyedStorage): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && USER_DATA_PREFIXES.some((p) => k.startsWith(p))) doomed.push(k);
    }
    for (const k of doomed) storage.removeItem(k);
    storage.removeItem(CLIENT_OWNER_KEY);
  } catch {
    /* لا شيء يُفعل */
  }
}

/**
 * يُسجَّل صاحب المتصفّح عند كلّ دخولٍ أو استعادة جلسة. فإن كان غيرَ من
 * ترك البيانات (خرج الأوّل بإغلاق النافذة لا بزرّ الخروج) مُحيت قبل أن
 * يراها. يُعيد `true` إن محا شيئاً، فيُفرَّغ معها ما في الذاكرة.
 */
export function claimClientState(storage: KeyedStorage, userId: string): boolean {
  try {
    const owner = storage.getItem(CLIENT_OWNER_KEY);
    const changed = owner !== null && owner !== userId;
    if (changed) wipeUserData(storage);
    storage.setItem(CLIENT_OWNER_KEY, userId);
    return changed;
  } catch {
    return false;
  }
}

/** ما يُفعل بالمتصفّح عند كلّ حدث مصادقة. */
export function onAuthEvent(event: string, userId: string | null, clearQueries: () => void): void {
  const stores = browserStorages();
  if (event === "SIGNED_OUT" || !userId) {
    if (event === "SIGNED_OUT") {
      for (const s of stores) wipeUserData(s);
      clearQueries();
    }
    return;
  }
  // الحالات كلّها يُعرف فيها المستخدم: الدخول، والاستعادة، وتحديث الرمز.
  let changed = false;
  for (const s of stores) changed = claimClientState(s, userId) || changed;
  if (changed) clearQueries();
}

/** محوٌ صريح قبل الخروج — فلا يبقى شيءٌ وإن تعذّر الخروج من الخادم. */
export function wipeBrowserUserData(): void {
  for (const s of browserStorages()) wipeUserData(s);
}
