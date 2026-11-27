/**
 * حضور الندوة كما يُرسم — مصدرٌ واحد للخارطة والقاعة.
 *
 * الأساس ملفّ البحث (`@/data/wamy-network`): المقرّ، والمكاتب المؤكَّدة، والنشاط الميداني.
 * وفوقه سجلّ المكاتب في القاعدة (`public_offices_map`): مكتبٌ اعتمدته الإدارة وفعّلته (حقيقيٌّ
 * فعّال) يجعل دولته «مكتباً مؤكَّداً» على الخريطة وفي القاعدة معاً، ولو لم يكن في ملفّ البحث.
 * والمكتب التجريبي لا يغيّر شيئاً مما يُرسم: يبقى في صفحة المكاتب موسوماً حتى يُعتمد.
 *
 * خالصٌ بلا DOM ولا طلب: الصفحة تجلب السجلّ (`officeRegisterQuery`) وتمرّره.
 */
import { queryOptions } from "@tanstack/react-query";

import { listOfficesMap, type PublicOffice } from "@/lib/organizations.functions";

export type RegisterRow = Pick<PublicOffice, "country" | "demo" | "active">;

/** الدول التي فيها مكتبٌ معتمدٌ فعّال في السجلّ. */
export function registeredOffices(rows: readonly RegisterRow[]): Set<string> {
  return new Set(rows.filter((r) => !r.demo && r.active).map((r) => r.country));
}

/**
 * حالة كلّ دولة بعد السجلّ: المعتمد الفعّال «office»، إلا المقرّ فيبقى مقرّاً. يُعيد خريطةً
 * جديدة ولا يمسّ الأصل. `T` حالة الخريطة أو حالة القاعدة — كلتاهما فيها "hq" و"office".
 */
export function withRegister<T extends string>(
  base: ReadonlyMap<string, T>,
  rows: readonly RegisterRow[],
): Map<string, T> {
  const out = new Map(base);
  for (const code of registeredOffices(rows)) {
    if (out.get(code) !== ("hq" as T)) out.set(code, "office" as T);
  }
  return out;
}

/** السجلّ كما تقرؤه الخريطة والقاعة وصفحة المكاتب: استعلامٌ واحد بمفتاحٍ واحد. */
export const officeRegisterQuery = queryOptions({
  queryKey: ["offices-map"],
  queryFn: () => listOfficesMap(),
  staleTime: 5 * 60_000,
});
