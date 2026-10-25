/**
 * فحص المخطط قبل التشغيل.
 *
 * الجدولة لا تُفعَّل على قاعدة متأخّرة عن الهجرات: تشغيل التصريف على
 * قاعدة تنقصها `notifications.kind` كان يُرجع 500 في كل دورة ويُراكم
 * ضجيجاً بلا فائدة. الفحص هنا يسبق أي عمل، فإن نقص عمود توقّف التصريف
 * برسالة صريحة بدل أن يفشل صفّاً صفّاً.
 *
 * الفحص رخيص: `limit(0)` لا يُرجع صفوفاً، وغياب العمود يظهر كخطأ 42703.
 */

/** عمود مفقود في PostgREST/Postgres. */
const UNDEFINED_COLUMN = "42703";
/** جدول مفقود. */
const UNDEFINED_TABLE = "42P01";

export type SchemaCheck = {
  ready: boolean;
  missing: string[];
  checkedAt: string;
};

type Probe = { table: string; columns: string };

const REQUIRED: Probe[] = [
  { table: "notifications", columns: "id, kind, email_state, email_attempts, email_sent_at" },
  { table: "platform_settings", columns: "id, payments_on_hold, payments_hold_reason" },
  { table: "dispatch_runs", columns: "id, ok, error_kind" },
];

/**
 * يتحقّق أن كل ما يحتاجه التصريف ولوحة المراقبة موجود فعلاً.
 * العميل يُمرَّر غير مُنمَّط عمداً: الفحص يسبق معرفة الأنواع بالمخطط.
 */
export async function checkDispatchSchema(client: unknown): Promise<SchemaCheck> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const missing: string[] = [];

  for (const probe of REQUIRED) {
    const { error } = await db.from(probe.table).select(probe.columns).limit(0);
    if (!error) continue;

    if (error.code === UNDEFINED_TABLE) {
      missing.push(`${probe.table} (جدول مفقود)`);
    } else if (error.code === UNDEFINED_COLUMN) {
      missing.push(`${probe.table}: ${error.message}`);
    } else {
      missing.push(`${probe.table}: ${error.message ?? "خطأ غير معروف"}`);
    }
  }

  return { ready: missing.length === 0, missing, checkedAt: new Date().toISOString() };
}
