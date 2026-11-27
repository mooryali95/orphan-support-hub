import { Check, ShieldCheck, ShieldAlert, ShieldOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VERIFICATION_CHECKS,
  verificationLevel,
  type Verification,
  type VerificationCheck,
  type VerificationLevel,
} from "@/lib/verification";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/admin/console/VerificationBadge", {
  ar: {
    level: {
      full: "ملفّ موثّق",
      partial: "توثيق جزئي",
      none: "غير موثّق",
    } satisfies Record<VerificationLevel, string>,
    check: {
      death: "شهادة وفاة موثّقة",
      identity: "هوية الطفل موثّقة (ميلاد أو بطاقة)",
      guardianship: "إثبات الولاية موثّق",
      consent: "موافقة الوليّ مسجّلة",
      followup: "تقرير متابعة معتمد خلال 90 يوماً",
    } satisfies Record<VerificationCheck, string>,
    ok: "متحقّق",
    missing: "ناقص",
    documents: (verified: number, total: number) => `المستندات: ${verified} موثّقة من ${total}`,
  },
  en: {
    level: {
      full: "Verified file",
      partial: "Partly verified",
      none: "Not verified",
    },
    check: {
      death: "Death certificate verified",
      identity: "Child's identity verified (birth certificate or ID)",
      guardianship: "Proof of guardianship verified",
      consent: "Guardian's consent recorded",
      followup: "Follow-up report approved within 90 days",
    },
    ok: "Checked",
    missing: "Missing",
    documents: (verified: number, total: number) => `Documents: ${verified} of ${total} verified`,
  },
});

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
  const c = useCopy(COPY);
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
      {c.level[level]}
    </span>
  );
}

export function VerificationChecklist({ v }: { v: Verification | null }) {
  const c = useCopy(COPY);
  return (
    <ul className="space-y-1.5 text-sm">
      {VERIFICATION_CHECKS.map((k) => {
        const ok = Boolean(v?.[k]);
        return (
          <li key={k} className="flex items-center gap-2">
            {ok ? (
              <Check className="text-shore-thrive size-4 shrink-0" aria-label={c.ok} />
            ) : (
              <X className="text-muted-foreground size-4 shrink-0" aria-label={c.missing} />
            )}
            <span className={ok ? "" : "text-muted-foreground"}>{c.check[k]}</span>
          </li>
        );
      })}
      {v && (
        <li className="text-muted-foreground pt-1 text-xs tabular-nums">
          {c.documents(v.verified_documents, v.documents)}
        </li>
      )}
    </ul>
  );
}
