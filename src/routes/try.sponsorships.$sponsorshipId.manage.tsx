import { createFileRoute } from "@tanstack/react-router";

import { ManageSponsorship } from "@/components/sponsorship/ManageSponsorship";
import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

/**
 * «إدارة الكفالة» في التجربة: الشاشة الحقيقية نفسها (`ManageSponsorship`) على كفالات الجلسة.
 * الإيقاف والاستئناف والمبلغ والإنهاء تُحاكى بقواعد المنصّة (`try-sponsor-center`)، ولا
 * يُحصَّل شيءٌ ولا يُلغى شيءٌ حقيقي.
 */
export const Route = createFileRoute("/try/sponsorships/$sponsorshipId/manage")({
  // نسخ المنفذ تُسجَّل في `beforeLoad` لـ`/try`؛ وهذا احتياطٌ لرابطٍ يُفتح مباشرةً.
  loader: () => import("@/lib/try-sponsor-center").then(() => null),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryManagePage,
});

const COPY = defineCopy("routes/try.sponsorships.manage", {
  ar: {
    pageTitle: "إدارة الكفالة · جرّب المنصّة",
    title: "إدارة الكفالة",
    lead: "إيقافٌ مؤقّت، أو استئناف، أو مبلغٌ جديد، أو إنهاء — بتأكيدٍ واضحٍ لكلّ خطوة. في التجربة يُحاكى كلّ ذلك في متصفّحك وحده.",
  },
  en: {
    pageTitle: "Manage sponsorship · Try the platform",
    title: "Manage sponsorship",
    lead: "Pause, resume, a new amount, or end it, with a clear confirmation for each step. In the trial, all of it is simulated in your browser only.",
  },
});

function TryManagePage() {
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
        <ManageSponsorship sponsorshipId={sponsorshipId} />
      </div>
    </>
  );
}
