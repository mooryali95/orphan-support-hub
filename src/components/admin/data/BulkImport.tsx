import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Loader2, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toCsv } from "@/lib/csv";
import {
  checkPerson,
  duplicatesInFile,
  matchCountry,
  MAX_IMPORT_ROWS,
  PERSON_FIELDS,
  readSheet,
  templateCsv,
  type CheckedRow,
  type GroupRow,
  type ParsedSheet,
  type RegionRow,
} from "@/lib/data-entry";
import {
  getGroups,
  getRegions,
  importPersons,
  type ImportResult,
} from "@/lib/data-entry.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import { ACCENT } from "./shared";
import { CARD, NeedsUpdate, Pill, SectionHead, useErrorText, type Shared } from "./shared";

type Loaded = {
  sheet: ParsedSheet;
  rows: CheckedRow[];
  inFile: Map<number, number>;
};
type ServerRow = ImportResult["results"][number];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * رفع دفعة: يُقرأ الجدول ويُفحص كلّ صفٍّ هنا، ثم يُفحص على الخادم بلا حفظ (هناك
 * يُكشف التكرار مع الملفّات القائمة)، ثم يُحفظ ما هو جاهز وحده.
 */
export function BulkImport({ shared }: { shared: Shared }) {
  const c = useCopy(COPY);
  const t = c.bulk;
  const p = c.persons;
  const errorText = useErrorText();
  const fetchRegions = useServerFn(getRegions);
  const fetchGroups = useServerFn(getGroups);
  const send = useServerFn(importPersons);

  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<"read" | "check" | "commit" | null>(null);
  const [server, setServer] = useState<Map<number, ServerRow> | null>(null);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<Map<number, ServerRow> | null>(null);

  function reset() {
    setLoaded(null);
    setServer(null);
    setDone(null);
    setConfirmed(new Set());
    setProblem(null);
  }

  async function read(input: string) {
    reset();
    const sheet = readSheet(input);
    if (sheet.rows.length === 0) return setProblem(t.emptySheet);
    if (sheet.missing.length > 0)
      return setProblem(
        t.missingColumns(sheet.missing.map((f) => t.fieldNames[f]).join(c.listJoin)),
      );
    if (sheet.rows.length > MAX_IMPORT_ROWS) return setProblem(t.tooMany(MAX_IMPORT_ROWS));

    setBusy("read");
    // الدولة أوّلاً: تُعرف دول الملفّ، ثم تُحمَّل مناطق كلٍّ منها ليُطابَق عليها.
    const codes = [
      ...new Set(
        sheet.rows
          .map((r) => matchCountry(r.country, shared.countries))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const [groupsRes, ...regionRes] = await Promise.all([
      fetchGroups({ data: {} }),
      ...codes.map((country) => fetchRegions({ data: { country } })),
    ]);
    setBusy(null);
    if ((!groupsRes.ok && groupsRes.missing) || regionRes.some((r) => !r.ok && r.missing))
      return setMissing(true);

    const regionsByCountry = new Map<string, RegionRow[]>();
    regionRes.forEach((r, i) => {
      if (r.ok) regionsByCountry.set(codes[i]!, r.data.regions);
    });
    const groups: GroupRow[] = groupsRes.ok ? groupsRes.data : [];
    const ctx = {
      countries: shared.countries,
      regionsByCountry,
      groups,
      today: new Date().toISOString().slice(0, 10),
    };
    const rows = sheet.rows.map((r) => checkPerson(r, ctx));
    setLoaded({ sheet, rows, inFile: duplicatesInFile(rows) });
  }

  const eligible = useMemo(() => {
    if (!loaded) return [] as number[];
    return loaded.rows.flatMap((r, i) => {
      if (!r.payload) return [];
      const s = server?.get(i);
      const dup = loaded.inFile.has(i) || s?.code === "possible_duplicate";
      if (dup && !confirmed.has(i)) return [];
      if (s && !s.ok && s.code !== "possible_duplicate") return [];
      return [i];
    });
  }, [loaded, server, confirmed]);

  async function run(dryRun: boolean) {
    if (!loaded) return;
    const indexes = dryRun ? loaded.rows.flatMap((r, i) => (r.payload ? [i] : [])) : eligible;
    if (indexes.length === 0) return;
    setBusy(dryRun ? "check" : "commit");
    const res = await send({
      data: {
        dryRun,
        rows: indexes.map((i) => ({
          ...loaded.rows[i]!.payload!,
          ...(!dryRun && confirmed.has(i) ? { confirm_duplicate: true } : {}),
        })),
      },
    });
    setBusy(null);
    if (!res.ok) {
      if (res.missing) setMissing(true);
      else toast.error(errorText(res.error));
      return;
    }
    const map = new Map<number, ServerRow>();
    res.data.results.forEach((r, k) => map.set(indexes[k]!, r));
    if (dryRun) {
      setServer(map);
      toast.success(t.dryRunDone);
    } else {
      setDone(map);
      shared.reloadCountries();
    }
  }

  if (missing) {
    return (
      <div className="space-y-6">
        <SectionHead title={t.heading} hint={t.hint} />
        <NeedsUpdate />
      </div>
    );
  }

  const sample = shared.countries.find((x) => x.code === shared.country) ?? shared.countries[0];
  const counts = loaded
    ? loaded.rows.reduce(
        (n, r, i) => {
          const s = server?.get(i);
          if (!r.payload || (s && !s.ok && s.code !== "possible_duplicate")) n.invalid += 1;
          else if (loaded.inFile.has(i) || s?.code === "possible_duplicate") n.dup += 1;
          else n.ready += 1;
          return n;
        },
        { ready: 0, invalid: 0, dup: 0 },
      )
    : null;
  const written = done ? [...done.values()].filter((r) => r.ok).length : 0;

  return (
    <div className="space-y-6">
      <SectionHead
        title={t.heading}
        hint={t.hint}
        action={
          <Button
            type="button"
            variant="outline"
            title={t.templateHint}
            onClick={() =>
              download(
                "persons-template.csv",
                templateCsv({
                  name: t.sampleName,
                  gender: p.male,
                  country: sample?.name_ar ?? "",
                  region: "",
                }),
              )
            }
          >
            <Download aria-hidden="true" />
            {t.template}
          </Button>
        }
      />

      {!loaded && (
        <div className={cn(CARD, "space-y-4 p-5")}>
          <div>
            <label htmlFor="bulk-paste" className="mb-1.5 block text-sm font-semibold">
              {t.paste}
            </label>
            <Textarea
              id="bulk-paste"
              rows={7}
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t.templateHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!text.trim() || busy !== null}
              onClick={() => void read(text)}
            >
              {busy === "read" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ScanSearch aria-hidden="true" />
              )}
              {t.read}
            </Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-4 text-sm font-bold hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <FileUp className="size-4" aria-hidden="true" />
              {t.upload}
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const body = await file.text();
                  setText(body);
                  await read(body);
                }}
              />
            </label>
          </div>
          {problem && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {problem}
            </p>
          )}
          <p className="text-xs leading-6 text-muted-foreground">{t.whyNotPartner}</p>
        </div>
      )}

      {loaded && counts && (
        <>
          {loaded.sheet.ignored.length > 0 && (
            <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
              {t.ignoredColumns(loaded.sheet.ignored.join(c.listJoin))}
            </p>
          )}

          {done ? (
            <div role="status" className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="font-bold">{t.done(written, loaded.rows.length - written)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.doneHint}</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums" role="status">
                {t.summary(counts.ready, counts.invalid, counts.dup)}
              </p>
              {!server && <p className="text-xs text-bridge-ink">{t.dryRunFirst}</p>}
            </div>
          )}

          <div className={cn(CARD, "overflow-x-auto")}>
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">{t.previewTitle}</caption>
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t.rowNo}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t.fieldNames.display_name}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t.fieldNames.country}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t.fieldNames.region}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t.state}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loaded.rows.map((r, i) => {
                  const raw = loaded.sheet.rows[i]!;
                  const s = done?.get(i) ?? server?.get(i);
                  const errors = [
                    ...r.errors,
                    ...(s && !s.ok && s.code !== "possible_duplicate" ? s.errors : []),
                  ];
                  const inFile = loaded.inFile.get(i);
                  const dbDups = s?.code === "possible_duplicate" ? s.duplicates : [];
                  const isDup = inFile !== undefined || dbDups.length > 0;
                  const saved = Boolean(done?.get(i)?.ok);
                  const warnings = [...r.warnings, ...(s?.warnings ?? [])];
                  return (
                    <tr key={i} className={cn(errors.length > 0 && "bg-destructive/5")}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 2}</td>
                      <td className="px-3 py-2 font-medium">
                        <bdi>{raw.display_name ?? c.none}</bdi>
                      </td>
                      <td className="px-3 py-2">
                        {r.countryCode ? (
                          <>
                            {shared.countries.find((x) => x.code === r.countryCode)?.name_ar}{" "}
                            <bdi dir="ltr" className="text-xs text-muted-foreground">
                              {r.countryCode}
                            </bdi>
                          </>
                        ) : (
                          <bdi className="text-destructive">{raw.country ?? c.none}</bdi>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {s?.region ?? r.region ?? (
                          <bdi className={cn(raw.region && "text-destructive")}>
                            {raw.region ?? c.none}
                          </bdi>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {done ? (
                            <Pill tone={saved ? "wine" : "quiet"}>
                              {saved ? `${t.written} ${done.get(i)?.code ?? ""}` : t.skipped}
                            </Pill>
                          ) : errors.length > 0 ? (
                            <Pill tone="quiet">{t.invalid}</Pill>
                          ) : isDup ? (
                            <Pill tone="gold">{t.duplicate}</Pill>
                          ) : (
                            <Pill tone="wine">{t.ready}</Pill>
                          )}
                          {[...new Set(warnings)].map((w) => (
                            <Pill key={w} tone="quiet">
                              {(p.rowWarnings as Record<string, string>)[w] ?? w}
                            </Pill>
                          ))}
                        </div>
                        {errors.length > 0 && (
                          <ul className="mt-1 space-y-1 text-xs text-destructive">
                            {[...new Set(errors)].map((e) => (
                              <li key={e}>{(p.rowErrors as Record<string, string>)[e] ?? e}</li>
                            ))}
                          </ul>
                        )}
                        {errors.length === 0 && isDup && !saved && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {inFile !== undefined && <p>{t.inFile(inFile + 2)}</p>}
                            {dbDups.map((d) => (
                              <p key={d.id}>{t.matches(d.code, d.name)}</p>
                            ))}
                            {!done && (
                              <label className="mt-1 flex min-h-9 cursor-pointer items-center gap-2 text-foreground">
                                <input
                                  type="checkbox"
                                  style={ACCENT}
                                  className="size-5"
                                  checked={confirmed.has(i)}
                                  onChange={(e) => {
                                    const next = new Set(confirmed);
                                    if (e.target.checked) next.add(i);
                                    else next.delete(i);
                                    setConfirmed(next);
                                  }}
                                />
                                {t.importAnyway}
                              </label>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!done && (
              <>
                <Button
                  type="button"
                  variant={server ? "outline" : "default"}
                  disabled={busy !== null || loaded.rows.every((r) => !r.payload)}
                  onClick={() => void run(true)}
                >
                  {busy === "check" && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {busy === "check" ? t.dryRunning : t.dryRun}
                </Button>
                <Button
                  type="button"
                  disabled={!server || busy !== null || eligible.length === 0}
                  onClick={() => void run(false)}
                >
                  {busy === "commit" && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {busy === "commit" ? t.committing : t.commit(eligible.length)}
                </Button>
              </>
            )}
            {done && written < loaded.rows.length && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  download(
                    "persons-not-saved.csv",
                    toCsv(
                      loaded.sheet.rows.flatMap((raw, i) =>
                        done.get(i)?.ok
                          ? []
                          : [
                              Object.fromEntries([
                                ...PERSON_FIELDS.map((f) => [t.fieldNames[f], raw[f] ?? ""]),
                                [
                                  t.state,
                                  [...loaded.rows[i]!.errors, ...(done.get(i)?.errors ?? [])]
                                    .map((e) => (p.rowErrors as Record<string, string>)[e] ?? e)
                                    .join(c.listJoin) || t.duplicate,
                                ],
                              ]),
                            ],
                      ),
                    ),
                  )
                }
              >
                <Download aria-hidden="true" />
                {t.downloadRejected}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                setText("");
              }}
            >
              {t.clear}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
