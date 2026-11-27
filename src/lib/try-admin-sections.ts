/**
 * أقسام لوحة الإدارة في العرض: المهامّ الستّ نفسها في `/admin` (`JOBS`)، بالترتيب نفسه.
 * `JOBS` مصدر الحقيقة، ويقفل `try-admin-sections.test.ts` التطابق.
 */
import type { Job } from "@/components/admin/nav";

export const TRY_ADMIN_SECTIONS = [
  "today",
  "countries",
  "quality",
  "money",
  "people",
  "settings",
] as const satisfies readonly Job[];
