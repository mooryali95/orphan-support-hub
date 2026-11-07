import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { entityTypeLabel } from "@/lib/plural";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assignOfficeMember,
  createOffice,
  getAdminOffices,
  OFFICE_ROLE_LABELS,
  setDonorEntityStatus,
} from "@/lib/workspaces.functions";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * المكاتب والجهات المانحة — شاشة الإدارة.
 *
 * المكتب مسؤول عن دولة (المنطقة فارغة) أو عن منطقة منها، ويتبع مكتب
 * الدولة إن وُجد، فيرى مدير الدولة ما تحته.
 */
export function OfficesAdmin() {
  const fetchOverview = useServerFn(getAdminOffices);
  const doCreate = useServerFn(createOffice);
  const doAssign = useServerFn(assignOfficeMember);
  const doStatus = useServerFn(setDonorEntityStatus);
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin-offices"],
    queryFn: () => fetchOverview(),
  });

  const [name, setName] = useState("");
  const [country, setCountry] = useState("AL");
  const [region, setRegion] = useState("");
  const [parentId, setParentId] = useState("");
  const [member, setMember] = useState<{ officeId: string; email: string; role: string }>({
    officeId: "",
    email: "",
    role: "field_officer",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isPending) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const o = data?.overview;
  if (!o) return <p className="text-sm text-destructive">تعذّر التحميل.</p>;

  async function run(p: Promise<{ ok: boolean; error: string | null }>, done: string) {
    setBusy(true);
    setMsg(null);
    const res = await p;
    setBusy(false);
    setMsg(res.ok ? done : (res.error ?? "تعذّر التنفيذ."));
    if (res.ok) await qc.invalidateQueries({ queryKey: ["admin-offices"] });
    return res.ok;
  }

  const countryName = (code: string) => o.countries.find((c) => c.code === code)?.name ?? code;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-bold">مكتب جديد</h2>
        <form
          className="mt-3 grid gap-3 md:grid-cols-4 md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              doCreate({
                data: {
                  name,
                  country,
                  region: region || undefined,
                  parentId: parentId || undefined,
                },
              }),
              "أُنشئ المكتب.",
            );
            if (ok) {
              setName("");
              setRegion("");
            }
          }}
        >
          <div>
            <Label htmlFor="of-name">الاسم</Label>
            <Input id="of-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="of-country">الدولة</Label>
            <select
              id="of-country"
              className={SELECT}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {o.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                  {c.status !== "active" ? " (غير مفعّلة)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="of-region">المنطقة (فارغة = الدولة كلّها)</Label>
            <Input id="of-region" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="of-parent">يتبع</Label>
            <select
              id="of-parent"
              className={SELECT}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— لا شيء —</option>
              {o.offices.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="md:col-span-4 md:w-fit"
          >
            إنشاء
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-bold">المكاتب</h2>
        {o.offices.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">لا مكاتب بعد.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {o.offices.map((x) => (
              <li key={x.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{x.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {x.region ?? "الدولة كلّها"} — {countryName(x.country)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {x.members.length === 0 ? (
                    <span className="text-xs text-muted-foreground">بلا أعضاء</span>
                  ) : (
                    x.members.map((m) => (
                      <Badge key={m.email} variant="secondary">
                        {m.email} · {OFFICE_ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {o.offices.length > 0 && (
          <form
            className="mt-4 grid gap-3 md:grid-cols-4 md:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(doAssign({ data: member }), "أُسند العضو.");
              if (ok) setMember((m) => ({ ...m, email: "" }));
            }}
          >
            <div>
              <Label htmlFor="om-office">المكتب</Label>
              <select
                id="om-office"
                className={SELECT}
                value={member.officeId}
                onChange={(e) => setMember((m) => ({ ...m, officeId: e.target.value }))}
              >
                <option value="">— اختر —</option>
                {o.offices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="om-email">البريد</Label>
              <Input
                id="om-email"
                type="email"
                value={member.email}
                onChange={(e) => setMember((m) => ({ ...m, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="om-role">الدور</Label>
              <select
                id="om-role"
                className={SELECT}
                value={member.role}
                onChange={(e) => setMember((m) => ({ ...m, role: e.target.value }))}
              >
                {o.roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || !member.officeId || !member.email}>
              إسناد
            </Button>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">الجهات المانحة</h2>
        {o.donor_entities.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">لم تسجّل جهةٌ بعد.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {o.donor_entities.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
              >
                <span>
                  <span className="font-semibold">{e.name}</span>
                  <span className="ms-2 text-xs text-muted-foreground">
                    {entityTypeLabel(e.type)}
                  </span>
                </span>
                <span className="flex gap-2">
                  {e.status !== "approved" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          doStatus({ data: { entityId: e.id, status: "approved" } }),
                          "اعتُمدت الجهة.",
                        )
                      }
                    >
                      اعتماد
                    </Button>
                  )}
                  {e.status !== "suspended" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          doStatus({ data: { entityId: e.id, status: "suspended" } }),
                          "أُوقفت الجهة.",
                        )
                      }
                    >
                      إيقاف
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && (
        <p role="status" className="text-sm text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
