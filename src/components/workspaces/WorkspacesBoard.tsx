import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Building2,
  ChevronLeft,
  HandHeart,
  Landmark,
  Languages,
  Loader2,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// الكتابة والفريق لا يُرسمان في العرض (useDemo)، فيناديان الخادم مباشرةً.
import { useServerFn } from "@tanstack/react-start";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { getMyCountryAccess } from "@/lib/golden-record.functions";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import {
  getMyDonorInvitations,
  getMyWorkspaces,
  registerDonorEntity,
  respondDonorInvitation,
  useWorkspaceLabels,
} from "@/lib/workspaces.functions";

export const WORKSPACES_COPY = defineCopy("components/workspaces/WorkspacesBoard", {
  ar: {
    title: "بواباتي",
    lead: "كل دورٍ لك في المنصّة بابٌ مستقل. ترى هنا ما يحقّ لك وحده.",
    loading: "جارٍ تحميل بواباتك…",
    loadFailed: "تعذّر تحميل البوابات. أعد تحميل الصفحة بعد قليل.",
    roles: "أدوارك",
    chip: { active: "نشط", pending: "قيد المراجعة", returned: "أُعيد للتصحيح", new: "متاح لك" },
    open: "افتح",
    sponsor: "كفالاتي",
    sponsorText: (n: number) => `كفالاتك وتعهّداتك، وعددها ${n}.`,
    guardian: "المستفيد وأسرته",
    guardianText: "من ترعاهم وملفّاتهم.",
    org: "الجهة الميدانية",
    orgPending: "طلب الاعتماد عند الإدارة. أكمل وثائقه.",
    orgPendingAction: "أكمل الوثائق",
    orgReturned: "أُعيد الطلب للتصحيح. افتحه لترى السبب.",
    orgReturnedAction: "اعرض السبب",
    orgText: "ملفّات جهتك ومستفيدوها.",
    orgNew: "سجّل جهة ميدانية",
    orgNewText:
      "مكتبٌ للندوة أو جهة تعمل معها ميدانياً؟ قدّم بياناتها ووثيقة تسجيلها لتراجعها الإدارة.",
    orgNewAction: "ابدأ التسجيل",
    country: "بيانات الدولة",
    countryText: "صحة بيانات دولتك والرفع والتنبيهات والتعارضات، بحسب دورك في فريقها.",
    supervisor: "الإشراف",
    supervisorText: "المستفيدون المُسنَدون إليك ومراحلهم.",
    translate: (lang: string) => `مراجعة الترجمة: ${lang}`,
    translateText: (lang: string) => `نصوص الواجهة بلغة ${lang}: ترجمتها ومراجعتها.`,
    admin: "إدارة المنصّة",
    adminText: "الطلبات والنطاقات والمكاتب.",
    onlySponsor: "ليس لك دورٌ آخر بعد. إن دعتك جهةٌ مانحة أو اعتُمدت جهتك الميدانية ظهر بابها هنا.",
    offices: "المكاتب",
    wholeCountry: "الدولة كلّها",
    donors: "الجهات المانحة",
    donorsEmpty: "لا جهة مانحة مرتبطة بحسابك. سجّل جهتك أدناه لتدعم باسمها بعد مراجعتها.",
    entityStatus: { pending: "قيد المراجعة", approved: "معتمدة", suspended: "موقوفة" } as Record<
      string,
      string
    >,
    donorRole: { owner: "مالك", finance: "مالي", member: "مطّلع" } as Record<string, string>,
    invitations: "دعوات الجهات المانحة",
    invitedAs: (role: string) => `دعوةٌ بدور «${role}»`,
    accept: "قبول",
    decline: "ردّ",
    answerFailed: "تعذّر تسجيل ردّك. ربما انتهت الدعوة.",
    joined: "انضممت إلى الجهة",
    declined: "رُدّت الدعوة",
    entityName: "اسم الجهة",
    entityType: "صفتها (شركة، وقف، مؤسسة…)",
    register: "سجّل جهة مانحة",
    registerFailed: "تعذّر التسجيل. تحقّق من الاسم.",
    registered: "سُجّلت الجهة، وستراجعها الإدارة قبل أن تدعم باسمها.",
  },
  en: {
    title: "My workspaces",
    lead: "Each role you hold on the platform is its own door. Here you see only what is yours.",
    loading: "Loading your workspaces…",
    loadFailed: "We couldn't load your workspaces. Reload the page in a moment.",
    roles: "Your roles",
    chip: { active: "Active", pending: "Under review", returned: "Returned", new: "Available" },
    open: "Open",
    sponsor: "My sponsorships",
    sponsorText: (n: number) => `Your sponsorships and pledges, ${n} in all.`,
    guardian: "Beneficiary and family",
    guardianText: "Those in your care and their files.",
    org: "Field organization",
    orgPending: "Your accreditation request is with the admin team. Complete its documents.",
    orgPendingAction: "Complete documents",
    orgReturned: "Your request was returned for correction. Open it to see why.",
    orgReturnedAction: "See the reason",
    orgText: "Your organization's files and beneficiaries.",
    orgNew: "Register a field organization",
    orgNewText:
      "A WAMY office or a partner working in the field? Submit its details and registration document for the admin team to review.",
    orgNewAction: "Start registering",
    country: "Country data",
    countryText:
      "Your country's data health, uploads, alerts and conflicts, according to your role in its team.",
    supervisor: "Supervision",
    supervisorText: "The beneficiaries assigned to you and their stages.",
    translate: (lang: string) => `Translation review: ${lang}`,
    translateText: (lang: string) => `Interface text in ${lang}: translate and review it.`,
    admin: "Platform administration",
    adminText: "Requests, scopes and offices.",
    onlySponsor:
      "You have no other role yet. If a donor entity invites you or your field organization is accredited, its door appears here.",
    offices: "Offices",
    wholeCountry: "Whole country",
    donors: "Donor entities",
    donorsEmpty:
      "No donor entity is linked to your account. Register yours below to give in its name once reviewed.",
    entityStatus: {
      pending: "Under review",
      approved: "Approved",
      suspended: "Suspended",
    } as Record<string, string>,
    donorRole: { owner: "Owner", finance: "Finance", member: "Viewer" } as Record<string, string>,
    invitations: "Donor entity invitations",
    invitedAs: (role: string) => `Invited as ${role}`,
    accept: "Accept",
    decline: "Decline",
    answerFailed: "We couldn't record your answer. The invitation may have expired.",
    joined: "You joined the entity",
    declined: "Invitation declined",
    entityName: "Entity name",
    entityType: "Its kind (company, endowment, foundation…)",
    register: "Register a donor entity",
    registerFailed: "Registration failed. Check the name.",
    registered:
      "The entity is registered. The admin team will review it before you give in its name.",
  },
});

