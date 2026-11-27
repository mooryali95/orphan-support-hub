/**
 * قرّاء صغار لمعاملات الرابط في المسارات غير الكسولة.
 *
 * خيارات المسار (`validateSearch`) تدخل حزمة الدخول التي تحملها كلّ صفحة؛ فلو
 * استُعمل zod هناك لنزل مع كلّ صفحة (~50KB مضغوطاً). هذه الدوالّ تُسقط القيمة
 * غير الصالحة بدل رمي خطأٍ يُسقط الصفحة، والخادم يتحقّق من جديد في دوالّه.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function searchString(v: unknown, max = Infinity): string | undefined {
  return typeof v === "string" && v.length <= max ? v : undefined;
}

export function searchUuid(v: unknown): string | undefined {
  return typeof v === "string" && UUID.test(v) ? v : undefined;
}

export function searchMatch(v: unknown, re: RegExp): string | undefined {
  return typeof v === "string" && re.test(v) ? v : undefined;
}

export function searchOneOf<T extends string>(v: unknown, options: readonly T[]): T | undefined {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** رقمٌ موجب حتى `max` (يقبل النصّ الرقمي كما يقبله `z.coerce`). */
export function searchPositive(v: unknown, max: number): number | undefined {
  if (typeof v !== "number" && typeof v !== "string") return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
}

/** يحذف المفاتيح الفارغة فيبقى الرابط نظيفاً كما كان مع `.optional()`. */
export function compact<T extends Record<string, unknown>>(
  o: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o as { [K in keyof T]?: Exclude<T[K], undefined> };
}
