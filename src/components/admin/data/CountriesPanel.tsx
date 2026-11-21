import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GitCompareArrows, Loader2, MapPin, Plus, UserPlus } from "lucide-react";

import { CountryPicker } from "@/components/geo/CountryPicker";
import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countryName, flagOf, normalize } from "@/lib/countries";
import { networkDiffSize, type CountryRow, type NetworkDiff } from "@/lib/data-entry";
import {
  applyNetworkSync,
  previewNetworkSync,
  saveCountry,
  type NetworkPreview,
} from "@/lib/data-entry.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import {
  ACCENT,
  CARD,
  Field,
  NeedsUpdate,
  Pill,
  SectionHead,
  SELECT,
  useErrorText,
  type Shared,
} from "./shared";

type Filter = "all" | "network" | "active" | "empty";
const CURRENCIES = ["USD", "EUR", "SAR", "GBP", "TRY"] as const;

export function CountriesPanel({ shared, unlinked }: { shared: Shared; unlinked: number | null }) {
  const c = useCopy(COPY);
  const t = c.countries;
  const errorText = useErrorText();
  const save = useServerFn(saveCountry);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const rows = shared.countries;

  const visible = useMemo(() => {
    const key = normalize(q);
    return rows.filter((r) => {
      if (filter === "network" && !r.in_network) return false;
      if (filter === "active" && r.status !== "active") return false;
      if (filter === "empty" && r.regions !== 0) return false;
      if (!key) return true;
      return [r.code, r.name_ar, r.name_local ?? ""].some((v) => normalize(v).includes(key));
    });
  }, [rows, q, filter]);

  async function patch(
    code: string,
    change: {
      create: false;
      code: string;
      status?: "planned" | "active" | "paused";
      currency?: string;
      inNetwork?: boolean;
    },
  ) {
    setBusy(code);
    const res = await save({ data: change });
    setBusy(null);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return false;
    }
    toast.success(c.saved);
    shared.reloadCountries();
    return true;
  }

  const total = (pick: (r: CountryRow) => number | null) =>
    rows.some((r) => pick(r) === null) ? null : rows.reduce((n, r) => n + (pick(r) ?? 0), 0);
  const children = total((r) => r.children);
  const hasCounts = rows.every((r) => r.regions !== null);
  const filters: Array<[Filter, string]> = [
    ["all", t.filterAll],
    ["network", t.filterNetwork],
    ["active", t.filterActive],
    ...(hasCounts ? ([["empty", t.filterEmpty]] as Array<[Filter, string]>) : []),
  ];

  return (
    <div className="space-y-6">
      <SectionHead
        title={t.heading}
        hint={t.hint}
        action={
          <Button
            type="button"
            variant="outline"
            aria-expanded={syncOpen}
            onClick={() => setSyncOpen((v) => !v)}
          >
            <GitCompareArrows aria-hidden="true" />
            {t.syncButton}
          </Button>
        }
      />

      {syncOpen && (
        <NetworkSync
          onClose={() => setSyncOpen(false)}
          onApplied={() => {
            shared.reloadCountries();
            setSyncOpen(false);
          }}
        />
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [rows.length, t.statCountries],
            [rows.filter((r) => r.in_network).length, t.statNetwork],
            [rows.filter((r) => r.status === "active").length, t.statActive],
            [children, t.statChildren],
          ] as const
        ).map(([n, label]) => (
          <div key={label} className={cn(CARD, "px-4 py-3")}>
            <dd className="text-2xl font-extrabold tabular-nums text-primary">{n ?? c.none}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      {unlinked !== null && unlinked > 0 && (
        <p className="rounded-xl bg-bridge/10 p-3 text-sm leading-7 text-bridge-ink">
          {t.unlinked(unlinked)} <span className="text-muted-foreground">{t.unlinkedHint}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.status}>
          {filters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
                filter === key
                  ? "border-primary bg-primary/10 font-bold text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t.empty} text={t.emptyText} />
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t.noMatch}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((r) => {
            const emergency = r.status === "emergency";
            const working = busy === r.code;
            return (
              <li key={r.code} className={cn(CARD, "p-4")}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {flagOf(r.code)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.name_ar}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <bdi dir="ltr">{r.code}</bdi>
                      {r.name_local ? (
                        <>
                          {" "}
                          · <bdi>{r.name_local}</bdi>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {working && (
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`st-${r.code}`}
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      {t.status}
                    </label>
                    {emergency ? (
                      <p className="text-sm font-semibold text-destructive" title={t.emergencyHint}>
                        {t.statusLabels.emergency}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t.emergencyHint}
                        </span>
                      </p>
                    ) : (
                      <select
                        id={`st-${r.code}`}
                        className={SELECT}
                        disabled={working}
                        value={r.status}
                        onChange={(e) => {
                          const status = e.target.value as "planned" | "active" | "paused";
                          if (status === "active") setConfirm(r.code);
                          else void patch(r.code, { create: false, code: r.code, status });
                        }}
                      >
                        {(["planned", "active", "paused"] as const).map((s) => (
                          <option key={s} value={s}>
                            {t.statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor={`cu-${r.code}`}
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      {t.currency}
                    </label>
                    <select
                      id={`cu-${r.code}`}
                      className={SELECT}
                      disabled={working}
                      value={r.currency ?? ""}
                      onChange={(e) =>
                        e.target.value &&
                        void patch(r.code, {
                          create: false,
                          code: r.code,
                          currency: e.target.value,
                        })
                      }
                    >
                      {!r.currency && (
                        <option value="">
                          {t.currencyDefault(shared.platformCurrency ?? c.none)}
                        </option>
                      )}
                      {[...new Set([...(r.currency ? [r.currency] : []), ...CURRENCIES])].map(
                        (x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2">
                  <label htmlFor={`nw-${r.code}`} className="min-w-0 text-sm">
                    <span className="font-semibold">{t.inNetwork}</span>
                    <span className="block text-xs text-muted-foreground">{t.inNetworkHint}</span>
                  </label>
                  <input
                    id={`nw-${r.code}`}
                    type="checkbox"
                    style={ACCENT}
                    className="size-5 shrink-0"
                    checked={r.in_network}
                    disabled={working}
                    onChange={(e) =>
                      void patch(r.code, {
                        create: false,
                        code: r.code,
                        inNetwork: e.target.checked,
                      })
                    }
                  />
                </div>

                {confirm === r.code && (
                  <div
                    role="alertdialog"
                    aria-labelledby={`cf-${r.code}`}
                    className="map-rise mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
                  >
                    <p id={`cf-${r.code}`} className="text-sm font-bold">
                      {t.activateTitle(r.name_ar)}
                    </p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">{t.activateText}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={working}
                        onClick={async () => {
                          await patch(r.code, { create: false, code: r.code, status: "active" });
                          setConfirm(null);
                        }}
                      >
                        {t.activateConfirm}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirm(null)}
                      >
                        {c.cancel}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {r.regions !== null && (
                    <Pill tone={r.regions === 0 ? "gold" : "quiet"}>
                      {t.regions}: <span className="ms-1 tabular-nums">{r.regions}</span>
                    </Pill>
                  )}
                  {r.children !== null && (
                    <Pill tone="quiet">
                      {t.children}: <span className="ms-1 tabular-nums">{r.children}</span>
                      {r.published ? (
                        <span className="ms-1">· {t.published(r.published)}</span>
                      ) : null}
                    </Pill>
                  )}
                  {r.groups !== null && (
                    <Pill tone="quiet">
                      {t.groups}: <span className="ms-1 tabular-nums">{r.groups}</span>
                    </Pill>
                  )}
                  {r.sources !== null &&
                    (r.sources.length === 0 ? (
                      <Pill tone="quiet">{t.noSource}</Pill>
                    ) : (
                      r.sources.map((s) => (
                        <Pill key={s.key} tone="wine">
                          {s.name}
                        </Pill>
                      ))
                    ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => shared.go("regions", r.code)}
                  >
                    <MapPin aria-hidden="true" />
                    {t.manageRegions}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => shared.go("persons", r.code)}
                  >
                    <UserPlus aria-hidden="true" />
                    {t.addPerson}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddCountry shared={shared} />
    </div>
  );
}

function AddCountry({ shared }: { shared: Shared }) {
  const c = useCopy(COPY);
  const t = c.countries;
  const errorText = useErrorText();
  const save = useServerFn(saveCountry);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const exists = shared.countries.some((x) => x.code === code);

  return (
    <form
      className={cn(CARD, "p-5")}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code || nameAr.trim().length < 2) return;
        setBusy(true);
        const res = await save({
          data: {
            create: true,
            code,
            nameAr: nameAr.trim(),
            nameLocal: nameLocal.trim(),
            ...(currency ? { currency } : {}),
          },
        });
        setBusy(false);
        if (!res.ok) {
          toast.error(errorText(res.error));
          return;
        }
        toast.success(t.added(nameAr.trim()));
        setCode("");
        setNameAr("");
        setNameLocal("");
        shared.reloadCountries();
      }}
    >
      <h4 className="font-bold">{t.addTitle}</h4>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">{t.addHint}</p>
      <div className="mt-4 max-w-xs">
        <CountryPicker
          value={code}
          allLabel={null}
          placeholder={t.addPick}
          onChange={(next) => {
            setCode(next);
            setNameAr(next ? countryName(next, "ar") : "");
            setNameLocal(next ? countryName(next, "en") : "");
            setCurrency("");
          }}
        />
      </div>
      {code && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label={t.nameAr}
            htmlFor="add-name-ar"
            error={exists ? c.errors.country_exists : undefined}
          >
            <Input
              id="add-name-ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
          <Field label={t.nameLocal} htmlFor="add-name-local">
            <Input
              id="add-name-local"
              dir="auto"
              value={nameLocal}
              onChange={(e) => setNameLocal(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label={t.currency} htmlFor="add-currency">
            <select
              id="add-currency"
              className={SELECT}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="">{t.currencyAuto}</option>
              {CURRENCIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <Button
        type="submit"
        className="mt-4"
        disabled={busy || !code || exists || nameAr.trim().length < 2}
      >
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        {t.addSubmit}
      </Button>
    </form>
  );
}

/** مطابقة `in_network` مع ملفّ الشبكة: الفرق يُعرض أوّلاً، ولا يُكتب إلا ما رآه المدير. */
function NetworkSync({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const c = useCopy(COPY);
  const t = c.countries;
  const errorText = useErrorText();
  const preview = useServerFn(previewNetworkSync);
  const apply = useServerFn(applyNetworkSync);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "missing" }
    | { kind: "error"; code: string }
    | { kind: "ready"; data: NetworkPreview }
  >({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void preview().then((res) => {
      if (!live) return;
      if (res.ok) setState({ kind: "ready", data: res.data });
      else setState(res.missing ? { kind: "missing" } : { kind: "error", code: res.error });
    });
    return () => {
      live = false;
    };
  }, [preview]);

  const groups = (d: NetworkDiff) =>
    [
      [t.syncAdd, d.add],
      [t.syncEnable, d.enable],
      [t.syncDisable, d.disable],
    ] as const;

  return (
    <div className={cn(CARD, "map-rise p-5")} role="region" aria-label={t.syncTitle}>
      <h4 className="font-bold">{t.syncTitle}</h4>
      {state.kind === "loading" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.syncLoading}
        </p>
      )}
      {state.kind === "missing" && <NeedsUpdate className="mt-3" />}
      {state.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorText(state.code)}
        </p>
      )}
      {state.kind === "ready" && (
        <>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            {t.syncLead(state.data.total)}
          </p>
          {networkDiffSize(state.data.diff) === 0 ? (
            <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm">{t.syncNone}</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {groups(state.data.diff).map(([label, list]) => (
                <div key={label}>
                  <p className="text-sm font-semibold">
                    {label}{" "}
                    <span className="tabular-nums text-muted-foreground">({list.length})</span>
                  </p>
                  {list.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{c.none}</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {list.map((x) => (
                        <li key={x.code} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                          {flagOf(x.code)} {x.nameAr}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t.syncWhere}</p>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {state.kind === "ready" && networkDiffSize(state.data.diff) > 0 && (
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              const d = state.data.diff;
              setBusy(true);
              const res = await apply({
                data: {
                  add: d.add.map((x) => x.code),
                  enable: d.enable.map((x) => x.code),
                  disable: d.disable.map((x) => x.code),
                },
              });
              setBusy(false);
              if (res.ok) {
                toast.success(t.syncApplied);
                onApplied();
                return;
              }
              toast.error(errorText(res.error));
              if ("diff" in res && res.diff)
                setState({ kind: "ready", data: { diff: res.diff, total: state.data.total } });
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t.syncApply(networkDiffSize(state.data.diff))}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          {c.close}
        </Button>
      </div>
    </div>
  );
}
