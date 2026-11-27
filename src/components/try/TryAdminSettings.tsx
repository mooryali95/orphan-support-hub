import { useQuery } from "@tanstack/react-query";

import { PanelState } from "@/components/admin/PanelState";
import { SampleTag } from "@/components/admin/overview/parts";
import { countryName } from "@/lib/countries";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { getSourcesOverview, type SourcesOverview } from "@/lib/integrity.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerSettingsDemos } from "@/lib/try-settings";
import { getMyReviewLocales } from "@/lib/ui-i18n-admin.functions";

import { TrySampleNotice } from "./TryVerification";

registerSettingsDemos();

export type SettingsKey = "country_sources" | "languages" | "integrations" | "health" | "golive";

export const TRY_SETTINGS_COPY = defineCopy("components/try/TryAdminSettings", {
  ar: {
    labels: {
      country_sources: "مصادر الدول",
      languages: "اللغات",
      integrations: "التكاملات",
      health: "صحة النظام",
      golive: "جاهزية الإطلاق",
    } satisfies Record<SettingsKey, string>,
    simulated: "محاكاة",
    readOnly: "للقراءة وحدها في العرض.",
    sourcesLead: "منصّة مكتبٍ لكل دولة، وحالتها، وما بقي من خطوات ربطها.",
    status: { onboarding: "قيد الإعداد", trial: "تجريبية", active: "مفعّلة", paused: "موقوفة" },
    steps: (done: number, all: number) => `${done} من ${all} خطوات`,
    mirrored: (n: number) => `${n} ملفّاً منسوخاً`,
    localesLead: "لغات الدول المقترحة، وما رُوجع منها وما نُشر.",
    live: "منشورة",
    draft: "مسودّة",
    counts: (r: number, p: number) => `${r} مراجَعة · ${p} منشورة`,
    empty: "لا عناصر في العيّنة.",
    emptyNext: "افتح «اليوم» لتجرّب الحسم.",
    cards: {
      integrations: "مفاتيح المنصّات ومن يستعملها تظهر هنا في المنصّة الحقيقية.",
      health: "حالة الخدمات والمهامّ المجدولة تظهر هنا في المنصّة الحقيقية.",
      golive: "قائمة ما يلزم قبل الإطلاق تظهر هنا في المنصّة الحقيقية.",
    },
    noStatus: "لا حالة حيّة في العرض.",
  },
  en: {
    labels: {
      country_sources: "Country sources",
      languages: "Languages",
      integrations: "Integrations",
      health: "System health",
      golive: "Go-live readiness",
    } satisfies Record<SettingsKey, string>,
    simulated: "Simulated",
    readOnly: "Read only in the demo.",
    sourcesLead: "One office platform per country, its status and the linking steps left.",
    status: { onboarding: "Onboarding", trial: "Trial", active: "Active", paused: "Paused" },
    steps: (done: number, all: number) => `${done} of ${all} steps`,
    mirrored: (n: number) => `${n} files mirrored`,
    localesLead: "Languages proposed by the countries, and how much is reviewed and published.",
    live: "Published",
    draft: "Draft",
    counts: (r: number, p: number) => `${r} reviewed · ${p} published`,
    empty: "No items in the sample.",
    emptyNext: "Open Today to try settling.",
    cards: {
      integrations: "Platform keys and who uses them appear here in the live platform.",
      health: "Service status and scheduled jobs appear here in the live platform.",
      golive: "The checklist before launch appears here in the live platform.",
    },
    noStatus: "No live status in the demo.",
  },
});

/** «الإعدادات» على العيّنة: المصادر واللغات للقراءة، والباقي بطاقةٌ تقول «محاكاة». */
export function TryAdminSettings({ tab }: { tab: SettingsKey }) {
  const t = useCopy(TRY_SETTINGS_COPY);
  return (
    <div>
      <TrySampleNotice />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold">{t.labels[tab]}</h2>
        <SampleTag>{t.simulated}</SampleTag>
      </div>
      <p className="text-muted-foreground mt-1 text-sm leading-7">{t.readOnly}</p>
      <div className="mt-6">
        {tab === "country_sources" ? (
          <Sources />
        ) : tab === "languages" ? (
          <Locales />
        ) : (
          <section className="border-border bg-card rounded-3xl border p-5">
            <p className="text-sm leading-7">{t.cards[tab]}</p>
            <p className="text-muted-foreground mt-2 text-xs">{t.noStatus}</p>
          </section>
        )}
      </div>
    </div>
  );
}

function Sources() {
  const t = useCopy(TRY_SETTINGS_COPY);
  const locale = useLocale();
  const fetch = useDataFn("settings.sources", getSourcesOverview);
  const q = useQuery({
    queryKey: useDataKey(["try-settings-sources"]),
    queryFn: async () => JSON.parse(String(await fetch())) as SourcesOverview | null,
  });
  const rows = q.data?.sources ?? [];
  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm leading-7">{t.sourcesLead}</p>
      <PanelState
        pending={q.isPending}
        failed={q.isError}
        onRetry={() => void q.refetch()}
        empty={rows.length === 0}
        emptyTitle={t.empty}
        emptyNext={t.emptyNext}
      >
        <ul className="space-y-2">
          {rows.map((s) => {
            const steps = Object.values(s.checklist);
            return (
              <li
                key={s.key}
                className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border p-4"
              >
                <span className="min-w-0 flex-1 font-bold">{countryName(s.country, locale)}</span>
                <bdi dir="ltr" className="text-muted-foreground text-xs">
                  {s.name}
                </bdi>
                <span className="bg-secondary rounded-full px-2.5 py-0.5 text-xs font-bold">
                  {t.status[s.status]}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t.steps(steps.filter(Boolean).length, steps.length)} · {t.mirrored(s.mirrored)}
                </span>
              </li>
            );
          })}
        </ul>
      </PanelState>
    </>
  );
}

function Locales() {
  const t = useCopy(TRY_SETTINGS_COPY);
  const locale = useLocale();
  const fetch = useDataFn("settings.locales", getMyReviewLocales);
  const q = useQuery({
    queryKey: useDataKey(["try-settings-locales"]),
    queryFn: () => fetch(),
  });
  const rows = q.data?.ok ? q.data.data.locales : [];
  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm leading-7">{t.localesLead}</p>
      <PanelState
        pending={q.isPending}
        failed={q.isError || (q.data ? !q.data.ok : false)}
        onRetry={() => void q.refetch()}
        empty={rows.length === 0}
        emptyTitle={t.empty}
        emptyNext={t.emptyNext}
      >
        <ul className="space-y-2">
          {rows.map((l) => (
            <li
              key={l.code}
              className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border p-4"
            >
              <bdi dir={l.dir} className="min-w-0 flex-1 font-bold">
                {l.name}
              </bdi>
              <span className="bg-secondary rounded-full px-2.5 py-0.5 text-xs font-bold">
                {l.status === "live" ? t.live : t.draft}
              </span>
              <span className="text-muted-foreground text-xs">
                {l.countries.map((c) => countryName(c, locale)).join(locale === "ar" ? "، " : ", ")}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {t.counts(l.counts?.reviewed ?? 0, l.counts?.published ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </PanelState>
    </>
  );
}
