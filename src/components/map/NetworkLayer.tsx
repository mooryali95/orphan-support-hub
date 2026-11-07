/**
 * طبقتا شبكة الندوة على الخارطة: الرسم، والمفتاح، وبطاقة الدولة، وقائمة
 * «قرار التوسّع». الأرقام كلّها بحثية من `@/data/wamy-network` بمصدرها
 * وسنتها وثقتها — ولا تختلط بأعداد المنصّة (البطاقة تفصل الأنواع الثلاثة).
 */
import { memo, type ReactNode } from "react";
import { ArrowUpLeft, Building2, Info, Landmark, MapPin, Star } from "lucide-react";

import {
  type Confidence,
  type Indicator,
  type NeedKey,
  type NetworkCountry,
  WAMY_COUNTRIES,
  WAMY_META,
} from "@/data/wamy-network";
import { formatCount } from "@/lib/format";
import { copyOf, type Locale, useLocale } from "@/lib/locale";
import {
  coverage,
  estimateOrphans,
  NETWORK_BY_CODE,
  priorityOf,
  rankPriorities,
  rationale,
  type PriorityItem,
  type Tier,
  yearOf,
} from "@/lib/office-gap";
import { cn } from "@/lib/utils";
import type { NetworkLayer } from "./layers";
import { KIND_ORDER, type NetworkKind } from "./network-layer";
import { NETWORK_COPY, nameOf, useNetworkCopy } from "./network-copy";

type Box = [number, number, number, number];
type Shape = { c: string; n: string; d: string; b: Box; p: [number, number] };

const COPY = NETWORK_COPY;

/* ── الرسم على الخارطة ─────────────────────────────────────────────── */

/**
 * نقشٌ مخطَّط لدول الأولوية — لا يعتمد على اللون وحده (عمى الألوان).
 * عرضه بالبكسل ثابتٌ مهما كبّرنا: `paint` في الخارطة يضبط `patternTransform`.
 */
export function NetworkPatterns() {
  return (
    <defs>
      {(["high", "medium"] as const).map((t) => (
        <pattern
          key={t}
          id={`og-hatch-${t}`}
          data-hatch=""
          patternUnits="userSpaceOnUse"
          width={6}
          height={6}
          patternTransform="rotate(45)"
        >
          <rect
            width={6}
            height={6}
            className="fill-office-gap"
            fillOpacity={t === "high" ? 0.9 : 0.4}
          />
          <rect
            width={2.2}
            height={6}
            className="fill-card"
            fillOpacity={t === "high" ? 0.5 : 0.75}
          />
        </pattern>
      ))}
    </defs>
  );
}

function shapeStyle(kind: NetworkKind): { className: string; style?: React.CSSProperties } {
  switch (kind) {
    case "hq":
    case "office":
      return { className: "fill-primary", style: { fillOpacity: 0.88 } };
    case "field":
      return { className: "fill-primary stroke-primary", style: { fillOpacity: 0.3 } };
    case "unconfirmed":
      return {
        className: "fill-transparent stroke-muted-foreground",
        style: { strokeDasharray: "3 2" },
      };
    case "high":
      return { className: "stroke-office-gap", style: { fill: "url(#og-hatch-high)" } };
    case "medium":
      return { className: "stroke-office-gap", style: { fill: "url(#og-hatch-medium)" } };
    case "data":
      return {
        className: "fill-foreground/[0.06] stroke-office-gap",
        style: { strokeDasharray: "3 2" },
      };
    case "covered":
      return { className: "fill-primary", style: { fillOpacity: 0.16 } };
  }
}

