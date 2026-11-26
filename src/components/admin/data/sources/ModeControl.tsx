import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import { authorityNow, type CountryHealth, type OfficeMode } from "@/lib/golden-record";
import { setCountrySource } from "@/lib/golden-record.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { ACCENT, CARD, Field, SELECT } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { useErr } from "./shared";

const MODES: OfficeMode[] = ["none", "shadow", "active"];

export function ModeControl({ row }: { row: CountryHealth }) {
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

export function Matrix({ mode }: { mode: OfficeMode }) {
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
