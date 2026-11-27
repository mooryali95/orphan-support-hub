import { createFileRoute } from "@tanstack/react-router";

import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { TransferInstructions } from "@/components/sponsorship/TransferInstructions";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

/**
 * «تعليمات التحويل» في التجربة: الشاشة الحقيقية نفسها على كفالات الجلسة النموذجية
 * (`sponsor.manage.list` من `try-sponsor-center`). لا تُسوّى فيها دفعةٌ ولا تُفعَّل كفالة.
 */
export const Route = createFileRoute("/try/sponsorships/$sponsorshipId/transfer")({
  // صريحٌ لا استيرادٌ مجرّد: الحزمة معلنة بلا آثار جانبية.
  loader: () =>
    import("@/lib/try-sponsor-center").then((m) => {
      m.registerSponsorCenterDemos();
      return null;
    }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryTransferPage,
});

const COPY = defineCopy("routes/try.sponsorships.transfer", {
  ar: {
    pageTitle: "تعليمات التحويل · جرّب المنصّة",
    title: "تعليمات التحويل البنكي",
    lead: "هكذا يرى الكافل خطوات التحويل البنكي حين يكون الدفع يدوياً. كلّها هنا محاكاة.",
  },
  en: {
    pageTitle: "Transfer instructions · Try the platform",
    title: "Bank transfer instructions",
    lead: "This is how a sponsor sees the bank transfer steps when payment is manual. Everything here is simulated.",
  },
});

function TryTransferPage() {
  const { sponsorshipId } = Route.useParams();
  const c = useCopy(COPY);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl leading-[1.3] font-bold md:text-4xl">{c.title}</h1>
        <SampleBadge />
      </div>
      <p className="mt-2 max-w-prose text-base leading-8 text-muted-foreground">{c.lead}</p>
      <div className="mt-8">
        <TransferInstructions sponsorshipId={sponsorshipId} />
      </div>
    </>
  );
}
