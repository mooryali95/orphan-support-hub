/**
 * ذاكرةٌ قصيرة داخل عامل الخادم للقراءات العامّة المجهولة وحدها (أعداد المنصّة،
 * الكتالوج، بطاقات الدليل العامّة، خيارات الفلترة): كلّها تُقرأ بالمفتاح العامّ
 * (`publicClient`) فلا تختلف من زائرٍ لآخر.
 *
 * لا تُستعمل أبداً لما يُقرأ بجلسة مستخدم أو لبيانات طفلٍ خاصّة: المفتاح لا يحمل
 * هوية الطالب، فكلّ ما يُخزَّن هنا يراه كلّ زائر.
 *
 * - مدّةٌ قصيرة (ثوانٍ إلى دقائق) فلا تتأخّر الأرقام عن القاعدة إلا قليلاً.
 * - الطلبات المتزامنة على المفتاح نفسه تنتظر جلباً واحداً (لا تدافع على القاعدة).
 * - لا يُخزَّن إلا الناجح (`keep`)؛ الخطأ يُعاد ولا يبقى.
 */
type Entry = { at: number; value: unknown };

const MAX_ENTRIES = 200;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedPublic<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  keep: (value: T) => boolean = () => true,
  now: () => number = Date.now,
): Promise<T> {
  const hit = store.get(key);
  if (hit && now() - hit.at < ttlMs) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      if (keep(value)) {
        if (store.size >= MAX_ENTRIES && !store.has(key)) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) store.delete(oldest);
        }
        store.delete(key);
        store.set(key, { at: now(), value });
      }
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** للاختبارات. */
export function clearPublicCache(): void {
  store.clear();
  inflight.clear();
}
