import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Download,
  FileUp,
  FolderOpen,
  ShieldAlert,
  Upload as UploadIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import { flagOf } from "@/lib/countries";
import {
  authorityNow,
  bulkEligible,
  canDo,
  goldenTemplate,
  grantableRoles,
  matchesQuery,
  MAX_BULK,
  readGoldenSheet,
  rowIssues,
  showValue,
  topFailure,
  verifiedShare,
  type BulkChoice,
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
  resolveConflictsBulk,
  resolveLink,
  setCountryStaff,
  setCountrySource,
} from "@/lib/golden-record.functions";
import { formatDate } from "@/lib/format";
import { useCopy, useLocale } from "@/lib/locale";
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
import { WORK_COPY } from "./work-copy";
import { ChildFileSheet, FilterBar, ROW_FOCUS, useListKeys, useWorkErr } from "./WorkTools";

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
  const fetchHealth = useDataFn("golden.health", getDataHealth);
  const health = useQuery({ queryKey: useDataKey(["data-health"]), queryFn: () => fetchHealth() });
  const rows = health.data?.ok ? health.data.data : [];
  const code = rows.some((r) => r.code === country) ? country : (rows[0]?.code ?? "");
  const selected = rows.find((r) => r.code === code) ?? null;
  const [tab, setTab] = useState<Tab>("alerts");
  const [fileId, setFileId] = useState<string | null>(null);

  if (health.isPending) return <Busy />;
  if (!health.data?.ok) {
    return health.data?.missing ? (
      <NeedsUpdate />
    ) : (
      <Failed onRetry={() => void health.refetch()} />
    );
  }

  const can = (need: "import" | "approve" | "manage") =>
    selected ? canDo(access, selected.code, need) : false;
  const tabs: Array<{ key: Tab; count: number; urgent: boolean }> = selected
    ? [
        {
          key: "alerts",
          count: selected.alerts.critical + selected.alerts.warning,
          urgent: selected.alerts.critical > 0,
        },
        {
          key: "conflicts",
          count: selected.conflicts.critical + selected.conflicts.other,
          urgent: selected.conflicts.critical > 0,
        },
        { key: "links", count: selected.link_pending, urgent: false },
        ...(can("import") ? [{ key: "upload" as const, count: 0, urgent: false }] : []),
        { key: "mode" as const, count: 0, urgent: false },
        ...(can("manage") ? [{ key: "team" as const, count: 0, urgent: false }] : []),
      ]
    : [];
  const current: Tab = tabs.some((t) => t.key === tab) ? tab : "alerts";

  return (
    <div className="space-y-8">
      <SectionHead title={c.title} hint={c.hint} />
      <StartHere
        rows={rows}
        access={access}
        onGo={(code, t) => {
          setCountry(code);
          setTab(t);
          requestAnimationFrame(() =>
            document
              .getElementById("country-work-title")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
        }}
      />

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
        <section aria-labelledby="country-work-title" className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 id="country-work-title" className="text-lg font-bold">
              {flagOf(selected.code)} {selected.name_ar}
            </h4>
            {!can("approve") && (
              <p role="note" className="text-xs text-muted-foreground">
                {c.readOnly}
              </p>
            )}
          </div>
          <div
            role="tablist"
            aria-label={c.sectionsLabel}
            className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={current === t.key}
                aria-controls={`panel-${t.key}`}
                onClick={(e) => {
                  setTab(t.key);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                }}
                className={cn(
                  "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current === t.key
                    ? "border-primary font-bold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {c.tabs[t.key]}
                {t.count > 0 && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-xs font-bold tabular-nums",
                      t.urgent
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`}>
            {current === "alerts" && (
              <Alerts country={selected.code} canApprove={can("approve")} onOpen={setFileId} />
            )}
            {current === "conflicts" && (
              <Conflicts country={selected.code} canApprove={can("approve")} onOpen={setFileId} />
            )}
            {current === "links" && (
              <LinkQueue country={selected.code} canApprove={can("approve")} onOpen={setFileId} />
            )}
            {current === "upload" && <UploadCard key={`up-${selected.code}`} row={selected} />}
            {current === "mode" &&
              (access.admin ? (
                <ModeControl key={`${selected.code}-${selected.office_mode}`} row={selected} />
              ) : (
                <section className={cn(CARD, "p-5")}>
                  <p className="text-sm">
                    <span className="font-bold">{c.modeTitle}: </span>
                    {c.modes[selected.office_mode]}
                  </p>
                  <Matrix mode={selected.office_mode} />
                </section>
              ))}
            {current === "team" && (
              <Team key={`team-${selected.code}`} country={selected.code} access={access} />
            )}
          </div>
        </section>
      )}
      <ChildFileSheet id={fileId} onClose={() => setFileId(null)} />
    </div>
  );
}

type Tab = "alerts" | "conflicts" | "links" | "upload" | "mode" | "team";

/** تاريخٌ بلغة الواجهة، معزولٌ عن اتجاه السطر. */
function useWhen() {
  const locale = useLocale();
  return (iso: string | null) => (iso ? formatDate(iso, locale) : null);
}

/** قيمة حقلٍ كما وصلت (تاريخ، رمز، اسمٌ لاتيني): كتلةٌ لا يقلبها اتجاه السطر. */
export function Val({ children }: { children: string }) {
  return (
    <bdi dir="auto" className="font-medium">
      {children}
    </bdi>
  );
}

/** قيمة تعارضٍ (نصّ، أو نعم/لا، أو غائب) معزولةً. */
function V({ v }: { v: Conflict["current"] }) {
  const c = useCopy(SOURCES_COPY);
  const t = showValue(v, c.yes, c.no, "·");
  return t === "·" ? <span className="text-muted-foreground">·</span> : <Val>{t}</Val>;
}

const BAR: Array<{ key: TrustState; cls: string }> = [
  { key: "verified", cls: "bg-shore-thrive" },
  { key: "single_source", cls: "bg-bridge" },
  { key: "stale", cls: "bg-muted-foreground/40" },
  { key: "conflict", cls: "bg-primary" },
  { key: "flagged", cls: "bg-destructive" },
];

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
  const when = useWhen();
  const share = verifiedShare(row.trust);
  const total = BAR.reduce((n, b) => n + row.trust[b.key], 0);
  const critical = row.alerts.critical + row.conflicts.critical;
  const other = row.alerts.warning + row.conflicts.other + row.link_pending;
  const last = row.office_mode === "none" ? row.last_wamy : (row.last_office ?? row.last_wamy);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        CARD,
        "block min-h-11 w-full p-4 text-start transition-[box-shadow,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          {c.modesShort[row.office_mode]}
        </Pill>
      </div>
      {share === null ? (
        <p className="mt-4 text-sm text-muted-foreground">{c.noManaged}</p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tabular-nums">{share}%</span>
            <span className="text-sm text-muted-foreground">{c.verifiedOf(total)}</span>
          </p>
          <div
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={BAR.filter((b) => row.trust[b.key] > 0)
              .map((b) => `${c.trust[b.key]} ${row.trust[b.key]}`)
              .join("، ")}
          >
            {BAR.map((b) =>
              row.trust[b.key] > 0 ? (
                <span
                  key={b.key}
                  className={b.cls}
                  style={{ width: `${(row.trust[b.key] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {BAR.filter((b) => b.key !== "verified" && row.trust[b.key] > 0).map((b) => (
              <li key={b.key} className="inline-flex items-center gap-1" title={c.trustHint[b.key]}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", b.cls)} />
                {c.trust[b.key]}
                <span className="tabular-nums text-foreground">{row.trust[b.key]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p
        className={cn(
          "mt-3 text-sm",
          critical > 0 ? "font-bold text-destructive" : "text-muted-foreground",
        )}
      >
        {critical > 0 ? c.needsDecision(critical) : other > 0 ? c.openItems(other) : c.allClear}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {c.lastSync}: {when(last) ?? c.never}
      </p>
    </button>
  );
}

function ModeControl({ row }: { row: CountryHealth }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const save = useDataFn("golden.setSource", setCountrySource);
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
      void qc.invalidateQueries({ queryKey: [...dk, "data-health"] });
      void qc.invalidateQueries({ queryKey: [...dk, "golden-conflicts"] });
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

function Step({
  n,
  title,
  done,
  children,
}: {
  n: string;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative ps-10">
      <span
        aria-hidden="true"
        className={cn(
          "absolute start-0 top-0 inline-flex size-7 items-center justify-center rounded-full text-sm font-bold tabular-nums",
          done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        )}
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      <h5 className="text-sm font-bold leading-7">{title}</h5>
      <div className="mt-2">{children}</div>
    </li>
  );
}

function UploadCard({ row }: { row: CountryHealth }) {
  const c = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const err = useWorkErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const send = useDataFn("golden.import", importGolden);
  const [role, setRole] = useState<SourceRole>("wamy");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const sheet: GoldenSheet | null = useMemo(
    () => (text ? readGoldenSheet(text, role) : null),
    [text, role],
  );
  const issues = useMemo(() => (sheet ? rowIssues(sheet) : []), [sheet]);
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
      setFileName("");
      if (fileInput.current) fileInput.current.value = "";
      for (const k of ["data-health", "golden-conflicts", "golden-links", "golden-alerts"])
        void qc.invalidateQueries({ queryKey: [...dk, k] });
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
  const ready = sheet?.records.length ?? 0;

  return (
    <section aria-labelledby="upload-title" className={cn(CARD, "p-4 sm:p-5")}>
      <h4 id="upload-title" className="text-base font-bold">
        {c.uploadTitle}
      </h4>
      <p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground">{c.uploadHint}</p>
      <ol className="mt-5 space-y-6">
        <Step n="1" title={w.stepSource} done>
          <div
            role="radiogroup"
            aria-label={c.sourceRole}
            className="grid grid-cols-2 gap-2 sm:max-w-md"
          >
            {(["wamy", "office"] as const).map((r) => {
              const off = r === "office" && row.office_mode === "none";
              return (
                <label
                  key={r}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-base transition-[border-color,background-color] duration-150 focus-within:ring-2 focus-within:ring-ring",
                    role === r ? "border-primary bg-primary/5 font-bold" : "border-border",
                    off && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="golden-role"
                    value={r}
                    checked={role === r}
                    disabled={off}
                    onChange={() => setRole(r)}
                    style={ACCENT}
                    className="size-5"
                  />
                  {c.roles[r]}
                </label>
              );
            })}
          </div>
          {row.office_mode === "none" && (
            <p className="mt-2 text-xs text-muted-foreground">{c.officeNeedsMode}</p>
          )}
          <Button type="button" variant="link" className="mt-1 min-h-11 px-0" onClick={download}>
            <Download className="size-4" aria-hidden="true" />
            {c.template}
          </Button>
        </Step>

        <Step n="2" title={w.stepFile} done={!!sheet}>
          <label
            htmlFor="golden-file"
            className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-input bg-background px-4 py-3 text-base transition-[border-color,background-color] duration-150 hover:border-primary/60 focus-within:ring-2 focus-within:ring-ring active:bg-secondary sm:max-w-md"
          >
            <FileUp className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-bold">{fileName ? w.changeFile : c.chooseFile}</span>
              <bdi dir="auto" className="block truncate text-sm text-muted-foreground">
                {fileName || c.noFile}
              </bdi>
            </span>
            <input
              ref={fileInput}
              id="golden-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileName(f?.name ?? "");
                if (f) void f.text().then(setText);
                else setText("");
              }}
            />
          </label>
        </Step>

        <Step n="3" title={w.stepCheck} done={false}>
          {!sheet ? (
            <p className="text-sm text-muted-foreground">{c.noFile}</p>
          ) : (
            <div className="space-y-3">
              <div role="status" className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex min-h-9 items-center rounded-full bg-shore-thrive/15 px-3 font-bold tabular-nums">
                  {w.rowsOk(ready)}
                </span>
                <span
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full px-3 tabular-nums",
                    issues.length > 0
                      ? "bg-destructive/10 font-bold text-destructive"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {w.rowsBad(issues.length)}
                </span>
              </div>
              {sheet.ignored.length > 0 && (
                <p className="text-xs leading-5 text-muted-foreground">
                  {c.ignored(sheet.ignored.join("، "))}
                </p>
              )}
              {issues.length > 0 && (
                <>
                  <p className="text-xs leading-5 text-muted-foreground">{w.stepCheckHint}</p>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-destructive/30">
                    {issues.slice(0, 30).map((x) => (
                      <li
                        key={x.line}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
                      >
                        <span className="font-bold tabular-nums">{w.line(x.line)}</span>
                        {x.missingRef && <span className="text-destructive">{w.noRef}</span>}
                        {x.fields.length > 0 && (
                          <span className="text-muted-foreground">
                            {w.badCells(x.fields.map((f) => c.fields[f] ?? f).join("، "))}
                          </span>
                        )}
                      </li>
                    ))}
                    {issues.length > 30 && (
                      <li className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {w.moreRows(issues.length - 30)}
                      </li>
                    )}
                  </ul>
                </>
              )}
              {ready > 0 && (
                <details className="rounded-xl bg-secondary/60 px-3">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
                    {w.sample}
                  </summary>
                  <ul className="space-y-1 pb-3 text-sm">
                    {sheet.records.slice(0, 5).map((r) => (
                      <li key={r.external_ref} className="flex min-w-0 gap-2">
                        <bdi dir="ltr" className="shrink-0 font-medium tabular-nums">
                          {r.external_ref}
                        </bdi>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {Object.keys(r.fields)
                            .map((f) => c.fields[f] ?? f)
                            .join("، ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <Button
                type="button"
                className="min-h-12 w-full text-base sm:w-auto"
                disabled={ready === 0 || officeBlocked || m.isPending}
                onClick={() => m.mutate()}
              >
                <UploadIcon className="size-4" aria-hidden="true" />
                {m.isPending ? c.sending : w.sendN(ready)}
              </Button>
            </div>
          )}
        </Step>
      </ol>
    </section>
  );
}

/** خيارات المرشّح من البنود نفسها: حقولٌ بلا بنود لا تزحم القائمة. */
function fieldOptions(items: Array<{ field: string }>, names: Record<string, string>) {
  return [...new Set(items.map((x) => x.field))]
    .map((f) => ({ value: f, label: names[f] ?? f }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

function OpenFile({ id, onOpen }: { id: string | null; onOpen: (id: string) => void }) {
  const w = useCopy(WORK_COPY);
  if (!id) return null;
  return (
    <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => onOpen(id)}>
      <FolderOpen className="size-4" aria-hidden="true" />
      {w.openFile}
    </Button>
  );
}

function Conflicts({
  country,
  canApprove,
  onOpen,
}: {
  country: string;
  canApprove: boolean;
  onOpen: (orphanId: string) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const err = useWorkErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.conflicts", listConflicts);
  const list = useQuery({
    queryKey: useDataKey(["golden-conflicts", country]),
    queryFn: () => fetchList({ data: { country } }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [...dk, "golden-conflicts"] });
    void qc.invalidateQueries({ queryKey: [...dk, "data-health"] });
    void qc.invalidateQueries({ queryKey: [...dk, "child-file"] });
  };
  const resolve = useDataFn("golden.resolveConflict", resolveConflict);
  const m = useMutation({
    mutationFn: (v: { id: string; choice: "accept" | "keep" | "use_wamy" | "use_office" }) =>
      resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      refresh();
    },
  });
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const bulkFn = useDataFn("golden.resolveConflictsBulk", resolveConflictsBulk);
  const bulk = useMutation({
    mutationFn: (v: { ids: string[]; choice: BulkChoice }) => bulkFn({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      if (res.data.done > 0) toast.success(w.bulkDone(res.data.done));
      if (res.data.failed > 0)
        toast.error(w.bulkFailed(res.data.failed, err(topFailure(res.data))));
      setPicked(new Set(res.data.results.filter((x) => !x.ok).map((x) => x.id)));
      refresh();
    },
  });
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [risk, setRisk] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const all = list.data?.ok ? list.data.data : [];
  const items = all.filter(
    (d) =>
      (!field || d.field === field) &&
      (!risk || d.risk === risk) &&
      matchesQuery(query, d.code, d.name),
  );
  const eligible = items.filter(bulkEligible);
  const chosen = all.filter((d) => picked.has(d.id) && bulkEligible(d));
  const allOn = eligible.length > 0 && eligible.every((d) => picked.has(d.id));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const keys = useListKeys({
    search,
    onOpen: (i) => items[i] && onOpen(items[i].orphan_id),
    onToggle: canApprove
      ? (i) => items[i] && bulkEligible(items[i]) && toggle(items[i].id)
      : undefined,
  });
  const busy = m.isPending || bulk.isPending;
  const choiceName: Record<BulkChoice, string> = {
    use_wamy: c.useWamy,
    use_office: c.useOffice,
    keep: c.keep,
  };
  function runBulk(choice: BulkChoice) {
    const ids = chosen.slice(0, MAX_BULK).map((d) => d.id);
    if (ids.length === 0) return;
    if (!window.confirm(w.bulkConfirm(ids.length, choiceName[choice]))) return;
    bulk.mutate({ ids, choice });
  }

  return (
    <section aria-labelledby="conflicts-title" onKeyDown={keys.onKeyDown}>
      <SectionHead title={c.conflictsTitle} hint={c.conflictsHint} />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        list.data?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : all.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noConflicts}</p>
      ) : (
        <>
          <FilterBar
            query={query}
            setQuery={setQuery}
            placeholder={w.search}
            inputRef={search}
            shown={items.length}
            total={all.length}
            filters={[
              {
                id: "field",
                label: w.fieldFilter,
                value: field,
                set: setField,
                all: w.allFields,
                options: fieldOptions(all, c.fields),
              },
              {
                id: "risk",
                label: w.riskFilter,
                value: risk,
                set: setRisk,
                all: w.allRisks,
                options: (["critical", "medium", "low"] as const).map((r) => ({
                  value: r,
                  label: w.risks[r]!,
                })),
              },
            ]}
          />
          {canApprove && eligible.length > 0 && (
            <div
              role="region"
              aria-label={w.bulkLabel}
              className={cn(
                CARD,
                "sticky bottom-3 z-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:static",
                chosen.length > 0 && "ring-2 ring-primary/50",
              )}
            >
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      for (const d of eligible) {
                        if (allOn) n.delete(d.id);
                        else n.add(d.id);
                      }
                      return n;
                    })
                  }
                  style={ACCENT}
                  className="size-5"
                  aria-label={w.selectAll}
                />
                <span className="font-bold tabular-nums">{w.selected(chosen.length)}</span>
              </label>
              {chosen.length > 0 && (
                <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => runBulk("use_wamy")}
                  >
                    {w.bulkWamy}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => runBulk("use_office")}
                  >
                    {w.bulkOffice}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => runBulk("keep")}
                  >
                    {w.bulkKeep}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => setPicked(new Set())}
                  >
                    {w.bulkClear}
                  </Button>
                </div>
              )}
              <p className="w-full text-xs text-muted-foreground">
                {w.bulkCriticalNote}
                {chosen.length > MAX_BULK && <> {w.bulkMax(MAX_BULK)}</>}
              </p>
            </div>
          )}
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{w.noMatch}</p>
          ) : (
            <div ref={keys.root}>
              <ul className="mt-4 space-y-3">
                {items.map((d) => {
                  const can = canApprove && bulkEligible(d);
                  const on = picked.has(d.id);
                  return (
                    <li
                      key={d.id}
                      data-row=""
                      tabIndex={0}
                      aria-label={`${c.fields[d.field] ?? d.field} · ${d.code} · ${d.name}`}
                      className={cn(
                        CARD,
                        ROW_FOCUS,
                        "p-4",
                        d.risk === "critical" && "ring-1 ring-destructive/40",
                        on && "ring-2 ring-primary",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {can && (
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(d.id)}
                            style={ACCENT}
                            className="-my-2 size-5 shrink-0 cursor-pointer p-3"
                            aria-label={w.selectOne}
                          />
                        )}
                        {d.risk === "critical" && (
                          <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                        )}
                        <span className="font-bold">{c.fields[d.field] ?? d.field}</span>
                        <Pill tone={d.risk === "critical" ? "wine" : "quiet"}>
                          {c.kinds[d.kind]}
                        </Pill>
                        <span className="text-xs text-muted-foreground">{w.risks[d.risk]}</span>
                        <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground">
                          <Val>{d.code}</Val> · <bdi dir="auto">{d.name}</bdi>
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.current}</dt>
                          <dd className="font-medium [overflow-wrap:anywhere]">
                            <V v={d.current} />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.roles.wamy}</dt>
                          <dd className="[overflow-wrap:anywhere]">
                            <V v={d.wamy} />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.roles.office}</dt>
                          <dd className="[overflow-wrap:anywhere]">
                            <V v={d.office} />
                          </dd>
                        </div>
                      </dl>
                      {d.kind === "held_locked" && (
                        <p className="mt-2 text-xs text-muted-foreground">{c.lockedHint}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canApprove &&
                          (d.kind === "disagreement" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => m.mutate({ id: d.id, choice: "use_wamy" })}
                              >
                                {c.useWamy}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => m.mutate({ id: d.id, choice: "use_office" })}
                              >
                                {c.useOffice}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="min-h-11"
                              disabled={busy}
                              onClick={() => m.mutate({ id: d.id, choice: "accept" })}
                            >
                              {c.accept}: <V v={d.proposed} />
                            </Button>
                          ))}
                        {canApprove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => m.mutate({ id: d.id, choice: "keep" })}
                          >
                            {c.keep}
                          </Button>
                        )}
                        <span className="ms-auto">
                          <OpenFile id={d.orphan_id} onOpen={onOpen} />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LinkQueue({
  country,
  canApprove,
  onOpen,
}: {
  country: string;
  canApprove: boolean;
  onOpen: (orphanId: string) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const err = useWorkErr();
  const [query, setQuery] = useState("");
  const [roleF, setRoleF] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.links", listLinkQueue);
  const list = useQuery({
    queryKey: useDataKey(["golden-links", country]),
    queryFn: () => fetchList({ data: { country } }),
  });
  const resolve = useDataFn("golden.resolveLink", resolveLink);
  const createAll = useDataFn("golden.createUnmatched", createUnmatched);
  const refresh = () => {
    for (const k of ["golden-links", "golden-conflicts", "data-health"])
      void qc.invalidateQueries({ queryKey: [...dk, k] });
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
  const everything = list.data?.ok ? list.data.data : [];
  const unmatched = everything.some((q) => q.role === "wamy" && q.candidates.length === 0);
  const items = everything.filter(
    (q) =>
      (!roleF || q.role === roleF) &&
      matchesQuery(query, q.name, q.external_ref, ...q.candidates.flatMap((o) => [o.code, o.name])),
  );
  const keys = useListKeys({
    search,
    onOpen: (i) => {
      const first = items[i]?.candidates[0];
      if (first) onOpen(first.id);
    },
  });

  return (
    <section aria-labelledby="links-title" onKeyDown={keys.onKeyDown}>
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
        list.data?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : everything.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noLinks}</p>
      ) : (
        <>
          <FilterBar
            query={query}
            setQuery={setQuery}
            placeholder={w.searchLinks}
            inputRef={search}
            shown={items.length}
            total={everything.length}
            filters={[
              {
                id: "role",
                label: c.sourceRole,
                value: roleF,
                set: setRoleF,
                all: w.allSources,
                options: (["wamy", "office"] as const).map((r) => ({
                  value: r,
                  label: c.roles[r],
                })),
              },
            ]}
          />
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{w.noMatch}</p>
          ) : (
            <div ref={keys.root}>
              <ul className="mt-4 space-y-3">
                {items.map((q) => (
                  <li
                    key={q.id}
                    data-row=""
                    tabIndex={0}
                    aria-label={`${q.name ?? q.external_ref} · ${q.external_ref}`}
                    className={cn(CARD, ROW_FOCUS, "p-4")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <bdi dir="auto" className="font-bold">
                        {q.name ?? q.external_ref}
                      </bdi>
                      <Pill tone="quiet">{c.roles[q.role]}</Pill>
                      <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground tabular-nums">
                        <Val>{q.external_ref}</Val>
                        {q.birth_date && (
                          <>
                            {" · "}
                            <Val>{q.birth_date}</Val>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {q.candidates.length ? c.candidates : c.noCandidates}
                    </p>
                    {q.candidates.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-1">
                        {q.candidates.map((o) => (
                          <li key={o.id}>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="min-h-11"
                              onClick={() => onOpen(o.id)}
                              aria-label={`${w.openFile} ${o.code}`}
                            >
                              <FolderOpen className="size-4" aria-hidden="true" />
                              <Val>{o.code}</Val>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                          <Val>{c.linkTo(o.code)}</Val>
                          <span className="text-xs text-muted-foreground">
                            {o.name}
                            {o.birth_date && (
                              <>
                                {" · "}
                                <Val>{o.birth_date}</Val>
                              </>
                            )}
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
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AlertDetail({ a }: { a: DataAlert }) {
  const c = useCopy(SOURCES_COPY);
  const d = a.detail;
  const str = (k: string) => (d[k] === undefined || d[k] === null ? null : String(d[k]));
  const from = str("from");
  const to = str("to") ?? str("back_to");
  const notes: string[] = [];
  if (typeof d["days"] === "number" && d["days"] !== 0)
    notes.push(
      (d["days"] < 0 ? c.alertOlder : c.alertYounger)((Math.abs(d["days"]) / 365.25).toFixed(1)),
    );
  if (d["crosses_adulthood"] === true) notes.push(c.alertAdult);
  if (typeof d["distance"] === "number") notes.push(c.alertDistance(d["distance"]));
  if (typeof d["files"] === "number" && typeof d["population"] === "number")
    notes.push(c.alertFiles(d["files"], d["population"]));
  if (a.hits > 1) notes.push(c.hitsPlural(a.hits));
  return (
    <div className="mt-3 space-y-2 text-sm">
      {(from !== null || to !== null) && (
        <dl className="grid max-w-md grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-3">
          <div>
            <dt className="text-xs text-muted-foreground">{c.alertFrom}</dt>
            <dd>{from !== null ? <Val>{from}</Val> : "·"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{c.alertTo}</dt>
            <dd>{to !== null ? <Val>{to}</Val> : "·"}</dd>
          </div>
        </dl>
      )}
      {str("other_code") !== null && (
        <p>
          {c.alertOther}: <Val>{str("other_code")!}</Val> · {str("other_name")}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {notes.map((n) => (
            <li key={n} className={n === c.alertAdult ? "font-bold text-destructive" : undefined}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** حسم تنبيه: «روجِع» هو الشائع، والتأكيد خطوةٌ ثانية بسببٍ مكتوب لا زرٌّ أحمر في كل بطاقة. */
function AlertActions({
  busy,
  onSettle,
}: {
  busy: boolean;
  onSettle: (status: "reviewed" | "false_positive" | "confirmed", note?: string) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (confirming)
    return (
      <form
        className="mt-3 space-y-2 rounded-xl border border-destructive/40 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) onSettle("confirmed", note.trim());
        }}
      >
        <label className="block text-sm font-bold" htmlFor="confirm-note">
          {c.confirmTitle}
        </label>
        <textarea
          id="confirm-note"
          autoFocus
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={c.confirmNote}
          className="w-full rounded-md border border-input bg-background p-2 text-base md:text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            className="min-h-11"
            disabled={busy || !note.trim()}
          >
            {c.confirmSubmit}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => setConfirming(false)}
          >
            {c.cancel}
          </Button>
        </div>
      </form>
    );
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" className="min-h-11" disabled={busy} onClick={() => onSettle("reviewed")}>
        {c.reviewed}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11"
        disabled={busy}
        onClick={() => onSettle("false_positive")}
      >
        {c.falsePositive}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="ms-auto min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {c.confirmFraud}
      </Button>
    </div>
  );
}

function Alerts({
  country,
  canApprove,
  onOpen,
}: {
  country: string;
  canApprove: boolean;
  onOpen: (orphanId: string) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const err = useWorkErr();
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [severity, setSeverity] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.alerts", listAlerts);
  const list = useQuery({
    queryKey: useDataKey(["golden-alerts", country]),
    queryFn: () => fetchList({ data: { country } }),
  });
  const resolve = useDataFn("golden.resolveAlert", resolveAlert);
  const m = useMutation({
    mutationFn: (v: {
      id: string;
      status: "reviewed" | "false_positive" | "confirmed";
      note?: string;
    }) => resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      void qc.invalidateQueries({ queryKey: [...dk, "golden-alerts"] });
      void qc.invalidateQueries({ queryKey: [...dk, "data-health"] });
    },
  });
  const all = list.data?.ok ? list.data.data : [];
  const items = all.filter(
    (a) =>
      (!field || a.field === field) &&
      (!severity || a.severity === severity) &&
      matchesQuery(query, a.code, a.name),
  );
  const keys = useListKeys({
    search,
    onOpen: (i) => {
      const id = items[i]?.orphan_id;
      if (id) onOpen(id);
    },
  });
  const fieldName = (f: string) => c.fields[f] ?? (f === "identity" ? c.groups.identity : f);

  return (
    <section aria-labelledby="alerts-title" onKeyDown={keys.onKeyDown}>
      <SectionHead title={c.alertsTitle} hint={c.alertsHint} />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        list.data?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : all.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noAlerts}</p>
      ) : (
        <>
          <FilterBar
            query={query}
            setQuery={setQuery}
            placeholder={w.search}
            inputRef={search}
            shown={items.length}
            total={all.length}
            filters={[
              {
                id: "field",
                label: w.fieldFilter,
                value: field,
                set: setField,
                all: w.allFields,
                options: [...new Set(all.map((a) => a.field))].map((f) => ({
                  value: f,
                  label: fieldName(f),
                })),
              },
              {
                id: "severity",
                label: w.severityFilter,
                value: severity,
                set: setSeverity,
                all: w.allSeverities,
                options: (["critical", "warning", "info"] as const).map((s) => ({
                  value: s,
                  label: c.severities[s],
                })),
              },
            ]}
          />
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{w.noMatch}</p>
          ) : (
            <div ref={keys.root}>
              <ul className="mt-4 space-y-3">
                {items.map((a) => (
                  <li
                    key={a.id}
                    data-row=""
                    tabIndex={0}
                    aria-label={`${c.signals[a.signal]} · ${a.code ?? c.countryWide}`}
                    className={cn(
                      CARD,
                      ROW_FOCUS,
                      "p-4",
                      a.severity === "critical" && "ring-1 ring-destructive/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {a.severity === "critical" && (
                        <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                      )}
                      <span className="font-bold">{c.signals[a.signal]}</span>
                      <Pill
                        tone={
                          a.severity === "critical"
                            ? "wine"
                            : a.severity === "warning"
                              ? "gold"
                              : "quiet"
                        }
                      >
                        {c.severities[a.severity]}
                      </Pill>
                      <span className="text-xs text-muted-foreground">
                        {fieldName(a.field)}
                        {a.role ? ` · ${c.roles[a.role]}` : ""}
                      </span>
                      <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground">
                        {a.code ? (
                          <>
                            <Val>{a.code}</Val> · <bdi dir="auto">{a.name}</bdi>
                          </>
                        ) : (
                          c.countryWide
                        )}
                      </span>
                    </div>
                    <AlertDetail a={a} />
                    {canApprove && (
                      <AlertActions
                        busy={m.isPending}
                        onSettle={(status, note) =>
                          m.mutate({ id: a.id, status, ...(note ? { note } : {}) })
                        }
                      />
                    )}
                    {a.orphan_id && (
                      <div className="mt-2 flex justify-end">
                        <OpenFile id={a.orphan_id} onOpen={onOpen} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Team({ country, access }: { country: string; access: CountryAccess }) {
  const c = useCopy(SOURCES_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.staff", listCountryStaff);
  const save = useDataFn("golden.setStaff", setCountryStaff);
  const list = useQuery({
    queryKey: useDataKey(["country-staff", country]),
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

/**
 * «ابدأ من هنا»: أوّل قرارٍ ينتظر صاحب الصفحة بحسب دوره، وما يملكه فيها، بلا بحث.
 * المشرف والإدارة: أكثر الدول بنوداً حرجة. المدخل: الرفع. المطّلع: القراءة.
 */
function StartHere({
  rows,
  access,
  onGo,
}: {
  rows: CountryHealth[];
  access: CountryAccess;
  onGo: (code: string, tab: Tab) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const role = access.admin ? "admin" : (access.countries[0]?.role ?? "viewer");
  const urgent = rows
    .map((r) => ({ r, n: r.alerts.critical + r.conflicts.critical }))
    .filter((x) => x.n > 0 && canDo(access, x.r.code, "approve"))
    .sort((a, b) => b.n - a.n)[0];
  const linking = rows.find((r) => r.link_pending > 0 && canDo(access, r.code, "approve"));
  const upload = rows.find((r) => canDo(access, r.code, "import"));
  const action = urgent
    ? {
        text: c.startUrgent(urgent.r.name_ar, urgent.n),
        code: urgent.r.code,
        tab: "alerts" as const,
      }
    : linking
      ? {
          text: c.startLinks(linking.name_ar, linking.link_pending),
          code: linking.code,
          tab: "links" as const,
        }
      : role === "data_entry" && upload
        ? { text: c.startUpload(upload.name_ar), code: upload.code, tab: "upload" as const }
        : null;
  return (
    <section
      aria-label={c.startLabel}
      className={cn(CARD, "flex flex-wrap items-center gap-x-6 gap-y-3 p-4")}
    >
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-xs font-semibold text-muted-foreground">
          {c.yourRole}: <span className="text-foreground">{c.roleNames[role]}</span>
        </p>
        <p className="mt-1 text-sm leading-7">{c.roleCan[role]}</p>
      </div>
      {action ? (
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => onGo(action.code, action.tab)}>
          {action.text}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{c.startNothing}</p>
      )}
    </section>
  );
}
