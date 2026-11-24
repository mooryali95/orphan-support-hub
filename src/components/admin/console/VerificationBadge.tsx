import { Check, ShieldCheck, ShieldAlert, ShieldOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VERIFICATION_CHECKS,
  verificationLevel,
  type Verification,
  type VerificationCheck,
  type VerificationLevel,
} from "@/lib/verification";

export const LEVEL_LABEL: Record<VerificationLevel, string> = {
  full: "ملفّ موثّق",
  partial: "توثيق جزئي",
  none: "غير موثّق",
};

export const CHECK_LABEL: Record<VerificationCheck, string> = {
  death: "شهادة وفاة موثّقة",
  identity: "هوية الطفل موثّقة (ميلاد أو بطاقة)",
  guardianship: "إثبات الولاية موثّق",
  consent: "موافقة الوليّ مسجّلة",
  followup: "تقرير متابعة معتمد خلال 90 يوماً",
};

const TONE: Record<VerificationLevel, string> = {
  full: "border-shore-thrive/50 bg-shore-thrive/10 text-foreground",
  partial: "border-bridge/50 bg-bridge/10 text-foreground",
  none: "border-border bg-secondary text-muted-foreground",
};

const ICON = { full: ShieldCheck, partial: ShieldAlert, none: ShieldOff } as const;

/** شارة توثيق الملفّ: مستواه بلمحة، والقائمة كاملةً في `VerificationChecklist`. */
export function VerificationBadge({
  v,
  className,
}: {
  v: Verification | null;
  className?: string;
}) {
  const level = verificationLevel(v);
  const Icon = ICON[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        TONE[level],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function VerificationChecklist({ v }: { v: Verification | null }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {VERIFICATION_CHECKS.map((k) => {
        const ok = Boolean(v?.[k]);
        return (
          <li key={k} className="flex items-center gap-2">
            {ok ? (
              <Check className="text-shore-thrive size-4 shrink-0" aria-label="متحقّق" />
            ) : (
              <X className="text-muted-foreground size-4 shrink-0" aria-label="ناقص" />
            )}
            <span className={ok ? "" : "text-muted-foreground"}>{CHECK_LABEL[k]}</span>
          </li>
        );
      })}
      {v && (
        <li className="text-muted-foreground pt-1 text-xs">
          المستندات: {v.verified_documents} موثّقة من {v.documents}
        </li>
      )}
    </ul>
  );
}
