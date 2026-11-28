import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import { grantableRoles, type CountryAccess, type CountryRole } from "@/lib/golden-record";
import { listCountryStaff, setCountryStaff } from "@/lib/golden-record.functions";
import { useCopy, useLocale } from "@/lib/locale";
import { Busy, Failed, Field, Pill, SectionHead, SELECT } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { useErr } from "./shared";

export function Team({ country, access }: { country: string; access: CountryAccess }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.staff", listCountryStaff);
  const save = useDataFn("golden.setStaff", setCountryStaff);
  // لغة دعوة البريد لمن لا حساب له: لغة الواجهة التي يدعو منها المدير.
  const lang = useLocale();
  const list = useQuery({
    queryKey: useDataKey(["country-staff", country]),
    queryFn: () => fetchList({ data: { country } }),
  });
  const roles = grantableRoles(access, country);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CountryRole>(roles[roles.length - 1] ?? "viewer");
  const m = useMutation({
    mutationFn: (v: { email: string; role: CountryRole | null }) =>
      save({ data: { country, ...v, lang } }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(res.invited ? c.invited(email.trim()) : c.done);
      setEmail("");
      void qc.invalidateQueries({ queryKey: [...dk, "country-staff", country] });
    },
  });
  const items = list.data?.ok ? list.data.data : [];

  return (
    <section aria-labelledby="team-title">
      <SectionHead title={c.teamTitle} hint={c.teamHint} />
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) m.mutate({ email: email.trim(), role });
        }}
      >
        <Field label={c.teamEmail} htmlFor="staff-email">
          <input
            id="staff-email"
            type="email"
            dir="ltr"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={SELECT}
          />
        </Field>
        <Field label={c.teamRole} htmlFor="staff-role">
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value as CountryRole)}
            className={SELECT}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {c.staffRoles[r]}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" className="min-h-11" disabled={!email.trim() || m.isPending}>
          {c.teamAdd}
        </Button>
      </form>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.teamEmailHint}</p>
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        <Failed onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.teamEmpty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {items.map((u) => (
            <li key={u.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <bdi dir="ltr" className="min-w-0 truncate">
                {u.email}
              </bdi>
              <Pill tone={u.role === "supervisor" ? "wine" : "quiet"}>{c.staffRoles[u.role]}</Pill>
              {u.pending && <Pill tone="gold">{c.pendingInvite}</Pill>}
              {roles.includes(u.role) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ms-auto min-h-11"
                  disabled={m.isPending}
                  onClick={() => m.mutate({ email: u.email, role: null })}
                >
                  {c.teamRemove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
