import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { getTraitModel } from "@/lib/support.functions";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/traits")({
  head: () => ({
    meta: [
      { title: pageTitle("نموذج السمات", false) },
      {
        name: "description",
        content: "السمات التي تُبنى في رحلة التأهيل، مقسّمةً على أبعادها، وما يُلاحَظ في كل سمة.",
      },
    ],
  }),
  component: TraitsPage,
});

function TraitsPage() {
  const fetchModel = useServerFn(getTraitModel);
  const { data, isPending } = useQuery({ queryKey: ["trait-model"], queryFn: () => fetchModel() });
  const model = data?.model ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-extrabold">نموذج السمات</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          ما يُبنى في الطفل خلال رحلة التأهيل. لكل بُعدٍ سماته، ولكل سمةٍ عناصر يلاحظها المشرف
          ويقيسها قبل الرحلة وبعدها. هذا هو المنهج؛ أمّا درجات طفلٍ بعينه فلا يراها إلا من أذنت له
          الإدارة.
        </p>

        {isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : model.length === 0 ? (
          <p className="mt-10 rounded-xl border border-border bg-secondary/40 p-5 text-sm">
            يُستورد النموذج من منصّة التشغيل، وسيظهر هنا فور ربطها.
          </p>
        ) : (
          <div className="mt-10 space-y-10">
            {model.map((dim) => (
              <section key={dim.key} aria-labelledby={`dim-${dim.key}`}>
                <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-2">
                  <h2 id={`dim-${dim.key}`} className="text-xl font-bold">
                    {dim.label}
                  </h2>
                  {dim.label_local && (
                    <span lang="sq" dir="ltr" className="text-sm text-muted-foreground">
                      {dim.label_local}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {dim.traits.length} سمة
                  </span>
                </div>
                {dim.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{dim.description}</p>
                )}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {dim.traits.map((t) => (
                    <article
                      key={t.id}
                      className="rounded-xl border border-border bg-background p-5"
                    >
                      <h3 className="font-semibold">{t.name}</h3>
                      {t.stage && <p className="mt-0.5 text-xs text-muted-foreground">{t.stage}</p>}
                      {t.definition && <p className="mt-2 text-sm">{t.definition}</p>}
                      {t.elements.length > 0 && (
                        <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                          {t.elements.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-12">
          <Button asChild size="lg">
            <Link to="/support">ادعم بناء الأهلية</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
