import { Link } from "@tanstack/react-router";
import { MapPin, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { TrustSignals } from "@/components/orphan/TrustSignals";
import { formatMoney, fundingPercent } from "@/lib/format";
import { AGE_BAND_LABELS, type OrphanCardRow } from "@/integrations/supabase/types.extra";
import { COLORS } from "@/config/brand-colors";
import { defineCopy, placeLabel, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/OrphanCard", {
  ar: {
    full: "مكفول بالكامل",
    needs: "بحاجة لكافل",
    female: "أنثى",
    male: "ذكر",
    years: "سنة",
    ages: AGE_BAND_LABELS as Record<string, string>,
    complete: "اكتمل احتياجه الشهري",
    surplus: "فائض",
    remaining: "متبقٍّ شهرياً",
    coverage: (name: string) => `تغطية احتياج ${name} الشهري`,
    of: "من",
  },
  en: {
    full: "Fully sponsored",
    needs: "Needs a sponsor",
    female: "Girl",
    male: "Boy",
    years: "years",
    ages: {
      under_6: "Under 6",
      age_6_11: "6–11",
      age_12_14: "12–14",
      age_15_17: "15–17",
      age_18_plus: "18+",
      unknown: "Unknown",
    } as Record<string, string>,
    complete: "Monthly need covered",
    surplus: "surplus",
    remaining: "still needed monthly",
    coverage: (name: string) => `Coverage of ${name}'s monthly need`,
    of: "of",
  },
});

const C = COLORS.light;

/**
 * بطاقة الدليل — ما يكفي ليُقرَّر، ولا يكفي ليُعرَف الطفل.
 *
 * لا قصّة، ولا صورة، ولا مدينة، ولا عمرٌ بالسنة: **فئةٌ عمرية وبلد**.
 * والقاعدة هي من تمنع لا هذا المكوّن — المنح مضيَّقة على الجدول نفسه،
 * فلا يُلتفّ على البطاقة بنداءٍ مباشر.
 */
export type PublicOrphan = OrphanCardRow;

/** لونٌ هادئ ثابتٌ لكل منطقة: يميّز البطاقات بالمكان لا بالطفل. */
const TINTS = [C.green, C.gold, C.slate, C.success, C.goldInk];
export function regionTint(region: string | null | undefined): string {
  if (!region) return C.line;
  let h = 0;
  for (const ch of region) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

export function OrphanCard({ orphan }: { orphan: PublicOrphan }) {
  const locale = useLocale();
  const c = useCopy(COPY);
  const percent = fundingPercent(orphan.monthly_need, orphan.funded_monthly);
  const full = orphan.status === "fully_sponsored" || percent >= 100;
  const gap = Math.max(0, Number(orphan.monthly_need) - Number(orphan.funded_monthly));
  const surplus = Math.max(0, Number(orphan.funded_monthly) - Number(orphan.monthly_need));

  return (
    // البطاقة ليست رابطاً كاملاً: الاسم هو الرابط ويمتدّ غطاؤه على البطاقة.
    // فيبقى الاسم وحده هو الاسم المتاح لقارئ الشاشة بدل فقرة كاملة.
    <article
      style={{ borderTopColor: regionTint(orphan.region) }}
      className="group border-border bg-card relative flex h-full flex-col overflow-hidden rounded-2xl border border-t-4 shadow-sm transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
    >
      {/* لا صورة في الدليل: الصورة تفصيلٌ خلف الإذن، فيبقى النائب
          الهوياتيّ وحده — وهو لا يحمل معلومةً عن الطفل فيُختصر. */}
      <div className="bg-secondary relative aspect-[16/6] overflow-hidden">
        <MuralImage
          photoUrl={null}
          displayName={orphan.display_name}
          register={registerFor(orphan.status, percent)}
          className="size-full"
          imgClassName="transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
        />
        <Badge
          className={
            full
              ? "bg-shore-thrive absolute end-3 top-3 text-white"
              : "bg-shore-need absolute end-3 top-3 text-white"
          }
        >
          {full ? c.full : c.needs}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="text-lg font-bold">
            <Link
              to="/orphans/$orphanId"
              params={{ orphanId: orphan.id }}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-['']"
            >
              {orphan.display_name}
            </Link>
          </h2>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{orphan.gender === "female" ? c.female : c.male}</span>
            {orphan.age_band !== "unknown" && (
              <span>
                {c.ages[orphan.age_band]} {c.years}
              </span>
            )}
            {(orphan.country ?? orphan.region) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />{" "}
                {placeLabel(orphan.country, orphan.region, locale)}
              </span>
            )}
            {orphan.education_stage && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="size-3" aria-hidden="true" /> {orphan.education_stage}
              </span>
            )}
          </p>
        </div>

        {/* بدل القصّة: الشارات الأربع (البروفايل، الصورة، البناء، التقرير) — ما يعني
            الكافل فعلاً، لا حكايةَ فقدٍ تُروى عن طفلٍ لغريب. */}
        {/* كم نعرف عنه — أعدادٌ ونعم/لا من القاعدة، لا محتوى. */}
        <TrustSignals
          compact
          profileSections={orphan.profile_sections}
          consentDocumented={orphan.consent_documented}
          building={orphan.building}
          recentReport={orphan.recent_report}
        />

        <div className="mt-auto space-y-2">
          {/* المتبقّي هو الرقم الذي يُتّخذ القرار عليه، فيسبق النسبة لا يتبعها. */}
          <div className="flex items-baseline justify-between gap-2">
            {full ? (
              <span className="text-sm font-bold">
                <span className="text-shore-thrive">{c.complete}</span>
                {/* الفائض يُذكر في البطاقة أيضاً: هو تمييز للملف لا خلل فيه. */}
                {surplus > 0 && (
                  <span className="text-bridge-ink font-normal">
                    {" "}
                    + {formatMoney(surplus, orphan.currency, locale)} {c.surplus}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm font-bold">
                <span className="text-bridge-ink">{formatMoney(gap, orphan.currency, locale)}</span>
                <span className="text-muted-foreground font-normal"> {c.remaining}</span>
              </span>
            )}
            <span className="text-muted-foreground text-xs tabular-nums">{percent}%</span>
          </div>
          <CrossingProgress percent={percent} label={c.coverage(orphan.display_name)} />
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatMoney(orphan.funded_monthly, orphan.currency, locale)} {c.of}{" "}
            {formatMoney(orphan.monthly_need, orphan.currency, locale)}
          </p>
        </div>
      </div>
    </article>
  );
}
