import { createFileRoute } from "@tanstack/react-router";

import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { SponsorshipChildPage } from "@/components/sponsorship/SponsorshipChildPage";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

/**
 * صفحة الطفل للكافل في التجربة: الشاشة الحقيقية نفسها (`SponsorshipChildPage`) على كفالات
 * الجلسة. السجلّ والفواتير والتقرير نموذجيّة من `try-sponsor-center` (رموز DEMO-)، ولا يُنادى
 * الخادم ولا يُحصَّل شيء.
 */
export const Route = createFileRoute("/try/sponsorships/$sponsorshipId/")({
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
  component: TryChildPage,
});

const COPY = defineCopy("routes/try.sponsorships.child", {
  ar: {
    pageTitle: "كفالتي · جرّب المنصّة",
    lead: "هكذا يرى الكافل طفله: كلّ شهرٍ بمحطّاته وفاتورته وإيصاله، والتقارير، ومحطّات التأهيل. كلّ ما هنا نموذجيٌّ ومحاكى في متصفّحك.",
  },
  en: {
    pageTitle: "My sponsorship · Try the platform",
    lead: "This is how a sponsor sees their child: each month with its steps, invoice and receipt, the reports, and the qualification steps. Everything here is sample data, simulated in your browser.",
  },
});

function TryChildPage() {
  const { sponsorshipId } = Route.useParams();
  const c = useCopy(COPY);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SampleBadge />
        <p className="min-w-0 flex-1 basis-64 text-sm leading-7 text-muted-foreground">{c.lead}</p>
      </div>
      <SponsorshipChildPage sponsorshipId={sponsorshipId} />
    </>
  );
}
