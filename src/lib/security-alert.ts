/**
 * تنبيه أحداث السلامة (N6). الفحص الدوري يعدّ أحداث sec_* في الساعة الأخيرة
 * (`security_events_recent`)، فإن تجاوزت الحدّ نُقر نبض فشلٍ في
 * HEARTBEAT_URL_SECURITY، فيصل التنبيه من خارج المنصّة. البحث الإداري لا يُعدّ:
 * أثرٌ عاديّ لا إنذار.
 */
export const DEFAULT_SECURITY_THRESHOLD = 50;

export function securityThresholdFrom(raw: string | undefined): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_SECURITY_THRESHOLD;
}

export type SecurityAlert = { count: number; threshold: number; alert: boolean };

export function securityAlertFrom(data: unknown): SecurityAlert {
  const d = (data ?? {}) as Partial<SecurityAlert>;
  const count = typeof d.count === "number" ? d.count : 0;
  const threshold = typeof d.threshold === "number" ? d.threshold : DEFAULT_SECURITY_THRESHOLD;
  return { count, threshold, alert: d.alert === true || count > threshold };
}
