import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, Repeat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewMode } from "@/hooks/useViewMode";
import { defineCopy, useCopy } from "@/lib/locale";
import type { ViewMode } from "@/lib/view-mode";

export const MODE_COPY = defineCopy("components/ModeSwitcher", {
  ar: {
    label: "وضع العرض",
    switch: "تبديل الوضع",
    hint: "كلّ وضعٍ يعرض أبواب دوره وحده.",
    modes: {
      admin: "الإدارة",
      supporter: "داعم",
      org: "جهة ميدانية",
      guardian: "وليّ",
      supervisor: "مشرف",
      office: "مكتب",
      donor: "جهة مانحة",
      translator: "مراجع ترجمة",
    } satisfies Record<ViewMode, string>,
  },
  en: {
    label: "View mode",
    switch: "Switch mode",
    hint: "Each mode shows its own role's pages only.",
    modes: {
      admin: "Administration",
      supporter: "Supporter",
      org: "Field organization",
      guardian: "Guardian",
      supervisor: "Supervisor",
      office: "Office",
      donor: "Donor entity",
      translator: "Translation reviewer",
    } satisfies Record<ViewMode, string>,
  },
});

/**
 * قائمة التبديل بين أدوار الحساب — بدل «بواباتي». حسابٌ بدورٍ واحد لا يرى
 * القائمة أصلاً، بل اسم وضعه وحده.
 */
export function ModeSwitcher() {
  const t = useCopy(MODE_COPY);
  const navigate = useNavigate();
  const { mode, modes, setMode, workspaces } = useViewMode();

  function go(next: ViewMode) {
    setMode(next);
    const office = workspaces?.offices[0]?.id;
    const donor = workspaces?.donor_entities[0]?.id;
    const locale = workspaces?.translator_locales?.[0]?.code;
    switch (next) {
      case "admin":
        return void navigate({ to: "/admin" });
      case "supporter":
        return void navigate({ to: "/dashboard" });
      case "org":
        return void navigate({ to: "/org" });
      case "guardian":
        return void navigate({ to: "/guardian" });
      case "supervisor":
        return void navigate({ to: "/supervisor" });
      case "office":
        return office
          ? void navigate({ to: "/office/$officeId", params: { officeId: office } })
          : void navigate({ to: "/workspaces" });
      case "donor":
        return donor
          ? void navigate({ to: "/donor/$entityId", params: { entityId: donor } })
          : void navigate({ to: "/workspaces" });
      case "translator":
        return locale
          ? void navigate({ to: "/translate/$locale", params: { locale } })
          : void navigate({ to: "/workspaces" });
    }
  }

  const badge = (
    <span className="border-bridge/50 bg-bridge/10 text-foreground inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-bold">
      <span className="bg-bridge size-1.5 rounded-full" aria-hidden="true" />
      {t.modes[mode]}
    </span>
  );

  if (modes.length < 2) return badge;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t.switch}: ${t.modes[mode]}`}
        className="border-bridge/50 bg-bridge/10 hover:bg-bridge/20 focus-visible:ring-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Repeat className="size-3.5" aria-hidden="true" />
        {t.modes[mode]}
        <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          {t.label}
        </DropdownMenuLabel>
        {modes.map((m) => (
          <DropdownMenuItem key={m} onSelect={() => go(m)} className="justify-between gap-3">
            <span className={m === mode ? "font-bold" : ""}>{t.modes[m]}</span>
            {m === mode && <Check className="text-primary size-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="text-muted-foreground px-2 py-1.5 text-xs leading-5">{t.hint}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
