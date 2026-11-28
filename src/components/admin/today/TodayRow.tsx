import { FourEyesNote } from "@/components/admin/FourEyesNote";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Circle, Clock, Lock } from "lucide-react";

import { SELECT } from "@/components/admin/data/shared";
import { ROW_FOCUS } from "@/components/admin/data/WorkTools";
import { Button } from "@/components/ui/button";
import { countryName, flagOf } from "@/lib/countries";
import { useDemo } from "@/lib/demo-mode";
import { useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { TODAY_COPY } from "./copy";

import { isOverdue, type QueueItem } from "./queue";

/* صفّ «اليوم» ومرشّحه: مفصولان عن الطابور كي يبقى كلّ ملفٍّ مقروءاً. */
const DAY = 86_400_000;

/** الحسم المباشر لبندٍ: التنبيه «روجِع»، والتغيير الحرج «اعتمد المقترح». غيره يحتاج اختياراً. */
export const directSettle = (it: QueueItem) =>
  it.source === "alert" || (it.source === "conflict" && it.conflict?.kind !== "disagreement");

export function Select({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs font-bold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(SELECT, "min-h-11")}
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Row({
  it,
  idx,
  active,
  now,
  busy,
  onFocus,
  onOpen,
  onSettle,
}: {
  it: QueueItem;
  idx: number;
  active: boolean;
  now: number;
  busy: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onSettle: () => void;
}) {
  const t = useCopy(TODAY_COPY);
  const locale = useLocale();
  const demo = useDemo();
  const days = Math.max(0, Math.floor((now - Date.parse(it.created_at)) / DAY));
  const late = it.can_settle && isOverdue(it, now);
  const country = it.country_code ? countryName(it.country_code, locale) : null;
  return (
    <li
      data-row=""
      data-idx={idx}
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        onOpen();
      }}
      aria-label={`${t.kinds[it.kind]} · ${it.title}`}
      className={cn(
        "border-border bg-card hover:bg-secondary/30 cursor-pointer rounded-2xl border p-4 transition-colors",
        ROW_FOCUS,
        it.severity === "critical" && "ring-destructive/40 ring-1",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="bg-secondary text-foreground rounded-full px-2.5 py-0.5 text-xs font-bold">
          {t.kinds[it.kind]}
        </span>
        {/* الشدّة كلمةٌ وأيقونة في كلّ صفّ، لا لونٌ وحده */}
        {it.severity === "critical" ? (
          <span className="text-destructive inline-flex items-center gap-1 text-xs font-bold">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t.critical}
          </span>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-bold">
            <Circle className="size-3" aria-hidden="true" />
            {t.normal}
          </span>
        )}
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate font-bold">
            {it.title ? <bdi dir="ltr">{it.title}</bdi> : t.countryWide}
          </span>
          {it.subtitle && (
            <span className="text-muted-foreground block truncate text-xs">
              <bdi dir="auto">{it.subtitle}</bdi>
            </span>
          )}
        </span>
        <span className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
          {country && (
            <span>
              <span aria-hidden="true">{flagOf(it.country_code!)}</span> {country}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              late && "text-destructive font-bold",
            )}
          >
            <Clock className="size-3.5" aria-hidden="true" />
            {days === 0 ? t.waitedToday : t.waited(days)}
          </span>
        </span>
      </div>
      {!it.can_settle ? (
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {/* العينان الأربع والعامل الثاني: الزرّ ظاهرٌ معطّلٌ بسببه، لا مخفيّ */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            tabIndex={-1}
            className="min-h-11 cursor-not-allowed opacity-60"
            aria-disabled="true"
            aria-describedby={`why-${it.key}`}
            aria-label={`${it.source === "alert" ? t.reviewed : t.acceptProposed} · ${it.title || t.countryWide}`}
            onClick={(e) => e.preventDefault()}
          >
            <Lock className="size-3.5" aria-hidden="true" />
            {it.source === "alert" ? t.reviewed : t.acceptProposed}
          </Button>
          <span id={`why-${it.key}`} className="text-foreground font-bold">
            {it.settle_block_reason ? t.reasons[it.settle_block_reason] : t.blocked}
          </span>
          {it.settle_block_reason === "needs_aal2" && !demo && (
            <Link to="/account" hash="security" className="text-primary font-medium underline">
              {t.stepUp}
            </Link>
          )}
          <span>
            {it.country_code
              ? t.whoSettles.replace("{0}", countryName(it.country_code, locale))
              : t.whoSettlesAny}
          </span>
        </div>
      ) : (
        directSettle(it) && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <FourEyesNote className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              tabIndex={-1}
              className="min-h-11"
              disabled={busy}
              onClick={onSettle}
              // the same verb repeats on every row: its name carries the item it settles
              aria-label={`${it.source === "alert" ? t.reviewed : t.acceptProposed} · ${it.title || t.countryWide}`}
            >
              {it.source === "alert" ? t.reviewed : t.acceptProposed}
            </Button>
          </div>
        )
      )}
    </li>
  );
}
