import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { listPublicOrganizations } from "@/lib/organizations.functions";
import { BRAND, pageTitle } from "@/config/brand";

const orgsQuery = queryOptions({
  queryKey: ["organizations", "public"],
  queryFn: () => listPublicOrganizations(),
});

export const Route = createFileRoute("/organizations")({
  head: () => ({
    meta: [
      { title: pageTitle("جهات الرعاية المعتمدة") },
      {
        name: "description",
        content: BRAND.description,
      },
      { property: "og:title", content: pageTitle("جهات الرعاية المعتمدة") },
      {
        property: "og:description",
        content: BRAND.description,
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(orgsQuery),
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const { data } = useSuspenseQuery(orgsQuery);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">جهات الرعاية المعتمدة</h1>
        <p className="mt-3 max-w-2xl leading-8 text-muted-foreground">
          كل ملف يتيم في المنصة مرتبط بجهة رعاية مرخّصة مسؤولة عن توثيق البيانات وتحديثها.
        </p>

        {data.organizations.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لا توجد جهات معتمدة بعد.
          </p>
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
      </main>
      <SiteFooter />
    </div>
  );
}
