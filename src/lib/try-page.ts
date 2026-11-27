/**
 * صفحاتٌ بالمؤشّر في العرض التفاعلي، كما في القاعدة: موضع البند في القائمة المرتّبة
 * مؤشّره (`k`)، فيعمل «عرض المزيد» على العيّنة بلا خادم. وحدةٌ صغيرة لا تحمل حالة.
 */
import { QUEUE_PAGE, type QueueCursor } from "@/lib/golden-record";

export type DemoPageInput = { after?: QueueCursor | null; limit?: number };

/** مرشِّحٌ لـ`filter`: يلصق بكلّ بندٍ مؤشّره ويُبقي الصفحة المطلوبة. */
export function pageOf(data: DemoPageInput) {
  const start = data.after?.k ?? 0;
  const size = data.limit ?? QUEUE_PAGE;
  return <T extends { id: string; cursor?: QueueCursor }>(x: T, i: number) => {
    x.cursor = { k: i + 1, at: "", id: x.id };
    return i >= start && i < start + size;
  };
}
