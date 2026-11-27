import { ShieldCheck } from "lucide-react";

import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const FOUR_EYES_COPY = defineCopy("components/admin/FourEyesNote", {
  ar: { note: "الحسم يحتاج تحقّقاً بخطوتين، ومراجعاً غير من رفع التغيير." },
  en: { note: "Settling needs two-step verification and a reviewer other than the uploader." },
});

/** سطرٌ بجانب كل زرّ حسم: العامل الثاني وعينٌ ثانية، بلغةٍ مقروءة. */
export function FourEyesNote({ className }: { className?: string }) {
  const t = useCopy(FOUR_EYES_COPY);
  return (
    <p
      data-four-eyes=""
      className={cn(
        "text-muted-foreground flex min-w-0 items-start gap-1.5 text-xs leading-6",
        className,
      )}
    >
      <ShieldCheck className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
      <span>{t.note}</span>
    </p>
  );
}
