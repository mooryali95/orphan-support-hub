import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { getTraitModel } from "@/lib/support.functions";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, pluralOf, useCopy } from "@/lib/locale";

const COPY = defineCopy("routes/traits", {
  ar: {
    title: "نموذج السمات",
    description: "السمات التي تُبنى في رحلة التأهيل، مقسّمةً على أبعادها، وما يُلاحَظ في كل سمة.",
    lead: "ما يُبنى في الطفل خلال رحلة التأهيل. لكل بُعدٍ سماته، ولكل سمةٍ عناصر يلاحظها المشرف ويقيسها قبل الرحلة وبعدها. هذا هو المنهج؛ أمّا درجات طفلٍ بعينه فلا يراها إلا من أذنت له الإدارة.",
    dataNote: null as string | null,
    empty: "يُستورد النموذج من منصّة التشغيل، وسيظهر هنا فور ربطها.",
    traits: (n: number) => `${n} سمة`,
    cta: "ادعم بناء الأهلية",
  },
  en: {
    title: "Trait model",
    description:
      "The traits built during the qualification journey, grouped by dimension, and what is observed for each trait.",
    lead: "What is built in the child during the qualification journey. Each dimension has its traits, and each trait has elements the supervisor observes and measures before and after the journey. This is the curriculum; an individual child's scores are seen only by those the administration authorizes.",
    dataNote:
      "The model's content comes from the operating platform and is currently shown in its original language.",
    empty:
      "The model is imported from the operating platform and will appear here once it is connected.",
    traits: pluralOf({ one: "{0} trait", other: "{0} traits" }),
    cta: "Support capability building",
  },
});

export const Route = createFileRoute("/traits")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).title, false, l) },
        { name: "description", content: copyOf(COPY, l).description },
      ],
    };
  },
  component: TraitsPage,
});

function TraitsPage() {
  const fetchModel = useServerFn(getTraitModel);
  const { data, isPending } = useQuery({ queryKey: ["trait-model"], queryFn: () => fetchModel() });
  const model = data?.model ?? [];
  const c = useCopy(COPY);

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        {/* عمود القراءة يبدأ من حافة الشعار نفسها (UI-13). */}
        <div className="max-w-5xl">
          <h1 className="text-3xl font-extrabold">{c.title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{c.lead}</p>
          {c.dataNote && model.length > 0 && (
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{c.dataNote}</p>
          )}

          {isPending ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : model.length === 0 ? (
            <p className="mt-10 rounded-xl border border-border bg-secondary/40 p-5 text-sm">
              {c.empty}
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
                      {c.traits(dim.traits.length)}
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
                        {t.stage && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{t.stage}</p>
                        )}
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
              <Link to="/support">{c.cta}</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