export const NetworkShapes = memo(function NetworkShapes({
  countries,
  paint,
  focus,
  onPick,
  onHover,
  onKey,
}: {
  countries: Shape[];
  paint: Map<string, NetworkKind>;
  focus: string | null;
  onPick: (code: string) => void;
  onHover: (code: string) => void;
  onKey: (e: React.KeyboardEvent<SVGPathElement>, code: string) => void;
}) {
  const locale = useLocale();
  const t = copyOf(COPY, locale);
  return (
    <g>
      {countries.map((c, i) => {
        const kind = paint.get(c.c);
        if (!kind) return null;
        const s = shapeStyle(kind);
        const focusable = focus !== c.c;
        const label = t[kind];
        return (
          <path
            key={`${c.c}-${i}`}
            d={c.d}
            vectorEffect="non-scaling-stroke"
            style={s.style}
            onClick={() => onPick(c.c)}
            onPointerEnter={() => onHover(c.c)}
            onFocus={() => onHover(c.c)}
            onKeyDown={focusable ? (e) => onKey(e, c.c) : undefined}
            data-tip={focusable ? `${c.n}|${label}` : undefined}
            data-country={focusable ? c.c : undefined}
            tabIndex={focusable ? 0 : -1}
            role={focusable ? "button" : undefined}
            aria-label={focusable ? t.countryButton(c.n, label) : undefined}
            strokeWidth={kind === "data" || kind === "unconfirmed" ? 1.2 : 0.8}
            className={cn(
              "cursor-pointer outline-none transition-[opacity,filter] duration-500 ease-[var(--ease-out)] hover:brightness-110",
              s.className,
              kind === "hq" || kind === "office" ? "stroke-background" : "",
              "focus-visible:stroke-bridge",
              focus && focus !== c.c && "opacity-40",
            )}
          />
        );
      })}
    </g>
  );
});

/** خمس نقاطٍ لنجمة المقرّ حول المركز. */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 9 : 3.8;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

function Marker({ kind }: { kind: NetworkKind }) {
  switch (kind) {
    case "hq":
      return (
        <>
          <circle r={13} className="map-pulse fill-bridge/25" />
          <polygon points={STAR} className="fill-bridge stroke-background" strokeWidth={1.5} />
        </>
      );
    case "office":
      return <circle r={4.5} className="fill-primary stroke-background" strokeWidth={1.75} />;
    case "field":
      return <circle r={3.75} className="fill-background stroke-primary" strokeWidth={2} />;
    case "unconfirmed":
      return (
        <circle
          r={3.5}
          className="fill-background stroke-muted-foreground"
          strokeWidth={1.5}
          strokeDasharray="2 1.5"
        />
      );
    case "high":
      return (
        <rect
          x={-4.5}
          y={-4.5}
          width={9}
          height={9}
          transform="rotate(45)"
          className="fill-office-gap stroke-background"
          strokeWidth={1.75}
        />
      );
    case "medium":
      return (
        <rect
          x={-3.75}
          y={-3.75}
          width={7.5}
          height={7.5}
          transform="rotate(45)"
          className="fill-background stroke-office-gap"
          strokeWidth={2}
        />
      );
    case "data":
      return (
        <circle
          r={3.5}
          className="fill-background stroke-office-gap"
          strokeWidth={1.5}
          strokeDasharray="2 1.5"
        />
      );
    case "covered":
      return <circle r={2.5} className="fill-primary/60" />;
  }
}

/** علاماتٌ بحجمٍ ثابت على الشاشة (`data-at`) — الدول الصغيرة تُرى وتُصاب بالإبهام. */
export function NetworkMarkers({
  countries,
  paint,
  interactive,
  onPick,
  onHover,
}: {
  countries: Shape[];
  paint: Map<string, NetworkKind>;
  interactive: boolean;
  onPick: (code: string) => void;
  onHover: (code: string) => void;
}) {
  const shown = countries
    .filter((c) => paint.has(c.c))
    // المقرّ فوق الجميع، ثم الأهمّ — يُرسم الأخير فوق ما قبله.
    .sort((a, b) => KIND_ORDER[paint.get(b.c)!] - KIND_ORDER[paint.get(a.c)!]);
  return (
    <>
      {shown.map((c, i) => (
        <g
          key={c.c}
          data-at={`${c.p[0]} ${c.p[1]}`}
          className={cn(
            "cursor-pointer",
            interactive ? "pointer-events-auto" : "pointer-events-none",
          )}
          onClick={() => onPick(c.c)}
          onPointerEnter={() => onHover(c.c)}
        >
          <g className="map-dot" style={{ ["--i" as string]: Math.min(i, 12) * 0.35 }}>
            <circle r={14} className="fill-transparent" />
            <Marker kind={paint.get(c.c)!} />
          </g>
        </g>
      ))}
    </>
  );
}

