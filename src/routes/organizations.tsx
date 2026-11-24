import { LoadFailed } from "@/components/kit/LoadFailed";
import { EmptyState } from "@/components/kit/EmptyState";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { OfficesMap } from "@/components/offices/OfficesMap";
import { listPublicOrganizations } from "@/lib/organizations.functions";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("routes/organizations", {
  ar: {
    title: "مكاتب الندوة وشركاؤها الميدانيون",
    lead: "كلّ ملفٍّ في المنصّة مرتبطٌ بجهةٍ ميدانية تعمل تحت مظلّة الندوة، اعتمدتها إدارة المنصّة، وهي المسؤولة عن توثيقه وتحديثه.",
    empty: "لم تعتمد إدارة المنصّة جهةً ميدانية بعد.",
    ctaTitle: "كلّ كفالةٍ هنا تمرّ عبر مكتبٍ للندوة أو شريكٍ ميداني لها",
    ctaText: "تصل كفالتك الطفلَ عبر جهته، ويعود إليك تسليمها بمستندٍ وتقريرِ أثر.",
    cta: "اكفل يتيماً",
    how: "كيف تعمل الكفالة",
  },
  en: {
    title: "WAMY's offices and field partners",
    lead: "Every child's file on the platform is linked to a field organization working under WAMY's umbrella, reviewed and approved by the platform's administration, and responsible for documenting and updating its data.",
    empty: "The platform's administration has not approved a field organization yet.",
    ctaTitle: "Every sponsorship here passes through a WAMY office or field partner",
    ctaText:
      "Your sponsorship reaches the child through their organization, and you get back a delivery document and an impact report.",
    cta: "Sponsor a child",
    how: "How sponsorship works",
  },
});

const orgsQuery = queryOptions({
  queryKey: ["organizations", "public"],
  queryFn: () => listPublicOrganizations(),
});

export const Route = createFileRoute("/organizations")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const title = pageTitle(copyOf(COPY, l).title, true, l);
    const description = brandFor(l).description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(orgsQuery),
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const { data } = useSuspenseQuery(orgsQuery);
  const c = useCopy(COPY);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12">
        {/* عمود القراءة يبدأ من حافة الشعار نفسها (UI-13). */}
        <div className="max-w-5xl">
          <h1 className="text-3xl font-extrabold">{c.title}</h1>
          <p className="mt-3 max-w-2xl leading-8 text-muted-foreground">{c.lead}</p>

          <OfficesMap />

          {data.error ? (
            // تعذّر الجلب ليس «لا جهات»: القول بأن لا جهة معتمدة يطعن في المنصّة بلا سبب.
            <LoadFailed className="mt-10" />
          ) : data.organizations.length === 0 ? (
            <EmptyState className="mt-10" title={c.empty} />
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {data.organizations.map((org) => (
                <article key={org.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-bold">{org.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {[org.city, org.region].filter(Boolean).join(" — ")}
                      </p>
                    </div>
                  </div>
                  {org.about && (
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{org.about}</p>
                  )}
                </article>
              ))}
            </div>
          )}
          {/* not a dead end: the trust this page builds leads straight to giving */}
          <section className="mt-12 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            <h2 className="text-xl font-bold">{c.ctaTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{c.ctaText}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/orphans">{c.cta}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/how-it-works">{c.how}</Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
