import { CompletenessLine } from "@/components/orphan/TrustSignals";
import { REVIEW_LABELS_COPY } from "@/lib/copy/review-labels";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/org-file-notes", {
  ar: { rejectReason: "سبب الرفض:", noReason: "غير محدّد" },
  en: { rejectReason: "Reason for rejection:", noReason: "Not specified" },
});

/** سبب إعادة الملف بلغة القارئ؛ مشترك بين /org و/try/org. */
export function RejectionLine({ code, reason }: { code: string | null; reason?: string | null }) {
  const c = useCopy(COPY);
  const labels = useCopy(REVIEW_LABELS_COPY);
  return (
    <p className="text-bridge-ink mt-1 text-xs font-medium">
      {c.rejectReason} {labels.rejection[code ?? ""] ?? c.noReason}
      {reason ? `: ${reason}` : ""}
    </p>
  );
}

/** تمام البروفايل بأسماء أقسام بلغة القارئ. */
export function OrgCompletenessLine({ filled, missing }: { filled: number; missing: string[] }) {
  const labels = useCopy(REVIEW_LABELS_COPY);
  return (
    <CompletenessLine className="mt-3" filled={filled} missing={missing} labels={labels.sections} />
  );
}
