/**
 * طبقات الخريطة — حسابٌ خالص بلا DOM.
 *
 * طبقةٌ واحدة تلوّن الدول والمناطق وتُقرأ في الوسوم والبطاقة، وتُحفظ في
 * الرابط `?layer=` فتُشارَك. كلّ قيمةٍ تأتي من القاعدة محجوبةً سلفاً إن
 * صغر الحشد؛ هنا لا نكشف شيئاً، فقط نختار ما يُعرض.
 */
import type { GeoCount } from "@/lib/geo";
import { formatMoney } from "@/lib/format";
import { intlOf, type Locale } from "@/lib/locale";

export const MAP_LAYERS = ["waiting", "impact", "gap", "network", "needs"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];
export const DEFAULT_LAYER: MapLayer = "waiting";

/**
 * طبقتا شبكة الندوة («الشبكة» و«تحتاج مكتباً») لا تقرآن أعداد المنصّة:
 * تلوينهما من البيانات البحثية في `@/data/wamy-network` (انظر `network-layer.ts`).
 */
export const NETWORK_LAYERS = ["network", "needs"] as const;
export type NetworkLayer = (typeof NETWORK_LAYERS)[number];
export const isNetworkLayer = (layer: MapLayer): layer is NetworkLayer =>
  (NETWORK_LAYERS as readonly string[]).includes(layer);

/** من الرابط: ما ليس طبقةً معروفة يُهمَل بصمت. */
export function parseLayer(raw: unknown): MapLayer | undefined {
  return typeof raw === "string" && (MAP_LAYERS as readonly string[]).includes(raw)
    ? (raw as MapLayer)
    : undefined;
}

/**
 * قيمة المكان في الطبقة، أو null حين تحجبها القاعدة:
 * - ينتظرون: من لم يُكفل بعد؛ وإن حُجب التقسيم فالعدد كلّه (ما يُعرض على الخريطة اليوم).
 * - الأثر: نسبة المكفولين ٪.
 * - الفجوة: الحاجة الشهرية غير المغطّاة.
 */
export function metricOf(layer: MapLayer, s: GeoCount | undefined): number | null {
  if (!s || s.total == null) return null;
  switch (layer) {
    case "waiting":
      return s.sponsored == null ? s.total : s.total - s.sponsored;
    case "impact":
      return s.sponsored == null ? null : Math.round((s.sponsored / Math.max(1, s.total)) * 100);
    case "gap":
      return s.gap;
    default:
      return null;
  }
}

/** ترتيب الأماكن: الأكبر قيمةً أوّلاً، والمحجوب آخراً. */
export function rankOf(layer: MapLayer, s: GeoCount | undefined): number {
  return metricOf(layer, s) ?? -1;
}

/**
 * كثافة اللون ٠.٣٥–٠.٩٥ نسبةً إلى الأكبر في المجموعة؛ والمحجوب يأخذ
 * الأخفّ فلا يبدو «صفراً» ولا يكشف شيئاً.
 */
export function intensityOf(metric: number | null, max: number): number {
  if (metric == null) return 0.35;
  return 0.35 + 0.6 * Math.min(1, Math.max(0, metric) / Math.max(1, max));
}

/** القيمة كما تُكتب على الوسم: عددٌ، أو نسبة، أو مبلغٌ بعملته. */
export function metricText(
  layer: MapLayer,
  s: GeoCount | undefined,
  locale: Locale,
  hidden: string,
): string {
  const m = metricOf(layer, s);
  if (m == null) return hidden;
  switch (layer) {
    case "waiting":
      return m.toLocaleString(intlOf(locale));
    case "impact":
      return `${m.toLocaleString(intlOf(locale))}%`;
    case "gap":
      return formatMoney(m, s?.currency ?? "USD", locale);
    default:
      return hidden;
  }
}
