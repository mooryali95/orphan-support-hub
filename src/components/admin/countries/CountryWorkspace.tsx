import { useQueries, useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { SourcesPanel } from "@/components/admin/data/SourcesPanel";
import { type Tab as WorkTab } from "@/components/admin/data/sources/shared";
import { TRUST_COPY } from "@/components/admin/trust/copy";
import { countryName, flagOf } from "@/lib/countries";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { canDo, type CountryAccess } from "@/lib/golden-record";
import { getTrustTeam } from "@/lib/trust-center.functions";
import { listCountryStaff } from "@/lib/golden-record.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { teamFlag, type TeamFlag } from "@/lib/trust-center";

const COPY = defineCopy("components/admin/countries/CountryWorkspace", {
  ar: {
    coverageTitle: "دولٌ لا تكتمل فيها العينان",
    coverageHint:
      "الحسم الحرج يحتاج مشرفَين داخلَين: من رفع التغيير لا يحسمه. بمشرفٍ واحد يبقى ما رفعه بلا من يحسمه إلا الإدارة.",
    manage: "أدر الفريق",
  },
  en: {
    coverageTitle: "Countries without full four-eyes cover",
    coverageHint:
      "Critical settling needs two signed-in supervisors: whoever uploaded a change can't settle it. With one supervisor, what they upload waits for the admin team.",
    manage: "Manage the team",
  },
});

type Gap = { code: string; flag: Exclude<TeamFlag, "ok"> };

/** تحذير التغطية: دولٌ بأقلّ من مشرفَين داخلَين، فلا يجد ما يرفعه مشرفها من يحسمه. */
function CoverageWarning({
  access,
  onManage,
}: {
  access: CountryAccess;
  onManage: (code: string) => void;
}) {
  const c = useCopy(COPY);
  const tc = useCopy(TRUST_COPY);
  const locale = useLocale();
  const dk = useDataKey([]);
  const fetchTeam = useDataFn("trust.team", getTrustTeam);
  const fetchStaff = useDataFn("golden.staff", listCountryStaff);
  // الإدارة: فرق الدول كلّها من «مركز الثقة». المشرف: فريق دوله التي يديرها (`manage`).
  const team = useQuery({
    queryKey: [...dk, "trust-team"],
    queryFn: () => fetchTeam(),
    enabled: access.admin,
  });
  const managed = access.admin
    ? []
    : access.countries.filter((k) => canDo(access, k.code, "manage")).map((k) => k.code);
  const staff = useQueries({
    queries: managed.map((code) => ({
      queryKey: [...dk, "country-staff", code],
      queryFn: () => fetchStaff({ data: { country: code } }),
    })),
  });

  const gaps: Gap[] = [];
  if (access.admin && team.data?.ok)
    for (const r of team.data.data) {
      const f = teamFlag(r);
      if (f !== "ok") gaps.push({ code: r.code, flag: f });
    }
  staff.forEach((q, i) => {
    if (!q.data?.ok) return;
    const sup = q.data.data.filter((m) => m.role === "supervisor");
    const f: TeamFlag =
      sup.length < 2
        ? "one_supervisor"
        : sup.filter((m) => !m.pending).length < 2
          ? "invited_only"
          : "ok";
    if (f !== "ok") gaps.push({ code: managed[i]!, flag: f });
  });
  if (gaps.length === 0) return null;

  return (
    <section
      role="note"
      aria-labelledby="coverage-title"
      className="border-bridge/60 bg-bridge/10 rounded-2xl border p-4 sm:p-5"
    >
      <h4 id="coverage-title" className="flex items-center gap-2 text-sm font-bold">
        <Users className="text-bridge-ink size-4" aria-hidden="true" />
        {c.coverageTitle}
      </h4>
      <p className="text-muted-foreground mt-1 text-xs leading-6 text-pretty">{c.coverageHint}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {gaps.map((g) => (
          <li key={g.code}>
            <button
              type="button"
              onClick={() => onManage(g.code)}
              className="border-border bg-card hover:border-primary/50 focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span aria-hidden="true">{flagOf(g.code)}</span>
              <span className="font-bold">{countryName(g.code, locale)}</span>
              <span className="text-muted-foreground text-xs">{tc.flags[g.flag]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * درج الدولة الواحد: صحّة بياناتها، ووضع منصّة مكتبها، والتنبيهات والتعارضات والربط،
 * والرفع والفريق — بحسب الدور. الإدارة تفتحه من «الدول» (`scope="admin"`)، وفريق
 * الدولة من «بيانات الدولة» (`scope="country"`): التخطيط نفسه للجميع، والقاعدة تحرس.
 */
export function CountryWorkspace({
  scope,
  access,
  country,
  setCountry,
  tab,
  setTab,
}: {
  scope: "admin" | "country";
  access: CountryAccess;
  country: string;
  setCountry: (code: string) => void;
  tab?: WorkTab | undefined;
  setTab?: ((t: WorkTab) => void) | undefined;
}) {
  return (
    <div className="space-y-6" data-scope={scope}>
      <CoverageWarning
        access={access}
        onManage={(code) => {
          setCountry(code);
          setTab?.("team");
        }}
      />
      <SourcesPanel
        country={country}
        setCountry={setCountry}
        access={access}
        tab={tab}
        setTab={setTab}
        inToday={scope === "country"}
      />
    </div>
  );
}
