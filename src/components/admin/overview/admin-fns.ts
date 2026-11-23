import { getAdminOverview, getPaymentsReady } from "@/lib/admin.functions";
import { getOverviewInbox, getSupportSummary } from "@/lib/admin-overview.functions";
import { goLiveSteps, linkHealth } from "@/lib/go-live";
import { getSourcesOverview } from "@/lib/integrity.functions";
import { getDispatchHealth, getOpsHealth } from "@/lib/monitoring.functions";

/**
 * دوالّ الإدارة التي تقرأ منها النظرة الشاملة — مصدرٌ واحد للوحة الحقيقية ولعرضها في
 * الوضع التجريبي. في العيّنة لا يُستدعى منها شيء (`useOverviewData`).
 */
export const ADMIN_FNS = {
  getAdminOverview,
  getPaymentsReady,
  getOverviewInbox,
  getSupportSummary,
  getSourcesOverview,
  getDispatchHealth,
  getOpsHealth,
  goLiveSteps,
  linkHealth,
};
