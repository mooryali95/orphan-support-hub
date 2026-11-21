import { toast } from "sonner";
import { Building2, Copy, GraduationCap, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import { CARD, SectionHead } from "./shared";

type Tab = "inbox" | "offices" | "supervisors";
const ROLES = [
  ["org", "inbox", Building2],
  ["office", "offices", Landmark],
  ["supervisor", "supervisors", GraduationCap],
] as const;

/**
 * فريق الإدخال: من يُدخل البيانات، وكيف يُسجَّل بما هو قائم. لا نظام دعواتٍ جديد
 * هنا — الخطوات كما هي في المنصّة، وما ينقصها مذكورٌ صراحةً.
 */
export function TeamPanel({ openTab }: { openTab: (tab: Tab) => void }) {
  const c = useCopy(COPY);
  const t = c.team;
  const link = typeof window === "undefined" ? "/auth" : `${window.location.origin}/auth`;

  return (
    <div className="space-y-6">
      <SectionHead title={t.heading} hint={t.hint} />

      <div className={cn(CARD, "flex flex-wrap items-center gap-3 p-4")}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t.signInLink}</p>
          <bdi dir="ltr" className="block truncate text-sm text-muted-foreground">
            {link}
          </bdi>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.success(t.copied);
            } catch {
              toast.message(link);
            }
          }}
        >
          <Copy aria-hidden="true" />
          {t.copy}
        </Button>
      </div>

      <ul className="grid gap-4 lg:grid-cols-3">
        {ROLES.map(([key, tab, Icon]) => {
          const role = t.roles[key];
          return (
            <li key={key} className={cn(CARD, "flex flex-col p-5")}>
              <Icon className="size-6 text-primary" strokeWidth={1.5} aria-hidden="true" />
              <h4 className="mt-3 font-bold">{role.title}</h4>
              <p className="mt-1 text-sm leading-7 text-muted-foreground">{role.what}</p>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">{t.steps}</p>
              <ol className="mt-2 flex-1 space-y-2 text-sm leading-7">
                {role.steps.map((step, i) => (
                  <li key={step} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-xs tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <Button type="button" variant="outline" className="mt-4" onClick={() => openTab(tab)}>
                {t.openTab}: {role.tab}
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border border-dashed border-border p-5">
        <h4 className="font-bold">{t.gapTitle}</h4>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm leading-7 text-muted-foreground">
          {t.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
