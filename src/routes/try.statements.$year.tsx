import { createFileRoute } from "@tanstack/react-router";

import { AnnualStatement } from "@/components/sponsorship/AnnualStatement";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

const COPY = defineCopy("routes/try.statements", {
  ar: { title: "سجلّ التبرّعات · جرّب المنصّة" },
  en: { title: "Record of donations · Try the platform" },
});

/**
 * سجلّ التبرّعات في التجربة: الشاشة الحقيقية نفسها على كفالات الجلسة، بفواتير نموذجية
 * (`DEMO-INV-`) وشارة «نموذجي · محاكاة» ظاهرة في الشاشة والمطبوع.
 */
export const Route = createFileRoute("/try/statements/$year")({
  loader: () =>
    import("@/lib/try-sponsor-center").then((m) => {
      m.registerSponsorCenterDemos();
      return null;
    }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryStatementPage,
});

function TryStatementPage() {
  const { year } = Route.useParams();
  const y = Number(year);
  const now = new Date().getUTCFullYear();
  return (
    <AnnualStatement
      year={Number.isInteger(y) && y >= 2000 && y <= now ? y : now}
      sample
      backTo="/try/impact"
      yearHref={(v) => `/try/statements/${v}`}
    />
  );
}
