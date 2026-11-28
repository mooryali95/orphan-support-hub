import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { TransferInstructions } from "@/components/sponsorship/TransferInstructions";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

/**
 * تعليمات التحويل البنكي.
 *
 * مزوّد الدفع اليدوي يحوّل الكافل إلى هنا، فبغياب هذه الصفحة يقع على
 * 404 وتبقى كفالته معلّقة بلا طريق للدفع.
 */
const COPY = defineCopy("routes/sponsorships.transfer", {
  ar: {
    pageTitle: "تعليمات التحويل",
    title: "تعليمات التحويل البنكي",
    description: "أكمل كفالتك بتحويل بنكي، وتُفعَّل فور تأكيد الإدارة استلام المبلغ.",
  },
  en: {
    pageTitle: "Transfer instructions",
    title: "Bank transfer instructions",
    description:
      "Complete your sponsorship by bank transfer. It is activated once the administration confirms receipt.",
  },
});

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/transfer")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const t = copyOf(COPY, l);
    return {
      meta: [
        { title: pageTitle(t.pageTitle, false, l) },
        { name: "description", content: t.description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TransferPage,
});

function TransferPage() {
  const { sponsorshipId } = Route.useParams();
  const t = useCopy(COPY);
  return (
    <DashboardShell title={t.title} description={t.description}>
      <TransferInstructions sponsorshipId={sponsorshipId} />
    </DashboardShell>
  );
}
