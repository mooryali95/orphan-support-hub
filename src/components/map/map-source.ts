import type { Geo } from "@/lib/geo";
import { demoGeography } from "@/lib/demo-network";

/**
 * حال مصدر الخارطة — ما تعرضه وما تقوله عن نفسها.
 *
 * - `demo`: وضع العرض الصريح (`DEMO_MODE`) — بطاقات المكاتب التجريبية
 *   بشارتها، كما صُمّم.
 * - `ready`: أرقامٌ حقيقية من `geo_stats`.
 * - `loading`: لم يصل الجواب بعد — هيكلٌ بلا أرقام.
 * - `unavailable`: تعذّرت القاعدة — «غير متاحة الآن» بلا أرقام.
 *
 * كانت الحالتان الأخيرتان تُعرضان بأرقامٍ مختلَقة (ألبانيا ٩٦، اليمن ٥٧،
 * السودان ٤١ وفجواتٌ بالدولار) تحت شارةٍ صغيرة — حتى في الإنتاج وأثناء
 * التحميل العاديّ (ARC-11/PRD-15). وموقعٌ لكفالة الأطفال لا يُظهر عدد
 * أيتامٍ لم يُحصوا في بلدٍ لا يعمل فيه. فخارج وضع العرض: لا رقم إلا
 * من القاعدة.
 */
export type MapSourceStatus = "demo" | "ready" | "loading" | "unavailable";

export const EMPTY_GEO: Geo = { available: false, countries: [] };

export function resolveMapSource(
  data: Geo | undefined,
  opts: { demoMode: boolean; failed: boolean },
): { geo: Geo; status: MapSourceStatus } {
  if (opts.demoMode) return { geo: demoGeography(), status: "demo" };
  if (data?.available) return { geo: data, status: "ready" };
  if (opts.failed || data) return { geo: EMPTY_GEO, status: "unavailable" };
  return { geo: EMPTY_GEO, status: "loading" };
}
