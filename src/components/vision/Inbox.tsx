/**
 * مركز الإشعارات لكلّ دور: الجرس في شريط المنصّة يعرض ما يخصّ الدور الحاليّ
 * وحده — الداعم يرى ما مسّ تبرّعاته والمجموعات التي وصلها، والمشرف ما وصل
 * مجموعاته، وصاحب القرار القرارات والقياسات والإنذارات. وما لم يُقرأ يُعدّ.
 */
import { Bell, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Persona, useEventText, usePlace, useVision } from "@/components/vision/VisionStore";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { fundingPct, type VisionEvent, type VisionState } from "@/lib/vision-engine";

const COPY = defineCopy("components/vision/Inbox", {
  ar: {
    open: "الإشعارات",
    h: {
      supporter: "ما وصلك كداعم",
      supervisor: "ما وصل مجموعاتك",
      decider: "ما يحتاج نظرك",
      all: "كلّ ما جرى",
    },
    empty: "لا إشعارات بعد.",
    readAll: "تعليم الكلّ مقروءاً",
    unread: (n: number) => `${n} غير مقروء`,
    alert: (city: string, pct: number) => `إنذار: تمويل ${city} عند ${pct}%، دون الحدّ (40%)`,
  },
  en: {
    open: "Notifications",
    h: {
      supporter: "What reached you",
      supervisor: "What reached your groups",
      decider: "What needs your attention",
      all: "Everything that happened",
    },
    empty: "No notifications yet.",
    readAll: "Mark all read",
    unread: (n: number) => `${n} unread`,
    alert: (city: string, pct: number) => `Alert: ${city} funding at ${pct}%; below the 40% floor`,
  },
});

/** ما يخصّ الدور من السجلّ. */
export function relevantFor(s: VisionState, p: Persona | null): VisionEvent[] {
  if (!p) return s.events;
  if (p.role === "supporter") {
    const invoices = new Set(
      s.donations
        .filter((d) => d.donor === p.name)
        .map((d) => d.invoice)
        .filter(Boolean),
    );
    const ids = new Set(s.donations.filter((d) => d.donor === p.name).map((d) => d.id));
    const groups = new Set<string>();
    for (const e of s.events)
      if (e.kind === "allocated" && invoices.has(String(e.args["invoice"])) && e.args["group"])
        groups.add(String(e.args["group"]));
    return s.events.filter(
      (e) =>
        (e.args["invoice"] !== undefined && invoices.has(String(e.args["invoice"]))) ||
        (e.args["id"] !== undefined && ids.has(String(e.args["id"]))) ||
        (e.args["group"] !== undefined &&
          groups.has(String(e.args["group"])) &&
          e.layer === "operations"),
    );
  }
  if (p.role === "supervisor") {
    const mine = new Set(s.groups.filter((g) => g.city === "tirana").map((g) => g.id));
    return s.events.filter(
      (e) => e.layer === "operations" && mine.has(String(e.args["group"] ?? "")),
    );
  }
  return s.events.filter((e) => e.layer === "decision");
}

const SEEN = "vision-inbox-seen:v1";

export function Inbox() {
  const c = useCopy(COPY);
  const text = useEventText();
  const place = usePlace();
  const locale = useLocale();
  const { state, persona, ready } = useVision();
  const key = persona ? `${persona.role}:${persona.name}` : "all";
  const items = useMemo(() => relevantFor(state, persona).slice(0, 30), [state, persona]);
  const alerts = useMemo(
    () => (persona?.role === "decider" ? state.cities.filter((x) => fundingPct(x) < 40) : []),
    [state, persona],
  );
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setSeen(JSON.parse(sessionStorage.getItem(SEEN) ?? "{}") as Record<string, string>);
    } catch {
      /* تجاهل */
    }
  }, []);
  const lastSeen = seen[key];
  const idx = lastSeen ? items.findIndex((e) => e.id === lastSeen) : -1;
  const unread = !ready ? 0 : idx < 0 ? items.length : idx;
  const markRead = () => {
    const next = { ...seen, [key]: items[0]?.id ?? "" };
    setSeen(next);
    try {
      sessionStorage.setItem(SEEN, JSON.stringify(next));
    } catch {
      /* تجاهل */
    }
  };
  const time = (t: number) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(t);

  return (
    <Popover onOpenChange={(o) => !o && markRead()}>
      <PopoverTrigger
        aria-label={unread ? `${c.open}: ${c.unread(unread)}` : c.open}
        className="relative grid size-9 shrink-0 place-items-center rounded-full border border-wine/20 bg-white text-wine transition-[background-color,scale] hover:bg-wine/5 active:scale-[0.94]"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread + alerts.length > 0 && (
          <span className="absolute -top-1 -end-1 grid min-w-5 place-items-center rounded-full bg-wine px-1 text-[10px] font-bold text-ivory tabular-nums">
            {Math.min(99, unread + alerts.length)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="theme-light w-[min(92vw,24rem)] bg-white p-0 text-foreground"
      >
        <div className="flex items-center justify-between gap-2 border-b border-wine/10 px-4 py-3">
          <p className="text-sm font-bold text-wine">{c.h[persona?.role ?? "all"]}</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markRead}
              className="text-xs font-semibold text-wine underline underline-offset-4"
            >
              {c.readAll}
            </button>
          )}
        </div>
        <ol className="max-h-96 overflow-y-auto p-2">
          {alerts.map((a) => (
            <li
              key={`alert-${a.id}`}
              className="flex gap-2 rounded-xl bg-gold-soft/60 px-3 py-2 text-sm text-wine-ink"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {c.alert(place(a.id), fundingPct(a))}
            </li>
          ))}
          {items.length === 0 && alerts.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{c.empty}</li>
          )}
          {items.map((e, i) => (
            <li
              key={e.id}
              className={cn(
                "flex items-start gap-2 rounded-xl px-3 py-2 text-sm leading-6",
                i < unread && "bg-wine/[0.04]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-2 size-2 shrink-0 rounded-full",
                  i < unread ? "bg-wine" : "bg-wine/20",
                )}
              />
              <span className="flex-1">{text(e)}</span>
              <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {time(e.at)}
              </time>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
