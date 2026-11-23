import type { ReactNode } from "react";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODE_COPY } from "@/components/ModeSwitcher";
import { useViewMode } from "@/hooks/useViewMode";
import { defineCopy, useCopy } from "@/lib/locale";
import { canPledgeIn } from "@/lib/view-mode";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/SupporterModeGate", {
  ar: {
    note: (mode: string) =>
      `أنت الآن في وضع «${mode}». الدعم الشخصي يُسجَّل من وضع الداعم، فلا يختلط بعمل دورك.`,
    switch: "بدّل إلى وضع الداعم",
  },
  en: {
    note: (mode: string) =>
      `You are in the “${mode}” mode. Personal support is recorded from the supporter mode, so it never mixes with your role's work.`,
    switch: "Switch to supporter mode",
  },
});

/**
 * زرّ الدعم في وضع الداعم وحده. الزائر بلا حساب والداعم يريان الزرّ كما هو؛
 * المدير (وكلّ وضعٍ آخر) يرى سطراً يشرح، وزرّ تبديلٍ يبقيه في الصفحة نفسها.
 */
export function SupporterModeGate({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const t = useCopy(COPY);
  const modes = useCopy(MODE_COPY).modes;
  const { mode, signedIn, setMode } = useViewMode();
  if (!signedIn || canPledgeIn(mode)) return <>{children}</>;
  return (
    <div
      role="note"
      className={cn(
        "border-bridge/50 bg-bridge/10 flex flex-col gap-3 rounded-xl border p-4 text-sm leading-7",
        className,
      )}
    >
      <p>{t.note(modes[mode])}</p>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setMode("supporter")}
      >
        <Repeat className="size-4" aria-hidden="true" />
        {t.switch}
      </Button>
    </div>
  );
}
