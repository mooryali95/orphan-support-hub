import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { StatTile } from "@/components/kit/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// الكتابة والفريق لا يُرسمان في العرض (useDemo)، فيناديان الخادم مباشرةً.
import { useServerFn } from "@tanstack/react-start";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { formatDate, formatMoney, formatMoneyTotals, totalsByCurrency } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { entityTypeLabel } from "@/lib/plural";
import {
  getDonorDashboard,
  getDonorMembers,
  getDonorPledges,
  setDonorMember,
  useWorkspaceLabels,
  type DonorDashboard,
} from "@/lib/workspaces.functions";

export const DONOR_COPY = defineCopy("components/donor/DonorBoard", {
  ar: {
    title: "الجهة المانحة",
    loading: "جارٍ تحميل بيانات الجهة…",
    deniedTitle: "هذه الصفحة لأعضاء الجهة",
    denied:
      "يطّلع على لوحة الجهة المانحة أعضاؤها الذين قبلوا دعوة مالكها. إن كنت منهم فاطلب من المالك دعوتك ببريد حسابك.",
    back: "العودة إلى بواباتي",
    members: pluralOf(
      {
        zero: "لا أعضاء",
        one: "عضو واحد",
        two: "عضوان",
        few: "{0} أعضاء",
        many: "{0} عضواً",
        other: "{0} عضو",
      },
      0,
      "ar",
    ),
    underReview: "الجهة قيد مراجعة الإدارة، ويُفتح الدعم باسمها بعد اعتمادها.",
    kindTotal: (kind: string) => `${kind}: مجموع التعهّدات`,
    byTarget: "توزيع الدعم حسب الهدف",
    noPledges: "لا تعهّدات بعد.",
    pledges: "تعهّدات الجهة",
    noEntityPledges: "لا تعهّدات باسم الجهة بعد.",
    noTarget: "بلا هدفٍ محدّد",
    delivered: (d: string) => `سُلّم موثّقاً ${d}`,
    status: {
      pending: "بانتظار فتح التحصيل",
      active: "نشط",
      fulfilled: "اكتمل",
      cancelled: "أُلغي",
    } as Record<string, string>,
    report: "تقرير الأثر للطباعة أو PDF",
    team: "فريق الجهة",
    role: { owner: "مالك", finance: "مالي", member: "مطّلع" },
    remove: "إزالة",
    removeWho: (email: string) => `إزالة ${email}`,
    memberEmail: "بريد العضو",
    roleLabel: "الدور",
    invite: "دعوة",
    lastOwner: "لا تُترك الجهة بلا مالك.",
    ownerOnly: "تعذّر التنفيذ. إدارة الفريق للمالك وحده.",
    done: "تمّ",
  },
  en: {
    title: "Donor entity",
    loading: "Loading the entity…",
    deniedTitle: "This page is for the entity's members",
    denied:
      "A donor entity's dashboard is open to the members who accepted its owner's invitation. If you are one, ask the owner to invite your account's email.",
    back: "Back to my workspaces",
    members: pluralOf({ zero: "No members", one: "1 member", other: "{0} members" }, 0, "en"),
    underReview:
      "The admin team is reviewing this entity. Support in its name opens once approved.",
    kindTotal: (kind: string) => `${kind}: total pledged`,
    byTarget: "Support by target",
    noPledges: "No pledges yet.",
    pledges: "The entity's pledges",
    noEntityPledges: "No pledges in the entity's name yet.",
    noTarget: "No specific target",
    delivered: (d: string) => `Delivered and documented ${d}`,
    status: {
      pending: "Awaiting collection",
      active: "Active",
      fulfilled: "Fulfilled",
      cancelled: "Cancelled",
    } as Record<string, string>,
    report: "Impact report for print or PDF",
    team: "Entity team",
    role: { owner: "Owner", finance: "Finance", member: "Viewer" },
    remove: "Remove",
    removeWho: (email: string) => `Remove ${email}`,
    memberEmail: "Member email",
    roleLabel: "Role",
    invite: "Invite",
    lastOwner: "The entity can't be left without an owner.",
    ownerOnly: "That didn't go through. Only the owner manages the team.",
    done: "Done",
  },
});

/**
 * لوحة الجهة المانحة: مجاميعها وتعهّداتها وفريقها. الصفحة الحقيقية تلفّها بـ`DashboardShell`،
 * والعرض التفاعلي يلفّها برأسه وشارة البيانات النموذجية، فتُقرأ البيانات عبر منفذ البيانات.
 */
