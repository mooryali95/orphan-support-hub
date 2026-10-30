import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { ImpactPanel } from "@/components/impact/ImpactPanel";
import { OrphanProfilePanel } from "@/components/profile/OrphanProfilePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, SPONSORSHIP_STATUS_LABELS } from "@/lib/format";
import { getSponsorshipLedger, MESSAGE_STATUS_LABELS } from "@/lib/ledger.functions";
import { pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";
import { SponsorshipJourney } from "@/components/sponsorship/SponsorshipJourney";
import { QualificationJourney } from "@/components/sponsorship/QualificationJourney";
import {
  getSponsorQualification,
  learnedByMonth,
  type SponsorQualification,
} from "@/lib/scopes.functions";

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/")({
  head: () => ({
    meta: [{ title: pageTitle("كفالتي", false) }, { name: "robots", content: "noindex" }],
  }),
  component: SponsorshipPage,
});

function SponsorshipPage() {
  const { sponsorshipId } = Route.useParams();
  const fetchLedger = useServerFn(getSponsorshipLedger);
  const { data, isPending } = useQuery({
    queryKey: ["ledger", sponsorshipId],
    queryFn: () => fetchLedger({ data: { sponsorshipId } }),
  });

  const orphanId = data?.ledger?.orphan.id;
  const fetchQualification = useServerFn(getSponsorQualification);
  const { data: qRaw } = useQuery({
    queryKey: ["sponsor-qualification", orphanId],
    queryFn: () => fetchQualification({ data: { orphanId: orphanId! } }),
    enabled: !!orphanId,
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
  const qualification = qRaw ? (JSON.parse(qRaw) as SponsorQualification) : undefined;

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

      <section className="mt-8" aria-label="رحلة الكفالة">
        <SponsorshipJourney ledger={l} learned={learnedByMonth(qualification)} />
      </section>

      {/* ما بُني بالكفالة: البرنامج، والمرحلة، والجلسات، والنموّ. */}
      <div className="mt-10">
        <QualificationJourney q={qualification} name={l.orphan.display_name} />
      </div>

      <section className="mt-10">
        <ImpactPanel orphanId={l.orphan.id} orphanName={l.orphan.display_name} />
      </section>

      <section className="mt-10">
        <OrphanProfilePanel orphanId={l.orphan.id} orphanName={l.orphan.display_name} />
      </section>
    </DashboardShell>
  );
}