/* ── المفتاح والسطر التعريفي ───────────────────────────────────────── */

function Swatch({ kind }: { kind: NetworkKind }) {
  return (
    <svg viewBox="-8 -8 16 16" className="size-4 shrink-0" aria-hidden="true">
      {kind === "high" || kind === "medium" ? (
        <>
          <rect
            x={-7}
            y={-7}
            width={14}
            height={14}
            rx={3}
            style={{ fill: `url(#og-key-${kind})` }}
            className="stroke-office-gap"
            strokeWidth={1}
          />
          <defs>
            <pattern
              id={`og-key-${kind}`}
              patternUnits="userSpaceOnUse"
              width={4}
              height={4}
              patternTransform="rotate(45)"
            >
              <rect
                width={4}
                height={4}
                className="fill-office-gap"
                fillOpacity={kind === "high" ? 0.9 : 0.4}
              />
              <rect
                width={1.5}
                height={4}
                className="fill-card"
                fillOpacity={kind === "high" ? 0.5 : 0.75}
              />
            </pattern>
          </defs>
        </>
      ) : (
        <Marker kind={kind} />
      )}
    </svg>
  );
}

export function NetworkLegend({
  layer,
  counts,
  admin = false,
  className,
}: {
  layer: NetworkLayer;
  counts: Record<NetworkKind, number>;
  admin?: boolean;
  className?: string;
}) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const kinds: NetworkKind[] =
    layer === "network"
      ? ["hq", "office", "field", ...(admin ? (["unconfirmed"] as const) : [])]
      : ["high", "medium", "data", "covered"];
  return (
    <div className={className}>
      <p className="sr-only">{t.legend}</p>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {kinds.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <Swatch kind={k} />
            <span className="text-foreground">{t[k]}</span>
            <span className="tabular-nums">{formatCount(counts[k], locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** العالم في طبقة الشبكة: العنوان، وسطرٌ بالأعداد، والمفتاح، والحاشية. */
export function NetworkIntro({
  layer,
  counts,
  admin,
}: {
  layer: NetworkLayer;
  counts: Record<NetworkKind, number>;
  admin?: boolean;
}) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const n = (x: number) => formatCount(x, locale);
  return (
    <>
      <p className="font-serif text-2xl font-bold text-primary md:text-4xl">
        {layer === "network" ? t.networkTitle : t.needsTitle}
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
        {layer === "network"
          ? t.networkLine(n(counts.hq + counts.office), n(counts.field))
          : t.needsLine(n(counts.high), n(counts.medium), n(counts.data))}
      </p>
      <NetworkLegend
        layer={layer}
        counts={counts}
        admin={admin ?? false}
        className="pointer-events-auto mx-auto mt-3 w-fit max-w-full rounded-2xl bg-card/85 px-4 py-2 shadow-sm backdrop-blur"
      />
      <p className="mx-auto mt-2 max-w-xl text-[11px] leading-5 text-muted-foreground">
        <Info className="me-1 inline size-3 align-[-2px]" aria-hidden="true" />
        {t.research}
      </p>
    </>
  );
}

/* ── بطاقة الدولة: ثلاث كتلٍ لا تختلط أرقامها ─────────────────────── */

const CONF_TONE: Record<Confidence, string> = {
  high: "bg-primary/10 text-primary",
  medium: "bg-bridge/15 text-bridge-ink",
  low: "bg-secondary text-muted-foreground",
};

function ConfidenceBadge({ c }: { c: Confidence }) {
  const t = useNetworkCopy();
  const label = c === "high" ? t.confHigh : c === "medium" ? t.confMedium : t.confLow;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", CONF_TONE[c])}>
      {label}
    </span>
  );
}

function indicatorYears(i: Indicator, locale: Locale): string {
  const years = [...new Set(i.year.match(/(?:19|20)\d\d/g) ?? [])];
  if (i.derived && years.length >= 2)
    return copyOf(COPY, locale).derivedYears(years[0]!, years[years.length - 1]!);
  return years[0] ?? "—";
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      dir="auto"
      className="inline-flex min-w-0 items-center gap-0.5 underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-current"
    >
      <span className="truncate">{children}</span>
      <ArrowUpLeft className="size-3 shrink-0 ltr:-scale-x-100" aria-hidden="true" />
    </a>
  );
}

function IndicatorRow({ i }: { i: Indicator }) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const label = t[`ind_${i.key}` as `ind_${NeedKey}`];
  const unverified = i.check === "unverifiable";
  return (
    <li className={cn("py-2.5", unverified && "opacity-70")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-base font-bold tabular-nums",
            unverified && "line-through decoration-1",
          )}
        >
          {formatCount(i.value, locale, { compact: i.value >= 1e6, percent: i.unit === "pct" })}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{indicatorYears(i, locale)}</span>
        <span aria-hidden="true">·</span>
        <SourceLink href={i.url}>{i.sourceShort}</SourceLink>
        <ConfidenceBadge c={i.confidence} />
        {i.derived && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
            {t.estimate}
          </span>
        )}
        {unverified && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {t.unverifiable}
          </span>
        )}
      </div>
    </li>
  );
}

