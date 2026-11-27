import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useDataFn, useDataKey } from "@/lib/data-port";
import type { CountryAccess } from "@/lib/golden-record";
import { listAlerts, listConflicts, listLinkQueue } from "@/lib/golden-record.functions";
import { getDecisionInbox } from "@/lib/inbox.functions";

import { buildQueue, type QueueInput, type QueueItem } from "./queue";

/**
 * مصادر «اليوم» في نداءٍ واحد من `useQueries`. الإدارة: الصندوق وطوابير الدول كلّها
 * (`country = null`). فريق الدولة: طوابير دوله وحدها، دولةً دولة — فلا يدخل عدّاده بندٌ
 * من دولةٍ أخرى. مفاتيح الاستعلام نفسها في «مصادر التحقق»، فالحسم هناك يحدّث هنا.
 */
export function useToday(access: CountryAccess, enabled = true) {
  const fetchInbox = useDataFn("today.inbox", getDecisionInbox);
  const fetchAlerts = useDataFn("golden.alerts", listAlerts);
  const fetchConflicts = useDataFn("golden.conflicts", listConflicts);
  const fetchLinks = useDataFn("golden.links", listLinkQueue);
  const dk = useDataKey([]);
  const scopes: Array<string | null> = access.admin ? [null] : access.countries.map((c) => c.code);

  const results = useQueries({
    queries: [
      {
        queryKey: [...dk, "decision-inbox"],
        queryFn: () => fetchInbox(),
        enabled: enabled && access.admin,
      },
      ...scopes.flatMap((country) => [
        {
          queryKey: [...dk, "golden-alerts", country],
          queryFn: () => fetchAlerts({ data: { country } }),
          enabled,
        },
        {
          queryKey: [...dk, "golden-conflicts", country],
          queryFn: () => fetchConflicts({ data: { country } }),
          enabled,
        },
        {
          queryKey: [...dk, "golden-links", country],
          queryFn: () => fetchLinks({ data: { country } }),
          enabled,
        },
      ]),
    ],
  });

  const pending = results.some((r) => r.isPending && r.fetchStatus !== "idle");
  const failed = results.some(
    (r) => r.isError || (r.data && typeof r.data === "object" && "ok" in r.data && !r.data.ok),
  );
  const stamp = results.map((r) => r.dataUpdatedAt).join(":");

  const items: QueueItem[] = useMemo(() => {
    const input: Required<QueueInput> = { inbox: [], alerts: [], conflicts: [], links: [] };
    const [inbox, ...golden] = results;
    if (Array.isArray(inbox?.data)) input.inbox = inbox.data;
    golden.forEach((r, i) => {
      const d = r.data as { ok: boolean; data?: unknown[] } | undefined;
      if (!d?.ok || !Array.isArray(d.data)) return;
      const slot = (["alerts", "conflicts", "links"] as const)[i % 3]!;
      (input[slot] as unknown[]).push(...d.data);
    });
    return buildQueue(input, access);
    // `stamp` يتغيّر مع كل وصولٍ جديد؛ النتائج نفسها مصفوفةٌ جديدة في كل رسم.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, access]);

  return {
    items,
    pending,
    failed,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}
