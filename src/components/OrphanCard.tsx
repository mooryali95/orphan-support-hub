import { Link } from "@tanstack/react-router";
import { MapPin, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { ageFromBirthDate, formatMoney, fundingPercent } from "@/lib/format";

export type PublicOrphan = {
  id: string;
  code: string;
  display_name: string;
  gender: string;
  birth_date: string | null;
  city: string | null;
  region: string | null;
  story: string | null;
  photo_url: string | null;
  education_stage: string | null;
  monthly_need: number | string;
  funded_monthly: number | string;
  currency: string;
  status: string;
};

export function OrphanCard({ orphan }: { orphan: PublicOrphan }) {
  const age = ageFromBirthDate(orphan.birth_date);
  const percent = fundingPercent(orphan.monthly_need, orphan.funded_monthly);
  const full = orphan.status === "fully_sponsored" || percent >= 100;
  const gap = Math.max(0, Number(orphan.monthly_need) - Number(orphan.funded_monthly));

  return (
    // البطاقة ليست رابطاً كاملاً: الاسم هو الرابط ويمتدّ غطاؤه على البطاقة.
    // فيبقى الاسم وحده هو الاسم المتاح لقارئ الشاشة بدل فقرة كاملة.
    <article className="group border-border bg-card relative flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <div
        className={
          // الصورة الحقيقية تستحق مساحتها؛ النائب لا يحمل معلومة فيُختصر.
          orphan.photo_url
            ? "bg-secondary relative aspect-[4/3] overflow-hidden"
            : "bg-secondary relative aspect-[16/6] overflow-hidden"
        }
      >
        <MuralImage
          photoUrl={orphan.photo_url}
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
            {age !== null && <span>{age} سنة</span>}
            {orphan.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" /> {orphan.city}
              </span>
            )}
            {orphan.education_stage && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="size-3" aria-hidden="true" /> {orphan.education_stage}
              </span>
            )}
          </p>
        </div>

        {orphan.story && (
          <p className="text-muted-foreground line-clamp-2 text-sm leading-6">{orphan.story}</p>
        )}

        <div className="mt-auto space-y-2">
          {/* المتبقّي هو الرقم الذي يُتّخذ القرار عليه، فيسبق النسبة لا يتبعها. */}
          <div className="flex items-baseline justify-between gap-2">
            {full ? (
              <span className="text-shore-thrive text-sm font-bold">اكتمل احتياجه الشهري</span>
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