function Block({
  title,
  icon,
  tone = "default",
  children,
}: {
  title: string;
  icon: ReactNode;
  tone?: "default" | "gap";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "mt-4 rounded-2xl p-3.5",
        tone === "gap"
          ? "bg-office-gap/[0.07] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-office-gap)_25%,transparent)]"
          : "bg-secondary/60",
      )}
    >
      <h3
        className={cn(
          "flex items-center gap-1.5 text-xs font-bold",
          tone === "gap" ? "text-office-gap" : "text-foreground",
        )}
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function TierChip({ tier, className }: { tier: Tier; className?: string }) {
  const t = useNetworkCopy();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap",
        tier === "high" && "bg-office-gap text-card",
        tier === "medium" && "bg-office-gap/12 text-office-gap",
        tier === "data" && "bg-transparent text-office-gap shadow-[inset_0_0_0_1px_currentColor]",
        className,
      )}
    >
      {t[tier]}
    </span>
  );
}

/**
 * البطاقة في طبقتي الشبكة: (١) الحاجة الوطنية (٢) حضور الندوة (و«لماذا
 * تحتاج مكتباً» لدول الأولوية) ثم (٣) «على المنصّة الآن» — ما يمرّره الأب
 * من أعداد المنصّة الحيّة كما هي.
 */
export function NetworkCountryCard({
  code,
  admin = false,
  platform,
}: {
  code: string;
  admin?: boolean;
  platform: ReactNode;
}) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const c = NETWORK_BY_CODE.get(code);
  const priority = c ? priorityOf(c) : null;
  return (
    <>
      {priority && (
        <Block
          title={t.blockWhy}
          icon={<MapPin className="size-3.5" aria-hidden="true" />}
          tone="gap"
        >
          <div className="mt-2">
            <TierChip tier={priority.tier} />
          </div>
          <p className="mt-2 text-sm leading-7">{rationale(priority, locale)}</p>
        </Block>
      )}

      <Block title={t.blockNeed} icon={<Landmark className="size-3.5" aria-hidden="true" />}>
        {!c ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.notInNetwork}</p>
        ) : c.need.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.noNeed}</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {c.need.map((i) => (
              <IndicatorRow key={i.key} i={i} />
            ))}
          </ul>
        )}
        {c?.context && locale === "ar" && (
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{c.context}</p>
        )}
      </Block>

      <Block title={t.blockPresence} icon={<Building2 className="size-3.5" aria-hidden="true" />}>
        {c && <PresenceBody c={c} admin={admin} />}
        {!c && <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.notInNetwork}</p>}
      </Block>

      <section className="mt-4 border-t border-border pt-3">
        <h3 className="text-xs font-bold">{t.blockPlatform}</h3>
        {platform}
      </section>
    </>
  );
}

