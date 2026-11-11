/**
 * مسودّة ملفّ اليتيم في المتصفّح — ما يُحفظ منها، وتحت أيّ مفتاح (UX-05).
 *
 * كانت تُحفظ كاملةً تحت مفتاحٍ واحد للجهاز كلّه: الاسم الكامل ورقم الهوية
 * وجوال الوليّ والعنوان والملاحظات الصحّية — وهي خطواتٌ تقول الواجهة إنها
 * «سرّية» — فتبقى بعد الخروج وتُستعاد في حساب جهةٍ أخرى على الجهاز نفسه.
 *
 * فالآن:
 * - المفتاح بالمستخدم والجهة معاً: لا تُقرأ مسودّة إلا لمن كتبها، لجهته.
 * - الحقول السرّية لا تُكتب في المتصفّح أصلاً: تعيش في ذاكرة الصفحة حتى
 *   الإرسال، ويُعاد إدخالها إن أُغلقت الصفحة قبله.
 * - ولا يُحفظ إلا ما يراه الكافل على البطاقة أصلاً (اسم العرض، الجنس،
 *   المنطقة، المرحلة، القصّة، البنود) وما يربط المسودّة بصفّها في القاعدة.
 * - والمسودّة تنتهي بعد مدّةٍ قصيرة، وتُمحى عند الخروج (`client-state`).
 */

export const DRAFT_PREFIX = "ioco:orphan-intake-draft";

/** المسودّة المحفوظة تنتهي بعد ثلاثة أيام: ما لم يُرسل فيها يُبدأ من جديد. */
export const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** حقولٌ لا تُكتب في المتصفّح أبداً — تُعرّف الطفل أو أسرته أو مكانه. */
export const CONFIDENTIAL_FIELDS = [
  "fullName",
  "nationalId",
  "guardianName",
  "guardianRelation",
  "guardianPhone",
  "address",
  "familySize",
  "familyIncome",
  "birthDate",
  "city",
  "schoolName",
  "healthNotes",
  "privateNotes",
] as const;

export type ConfidentialField = (typeof CONFIDENTIAL_FIELDS)[number];

type Storageish = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function draftKey(userId: string, orgId: string): string {
  return `${DRAFT_PREFIX}:${userId}:${orgId}`;
}

/** المسودّة بلا حقولها السرّية — هذا وحده ما يُكتب. */
export function persistable<T extends Record<string, unknown>>(
  draft: T,
): Omit<T, ConfidentialField> {
  const out: Record<string, unknown> = { ...draft };
  for (const f of CONFIDENTIAL_FIELDS) delete out[f];
  return out as Omit<T, ConfidentialField>;
}

export function saveDraft(
  storage: Storageish,
  userId: string,
  orgId: string,
  draft: Record<string, unknown>,
  now = Date.now(),
): void {
  try {
    storage.setItem(
      draftKey(userId, orgId),
      JSON.stringify({ savedAt: now, draft: persistable(draft) }),
    );
  } catch {
    /* التخزين محجوب أو ممتلئ: المسودّة تعيش في الذاكرة وحدها */
  }
}

/**
 * يقرأ مسودّة هذا المستخدم لهذه الجهة وحدها، بلا حقلٍ سرّي ولو وُجد في
 * نسخةٍ قديمة. ويمحو المفتاح القديم المشترك متى صادفه.
 */
export function loadDraft(
  storage: Storageish,
  userId: string,
  orgId: string,
  now = Date.now(),
): Record<string, unknown> | null {
  try {
    // المفتاح القديم المشترك بين كلّ من استعمل الجهاز — لا يُقرأ، يُمحى.
    storage.removeItem(DRAFT_PREFIX);
    const key = draftKey(userId, orgId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; draft?: unknown };
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (
      now - savedAt > DRAFT_TTL_MS ||
      !parsed.draft ||
      typeof parsed.draft !== "object" ||
      Array.isArray(parsed.draft)
    ) {
      storage.removeItem(key);
      return null;
    }
    return persistable(parsed.draft as Record<string, unknown>);
  } catch {
    // تخزين محجوب أو مسودّة تالفة: نبدأ نظيفاً بدل أن ينكسر النموذج.
    return null;
  }
}

export function clearDraft(storage: Storageish, userId: string, orgId: string): void {
  try {
    storage.removeItem(draftKey(userId, orgId));
    storage.removeItem(DRAFT_PREFIX);
  } catch {
    /* لا شيء يُفعل */
  }
}
