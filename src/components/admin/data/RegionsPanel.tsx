import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalize } from "@/lib/countries";
import type { RegionRow } from "@/lib/data-entry";
import { getRegions, saveRegion, seedRegions } from "@/lib/data-entry.functions";
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
  useErrorText,
  type Shared,
} from "./shared";

/**
 * مناطق الدولة كما ترسمها الخريطة — الملفّ نفسه الذي يقرؤه `fetchRegions` في
 * `src/lib/regions.ts`. يُقرأ هنا مباشرةً كي لا تُشقّ قطعةٌ مشتركة جديدة تزيد
 * وزن الصفحات العامّة.
 */
async function mapRegions(code: string): Promise<Array<{ id: string; n: string; en: string }>> {
  const res = await fetch(`/geo/admin1/${code}.json`);
  if (!res.ok) return [];
  const body = (await res.json()) as { regions: Array<{ id: string; n: string; en: string }> };
  return body.regions;
}

type Suggestion = { name_ar: string; name_local: string; geo_id: string; on: boolean };

export function RegionsPanel({ shared }: { shared: Shared }) {
  const c = useCopy(COPY);
  const t = c.regions;
  const errorText = useErrorText();
  const fetchList = useServerFn(getRegions);
  const save = useServerFn(saveRegion);
  const seed = useServerFn(seedRegions);
  const qc = useQueryClient();
  const country = shared.country;
  const list = useQuery({
    queryKey: ["data-regions", country],
    queryFn: () => fetchList({ data: { country } }),
    enabled: Boolean(country),
  });
  const [name, setName] = useState("");
  const [local, setLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [starter, setStarter] = useState<Suggestion[] | null>(null);
  const [starterBusy, setStarterBusy] = useState(false);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["data-regions", country] });
    shared.reloadCountries();
  }

  async function add(nameAr: string, nameLocal?: string) {
    setBusy(true);
    const res = await save({
      data: { country, nameAr, ...(nameLocal ? { nameLocal } : {}) },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return false;
    }
    toast.success(t.added);
    await refresh();
    return true;
  }

  async function suggest(existing: RegionRow[]) {
    setStarterBusy(true);
    const shapes = await mapRegions(country).catch(() => []);
    setStarterBusy(false);
    const known = new Set(existing.map((r) => normalize(r.name_ar)));
    setStarter(
      shapes
        .filter((s) => s.n && !known.has(normalize(s.n)))
        .map((s) => ({
          name_ar: s.n,
          name_local: s.en === s.n ? "" : s.en,
          geo_id: s.id,
          on: true,
        }))
        .sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")),
    );
  }

  const result = list.data;
  const view = result?.ok ? result.data : null;
  const chosen = starter?.filter((s) => s.on && s.name_ar.trim()) ?? [];

  return (
    <div className="space-y-6">
      <SectionHead title={t.heading} hint={t.hint} />
      <div className="max-w-xs">
        <label htmlFor="regions-country" className="mb-1.5 block text-sm font-semibold">
          {c.country}
        </label>
        <CountrySelect
          id="regions-country"
          value={country}
          countries={shared.countries}
          onChange={(code) => {
            shared.setCountry(code);
            setStarter(null);
            setEditing(null);
          }}
        />
      </div>

      {!country ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t.pickFirst}
        </p>
      ) : list.isPending ? (
        <Busy />
      ) : !result || !result.ok ? (
        result?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : (
        view && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums">
                {t.count(view.regions.filter((r) => r.active).length)}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={starterBusy}
                onClick={() => void suggest(view.regions)}
              >
                {starterBusy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
                {t.starterButton}
              </Button>
            </div>

            {starter && (
              <div className={cn(CARD, "map-rise p-5")} role="region" aria-label={t.starterTitle}>
                <h4 className="font-bold">{t.starterTitle}</h4>
                {starter.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t.starterNone}</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">{t.starterLead}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setStarter(starter.map((s) => ({ ...s, on: true })))}
                      >
                        {t.starterAll}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setStarter(starter.map((s) => ({ ...s, on: false })))}
                      >
                        {t.starterNoneBtn}
                      </Button>
                    </div>
                    <ul className="mt-3 grid max-h-96 gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
                      {starter.map((s, i) => (
                        <li key={s.geo_id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            style={ACCENT}
                            className="size-5 shrink-0"
                            checked={s.on}
                            aria-label={s.name_ar}
                            onChange={(e) =>
                              setStarter(
                                starter.map((x, j) =>
                                  j === i ? { ...x, on: e.target.checked } : x,
                                ),
                              )
                            }
                          />
                          <Input
                            value={s.name_ar}
                            aria-label={`${t.name}: ${s.name_local || s.name_ar}`}
                            maxLength={120}
                            onChange={(e) =>
                              setStarter(
                                starter.map((x, j) =>
                                  j === i ? { ...x, name_ar: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          {s.name_local && (
                            <bdi
                              dir="ltr"
                              className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground sm:block"
                            >
                              {s.name_local}
                            </bdi>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {chosen.length > 0 && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        const res = await seed({
                          data: {
                            country,
                            rows: chosen.map((s) => ({
                              name_ar: s.name_ar.trim(),
                              ...(s.name_local ? { name_local: s.name_local } : {}),
                              geo_id: s.geo_id,
                            })),
                          },
                        });
                        setBusy(false);
                        if (!res.ok) {
                          toast.error(errorText(res.error));
                          return;
                        }
                        toast.success(t.starterDone(res.data.added));
                        setStarter(null);
                        await refresh();
                      }}
                    >
                      {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                      {t.starterAccept(chosen.length)}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={() => setStarter(null)}>
                    {c.close}
                  </Button>
                </div>
              </div>
            )}

            {view.regions.length === 0 ? (
              <EmptyState title={t.empty} text={t.emptyText} />
            ) : (
              <ul className={cn(CARD, "divide-y divide-border")}>
                {view.regions.map((r) => (
                  <li key={r.id} className="p-3">
                    {editing === r.id ? (
                      <RenameRegion
                        region={r}
                        country={country}
                        onDone={async () => {
                          setEditing(null);
                          await refresh();
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate font-semibold",
                              !r.active && "text-muted-foreground",
                            )}
                          >
                            {r.name_ar}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.name_local ? <bdi dir="ltr">{r.name_local}</bdi> : null}
                            {r.name_local ? " · " : ""}
                            {t.children(r.children)}
                          </p>
                        </div>
                        {!r.active && <Pill tone="quiet">{t.inactive}</Pill>}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(r.id)}
                        >
                          <Pencil aria-hidden="true" />
                          {t.rename}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          title={t.deactivateHint}
                          onClick={async () => {
                            setBusy(true);
                            const res = await save({
                              data: {
                                id: r.id,
                                country,
                                nameAr: r.name_ar,
                                ...(r.name_local ? { nameLocal: r.name_local } : {}),
                                active: !r.active,
                              },
                            });
                            setBusy(false);
                            if (!res.ok) toast.error(errorText(res.error));
                            else {
                              toast.success(c.saved);
                              await refresh();
                            }
                          }}
                        >
                          {r.active ? t.deactivate : t.activate}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form
              className={cn(CARD, "grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] items-end")}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim()) return;
                if (await add(name.trim(), local.trim() || undefined)) {
                  setName("");
                  setLocal("");
                }
              }}
            >
              <Field label={t.name} htmlFor="region-new">
                <Input
                  id="region-new"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.addPlaceholder}
                  maxLength={120}
                />
              </Field>
              <Field label={t.nameLocal} htmlFor="region-new-local">
                <Input
                  id="region-new-local"
                  dir="auto"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  placeholder={t.addLocalPlaceholder}
                  maxLength={120}
                />
              </Field>
              <Button type="submit" disabled={busy || !name.trim()}>
                <Plus aria-hidden="true" />
                {c.add}
              </Button>
            </form>

            {view.unmatched.length > 0 && (
              <div className="rounded-2xl border border-bridge/40 bg-bridge/10 p-4">
                <h4 className="font-bold text-bridge-ink">{t.unmatchedTitle}</h4>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{t.unmatchedText}</p>
                <ul className="mt-3 space-y-2">
                  {view.unmatched.map((u) => (
                    <li key={u.name} className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1 text-sm">
                        <bdi className="font-semibold">{u.name}</bdi>{" "}
                        <span className="text-muted-foreground">· {t.children(u.children)}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void add(u.name)}
                      >
                        {t.unmatchedAdd}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

function RenameRegion({
  region,
  country,
  onDone,
  onCancel,
}: {
  region: RegionRow;
  country: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const c = useCopy(COPY);
  const t = c.regions;
  const errorText = useErrorText();
  const save = useServerFn(saveRegion);
  const [name, setName] = useState(region.name_ar);
  const [local, setLocal] = useState(region.name_local ?? "");
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);
  const renamed = name.trim() !== region.name_ar;

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        const res = await save({
          data: {
            id: region.id,
            country,
            nameAr: name.trim(),
            ...(local.trim() ? { nameLocal: local.trim() } : {}),
            active: region.active,
            cascade: renamed && cascade,
          },
        });
        setBusy(false);
        if (!res.ok) {
          toast.error(errorText(res.error));
          return;
        }
        toast.success(
          renamed && region.children > 0
            ? t.renamed(res.data.children_renamed ?? 0, res.data.children_left ?? 0)
            : c.saved,
        );
        await onDone();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.name} htmlFor={`rn-${region.id}`}>
          <Input
            id={`rn-${region.id}`}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <Field label={t.nameLocal} htmlFor={`rl-${region.id}`}>
          <Input
            id={`rl-${region.id}`}
            dir="auto"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            maxLength={120}
          />
        </Field>
      </div>
      {renamed && region.children > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            style={ACCENT}
            className="mt-0.5 size-5 shrink-0"
            checked={cascade}
            onChange={(e) => setCascade(e.target.checked)}
          />
          <span>
            {t.renameCascade(region.children)}
            <span className="block text-xs text-muted-foreground">{t.renameCascadeHint}</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {c.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {c.cancel}
        </Button>
      </div>
    </form>
  );
}
