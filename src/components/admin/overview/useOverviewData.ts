import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import type { AdminOverview, getAdminOverview, getPaymentsReady } from "@/lib/admin.functions";
import type { Loaded, SupportExtras } from "@/lib/admin-overview";
import { sampleOverview } from "@/lib/admin-overview-sample";
import type { goLiveSteps, linkHealth } from "@/lib/go-live";
import type { getDecisionInbox, InboxItem } from "@/lib/inbox.functions";
import type { getSourcesOverview, SourcesOverview } from "@/lib/integrity.functions";
import type {
  DispatchHealth,
  getDispatchHealth,
  getOpsHealth,
  OpsHealth,
} from "@/lib/monitoring.functions";
import { getGeoStats, type GeoCountryRow } from "@/lib/protection.functions";
import { getMyReviewLocales, type ReviewLocale } from "@/lib/ui-i18n-admin.functions";
import { getOperatingLinks, type OperatingLink } from "@/lib/vision-links.functions";

export type OverviewData = {
  sample: boolean;
  /** الحسابُ ليس إدارياً (أو رفضت القاعدة): لا شيء يُعرض. */
  denied: boolean;
  overview: Loaded<AdminOverview>;
  geo: Loaded<GeoCountryRow[]>;
  inbox: Loaded<InboxItem[]>;
  sources: Loaded<SourcesOverview>;
  locales: Loaded<ReviewLocale[]>;
  dispatch: Loaded<DispatchHealth>;
  ops: Loaded<OpsHealth>;
  links: Loaded<OperatingLink[]>;
  payments: Loaded<boolean>;
  /** لا مصدر حيّاً له: `null` في المسار الحقيقي دائماً. */
  extras: SupportExtras | null;
  now: number;
  updatedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * مفاتيح الاستعلام هي مفاتيح شاشات الإدارة نفسها: ما حمّلته اللوحة لا يُحمَّل ثانيةً
 * حين تُفتح شاشته، وما تغيّر هناك يتحدّث هنا.
 */
const KEYS = [
  ["admin-overview"],
  ["admin-overview-geo"],
  ["decision-inbox"],
  ["sources-overview"],
  ["review-locales"],
  ["dispatch-health"],
  ["ops-health"],
  ["operating-links"],
  ["payments-ready"],
] as const;

/** نتيجة الاستعلام ← `undefined` لم يصل · `null` تعذّر · القيمة. */
function settle<T, R>(
  q: { data: T | undefined; isError: boolean },
  pick: (data: T) => R | null,
): Loaded<R> {
  if (q.isError) return null;
  if (q.data === undefined) return undefined;
  return pick(q.data);
}

/**
 * مصادر اللوحة: دوالّ الإدارة القائمة كما هي، كلٌّ باستعلامه، فتعذُّر واحدٍ لا يُسقط
 * الباقي. في وضع العيّنة لا يُستدعى الخادم أصلاً — العيّنة والحقيقي لا يختلطان.
 */
/**
 * دوالّ تحملها صفحة الإدارة وحدها اليوم: تصل منها، لأنّ استيرادها هنا يشقّ قطعةً
 * مشتركة جديدة يُسجَّل اسمها في الحزمة الأولى التي تحمّلها كلّ الصفحات.
 */
export type AdminSourceFns = {
  getDispatchHealth: typeof getDispatchHealth;
  getOpsHealth: typeof getOpsHealth;
  getSourcesOverview: typeof getSourcesOverview;
  getAdminOverview: typeof getAdminOverview;
  getPaymentsReady: typeof getPaymentsReady;
  getDecisionInbox: typeof getDecisionInbox;
  goLiveSteps: typeof goLiveSteps;
  linkHealth: typeof linkHealth;
};

export function useOverviewData(sample: boolean, fns: AdminSourceFns): OverviewData {
  const qc = useQueryClient();
  const enabled = !sample;
  const fetchOverview = useServerFn(fns.getAdminOverview);
  const fetchInbox = useServerFn(fns.getDecisionInbox);
  const fetchSources = useServerFn(fns.getSourcesOverview);
  const fetchLocales = useServerFn(getMyReviewLocales);
  const fetchDispatch = useServerFn(fns.getDispatchHealth);
  const fetchOps = useServerFn(fns.getOpsHealth);
  const fetchPayments = useServerFn(fns.getPaymentsReady);

  const overview = useQuery({ queryKey: KEYS[0], queryFn: () => fetchOverview(), enabled });
  const allowed = enabled && overview.data?.allowed === true;
  // ما بعد المجاميع لا يُطلب إلا لمن ثبت أنّه إدارة.
  const geo = useQuery({ queryKey: KEYS[1], queryFn: () => getGeoStats(), enabled: allowed });
  const inbox = useQuery({ queryKey: KEYS[2], queryFn: () => fetchInbox(), enabled: allowed });
  const sources = useQuery({ queryKey: KEYS[3], queryFn: () => fetchSources(), enabled: allowed });
  const locales = useQuery({ queryKey: KEYS[4], queryFn: () => fetchLocales(), enabled: allowed });
  const dispatch = useQuery({
    queryKey: KEYS[5],
    queryFn: () => fetchDispatch(),
    enabled: allowed,
  });
  const ops = useQuery({ queryKey: KEYS[6], queryFn: () => fetchOps(), enabled: allowed });
  const links = useQuery({
    queryKey: KEYS[7],
    queryFn: () => getOperatingLinks(),
    enabled: allowed,
  });
  const payments = useQuery({
    queryKey: KEYS[8],
    queryFn: () => fetchPayments(),
    enabled: allowed,
  });

  const demo = useMemo(() => (sample ? sampleOverview() : null), [sample]);
  const now = useMemo(
    () => Date.now(),
    // «الآن» يتجدّد مع كلّ وصولٍ للمجاميع، لا مع كلّ رسم.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sample, overview.dataUpdatedAt],
  );
  const refresh = () => {
    for (const queryKey of KEYS) void qc.invalidateQueries({ queryKey });
  };

  if (demo) {
    return {
      sample: true,
      denied: false,
      ...demo,
      now,
      updatedAt: null,
      refreshing: false,
      refresh: () => {},
    };
  }

  const o = settle(overview, (d) => (d.allowed ? d.overview : null));
  const inboxItems = settle(inbox, (d) => d);
  return {
    sample: false,
    denied: overview.data?.allowed === false,
    overview: o,
    geo: settle(geo, (d) => (d.available ? d.countries : null)),
    // الدالّة تعيد قائمةً فارغة عند الخطأ أيضاً: إن قالت المجاميع إنّ في الطابور
    // ملفّاتٍ أو جهات والصندوق فارغ، فالصندوق لم يُقرأ — لا «لا شيء ينتظر».
    inbox:
      inboxItems && o && inboxItems.length === 0 && pendingInOverview(o) > 0 ? null : inboxItems,
    sources: settle(sources, (raw) => (raw ? (JSON.parse(raw) as SourcesOverview | null) : null)),
    locales: settle(locales, (r) => (r.ok ? r.data.locales : null)),
    dispatch: settle(dispatch, (d) => (d.allowed ? d.health : null)),
    ops: settle(ops, (d) => (d.allowed ? d.health : null)),
    links: settle(links, (d) => d),
    payments: settle(payments, (d) => d.ready),
    extras: null,
    now,
    updatedAt: overview.dataUpdatedAt || null,
    refreshing: overview.isFetching && !overview.isPending,
    refresh,
  };
}

const pendingInOverview = (o: AdminOverview) =>
  Number(o.orphans.awaiting_review ?? 0) + Number(o.organizations.pending ?? 0);