type Chip = "active" | "pending" | "returned" | "new";
type PortalKey = "dashboard" | "guardian" | "org" | "country" | "supervisor" | "admin";

/** Where each door leads. The trial passes its own paths; the real page keeps the defaults. */
export type WorkspaceLinks = Partial<Record<PortalKey, string>> & {
  office?: (id: string) => string;
  donor?: (id: string) => string;
  translate?: (code: string) => string;
};

const REAL: Record<PortalKey, string> = {
  dashboard: "/dashboard",
  guardian: "/guardian",
  org: "/org",
  country: "/country-data",
  supervisor: "/supervisor",
  admin: "/admin",
};

/** The workspaces board: one card per role, each with its status and one primary action. */
export function WorkspacesBoard({ links = {} }: { links?: WorkspaceLinks }) {
  const c = useCopy(WORKSPACES_COPY);
  const labels = useWorkspaceLabels();
  const demo = useDemo();
  const fetchWs = useDataFn("workspaces.mine", getMyWorkspaces);
  const { data, isPending } = useQuery({
    queryKey: useDataKey(["workspaces"]),
    queryFn: () => fetchWs(),
  });
  // فريق دولة (مشرف أو مدخل أو مطّلع): بوّابة «بيانات الدولة». الإدارة تصلها من لوحتها.
  const fetchAccess = useDataFn("workspaces.countryAccess", getMyCountryAccess);
  const { data: accessRes } = useQuery({
    queryKey: useDataKey(["my-country-access"]),
    queryFn: () => fetchAccess(),
  });
  const countryTeam = Boolean(accessRes?.ok && accessRes.data.countries.length > 0);
  const to = (k: PortalKey) => links[k] ?? REAL[k];

  if (isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        <p role="status" className="sr-only">
          {c.loading}
        </p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden="true" className="h-36 animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
    );
  }
  const ws = data?.workspaces;
  if (!ws) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {c.loadFailed}
      </p>
    );
  }

  const orgChip: Chip = !ws.care_org
    ? "new"
    : ws.care_org_status === "pending"
      ? "pending"
      : ws.care_org_status === "rejected"
        ? "returned"
        : "active";
  const onlySponsor =
    !ws.guardian &&
    !ws.care_org &&
    !countryTeam &&
    !ws.supervisor &&
    !ws.admin &&
    (ws.translator_locales ?? []).length === 0 &&
    ws.offices.length === 0;

  return (
    <>
      <section aria-labelledby="ws-roles">
        <h2 id="ws-roles" className="sr-only">
          {c.roles}
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          <RoleCard
            icon={<HandHeart />}
            title={c.sponsor}
            text={c.sponsorText(ws.pledges)}
            chip="active"
            action={c.open}
            to={to("dashboard")}
          />
          {ws.guardian && (
            <RoleCard
              icon={<Users />}
              title={c.guardian}
              text={c.guardianText}
              chip="active"
              action={c.open}
              to={to("guardian")}
            />
          )}
          {/* أيّ حسابٍ يُسجّل جهته من هنا (UX-03): الطلب يُنشئها «بانتظار الاعتماد»،
              ولا تُرفع ملفات أطفالٍ قبل أن تعتمدها الإدارة. */}
          <RoleCard
            icon={<Building2 />}
            title={ws.care_org ? c.org : c.orgNew}
            text={
              orgChip === "new"
                ? c.orgNewText
                : orgChip === "pending"
                  ? c.orgPending
                  : orgChip === "returned"
                    ? c.orgReturned
                    : c.orgText
            }
            chip={orgChip}
            action={
              orgChip === "new"
                ? c.orgNewAction
                : orgChip === "pending"
                  ? c.orgPendingAction
                  : orgChip === "returned"
                    ? c.orgReturnedAction
                    : c.open
            }
            to={to("org")}
          />
          {countryTeam && (
            <RoleCard
              icon={<UserCheck />}
              title={c.country}
              text={c.countryText}
              chip="active"
              action={c.open}
              to={to("country")}
            />
          )}
          {ws.supervisor && (
            <RoleCard
              icon={<UserCheck />}
              title={c.supervisor}
              text={c.supervisorText}
              chip="active"
              action={c.open}
              to={to("supervisor")}
            />
          )}
          {(ws.translator_locales ?? []).map((l) => (
            <RoleCard
              key={l.code}
              icon={<Languages />}
              title={c.translate(l.name)}
              text={c.translateText(l.name)}
              chip="active"
              action={c.open}
              to={links.translate?.(l.code) ?? `/translate/${l.code}`}
            />
          ))}
          {ws.admin && (
            <RoleCard
              icon={<ShieldCheck />}
              title={c.admin}
              text={c.adminText}
              chip="active"
              action={c.open}
              to={to("admin")}
            />
          )}
        </ul>
        {onlySponsor && (
          <p className="mt-4 rounded-2xl border border-dashed border-border p-4 text-sm leading-7 text-muted-foreground">
            {c.onlySponsor}
          </p>
        )}
      </section>

      {/* المكاتب لأعضائها وحدهم: لا قسمٌ فارغ يقول «لست عضواً» لكلّ حساب (UX-16). */}
      {ws.offices.length > 0 && (
        <section className="mt-10" aria-labelledby="ws-offices">
          <h2 id="ws-offices" className="text-lg font-bold">
            {c.offices}
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {ws.offices.map((o) => (
              <li key={o.id}>
                <Link
                  to={(links.office?.(o.id) ?? `/office/${o.id}`) as "/"}
                  className="flex min-h-11 flex-col rounded-xl border border-border bg-background p-4 hover:border-primary"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{o.name}</span>
                    <StatusChip label={labels.role[o.role] ?? o.role} tone="neutral" />
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {o.region ?? c.wholeCountry} · {o.country}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="ws-donors">
        <h2 id="ws-donors" className="text-lg font-bold">
          {c.donors}
        </h2>
        <DonorInvitations />
        {ws.donor_entities.length > 0 ? (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {ws.donor_entities.map((e) => (
              <li key={e.id}>
                <Link
                  to={(links.donor?.(e.id) ?? `/donor/${e.id}`) as "/"}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-background p-4 hover:border-primary"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Landmark className="size-4" aria-hidden="true" />
                    {e.name}
                  </span>
                  <StatusChip
                    label={c.entityStatus[e.status] ?? e.status}
                    tone={e.status === "approved" ? "active" : "neutral"}
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{c.donorsEmpty}</p>
        )}
        {!demo && <RegisterEntity />}
      </section>
    </>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "active" | "neutral" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "active" && "bg-primary/10 text-primary",
        tone === "neutral" && "bg-secondary text-foreground",
        tone === "warn" && "bg-bridge-bright/15 text-bridge-ink",
      )}
    >
      {label}
    </span>
  );
}

function RoleCard({
  icon,
  title,
  text,
  chip,
  action,
  to,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  chip: Chip;
  action: string;
  to: string;
}) {
  const c = useCopy(WORKSPACES_COPY);
  return (
    <li className="flex flex-col rounded-2xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-lg bg-secondary p-2 text-primary [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </span>
        <StatusChip
          label={c.chip[chip]}
          tone={chip === "active" ? "active" : chip === "new" ? "neutral" : "warn"}
        />
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-6 text-muted-foreground">{text}</p>
      <Button
        asChild
        variant={chip === "active" ? "default" : "outline"}
        className="mt-4 min-h-11 w-fit"
      >
        <Link to={to as "/"}>
          {action}
          <ChevronLeft className="ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      </Button>
    </li>
  );
}

/** دعواتٌ إلى جهاتٍ مانحة: العضوية بقبول صاحب البريد وحده (DB-10). */
function DonorInvitations() {
  const c = useCopy(WORKSPACES_COPY);
  const fetchInvites = useDataFn("workspaces.donorInvitations", getMyDonorInvitations);
  const respond = useServerFn(respondDonorInvitation);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: invites = [] } = useQuery({
    queryKey: useDataKey(["donor-invitations"]),
    queryFn: () => fetchInvites(),
  });
  if (invites.length === 0) return null;

  async function answer(entityId: string, accept: boolean) {
    setBusy(entityId);
    const res = await respond({ data: { entityId, accept } });
    setBusy(null);
    if (!res.ok) toast.error(c.answerFailed);
    else toast.success(accept ? c.joined : c.declined);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["donor-invitations"] }),
      qc.invalidateQueries({ queryKey: ["workspaces"] }),
    ]);
  }

  return (
    <ul className="mt-3 grid gap-3 md:grid-cols-2" aria-label={c.invitations}>
      {invites.map((i) => (
        <li
          key={i.entity_id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-primary/50 bg-background p-4"
        >
          <span className="min-w-0">
            <span className="block font-semibold">{i.entity_name}</span>
            <span className="block text-xs text-muted-foreground">
              {c.invitedAs(c.donorRole[i.role] ?? i.role)}
            </span>
          </span>
          <span className="flex gap-2">
            <Button
              className="min-h-11"
              disabled={busy === i.entity_id}
              onClick={() => answer(i.entity_id, true)}
            >
              {c.accept}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={busy === i.entity_id}
              onClick={() => answer(i.entity_id, false)}
            >
              {c.decline}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function RegisterEntity() {
  const c = useCopy(WORKSPACES_COPY);
  const register = useServerFn(registerDonorEntity);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await register({ data: { name, type: type || "foundation" } });
    setBusy(false);
    if (!res.ok) {
      setMsg(c.registerFailed);
      return;
    }
    setName("");
    setType("");
    setMsg(c.registered);
    await qc.invalidateQueries({ queryKey: ["workspaces"] });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-xl border border-dashed border-border p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
    >
      <div>
        <Label htmlFor="entity-name">{c.entityName}</Label>
        <Input id="entity-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="entity-type">{c.entityType}</Label>
        <Input id="entity-type" value={type} onChange={(e) => setType(e.target.value)} />
      </div>
      <Button type="submit" className="min-h-11" disabled={busy || name.trim().length < 2}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {c.register}
      </Button>
      {msg && (
        <p role="status" className="text-sm text-muted-foreground md:col-span-3">
          {msg}
        </p>
      )}
    </form>
  );
}
