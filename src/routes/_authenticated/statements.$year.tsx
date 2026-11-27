import { createFileRoute } from "@tanstack/react-router";

import { AnnualStatement } from "@/components/sponsorship/AnnualStatement";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

const COPY = defineCopy("routes/_authenticated/statements", {
  ar: { title: (year: string) => `سجلّ التبرّعات ${year}` },
  en: { title: (year: string) => `Record of donations ${year}` },
});

/** سنةٌ ميلادية معقولة من الرابط، وإلا السنة الجارية. */
function statementYearOf(raw: string, now = new Date()): number {
  const y = Number(raw);
  const max = now.getUTCFullYear();
  return Number.isInteger(y) && y >= 2000 && y <= max ? y : max;
}

export const Route = createFileRoute("/_authenticated/statements/$year")({
  head: ({ match, params }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).title(params.year), false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: StatementPage,
});

/** سجلّ التبرّعات السنوي للكافل: صفحةٌ للطباعة بتخطيط تقرير الكفالة. */
function StatementPage() {
  const { year } = Route.useParams();
  return (
    <AnnualStatement
      year={statementYearOf(year)}
      backTo="/dashboard"
      yearHref={(y) => `/statements/${y}`}
    />
  );
}
