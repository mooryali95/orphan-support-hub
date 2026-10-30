import { Link } from "@tanstack/react-router";
import { MapPin, GraduationCap, Hammer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { formatMoney, fundingPercent } from "@/lib/format";
import { AGE_BAND_LABELS, type OrphanCardRow } from "@/integrations/supabase/types.extra";
import { COLORS } from "@/config/brand-colors";

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
  const percent = fundingPercent(orphan.monthly_need, orphan.funded_monthly);
  const full = orphan.status === "fully_sponsored" || percent >= 100;
  const gap = Math.max(0, Number(orphan.monthly_need) - Number(orphan.funded_monthly));
  const surplus = Math.max(0, Number(orphan.funded_monthly) - Number(orphan.monthly_need));

  return (
    // البطاقة ليست رابطاً كاملاً: الاسم هو الرابط ويمتدّ غطاؤه على البطاقة.
    // فيبقى الاسم وحده هو الاسم المتاح لقارئ الشاشة بدل فقرة كاملة.
    <article
      style={{ borderTopColor: regionTint(orphan.region) }}
      className="group border-border bg-card relative flex flex-col overflow-hidden rounded-2xl border border-t-4 shadow-sm transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
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
          {full ? "مكفول بالكامل" : "بحاجة لكافل"}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="text-base font-bold">
            <Link
              to="/orphans/$orphanId"
              params={{ orphanId: orphan.id }}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-['']"
            >
              {orphan.display_name}
            </Link>
          </h2>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>{orphan.gender === "female" ? "أنثى" : "ذكر"}</span>
            {orphan.age_band !== "unknown" && <span>{AGE_BAND_LABELS[orphan.age_band]} سنة</span>}
            {(orphan.country ?? orphan.region) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />{" "}
                {[orphan.country, orphan.region].filter(Boolean).join(" — ")}
              </span>
            )}
            {orphan.education_stage && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="size-3" aria-hidden="true" /> {orphan.education_stage}
              </span>
            )}
          </p>
        </div>

        {/* بدل القصّة: حالُ البناء — وهو ما يعني الكافل فعلاً، وليس
            حكايةَ فقدٍ تُروى عن طفلٍ لغريب. */}
        {orphan.building ? (
          <p className="text-shore-thrive inline-flex items-center gap-1.5 text-xs font-medium">
            <Hammer className="size-3.5" aria-hidden="true" />
            برنامج بناء أهلية قائم
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">برنامجه لم يبدأ بعد</p>
        )}

        <div className="mt-auto space-y-2">
          {/* المتبقّي هو الرقم الذي يُتّخذ القرار عليه، فيسبق النسبة لا يتبعها. */}
          <div className="flex items-baseline justify-between gap-2">
            {full ? (
              <span className="text-sm font-bold">
                <span className="text-shore-thrive">اكتمل احتياجه الشهري</span>
                {/* الفائض يُذكر في البطاقة أيضاً: هو تمييز للملف لا خلل فيه. */}
                {surplus > 0 && (
                  <span className="text-bridge-ink font-normal">
                    {" "}
                    + {formatMoney(surplus, orphan.currency)} فائض
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm font-bold">
                <span className="text-bridge-ink">{formatMoney(gap, orphan.currency)}</span>
                <span className="text-muted-foreground font-normal"> متبقٍّ شهرياً</span>
              </span>
            )}
            <span className="text-muted-foreground text-xs tabular-nums">{percent}%</span>
          </div>
          <CrossingProgress
            percent={percent}
            label={`تغطية احتياج ${orphan.display_name} الشهري`}
          />
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatMoney(orphan.funded_monthly, orphan.currency)} من{" "}
            {formatMoney(orphan.monthly_need, orphan.currency)}
          </p>
        </div>
      </div>
    </article>
  );
}
