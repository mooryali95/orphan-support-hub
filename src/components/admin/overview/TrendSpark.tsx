import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { SupportExtras, SupportKindKey } from "@/lib/admin-overview";
import { formatMoney } from "@/lib/format";
import { dirOf, intlOf, useLocale } from "@/lib/locale";

const W = 240;
const H = 56;
const PAD = 6;

function monthLabel(month: string, locale: string, long = false) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(intlOf(locale), {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * خطّ اتجاهٍ صغير لسلسلةٍ واحدة — SVG خفيف بلا مكتبة. لونٌ واحد (النبيذي) لأنّ كلّ
 * نوعٍ في سطره باسمه، فلا يحمل اللون هويّة. الزمن يجري باتجاه القراءة. المرور
 * بالمؤشّر أو بالأسهم يُظهر الشهر وقيمته؛ والجدول تحت اللوحة يحمل الأرقام كلّها.
 */
export default function TrendSpark({
  months,
  values,
  currency,
  label,
}: {
  months: string[];
  values: number[];
  currency: string;
  label: string;
}) {
  const locale = useLocale();
  const rtl = dirOf(locale) === "rtl";
  const gradient = useId();
  const [at, setAt] = useState<number | null>(null);
  const n = values.length;
  if (n < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  // ٠ = أقدم شهر. الموضع من بداية السطر (يمينٌ بالعربية).
  const fx = (i: number) => i / (n - 1);
  const fy = (v: number) => (H - PAD - ((v - min) / span) * (H - PAD * 2)) / H;
  const px = (i: number) => (rtl ? 1 - fx(i) : fx(i)) * W;
  const points = values.map((v, i) => `${px(i).toFixed(1)},${(fy(v) * H).toFixed(1)}`);
  const line = `M${points.join("L")}`;
  const area = `${line}L${px(n - 1).toFixed(1)},${H}L${px(0).toFixed(1)},${H}Z`;
  const shown = at ?? n - 1;
  // الموضع الفيزيائي من اليسار: الزمن يجري باتجاه القراءة.
  const left = (px(shown) / W) * 100;
  const top = fy(values[shown]!) * 100;

  function move(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const raw = (e.clientX - box.left) / box.width;
    const f = rtl ? 1 - raw : raw;
    setAt(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step =
      e.key === "ArrowLeft" ? (rtl ? 1 : -1) : e.key === "ArrowRight" ? (rtl ? -1 : 1) : 0;
    if (step === 0) return;
    e.preventDefault();
    setAt(Math.max(0, Math.min(n - 1, (at ?? n - 1) + step)));
  }

  return (
    <div
      role="img"
      aria-label={`${label} — ${monthLabel(months[shown]!, locale, true)}: ${formatMoney(values[shown], currency, locale)}`}
      tabIndex={0}
      onPointerMove={move}
      onPointerLeave={() => setAt(null)}
      onBlur={() => setAt(null)}
      onKeyDown={key}
      className="ov-spark relative h-14 w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible text-primary"
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradient})`} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {at !== null && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: `${left}%` }}
        />
      )}
      <span aria-hidden="true" className="ov-dot" style={{ left: `${left}%`, top: `${top}%` }} />
      {at !== null && (
        <span
          aria-hidden="true"
          className="ov-tip rounded-lg border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-soft"
          style={left > 50 ? { right: `${100 - left}%` } : { left: `${left}%` }}
        >
          <span className="text-muted-foreground">{monthLabel(months[shown]!, locale)}</span>{" "}
          <span className="font-bold tabular-nums">
            {formatMoney(values[shown], currency, locale)}
          </span>
        </span>
      )}
    </div>
  );
}

/** الجدول نفسه بالأرقام: بديل الرسم لمن يقرأ بقارئ شاشة أو يريد القيم كلّها. */
export function TrendTable({
  extras,
  kinds,
  monthHeading,
}: {
  extras: SupportExtras;
  kinds: Record<SupportKindKey, string>;
  monthHeading: string;
}) {
  const locale = useLocale();
  const cols: SupportKindKey[] = ["sponsorship", "qualification", "in_kind"];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="ov-table w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="py-2 text-start font-medium">
              {monthHeading}
            </th>
            {cols.map((k) => (
              <th key={k} scope="col" className="py-2 text-end font-medium">
                {kinds[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {extras.trend.map((row) => (
            <tr key={row.month} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-1.5 text-start font-normal">
                {monthLabel(row.month, locale)}
              </th>
              {cols.map((k) => (
                <td key={k} className="py-1.5 text-end tabular-nums">
                  {formatMoney(row[k], extras.currency, locale)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
