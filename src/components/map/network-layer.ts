/**
 * ما يُرسم على خارطة الشبكة — حسابٌ خالص بلا DOM.
 *
 * - «الشبكة»: المقرّ، والمكاتب المؤكَّدة (أخضر ممتلئ)، والنشاط الميداني (أخضر
 *   فاتح). غير المؤكَّد لا يُعرض للزوّار مكتباً للندوة (قرار المالك)؛ وللإدارة
 *   يظهر محدَّداً بلونٍ محايد كي تراجعه.
 * - «تحتاج مكتباً»: دول الأولوية بالكهرماني المخطَّط (عالية/متوسطة)، و«تحتاج
 *   بيانات» بحدٍّ متقطّع، ودول المكاتب خلفيةً خضراء خافتة (الحضور مقابل الحاجة).
 */
import { WAMY_COUNTRIES } from "@/data/wamy-network";
import { rankPriorities, type Tier } from "@/lib/office-gap";
import type { NetworkLayer } from "./layers";

export type NetworkKind =
  "hq" | "office" | "field" | "unconfirmed" | "demo" | "high" | "medium" | "data" | "covered";

/** رمز الدولة ← ما تُرسم به في الطبقة. */
export function networkPaint(
  layer: NetworkLayer,
  opts: { showUnconfirmed?: boolean } = {},
): Map<string, NetworkKind> {
  const out = new Map<string, NetworkKind>();
  if (layer === "network") {
    for (const c of WAMY_COUNTRIES) {
      const p = c.presence;
      if (p.status === "unconfirmed") {
        if (opts.showUnconfirmed) out.set(c.code, "unconfirmed");
      } else out.set(c.code, p.status === "office" && p.hq ? "hq" : p.status);
    }
    return out;
  }
  for (const c of WAMY_COUNTRIES) if (c.presence.status === "office") out.set(c.code, "covered");
  for (const p of rankPriorities()) out.set(p.code, p.tier satisfies Tier);
  return out;
}

/** ترتيب القائمة والتنقّل بالأسهم: الأهمّ أوّلاً. */
export const KIND_ORDER: Record<NetworkKind, number> = {
  hq: 0,
  office: 1,
  field: 2,
  unconfirmed: 3,
  demo: 4,
  high: 0,
  medium: 1,
  data: 2,
  covered: 3,
};

/** ما يُفتح بالضغط ولوحة المفاتيح في الطبقة. */
export function interactiveCodes(paint: Map<string, NetworkKind>): Set<string> {
  return new Set(paint.keys());
}

/** أعداد الوسيلة: كم دولةً في كل صنف — للمفتاح والسطر التعريفي. */
export function kindCounts(paint: Map<string, NetworkKind>): Record<NetworkKind, number> {
  const n: Record<NetworkKind, number> = {
    hq: 0,
    office: 0,
    field: 0,
    unconfirmed: 0,
    demo: 0,
    high: 0,
    medium: 0,
    data: 0,
    covered: 0,
  };
  for (const k of paint.values()) n[k] += 1;
  return n;
}
