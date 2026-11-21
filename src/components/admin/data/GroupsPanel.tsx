import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Users } from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { flagOf } from "@/lib/countries";
import type { GroupRow, PersonRow } from "@/lib/data-entry";
import {
  findPersons,
  getGroupMembers,
  getGroups,
  getRegions,
  removeGroupMember,
  saveGroup,
  setGroupMember,
  type MemberConflict,
} from "@/lib/data-entry.functions";
import { ORPHAN_STATUS_LABELS } from "@/lib/format";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import { ACCENT } from "./shared";
import {
  Busy,
  CARD,
  CountrySelect,
  Failed,
  Field,
  NeedsUpdate,
  Pill,
  SectionHead,
  SELECT,
  useErrorText,
  type Shared,
} from "./shared";

export function GroupsPanel({ shared }: { shared: Shared }) {
  const c = useCopy(COPY);
  const t = c.groups;
  const fetchGroups = useServerFn(getGroups);
  const qc = useQueryClient();
  const country = shared.country;
  const list = useQuery({
    queryKey: ["data-groups", country],
    queryFn: () => fetchGroups({ data: country ? { country } : {} }),
  });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<GroupRow | "new" | null>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["data-groups"] });
    shared.reloadCountries();
  };
  const name = (code: string) => shared.countries.find((x) => x.code === code)?.name_ar ?? code;
  const result = list.data;

  return (
    <div className="space-y-6">
      <SectionHead
        title={t.heading}
        hint={t.hint}
        action={
          <Button type="button" onClick={() => setForm("new")}>
            <Plus aria-hidden="true" />
            {t.newTitle}
          </Button>
        }
      />
      <div className="max-w-xs">
        <label htmlFor="groups-country" className="mb-1.5 block text-sm font-semibold">
          {c.country}
        </label>
        <CountrySelect
          id="groups-country"
          value={country}
          countries={shared.countries}
          allLabel={t.allCountries}
          onChange={shared.setCountry}
        />
      </div>

      {form && (
        <GroupForm
          shared={shared}
          group={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await refresh();
          }}
        />
      )}

      {list.isPending ? (
        <Busy />
      ) : !result || !result.ok ? (
        result?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : result.data.length === 0 ? (
        <EmptyState title={t.empty} text={t.emptyText} />
      ) : (
        <ul className="space-y-3">
          {result.data.map((g) => (
            <li key={g.id} className={cn(CARD, "p-4")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    <bdi>{g.name}</bdi>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {flagOf(g.country_code)} {name(g.country_code)}
                    {g.region ? ` · ${g.region}` : ""} · {t.members(g.members)}
                  </p>
                </div>
                {g.source ? (
                  <Pill tone="wine">{t.synced(g.source)}</Pill>
                ) : (
                  <Pill tone="quiet">{t.local}</Pill>
                )}
                {!g.source && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setForm(g)}>
                    <Pencil aria-hidden="true" />
                    {c.edit}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={open === g.id}
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                >
                  <Users aria-hidden="true" />
                  {t.open}
                </Button>
              </div>
              {open === g.id && <Members group={g} countryName={name} onChanged={refresh} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupForm({
  shared,
  group,
  onClose,
  onSaved,
}: {
  shared: Shared;
  group: GroupRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const c = useCopy(COPY);
  const t = c.groups;
  const errorText = useErrorText();
  const save = useServerFn(saveGroup);
  const fetchRegions = useServerFn(getRegions);
  const [name, setName] = useState(group?.name ?? "");
  const [country, setCountry] = useState(group?.country_code ?? shared.country);
  const [region, setRegion] = useState(group?.region ?? "");
  const [institution, setInstitution] = useState(group?.institution ?? "");
  const [supervisor, setSupervisor] = useState(group?.supervisor ?? "");
  const [busy, setBusy] = useState(false);
  const regions = useQuery({
    queryKey: ["data-regions", country],
    queryFn: () => fetchRegions({ data: { country } }),
    enabled: Boolean(country),
  });
  const regionList = regions.data?.ok ? regions.data.data.regions.filter((r) => r.active) : [];

  return (
    <form
      className={cn(CARD, "map-rise p-5")}
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim().length < 2 || !country) return;
        setBusy(true);
        const res = await save({
          data: {
            ...(group ? { id: group.id } : {}),
            name: name.trim(),
            country,
            ...(region ? { region } : {}),
            ...(institution.trim() ? { institution: institution.trim() } : {}),
            ...(supervisor.trim() ? { supervisor: supervisor.trim() } : {}),
          },
        });
        setBusy(false);
        if (!res.ok) {
          toast.error(errorText(res.error));
          return;
        }
        toast.success(group ? c.saved : t.created);
        await onSaved();
      }}
    >
      <h4 className="font-bold">{group ? t.editTitle : t.newTitle}</h4>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label={t.name} htmlFor="group-name">
          <Input
            id="group-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </Field>
        <Field label={c.country} htmlFor="group-country">
          <CountrySelect
            id="group-country"
            value={country}
            countries={shared.countries}
            onChange={(code) => {
              setCountry(code);
              setRegion("");
            }}
          />
        </Field>
        <Field label={c.region} htmlFor="group-region">
          <select
            id="group-region"
            className={SELECT}
            disabled={!country}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            <option value="">{c.noRegion}</option>
            {regionList.map((r) => (
              <option key={r.id} value={r.name_ar}>
                {r.name_ar}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`${t.institution} (${c.optional})`} htmlFor="group-inst">
          <Input
            id="group-inst"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            maxLength={140}
          />
        </Field>
        <Field label={`${t.supervisor} (${c.optional})`} htmlFor="group-sup">
          <Input
            id="group-sup"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
            maxLength={140}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || name.trim().length < 2 || !country}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {group ? c.save : t.create}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {c.cancel}
        </Button>
      </div>
    </form>
  );
}

type Pending = {
  person: PersonRow;
  conflict: MemberConflict;
  adoptCountry: boolean;
  regionChoice: "group" | "keep" | null;
  move: boolean;
};

function Members({
  group,
  countryName,
  onChanged,
}: {
  group: GroupRow;
  countryName: (code: string) => string;
  onChanged: () => Promise<void>;
}) {
  const c = useCopy(COPY);
  const t = c.groups;
  const errorText = useErrorText();
  const qc = useQueryClient();
  const fetchMembers = useServerFn(getGroupMembers);
  const search = useServerFn(findPersons);
  const join = useServerFn(setGroupMember);
  const leave = useServerFn(removeGroupMember);
  const members = useQuery({
    queryKey: ["data-members", group.id],
    queryFn: () => fetchMembers({ data: { groupId: group.id } }),
  });
  const [q, setQ] = useState("");
  const found = useQuery({
    queryKey: ["data-find", q],
    queryFn: () => search({ data: { q: q.trim(), limit: 8 } }),
    enabled: q.trim().length >= 2,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const local = !group.source;

  async function changed() {
    await qc.invalidateQueries({ queryKey: ["data-members", group.id] });
    await qc.invalidateQueries({ queryKey: ["data-find"] });
    await onChanged();
  }

  async function add(person: PersonRow, choice?: Pending) {
    setBusy(person.id);
    setBlocked(null);
    const res = await join({
      data: {
        groupId: group.id,
        personId: person.id,
        adoptCountry: choice?.adoptCountry ?? false,
        ...(choice?.regionChoice ? { regionChoice: choice.regionChoice } : {}),
        move: choice?.move ?? false,
      },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    const out = res.data;
    if (out.ok) {
      setPending(null);
      toast.success(t.memberAdded);
      await changed();
      return;
    }
    if (out.code === "conflict" && out.conflict) {
      setPending({
        person,
        conflict: out.conflict,
        adoptCountry: choice?.adoptCountry ?? false,
        regionChoice: choice?.regionChoice ?? null,
        move: choice?.move ?? false,
      });
      return;
    }
    setPending(null);
    const b = t.memberBlocked;
    setBlocked(
      out.code === "synced"
        ? b.synced(out.source ?? "")
        : out.code
          ? ((b as Record<string, unknown>)[out.code] as string)
          : c.errors.failed,
    );
  }

  const memberIds = new Set(members.data?.ok ? members.data.data.map((m) => m.id) : []);
  const resolved =
    pending !== null &&
    (!pending.conflict.country || pending.adoptCountry) &&
    (!pending.conflict.region || pending.regionChoice !== null) &&
    (!pending.conflict.group || pending.move);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h4 className="text-sm font-bold">{t.membersTitle(group.name)}</h4>
      {members.isPending ? (
        <Loader2 className="mt-3 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : !members.data?.ok ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {c.loadFailed}
        </p>
      ) : members.data.data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t.membersEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl bg-secondary/40">
          {members.data.data.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <bdi className="font-semibold">{m.name}</bdi>{" "}
                <bdi dir="ltr" className="text-xs text-muted-foreground">
                  {m.code}
                </bdi>
                <span className="block text-xs text-muted-foreground">
                  {m.region ?? c.noRegion} · {ORPHAN_STATUS_LABELS[m.status] ?? m.status}
                </span>
              </span>
              {m.synced_source && <Pill tone="wine">{c.persons.synced(m.synced_source)}</Pill>}
              {m.locked && <Pill tone="gold">{c.persons.locked}</Pill>}
              {local && !m.synced_source && !m.locked && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy === m.id}
                  onClick={async () => {
                    setBusy(m.id);
                    const res = await leave({ data: { personId: m.id } });
                    setBusy(null);
                    if (!res.ok || !res.data.ok) {
                      toast.error(res.ok ? c.errors.failed : errorText(res.error));
                      return;
                    }
                    toast.success(t.memberRemoved);
                    await changed();
                  }}
                >
                  {t.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {local && (
        <div className="mt-4">
          <label htmlFor={`find-${group.id}`} className="mb-1.5 block text-sm font-semibold">
            {t.searchPerson}
          </label>
          <Input
            id={`find-${group.id}`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
            aria-describedby={`find-${group.id}-hint`}
          />
          <p id={`find-${group.id}-hint`} className="mt-1 text-xs text-muted-foreground">
            {t.searchHint}
          </p>

          {blocked && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {blocked}
            </p>
          )}

          {pending && (
            <div
              role="alert"
              className="map-rise mt-3 rounded-2xl border border-bridge/50 bg-bridge/10 p-4"
            >
              <p className="font-bold text-bridge-ink">
                {t.conflictTitle}: <bdi>{pending.person.name}</bdi>
              </p>
              <p className="text-sm text-muted-foreground">{t.conflictText}</p>
              <div className="mt-3 space-y-3 text-sm">
                {pending.conflict.country && (
                  <ConflictRow
                    label={t.conflictCountry}
                    child={countryName(pending.conflict.country.child ?? "")}
                    group={countryName(pending.conflict.country.group ?? "")}
                  >
                    <Choice
                      checked={pending.adoptCountry}
                      onChange={(on) => setPending({ ...pending, adoptCountry: on })}
                      label={t.adoptCountry}
                    />
                  </ConflictRow>
                )}
                {pending.conflict.region && (
                  <ConflictRow
                    label={t.conflictRegion}
                    child={pending.conflict.region.child ?? c.noRegion}
                    group={pending.conflict.region.group ?? c.noRegion}
                  >
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label={t.conflictRegion}
                    >
                      {(
                        [
                          ["group", t.regionUseGroup],
                          ["keep", t.regionKeep],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={pending.regionChoice === value}
                          onClick={() => setPending({ ...pending, regionChoice: value })}
                          className={cn(
                            "min-h-11 rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            pending.regionChoice === value
                              ? "border-primary bg-primary/10 font-bold text-primary"
                              : "border-border bg-card",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </ConflictRow>
                )}
                {pending.conflict.group && (
                  <ConflictRow
                    label={t.conflictGroup}
                    child={pending.conflict.group.child ?? c.none}
                    group={pending.conflict.group.group ?? c.none}
                  >
                    <Choice
                      checked={pending.move}
                      onChange={(on) => setPending({ ...pending, move: on })}
                      label={t.moveFromGroup}
                    />
                  </ConflictRow>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!resolved || busy === pending.person.id}
                  onClick={() => void add(pending.person, pending)}
                >
                  {busy === pending.person.id && (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  )}
                  {t.confirmJoin}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                  {c.cancel}
                </Button>
              </div>
            </div>
          )}

          {q.trim().length >= 2 &&
            (found.isPending ? (
              <Loader2
                className="mt-3 size-4 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : !found.data?.ok || found.data.data.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t.searchNone}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {found.data.data.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm">
                      <bdi className="font-semibold">{p.name}</bdi>{" "}
                      <bdi dir="ltr" className="text-xs text-muted-foreground">
                        {p.code}
                      </bdi>
                      <span className="block text-xs text-muted-foreground">
                        {p.country_code ? countryName(p.country_code) : c.none}
                        {p.region ? ` · ${p.region}` : ""}
                        {p.group_name ? ` · ${p.group_name}` : ""}
                      </span>
                    </span>
                    {p.synced_source && (
                      <Pill tone="wine">{c.persons.synced(p.synced_source)}</Pill>
                    )}
                    {p.locked && <Pill tone="gold">{c.persons.locked}</Pill>}
                    {memberIds.has(p.id) ? (
                      <Pill tone="quiet">{t.already}</Pill>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy === p.id}
                        onClick={() => void add(p)}
                      >
                        {t.addMember}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  );
}

function ConflictRow({
  label,
  child,
  group,
  children,
}: {
  label: string;
  child: string;
  group: string;
  children: React.ReactNode;
}) {
  const t = useCopy(COPY).groups;
  return (
    <div className="rounded-xl bg-card p-3">
      <p className="font-semibold">{label}</p>
      <dl className="mt-1 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">{t.onFile}</dt>
          <dd className="text-sm font-medium">
            <bdi>{child}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t.onGroup}</dt>
          <dd className="text-sm font-medium">
            <bdi>{group}</bdi>
          </dd>
        </div>
      </dl>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Choice({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        style={ACCENT}
        className="size-5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