function PresenceBody({ c, admin }: { c: NetworkCountry; admin: boolean }) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const p = c.presence;
  if (p.status === "unconfirmed") {
    return (
      <>
        <p className="mt-2 text-sm leading-7">{t.noPresence}</p>
        <p className="text-xs leading-6 text-muted-foreground">{t.noPresenceNote}</p>
        {admin && (
          <p className="mt-2 rounded-xl bg-background/70 p-2 text-xs leading-6 text-muted-foreground">
            <strong className="text-foreground">{t.unconfirmed}: </strong>
            {p.lastEvidenceYear ? t.lastEvidence(String(p.lastEvidenceYear)) : t.noEvidence}{" "}
            {p.url && <SourceLink href={p.url}>{p.source ?? t.source}</SourceLink>}
          </p>
        )}
      </>
    );
  }
  const lang = locale === "ar" ? "ar" : "en";
  const kind: NetworkKind = p.hq ? "hq" : p.status;
  const est = p.status === "office" ? estimateOrphans(c) : null;
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            kind === "field" ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground",
          )}
        >
          {kind === "hq" && <Star className="size-3" aria-hidden="true" />}
          {t[kind]}
        </span>
        <span className="text-xs text-muted-foreground">{p.type[lang]}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{t.city}</dt>
        <dd className={p.city ? "font-medium" : "text-muted-foreground"}>
          {p.city ? p.city[lang] : t.cityUnknown}
        </dd>
        <dt className="text-muted-foreground">{t.latest}</dt>
        <dd className="leading-6">
          <span className="font-semibold tabular-nums">{p.year}</span> — {p.activity[lang]}
        </dd>
        <dt className="text-muted-foreground">{t.source}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SourceLink href={p.url}>{p.source}</SourceLink>
          <ConfidenceBadge c={p.confidence} />
        </dd>
      </dl>
      {p.status === "office" && !p.hq && (
        <p className="mt-2 border-t border-border pt-2 text-xs leading-6 text-muted-foreground">
          {est ? t.coverageLine(formatCount(est.value, locale, { compact: true })) : t.coverageNone}
        </p>
      )}
    </>
  );
}

/* ── قرار التوسّع ─────────────────────────────────────────────────── */

/** قائمة الأولوية مجمّعةً بالفئة؛ كل عنصرٍ بسطر تعليله ويُفتح على الخارطة. */
export function ExpansionList({
  onPick,
  dense = false,
}: {
  onPick?: (code: string) => void;
  dense?: boolean;
}) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const ranked = rankPriorities();
  const groups = (["high", "medium", "data"] as const).map((tier) => ({
    tier,
    items: ranked.filter((r) => r.tier === tier),
  }));
  // الرقم للمرتَّب فقط؛ «تحتاج بيانات» بلا رقم — لا ترتيب بلا بيانات.
  const rankOf = new Map(ranked.filter((r) => r.tier !== "data").map((r, i) => [r.code, i + 1]));
  return (
    <div className="space-y-4">
      {groups.map(({ tier, items }) =>
        items.length === 0 ? null : (
          <section key={tier} aria-label={t[tier]}>
            <TierChip tier={tier} />
            <ol className="mt-2 divide-y divide-border">
              {items.map((item) => (
                <ExpansionItem
                  key={item.code}
                  item={item}
                  rank={rankOf.get(item.code) ?? null}
                  locale={locale}
                  dense={dense}
                  onPick={onPick}
                />
              ))}
            </ol>
          </section>
        ),
      )}
    </div>
  );
}

function ExpansionItem({
  item,
  rank,
  locale,
  dense,
  onPick,
}: {
  item: PriorityItem;
  rank: number | null;
  locale: Locale;
  dense: boolean;
  onPick: ((code: string) => void) | undefined;
}) {
  const t = useNetworkCopy();
  const name = nameOf(item.code, locale);
  const body = (
    <>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
          rank ? "bg-office-gap/12 text-office-gap" : "text-muted-foreground",
        )}
        aria-hidden={rank ? undefined : "true"}
      >
        {rank ?? "—"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{name}</span>
          {item.estimate && (
            <span className="shrink-0 text-sm font-bold tabular-nums text-office-gap">
              {formatCount(item.estimate.value, locale, { compact: true })}
            </span>
          )}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-xs text-muted-foreground",
            dense ? "leading-5" : "leading-6",
          )}
        >
          {rationale(item, locale)}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {onPick ? (
        <button
          type="button"
          onClick={() => onPick(item.code)}
          aria-label={`${t.open(name)} — ${rationale(item, locale)}`}
          className="flex min-h-11 w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start transition-[background-color,transform] hover:bg-secondary active:scale-[0.99]"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-2 py-2.5">{body}</div>
      )}
    </li>
  );
}

