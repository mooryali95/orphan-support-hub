import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Upload as UploadIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import {
  goldenTemplate,
  readGoldenSheet,
  rowIssues,
  type CountryHealth,
  type GoldenSheet,
  type SourceRole,
} from "@/lib/golden-record";
import { importGolden } from "@/lib/golden-record.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { ACCENT, CARD } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { WORK_COPY } from "../work-copy";
import { useWorkErr } from "../WorkTools";
import { Step } from "./shared";

export function UploadCard({ row }: { row: CountryHealth }) {
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
      for (const k of [
        "data-health",
        "golden-conflicts",
        "golden-links",
        "golden-alerts",
        "queue-counts",
      ])
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
