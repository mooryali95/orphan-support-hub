import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { CountryWorkspace } from "@/components/admin/countries/CountryWorkspace";
import { Busy } from "@/components/admin/data/shared";
import type { Tab as WorkTab } from "@/components/admin/data/sources/shared";
import { TodayQueue, type WorkTab as TodayTab } from "@/components/admin/today/TodayQueue";
import { useUrlFilters } from "@/components/admin/today/useUrlFilters";
import { useDemo } from "@/lib/demo-mode";
import { type CountryRole } from "@/lib/golden-record";
import { countryName } from "@/lib/countries";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { setVerificationActor, verificationCountries } from "@/lib/try-verification";
import { registerTodayDemos } from "@/lib/try-today";

registerTodayDemos();
import { cn } from "@/lib/utils";

// مركز الثقة نفسه في الإدارة، يُحمَّل حين يُفتح لسانه.
const TrustCenter = lazy(() => import("@/components/admin/trust/TrustCenter"));

const COPY = defineCopy("components/try/TryVerification", {
  ar: {
    sample: "بيانات نموذجية",
    sampleLead:
      "دولٌ خمس بملفّاتٍ مستعارة (DEMO-…) ومنصّات مكاتب تجريبية. الحسم والرفع والربط محاكاةٌ في هذه الجلسة وحدها، لا تصل الخادم ولا تمسّ طفلاً أو دفعة.",
    roleLabel: "ادخل بدور",
    countryLabel: "الدولة",
    roles: {
      supervisor: "مشرف الدولة",
      data_entry: "مدخل بيانات",
      viewer: "مطّلع",
    } satisfies Record<CountryRole, string>,
    roleHint: {
      supervisor: "يحسم ويرفع ويدير فريقه — إلا ما رفعه بنفسه، فيحسمه غيره.",
      data_entry: "يرفع ملفّات الدولة ويقرأ التنبيهات، ولا يحسم.",
      viewer: "يقرأ صحة البيانات وطوابيرها، ولا يرفع ولا يحسم.",
    } satisfies Record<CountryRole, string>,
  },
  en: {
    sample: "Sample data",
    sampleLead:
      "Five countries with fictional files (DEMO-…) and demo office platforms. Settling, uploading and linking are simulated in this session only; nothing reaches the server or touches a child or a payment.",
    roleLabel: "Enter as",
    countryLabel: "Country",
    roles: {
      supervisor: "Country supervisor",
      data_entry: "Data entry",
      viewer: "Viewer",
    } satisfies Record<CountryRole, string>,
    roleHint: {
      supervisor:
        "Settles, uploads and manages the team, except changes they uploaded, which someone else settles.",
      data_entry: "Uploads the country's files and reads the alerts, but cannot settle.",
      viewer: "Reads data health and the queues; cannot upload or settle.",
    } satisfies Record<CountryRole, string>,
  },
});

/** شارة «بيانات نموذجية» فوق كل شاشة تحقّقٍ في العرض. */
export function TrySampleNotice() {
  const t = useCopy(COPY);
  return (
    <div
      role="note"
      className="border-bridge/60 bg-bridge/10 mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-7"
    >
      <FlaskConical className="text-bridge-ink mt-1 size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-pretty">
        <strong>{t.sample}</strong> — {t.sampleLead}
      </p>
    </div>
  );
}

/** لا تُعرض اللوحة قبل أن تدخل الجلسة وضع التجربة، فلا يُطلب الخادم ولو مرّة. */
function DemoOnly({ children }: { children: ReactNode }) {
  return useDemo() ? <>{children}</> : <Busy />;
}

/** «اليوم» بعين الإدارة: الصندوق وطوابير الدول الخمس، وما رفعه الزائر ينتظر غيره. */
export function TryAdminToday({
  openCountry,
  openTrust,
}: {
  openCountry: (code: string, tab: TodayTab) => void;
  openTrust: () => void;
}) {
  const access = setVerificationActor(null);
  const [filters, setFilters] = useUrlFilters();
  return (
    <DemoOnly>
      <TrySampleNotice />
      <TodayQueue
        access={access}
        scope="admin"
        filters={filters}
        setFilters={setFilters}
        onOpenCountry={openCountry}
        onOpenTrust={openTrust}
      />
    </DemoOnly>
  );
}