/** قائمة طبقة «الشبكة»: المقرّ ثم المكاتب ثم النشاط الميداني. */
export function PresenceList({
  paint,
  onPick,
}: {
  paint: Map<string, NetworkKind>;
  onPick: (code: string) => void;
}) {
  const t = useNetworkCopy();
  const locale = useLocale();
  const rows = WAMY_COUNTRIES.filter((c) => paint.has(c.code)).sort(
    (a, b) =>
      KIND_ORDER[paint.get(a.code)!] - KIND_ORDER[paint.get(b.code)!] ||
      nameOf(a.code, locale).localeCompare(nameOf(b.code, locale), locale),
  );
  return (
    <ul className="divide-y divide-border">
      {rows.map((c) => {
        const kind = paint.get(c.code)!;
        const p = c.presence;
        const lang = locale === "ar" ? "ar" : "en";
        return (
          <li key={c.code}>
            <button
              type="button"
              onClick={() => onPick(c.code)}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-start transition-colors hover:bg-secondary"
            >
              <Swatch kind={kind} />
              <span className="min-w-0 flex-1">
                <span className="block">{nameOf(c.code, locale)}</span>
                {p.status !== "unconfirmed" && p.city && (
                  <span className="block text-xs text-muted-foreground">{p.city[lang]}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {p.status !== "unconfirmed" ? p.year : t[kind]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ── الحاشية: المصادر ──────────────────────────────────────────────── */

export function NetworkSources() {
  const t = useNetworkCopy();
  const locale = useLocale();
  return (
    <details className="group rounded-2xl bg-secondary/60 p-4 text-sm">
      <summary className="cursor-pointer font-bold marker:text-muted-foreground">
        {t.sources}
      </summary>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.sourcesLead}</p>
      <ul className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {WAMY_COUNTRIES.filter((c) => c.need.length > 0 || c.presence.status !== "unconfirmed").map(
          (c) => (
            <li key={c.code} className="min-w-0">
              <p className="font-semibold">{nameOf(c.code, locale)}</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {c.presence.status !== "unconfirmed" && (
                  <li className="flex min-w-0 gap-1">
                    <span className="shrink-0">{t.presenceSource}:</span>
                    <SourceLink href={c.presence.url}>
                      {c.presence.source} ({c.presence.year})
                    </SourceLink>
                  </li>
                )}
                {c.need.map((i) => (
                  <li key={i.key} className="flex min-w-0 gap-1">
                    <span className="shrink-0">{t[`ind_${i.key}` as `ind_${NeedKey}`]}:</span>
                    <SourceLink href={i.url}>
                      {i.sourceShort} ({yearOf(i.year) ?? "—"})
                    </SourceLink>
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        {t.sponsoredNote(
          formatCount(WAMY_META.lastConfirmedSponsored.value, locale),
          WAMY_META.lastConfirmedSponsored.year,
        )}{" "}
        <SourceLink href={WAMY_META.lastConfirmedSponsored.url}>
          {WAMY_META.lastConfirmedSponsored.source}
        </SourceLink>
      </p>
    </details>
  );
}

/** «التغطية الحالية»: دول المكاتب بحاجتها — بلا تخمينٍ لمن لا رقم له. */
export function CoverageList({ onPick }: { onPick?: (code: string) => void }) {
  const t = useNetworkCopy();
  const locale = useLocale();
  return (
    <ol className="divide-y divide-border">
      {coverage().map((c) => {
        const name = nameOf(c.code, locale);
        const inner = (
          <>
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span
              className={cn(
                "shrink-0 text-sm tabular-nums",
                c.estimate ? "font-bold text-primary" : "text-xs text-muted-foreground",
              )}
            >
              {c.estimate
                ? formatCount(c.estimate.value, locale, { compact: true })
                : t.coverageNoData}
            </span>
            {c.estimate?.derived && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                {t.estimate}
              </span>
            )}
          </>
        );
        return (
          <li key={c.code}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(c.code)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-start transition-colors hover:bg-secondary"
              >
                {inner}
              </button>
            ) : (
              <div className="flex min-h-11 items-center gap-3 px-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
