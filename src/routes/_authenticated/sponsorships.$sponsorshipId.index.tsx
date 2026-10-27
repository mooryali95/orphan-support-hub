import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Clock, Loader2, TriangleAlert } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { ImpactPanel } from "@/components/impact/ImpactPanel";
import { OrphanProfilePanel } from "@/components/profile/OrphanProfilePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, SPONSORSHIP_STATUS_LABELS } from "@/lib/format";
import {
  getSponsorshipLedger,
  MESSAGE_STATUS_LABELS,
  monthState,
  type LedgerMonth,
} from "@/lib/ledger.functions";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/")({
  head: () => ({
    meta: [{ title: pageTitle("كفالتي", false) }, { name: "robots", content: "noindex" }],
  }),
  component: SponsorshipPage,
});

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_AR[Number(m) - 1] ?? m} ${y}`;
}

const TONE: Record<ReturnType<typeof monthState>["tone"], { icon: typeof Clock; cls: string }> = {
  done: { icon: CheckCircle2, cls: "text-shore-thrive" },
  progress: { icon: CircleDashed, cls: "text-bridge-ink" },
  wait: { icon: Clock, cls: "text-muted-foreground" },
  issue: { icon: TriangleAlert, cls: "text-destructive" },
};

function SponsorshipPage() {
  const { sponsorshipId } = Route.useParams();
  const fetchLedger = useServerFn(getSponsorshipLedger);
  const { data, isPending } = useQuery({
    queryKey: ["ledger", sponsorshipId],
    queryFn: () => fetchLedger({ data: { sponsorshipId } }),
  });

  if (isPending) {
    return (
      <DashboardShell title="كفالتي">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }
  const l = data?.ledger;
  if (!l) {
    return (
      <DashboardShell title="كفالتي">
        <p className="text-sm text-muted-foreground">
          تعذّر تحميل الكفالة.{" "}
          <Link to="/dashboard" className="underline">
            العودة إلى لوحتي
          </Link>
        </p>
      </DashboardShell>
    );
  }
  const s = l.sponsorship;

  return (
    <DashboardShell
      title={`كفالة ${l.orphan.display_name}`}
      description={`ملف ${l.orphan.code} · ${formatMoney(s.amount, s.currency)} ${s.type === "monthly" ? "شهرياً" : "لمرة واحدة"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={s.status === "active" ? "default" : "secondary"}>
          {SPONSORSHIP_STATUS_LABELS[s.status] ?? s.status}
        </Badge>
        {s.started_at && (
          <span className="text-xs text-muted-foreground">بدأت {formatDate(s.started_at)}</span>
        )}
        {s.next_charge_at && (
          <span className="text-xs text-muted-foreground">
            · الدفعة القادمة {formatDate(s.next_charge_at)}
          </span>
        )}
        <Button asChild variant="outline" size="sm" className="ms-auto">
          <Link to="/sponsorships/$sponsorshipId/report" params={{ sponsorshipId }}>
            التقرير السنوي
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/orphans/$orphanId" params={{ orphanId: l.orphan.id }}>
            ملف الطفل
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="مجموع ما دفعته" value={formatMoney(l.totals.paid, s.currency)} />
        <StatTile label="أشهرٌ مدفوعة" value={String(l.totals.months_paid)} />
        <StatTile label="أشهرٌ وصلت الطفل موثّقة" value={String(l.totals.months_delivered)} />
      </div>

      {s.message_status !== "none" && (
        <p className="mt-6 rounded-xl border border-border bg-secondary/50 p-4 text-sm">
          {MESSAGE_STATUS_LABELS[s.message_status]}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold">جدول الكفالة</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          كل شهر يمرّ بثلاث محطّات: الدفع، ثم التحويل إلى جهة الرعاية، ثم تأكيد الوصول بمستند.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الشهر</th>
                <th className="px-4 py-3 text-start font-medium">المستحَقّ</th>
                <th className="px-4 py-3 text-start font-medium">المدفوع</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {l.months.map((m) => (
                <Row key={m.month} m={m} currency={s.currency} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <ImpactPanel orphanId={l.orphan.id} orphanName={l.orphan.display_name} />
      </section>

      <section className="mt-10">
        <OrphanProfilePanel orphanId={l.orphan.id} orphanName={l.orphan.display_name} />
      </section>
    </DashboardShell>
  );
}

function Row({ m, currency }: { m: LedgerMonth; currency: string }) {
  const st = monthState(m);
  const Icon = TONE[st.tone].icon;
  return (
    <tr className={cn(m.upcoming && "text-muted-foreground")}>
      <td className="px-4 py-3 font-medium">{monthLabel(m.month)}</td>
      <td className="px-4 py-3 tabular-nums">{formatMoney(m.due, currency)}</td>
      <td className="px-4 py-3 tabular-nums">{m.paid > 0 ? formatMoney(m.paid, currency) : "—"}</td>
      <td className="px-4 py-3">
        <span className={cn("inline-flex items-center gap-1.5", TONE[st.tone].cls)}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {st.label}
        </span>
        {m.delivered_at && (
          <span className="block text-xs text-muted-foreground">{formatDate(m.delivered_at)}</span>
        )}
      </td>
    </tr>
  );
}
