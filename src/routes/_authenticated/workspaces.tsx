import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Building2,
  HandHeart,
  Landmark,
  Languages,
  Loader2,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DONOR_ROLE_LABELS,
  getMyDonorInvitations,
  getMyWorkspaces,
  OFFICE_ROLE_LABELS,
  registerDonorEntity,
  respondDonorInvitation,
} from "@/lib/workspaces.functions";
import { BRAND, pageTitle } from "@/config/brand";

const TITLE = pageTitle("بواباتي", false);

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: `كل أدوارك في ${BRAND.name} في مكانٍ واحد.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspacesPage,
});

const ENTITY_STATUS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمدة",
  suspended: "موقوفة",
};

function WorkspacesPage() {
  const fetchWs = useServerFn(getMyWorkspaces);
  const { data, isPending } = useQuery({ queryKey: ["workspaces"], queryFn: () => fetchWs() });

  if (isPending) {
    return (
      <DashboardShell title="بواباتي">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }
  const ws = data?.workspaces;
  if (!ws) {
    return (
      <DashboardShell title="بواباتي">
        <p className="text-sm text-destructive">تعذّر تحميل البوابات.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="بواباتي"
      description="كل دورٍ لك في المنصّة بابٌ مستقل. ترى هنا ما يحقّ لك وحده."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Portal
          icon={<HandHeart className="size-5" />}
          title="كفالاتي"
          text={`كفالاتك وتعهّداتك (${ws.pledges} تعهّد).`}
          to="/dashboard"
        />
        {ws.guardian && (
          <Portal
            icon={<Users className="size-5" />}
            title="المستفيد وأسرته"
            text="من ترعاهم وملفّاتهم."
            to="/guardian"
          />
        )}
        {ws.care_org ? (
          <Portal
            icon={<Building2 className="size-5" />}
            title="الجهة الميدانية"
            text={
              ws.care_org_status === "pending"
                ? "طلب الاعتماد عند الإدارة — أكمل وثائقه."
                : ws.care_org_status === "rejected"
                  ? "أُعيد الطلب للتصحيح — افتحه لترى السبب."
                  : "ملفّات جهتك ومستفيدوها."
            }
            to="/org"
          />
        ) : (
          // أيّ حسابٍ يُسجّل جهته من هنا (UX-03): الطلب يُنشئها «بانتظار
          // الاعتماد»، ولا تُرفع ملفات أطفالٍ قبل أن تعتمدها الإدارة.
          <Portal
            icon={<Building2 className="size-5" />}
            title="سجّل جهة ميدانية"
            text="مكتبٌ للندوة أو جهة تعمل معها ميدانياً؟ قدّم بياناتها ووثيقة تسجيلها لتراجعها الإدارة."
            to="/org"
          />
        )}
        {ws.supervisor && (
          <Portal
            icon={<UserCheck className="size-5" />}
            title="الإشراف"
            text="المستفيدون المُسنَدون إليك ومراحلهم."
            to="/supervisor"
          />
        )}
        {(ws.translator_locales ?? []).map((l) => (
          <Link
            key={l.code}
            to="/translate/$locale"
            params={{ locale: l.code }}
            className="flex items-start gap-3 rounded-xl border border-border bg-background p-5 hover:border-primary"
          >
            <span className="rounded-lg bg-secondary p-2 text-primary">
              <Languages className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">مراجعة الترجمة — {l.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                نصوص الواجهة بلغة {l.name}: ترجمتها ومراجعتها.
              </span>
            </span>
          </Link>
        ))}
        {ws.admin && (
          <Portal
            icon={<ShieldCheck className="size-5" />}
            title="إدارة المنصّة"
            text="الطلبات والنطاقات والمكاتب."
            to="/admin"
          />
        )}
      </div>

      {/* المكاتب لأعضائها وحدهم: لا قسمٌ فارغ يقول «لست عضواً» لكلّ حساب (UX-16). */}
      {ws.offices.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">المكاتب</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {ws.offices.map((o) => (
              <li key={o.id}>
                <Link
                  to="/office/$officeId"
                  params={{ officeId: o.id }}
                  className="block rounded-xl border border-border bg-background p-4 hover:border-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{o.name}</span>
                    <Badge variant="secondary">{OFFICE_ROLE_LABELS[o.role] ?? o.role}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.region ? `${o.region} — ` : "الدولة كلّها — "}
                    {o.country}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-bold">الجهات المانحة</h2>
        <DonorInvitations />
        {ws.donor_entities.length > 0 && (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {ws.donor_entities.map((e) => (
              <li key={e.id}>
                <Link
                  to="/donor/$entityId"
                  params={{ entityId: e.id }}
                  className="block rounded-xl border border-border bg-background p-4 hover:border-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <Landmark className="size-4" />
                      {e.name}
                    </span>
                    <Badge variant={e.status === "approved" ? "default" : "secondary"}>
                      {ENTITY_STATUS[e.status] ?? e.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <RegisterEntity />
      </section>
    </DashboardShell>
  );
}

/** دعواتٌ إلى جهاتٍ مانحة: العضوية بقبول صاحب البريد وحده (DB-10). */
function DonorInvitations() {
  const fetchInvites = useServerFn(getMyDonorInvitations);
  const respond = useServerFn(respondDonorInvitation);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: invites = [] } = useQuery({
    queryKey: ["donor-invitations"],
    queryFn: () => fetchInvites(),
  });
  if (invites.length === 0) return null;

  async function answer(entityId: string, accept: boolean) {
    setBusy(entityId);
    const res = await respond({ data: { entityId, accept } });
    setBusy(null);
    if (!res.ok) {
      toast.error("تعذّر تسجيل ردّك — ربما انتهت الدعوة");
    } else {
      toast.success(accept ? "انضممت إلى الجهة" : "رُدّت الدعوة");
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["donor-invitations"] }),
      qc.invalidateQueries({ queryKey: ["workspaces"] }),
    ]);
  }

  return (
    <ul className="mt-3 grid gap-3 md:grid-cols-2" aria-label="دعوات الجهات المانحة">
      {invites.map((i) => (
        <li
          key={i.entity_id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-primary/50 bg-background p-4"
        >
          <span className="min-w-0">
            <span className="block font-semibold">{i.entity_name}</span>
            <span className="block text-xs text-muted-foreground">
              دعوةٌ بدور «{DONOR_ROLE_LABELS[i.role]}»
            </span>
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              disabled={busy === i.entity_id}
              onClick={() => answer(i.entity_id, true)}
            >
              قبول
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === i.entity_id}
              onClick={() => answer(i.entity_id, false)}
            >
              ردّ
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Portal({
  icon,
  title,
  text,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  to: "/dashboard" | "/guardian" | "/org" | "/admin" | "/supervisor";
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl border border-border bg-background p-5 hover:border-primary"
    >
      <span className="rounded-lg bg-secondary p-2 text-primary">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}

function RegisterEntity() {
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
      setMsg("تعذّر التسجيل. تحقّق من الاسم.");
      return;
    }
    setName("");
    setType("");
    setMsg("سُجّلت الجهة، وستراجعها الإدارة قبل أن تدعم باسمها.");
    await qc.invalidateQueries({ queryKey: ["workspaces"] });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-xl border border-dashed border-border p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
    >
      <div>
        <Label htmlFor="entity-name">اسم الجهة</Label>
        <Input id="entity-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="entity-type">صفتها (شركة، وقف، مؤسسة…)</Label>
        <Input id="entity-type" value={type} onChange={(e) => setType(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy || name.trim().length < 2}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        سجّل جهة مانحة
      </Button>
      {msg && (
        <p role="status" className="text-sm text-muted-foreground md:col-span-3">
          {msg}
        </p>
      )}
    </form>
  );
}
