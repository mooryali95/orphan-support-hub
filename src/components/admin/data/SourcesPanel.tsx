import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ShieldAlert, Upload as UploadIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { flagOf } from "@/lib/countries";
import {
  authorityNow,
  canDo,
  goldenTemplate,
  grantableRoles,
  readGoldenSheet,
  showValue,
  verifiedShare,
  type Conflict,
  type CountryAccess,
  type CountryHealth,
  type CountryRole,
  type DataAlert,
  type GoldenSheet,
  type LinkItem,
  type OfficeMode,
  type SourceRole,
  type TrustState,
} from "@/lib/golden-record";
import {
  createUnmatched,
  getDataHealth,
  importGolden,
  listAlerts,
  listCountryStaff,
  listConflicts,
  listLinkQueue,
  resolveAlert,
  resolveConflict,
  resolveLink,
  setCountryStaff,
  setCountrySource,
} from "@/lib/golden-record.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import {
  ACCENT,
  Busy,
  CARD,
  Failed,
  Field,
  NeedsUpdate,
  Pill,
  SectionHead,
  SELECT,
} from "./shared";
import { SOURCES_COPY } from "./sources-copy";

const TRUST_ORDER: TrustState[] = [
  "verified",
  "single_source",
  "flagged",
  "conflict",
  "stale",
  "legacy",
];
const MODES: OfficeMode[] = ["none", "shadow", "active"];

function useErr() {
  const c = useCopy(SOURCES_COPY);
  return (code: string | undefined) => c.errors[code ?? ""] ?? c.errors["failed"]!;
}

/**
 * مصادر التحقق: صحة كل دولة، ووضع منصّة مكتبها، والرفع، والتعارضات، والربط.
 * القاعدة تقرّر؛ هذه الخانة تعرض وتسأل المشرف حيث يلزم قرار بشري.
 */
export function SourcesPanel({
  country,
  setCountry,
  access,
}: {
  country: string;
  setCountry: (code: string) => void;
  /** الإدارة، أو أدوار الدول لعضو فريقٍ (`my_country_access`). القاعدة تحرس على كل حال. */
  access: CountryAccess;
}) {
  const c = useCopy(SOURCES_COPY);
  const fetchHealth = useServerFn(getDataHealth);
  const health = useQuery({ queryKey: ["data-health"], queryFn: () => fetchHealth() });
  const rows = health.data?.ok ? health.data.data : [];
  const code = rows.some((r) => r.code === country) ? country : (rows[0]?.code ?? "");
  const selected = rows.find((r) => r.code === code) ?? null;

  if (health.isPending) return <Busy />;
  if (!health.data?.ok) {
    return health.data?.missing ? (
      <NeedsUpdate />
    ) : (
      <Failed onRetry={() => void health.refetch()} />
    );
  }

  return (
    <div className="space-y-10">
      <SectionHead title={c.title} hint={c.hint} />

      <section aria-labelledby="health-title">
        <h4 id="health-title" className="text-base font-bold">
          {c.healthTitle}
        </h4>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.noCountries}</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <li key={r.code}>
                <HealthCard row={r} active={r.code === code} onPick={() => setCountry(r.code)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <>
          {access.admin ? (
            <ModeControl key={`${selected.code}-${selected.office_mode}`} row={selected} />
          ) : (
            <section className={cn(CARD, "p-5")}>
              <p className="text-sm">
                <span className="font-bold">{c.modeTitle}: </span>
                {c.modes[selected.office_mode]}
              </p>
              <Matrix mode={selected.office_mode} />
            </section>
          )}
          {canDo(access, selected.code, "import") && (
            <UploadCard key={`up-${selected.code}`} row={selected} />
          )}
          {!canDo(access, selected.code, "approve") && (
            <p role="note" className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
              {c.readOnly}
            </p>
          )}
          <Alerts country={selected.code} canApprove={canDo(access, selected.code, "approve")} />
          <Conflicts country={selected.code} canApprove={canDo(access, selected.code, "approve")} />
          <LinkQueue country={selected.code} canApprove={canDo(access, selected.code, "approve")} />
          {canDo(access, selected.code, "manage") && (
            <Team key={`team-${selected.code}`} country={selected.code} access={access} />
          )}
        </>
      )}
    </div>
  );
}

function when(iso: string | null, never: string) {
  return iso ? new Date(iso).toLocaleDateString() : never;
}