export function DonorBoard({
  entityId,
  shell,
  reportHref,
}: {
  entityId: string;
  /** يلفّ المحتوى بعنوانه ووصفه */
  shell: (p: { title: string; description?: string; children: ReactNode }) => ReactNode;
  /** رابط التقرير؛ يغيب في العرض فلا يظهر الزرّ */
  reportHref?: string;
}) {
  const c = useCopy(DONOR_COPY);
  const locale = useLocale();
  const labels = useWorkspaceLabels();
  const demo = useDemo();
  const fetchDash = useDataFn("donor.dashboard", getDonorDashboard);
  const fetchPledges = useDataFn("donor.pledges", getDonorPledges);
  const { data, isPending } = useQuery({
    queryKey: useDataKey(["donor", entityId]),
    queryFn: () => fetchDash({ data: { entityId } }),
  });
  const { data: pledges = [] } = useQuery({
    queryKey: useDataKey(["donor-pledges", entityId]),
    queryFn: () => fetchPledges({ data: { entityId } }),
  });
  // المبالغ بعملاتها من التعهّدات نفسها (UX-14 / UI-01): لا رقمٌ بلا عملة، ولا يُجمع يورو مع دولار.
  const live = pledges.filter((p) => p.status !== "cancelled");
  const fallback = pledges[0]?.currency ?? "EUR";

  if (isPending) {
    return shell({
      title: c.title,
      children: (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <p role="status" className="sr-only">
            {c.loading}
          </p>
          <div aria-hidden="true" className="h-24 animate-pulse rounded-2xl bg-secondary" />
          <div aria-hidden="true" className="h-24 animate-pulse rounded-2xl bg-secondary" />
        </div>
      ),
    });
  }
  const d: DonorDashboard | null | undefined = data?.dashboard;
  if (!d) {
    return shell({
      title: c.title,
      children: (
        <div role="alert" className="max-w-xl rounded-2xl border border-border bg-card p-5">
          <p className="font-semibold">{c.deniedTitle}</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.denied}</p>
          <Button asChild variant="outline" className="mt-4 min-h-11">
            <Link to="/workspaces">{c.back}</Link>
          </Button>
        </div>
      ),
    });
  }

  const type = locale === "ar" ? entityTypeLabel(d.entity.type) : d.entity.type;
  return shell({
    title: d.entity.name,
    description: [type, c.members(d.members)].filter(Boolean).join(" · "),
    children: (
      <>
        {d.entity.status !== "approved" && (
          <p className="mb-6 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
            {c.underReview}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(["qualification", "in_kind"] as const).map((k) => (
            <StatTile
              key={k}
              label={c.kindTotal(labels.kind[k] ?? k)}
              value={formatMoneyTotals(
                totalsByCurrency(live.filter((p) => p.kind === k)),
                fallback,
                locale,
              )}
            />
          ))}
        </div>
        <h2 className="mt-8 text-lg font-bold">{c.byTarget}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.keys(d.by_target).length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.noPledges}</p>
          ) : (
            Object.entries(d.by_target).map(([t, n]) => (
              <Badge key={t} variant="secondary">
                {labels.target[t] ?? t}: {n}
              </Badge>
            ))
          )}
        </div>

        <h2 className="mt-8 text-lg font-bold">{c.pledges}</h2>
        {pledges.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.noEntityPledges}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {pledges.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="font-medium">{labels.kind[p.kind] ?? p.kind}</span>
                <span className="text-muted-foreground">
                  {p.target ?? c.noTarget} ({labels.target[p.target_type] ?? p.target_type})
                </span>
                <span className="tabular-nums">{formatMoney(p.amount, p.currency, locale)}</span>
                <Badge variant="secondary" className="ms-auto">
                  {p.delivered_at
                    ? c.delivered(formatDate(p.delivered_at, locale))
                    : (c.status[p.status] ?? p.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {reportHref && (
          <div className="mt-8">
            <Button asChild variant="outline" className="min-h-11">
              <Link to={reportHref as "/"}>{c.report}</Link>
            </Button>
          </div>
        )}

        {/* العرض بلا حساب: لا فريق يُدار ولا دعوة تُرسل */}
        {!demo && <DonorTeam entityId={entityId} />}
      </>
    ),
  });
}

/** فريق الجهة: المالك يدعو بالبريد بدورٍ (مالك، مالي، مطّلع) ويزيل. */
function DonorTeam({ entityId }: { entityId: string }) {
  const c = useCopy(DONOR_COPY);
  const fetchMembers = useServerFn(getDonorMembers);
  const setMember = useServerFn(setDonorMember);
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: useDataKey(["donor-members", entityId]),
    queryFn: () => fetchMembers({ data: { entityId } }),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "finance" | "member">("member");

  async function act(target: string, r: "owner" | "finance" | "member" | "remove") {
    const res = await setMember({ data: { entityId, email: target, role: r } });
    if (!res.ok) {
      toast.error(res.error?.includes("last_owner") ? c.lastOwner : c.ownerOnly);
      return;
    }
    toast.success(c.done);
    setEmail("");
    await qc.invalidateQueries({ queryKey: ["donor-members", entityId] });
  }

  return (
    <section className="mt-10" aria-labelledby="donor-team">
      <h2 id="donor-team" className="text-lg font-bold">
        {c.team}
      </h2>
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
        {members.map((m) => (
          <li key={m.email} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
            <bdi dir="ltr">{m.email}</bdi>
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{c.role[m.role]}</Badge>
              <Button
                variant="ghost"
                className="min-h-11"
                aria-label={c.removeWho(m.email)}
                onClick={() => act(m.email, "remove")}
              >
                {c.remove}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input
          type="email"
          aria-label={c.memberEmail}
          placeholder={c.memberEmail}
          className="h-11 w-64"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          aria-label={c.roleLabel}
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        >
          {(Object.keys(c.role) as Array<keyof typeof c.role>).map((k) => (
            <option key={k} value={k}>
              {c.role[k]}
            </option>
          ))}
        </select>
        <Button
          className="min-h-11"
          disabled={!email.includes("@")}
          onClick={() => act(email, role)}
        >
          {c.invite}
        </Button>
      </div>
    </section>
  );
}