/** درج الدول بعين الإدارة: الدول الخمس، والحسم، والرفع، ووضع المكتب، والفرق. */
export function TryAdminSources({
  country,
  setCountry,
  tab,
  setTab,
}: {
  country: string;
  setCountry: (code: string) => void;
  tab?: WorkTab | undefined;
  setTab?: ((t: WorkTab) => void) | undefined;
}) {
  const access = setVerificationActor(null);
  return (
    <DemoOnly>
      <TrySampleNotice />
      <CountryWorkspace
        scope="admin"
        access={access}
        country={country}
        setCountry={setCountry}
        tab={tab}
        setTab={setTab}
      />
    </DemoOnly>
  );
}

/** «مركز الثقة» على الحالة نفسها؛ روابط الدول تفتح «مصادر التحقق» في العرض. */
export function TryAdminTrust({ openCountry }: { openCountry: (code: string) => void }) {
  setVerificationActor(null);
  return (
    <DemoOnly>
      <TrySampleNotice />
      <Suspense fallback={<Busy />}>
        <TrustCenter openCountry={openCountry} />
      </Suspense>
    </DemoOnly>
  );
}

const ROLES: CountryRole[] = ["supervisor", "data_entry", "viewer"];

/** فريق الدولة: دولةٌ واحدة، ومبدّل أدوارٍ ظاهر، واللوحة نفسها بصلاحية الدور. */
export function TryCountryTeam() {
  const t = useCopy(COPY);
  const locale = useLocale();
  const qc = useQueryClient();
  const countries = verificationCountries();
  const [country, setCountry] = useState(countries[0]?.code ?? "LK");
  const [role, setRole] = useState<CountryRole>("supervisor");
  const [tab, setTab] = useState<WorkTab | undefined>(undefined);
  const [filters, setFilters] = useUrlFilters();
  const access = setVerificationActor({ country, role });
  const change = (next: { country?: string; role?: CountryRole }) => {
    if (next.country) setCountry(next.country);
    if (next.role) setRole(next.role);
    setVerificationActor({ country: next.country ?? country, role: next.role ?? role });
    void qc.invalidateQueries({ queryKey: ["demo"] });
  };

  return (
    <DemoOnly>
      <TrySampleNotice />
      <div className="border-border bg-card mb-8 rounded-2xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <fieldset className="min-w-0">
            <legend className="text-muted-foreground mb-2 text-xs font-bold">{t.roleLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => change({ role: r })}
                  className={cn(
                    "focus-visible:ring-ring inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97]",
                    role === r
                      ? "border-primary bg-primary text-primary-foreground font-bold"
                      : "border-border bg-background text-muted-foreground hover:text-foreground font-medium",
                  )}
                >
                  {t.roles[r]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-muted-foreground mb-2 block text-xs font-bold">
              {t.countryLabel}
            </span>
            <select
              value={country}
              onChange={(e) => change({ country: e.target.value })}
              className="border-border bg-background focus-visible:ring-ring min-h-11 rounded-xl border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {countryName(c.code, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-7">{t.roleHint[role]}</p>
      </div>
      <div key={`${country}:${role}`} className="space-y-12">
        <TodayQueue
          access={access}
          scope="country"
          filters={filters}
          setFilters={setFilters}
          onOpenCountry={(_code, t) => {
            setTab(t);
            requestAnimationFrame(() =>
              document
                .getElementById("country-work-title")
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
            );
          }}
        />
        <CountryWorkspace
          scope="country"
          access={access}
          country={country}
          setCountry={() => {}}
          tab={tab}
          setTab={setTab}
        />
      </div>
    </DemoOnly>
  );
}