function HealthCard({
  row,
  active,
  onPick,
}: {
  row: CountryHealth;
  active: boolean;
  onPick: () => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const share = verifiedShare(row.trust);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        CARD,
        "block min-h-11 w-full p-4 text-start transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold">
          {flagOf(row.code)} {row.name_ar}
        </span>
        <Pill
          tone={
            row.office_mode === "active" ? "wine" : row.office_mode === "shadow" ? "gold" : "quiet"
          }
        >
          {c.modes[row.office_mode]}
        </Pill>
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums">
        {share === null ? (
          <span className="text-sm font-medium text-muted-foreground">{c.noManaged}</span>
        ) : (
          c.verifiedShare(share)
        )}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {TRUST_ORDER.map((t) => (
          <div key={t} className="flex justify-between gap-2" title={c.trustHint[t]}>
            <dt>{c.trust[t]}</dt>
            <dd className="tabular-nums text-foreground">{row.trust[t]}</dd>
          </div>
        ))}
      </dl>
      <p
        className={cn(
          "mt-3 text-xs",
          row.conflicts.critical > 0 ? "font-bold text-destructive" : "text-muted-foreground",
        )}
      >
        {c.criticalOpen(row.conflicts.critical)} · {c.otherOpen(row.conflicts.other)}
      </p>
      <p
        className={cn(
          "mt-1 text-xs",
          row.alerts.critical > 0 ? "font-bold text-destructive" : "text-muted-foreground",
        )}
      >
        {c.alertsCount(row.alerts.critical, row.alerts.warning)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{c.linkPending(row.link_pending)}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {c.lastWamy}: {when(row.last_wamy, c.never)}
        {row.office_mode !== "none" && (
          <>
            <br />
            {c.lastOffice}: {when(row.last_office, c.never)}
          </>
        )}
      </p>
    </button>
  );
}

function ModeControl({ row }: { row: CountryHealth }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const save = useServerFn(setCountrySource);
  const [mode, setMode] = useState<OfficeMode>(row.office_mode);
  const [source, setSource] = useState(row.office_source ?? row.platforms[0]?.key ?? "");
  const [days, setDays] = useState(String(row.stale_after_days));
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          country: row.code,
          source: mode === "none" ? null : source || null,
          mode,
          staleDays: Number(days),
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.modeSaved(res.data.reevaluated));
      void qc.invalidateQueries({ queryKey: ["data-health"] });
      void qc.invalidateQueries({ queryKey: ["golden-conflicts"] });
    },
  });
  const noPlatform = row.platforms.length === 0;
  const dirty =
    mode !== row.office_mode ||
    (mode !== "none" && source !== (row.office_source ?? "")) ||
    Number(days) !== row.stale_after_days;
  const daysOk = /^\d+$/.test(days) && Number(days) >= 30 && Number(days) <= 730;

  return (
    <section aria-labelledby="mode-title" className={cn(CARD, "p-5")}>
      <h4 id="mode-title" className="text-base font-bold">
        {c.modeTitle}
      </h4>
      <p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground">{c.modeHint}</p>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">{c.modeTitle}</legend>
        {MODES.map((x) => (
          <label
            key={x}
            className={cn(
              "flex min-h-11 cursor-pointer gap-3 rounded-xl border p-3 text-sm",
              mode === x ? "border-primary bg-primary/5" : "border-border",
              x !== "none" && noPlatform && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name="office-mode"
              value={x}
              checked={mode === x}
              disabled={x !== "none" && noPlatform}
              onChange={() => setMode(x)}
              style={ACCENT}
              className="mt-1"
            />
            <span>
              <span className="block font-bold">{c.modes[x]}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {c.modeHints[x]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {noPlatform && <p className="mt-3 text-xs text-muted-foreground">{c.noPlatform}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {mode !== "none" && (
          <Field label={c.platform} htmlFor="office-platform">
            <select
              id="office-platform"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={SELECT}
            >
              <option value="">{c.choosePlatform}</option>
              {row.platforms.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={c.staleDays} htmlFor="stale-days">
          <input
            id="stale-days"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={!daysOk || undefined}
            className={SELECT}
          />
        </Field>
      </div>
      <Matrix mode={mode} />
      <Button
        type="button"
        className="mt-4 min-h-11"
        disabled={!dirty || !daysOk || (mode !== "none" && !source) || m.isPending}
        onClick={() => {
          if (mode === "active" && row.office_mode !== "active" && !window.confirm(c.confirmActive))
            return;
          m.mutate();
        }}
      >
        {c.saveMode}
      </Button>
    </section>
  );
}

function Matrix({ mode }: { mode: OfficeMode }) {
  const c = useCopy(SOURCES_COPY);
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <caption className="mb-2 text-start font-bold">{c.matrixTitle}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 text-start font-medium" />
            <th scope="col" className="py-2 text-start font-medium">
              {c.owner}
            </th>
            <th scope="col" className="py-2 text-start font-medium">
              {c.verifier}
            </th>
          </tr>
        </thead>
        <tbody>
          {authorityNow(mode).map((a) => (
            <tr key={a.group} className="border-t border-border">
              <th scope="row" className="py-2 text-start font-medium">
                {c.groups[a.group]}
              </th>
              <td className="py-2">{c.roles[a.owner]}</td>
              <td className="py-2 text-muted-foreground">
                {a.verifier ? c.roles[a.verifier] : c.nobody}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadCard({ row }: { row: CountryHealth }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const send = useServerFn(importGolden);
  const [role, setRole] = useState<SourceRole>("wamy");
  const [text, setText] = useState("");
  const sheet: GoldenSheet | null = useMemo(
    () => (text ? readGoldenSheet(text, role) : null),
    [text, role],
  );
  const officeBlocked = role === "office" && row.office_mode === "none";
  useEffect(() => {
    if (row.office_mode === "none") setRole("wamy");
  }, [row.office_mode]);

  const m = useMutation({
    mutationFn: () =>
      send({
        data: {
          role,
          country: row.code,
          source: role === "office" ? row.office_source : null,
          records: sheet?.records ?? [],
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.result(res.data.observed, res.data.unlinked, res.data.skipped_count));
      setText("");
      for (const k of ["data-health", "golden-conflicts", "golden-links"])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  function download() {
    const url = URL.createObjectURL(new Blob([goldenTemplate(role)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-${role}-${row.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="upload-title" className={cn(CARD, "p-5")}>
      <h4 id="upload-title" className="text-base font-bold">
        {c.uploadTitle}
      </h4>
      <p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground">{c.uploadHint}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label={c.sourceRole}
          htmlFor="golden-role"
          hint={officeBlocked ? c.officeNeedsMode : undefined}
        >
          <select
            id="golden-role"
            value={role}
            onChange={(e) => setRole(e.target.value as SourceRole)}
            className={SELECT}
          >
            <option value="wamy">{c.roles.wamy}</option>
            <option value="office" disabled={row.office_mode === "none"}>
              {c.roles.office}
            </option>
          </select>
        </Field>
        <Field label={c.file} htmlFor="golden-file">
          <input
            id="golden-file"
            type="file"
            accept=".csv,text/csv"
            className="block min-h-11 w-full text-sm file:me-3 file:min-h-11 file:rounded-md file:border-0 file:bg-secondary file:px-3"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setText);
            }}
          />
        </Field>
      </div>
      {sheet && (
        <div role="status" className="mt-4 space-y-1 rounded-xl bg-secondary/60 p-3 text-sm">
          <p className="font-bold">{c.preview(sheet.records.length, sheet.fields.length)}</p>
          {sheet.ignored.length > 0 && (
            <p className="text-muted-foreground">{c.ignored(sheet.ignored.join("، "))}</p>
          )}
          {sheet.missingRef.length > 0 && (
            <p className="text-muted-foreground">
              {c.missingRef(sheet.missingRef.slice(0, 20).join("، "))}
            </p>
          )}
          {sheet.invalid.length > 0 && (
            <p className="text-muted-foreground">{c.invalidCells(sheet.invalid.length)}</p>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={!sheet || sheet.records.length === 0 || officeBlocked || m.isPending}
          onClick={() => m.mutate()}
        >
          <UploadIcon className="size-4" aria-hidden="true" />
          {m.isPending ? c.sending : c.send}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={download}>
          <Download className="size-4" aria-hidden="true" />
          {c.template}
        </Button>
      </div>
    </section>
  );
}

function Conflicts({ country, canApprove }: { country: string; canApprove: boolean }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const fetchList = useServerFn(listConflicts);
  const list = useQuery({
    queryKey: ["golden-conflicts", country],
    queryFn: () => fetchList({ data: { country } }),
  });
  const resolve = useServerFn(resolveConflict);
  const m = useMutation({
    mutationFn: (v: { id: string; choice: "accept" | "keep" | "use_wamy" | "use_office" }) =>
      resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      void qc.invalidateQueries({ queryKey: ["golden-conflicts"] });
      void qc.invalidateQueries({ queryKey: ["data-health"] });
    },
  });
  const show = (v: Conflict["current"]) => showValue(v, c.yes, c.no, "·");
  const items = list.data?.ok ? list.data.data : [];

  return (
    <section aria-labelledby="conflicts-title">
      <SectionHead title={c.conflictsTitle} hint={c.conflictsHint} />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        <Failed onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noConflicts}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((d) => (
            <li
              key={d.id}
              className={cn(CARD, "p-4", d.risk === "critical" && "ring-1 ring-destructive/40")}
            >
              <div className="flex flex-wrap items-center gap-2">
                {d.risk === "critical" && (
                  <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                )}
                <span className="font-bold">{c.fields[d.field] ?? d.field}</span>
                <Pill tone={d.risk === "critical" ? "wine" : "quiet"}>{c.kinds[d.kind]}</Pill>
                <span className="ms-auto text-xs text-muted-foreground">
                  {d.code} · {d.name}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{c.current}</dt>
                  <dd className="font-medium">{show(d.current)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{c.roles.wamy}</dt>
                  <dd>{show(d.wamy)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{c.roles.office}</dt>
                  <dd>{show(d.office)}</dd>
                </div>
              </dl>
              {d.kind === "held_locked" && (
                <p className="mt-2 text-xs text-muted-foreground">{c.lockedHint}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2" hidden={!canApprove}>
                {d.kind === "disagreement" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={m.isPending}
                      onClick={() => m.mutate({ id: d.id, choice: "use_wamy" })}
                    >
                      {c.useWamy}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={m.isPending}
                      onClick={() => m.mutate({ id: d.id, choice: "use_office" })}
                    >
                      {c.useOffice}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="min-h-11"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ id: d.id, choice: "accept" })}
                  >
                    {c.accept}: {show(d.proposed)}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={m.isPending}
                  onClick={() => m.mutate({ id: d.id, choice: "keep" })}
                >
                  {c.keep}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkQueue({ country, canApprove }: { country: string; canApprove: boolean }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const fetchList = useServerFn(listLinkQueue);
  const list = useQuery({
    queryKey: ["golden-links", country],
    queryFn: () => fetchList({ data: { country } }),
  });
  const resolve = useServerFn(resolveLink);
  const createAll = useServerFn(createUnmatched);
  const refresh = () => {
    for (const k of ["golden-links", "golden-conflicts", "data-health"])
      void qc.invalidateQueries({ queryKey: [k] });
  };
  const m = useMutation({
    mutationFn: (v: { id: string; action: "link" | "create" | "ignore"; orphanId?: string }) =>
      resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      refresh();
    },
  });
  const all = useMutation({
    mutationFn: () => createAll({ data: { country } }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.createdAll(res.data.created));
      if (res.data.failed > 0) toast.error(c.createFailed(res.data.failed));
      refresh();
    },
  });
  const items = list.data?.ok ? list.data.data : [];
  const unmatched = items.some((q) => q.role === "wamy" && q.candidates.length === 0);

  return (
    <section aria-labelledby="links-title">
      <SectionHead
        title={c.linkTitle}
        hint={c.linkHint}
        action={
          unmatched && canApprove ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={all.isPending}
              onClick={() => all.mutate()}
            >
              {c.createAll}
            </Button>
          ) : undefined
        }
      />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        <Failed onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noLinks}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((q) => (
            <li key={q.id} className={cn(CARD, "p-4")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{q.name ?? q.external_ref}</span>
                <Pill tone="quiet">{c.roles[q.role]}</Pill>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums" dir="ltr">
                  {q.external_ref}
                  {q.birth_date ? ` · ${q.birth_date}` : ""}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {q.candidates.length ? c.candidates : c.noCandidates}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" hidden={!canApprove}>
                {q.candidates.map((o) => (
                  <Button
                    key={o.id}
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ id: q.id, action: "link", orphanId: o.id })}
                  >
                    {c.linkTo(o.code)}
                    <span className="text-xs text-muted-foreground">
                      {o.name}
                      {o.birth_date ? ` · ${o.birth_date}` : ""}
                    </span>
                  </Button>
                ))}
                {q.role === "wamy" && (
                  <Button
                    size="sm"
                    className="min-h-11"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ id: q.id, action: "create" })}
                  >
                    {c.create}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={m.isPending}
                  onClick={() => m.mutate({ id: q.id, action: "ignore" })}
                >
                  {c.ignore}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertDetail({ a }: { a: DataAlert }) {
  const c = useCopy(SOURCES_COPY);
  const d = a.detail;
  const str = (k: string) => (d[k] === undefined || d[k] === null ? null : String(d[k]));
  const parts: string[] = [];
  if (str("from") !== null) parts.push(`${c.alertFrom}: ${str("from")}`);
  if (str("to") !== null) parts.push(`${c.alertTo}: ${str("to")}`);
  if (str("back_to") !== null) parts.push(`${c.alertTo}: ${str("back_to")}`);
  if (typeof d["distance"] === "number") parts.push(c.alertDistance(d["distance"]));
  if (typeof d["days"] === "number") parts.push(c.alertDays(d["days"]));
  if (d["crosses_adulthood"] === true) parts.push(c.alertAdult);
  if (str("other_code") !== null)
    parts.push(`${c.alertOther}: ${str("other_code")} · ${str("other_name") ?? ""}`);
  if (typeof d["files"] === "number" && typeof d["population"] === "number")
    parts.push(c.alertFiles(d["files"], d["population"]));
  if (a.hits > 1) parts.push(c.alertHits(a.hits));
  return parts.length ? (
    <ul className="mt-2 space-y-0.5 text-sm">
      {parts.map((p) => (
        <li key={p}>
          <bdi>{p}</bdi>
        </li>
      ))}
    </ul>
  ) : null;
}

function Alerts({ country, canApprove }: { country: string; canApprove: boolean }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const fetchList = useServerFn(listAlerts);
  const list = useQuery({
    queryKey: ["golden-alerts", country],
    queryFn: () => fetchList({ data: { country } }),
  });
  const resolve = useServerFn(resolveAlert);
  const m = useMutation({
    mutationFn: (v: {
      id: string;
      status: "reviewed" | "false_positive" | "confirmed";
      note?: string;
    }) => resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      void qc.invalidateQueries({ queryKey: ["golden-alerts"] });
      void qc.invalidateQueries({ queryKey: ["data-health"] });
    },
  });
  const items = list.data?.ok ? list.data.data : [];

  return (
    <section aria-labelledby="alerts-title">
      <SectionHead title={c.alertsTitle} hint={c.alertsHint} />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        <Failed onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noAlerts}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((a) => (
            <li
              key={a.id}
              className={cn(CARD, "p-4", a.severity === "critical" && "ring-1 ring-destructive/40")}
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.severity === "critical" && (
                  <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                )}
                <span className="font-bold">{c.signals[a.signal]}</span>
                <Pill
                  tone={
                    a.severity === "critical" ? "wine" : a.severity === "warning" ? "gold" : "quiet"
                  }
                >
                  {c.severities[a.severity]}
                </Pill>
                <span className="text-xs text-muted-foreground">
                  {c.fields[a.field] ?? (a.field === "identity" ? c.groups.identity : a.field)}
                  {a.role ? ` · ${c.roles[a.role]}` : ""}
                </span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {a.code ? `${a.code} · ${a.name ?? ""}` : c.countryWide}
                </span>
              </div>
              <AlertDetail a={a} />
              <div className="mt-3 flex flex-wrap gap-2" hidden={!canApprove}>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={m.isPending}
                  onClick={() => m.mutate({ id: a.id, status: "reviewed" })}
                >
                  {c.reviewed}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={m.isPending}
                  onClick={() => m.mutate({ id: a.id, status: "false_positive" })}
                >
                  {c.falsePositive}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="min-h-11"
                  disabled={m.isPending}
                  onClick={() => {
                    const note = window.prompt(c.confirmNote)?.trim();
                    if (note) m.mutate({ id: a.id, status: "confirmed", note });
                  }}
                >
                  {c.confirmFraud}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Team({ country, access }: { country: string; access: CountryAccess }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const fetchList = useServerFn(listCountryStaff);
  const save = useServerFn(setCountryStaff);
  const list = useQuery({
    queryKey: ["country-staff", country],
    queryFn: () => fetchList({ data: { country } }),
  });
  const roles = grantableRoles(access, country);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CountryRole>(roles[roles.length - 1] ?? "viewer");
  const m = useMutation({
    mutationFn: (v: { email: string; role: CountryRole | null }) =>
      save({ data: { country, ...v } }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["country-staff", country] });
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
