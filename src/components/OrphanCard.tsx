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

  return (
    <Link
      to="/orphans/$orphanId"
      params={{ orphanId: orphan.id }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
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
              ? "absolute end-3 top-3 bg-shore-thrive text-white"
              : "absolute end-3 top-3 bg-shore-need text-white"
          }
        >
          {full ? "مكفول بالكامل" : "بحاجة لكافل"}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-base font-bold">{orphan.display_name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{orphan.gender === "female" ? "أنثى" : "ذكر"}</span>
            {age !== null && <span>{age} سنة</span>}
            {orphan.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" /> {orphan.city}
              </span>
            )}
            {orphan.education_stage && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="size-3" /> {orphan.education_stage}
              </span>
            )}
          </p>
        </div>

        {orphan.story && (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{orphan.story}</p>
        )}

        <div className="mt-auto space-y-2">
          <CrossingProgress
            percent={percent}
            label={`تغطية احتياج ${orphan.display_name} الشهري`}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              {formatMoney(orphan.funded_monthly, orphan.currency)} /{" "}
              {formatMoney(orphan.monthly_need, orphan.currency)} شهرياً
            </span>
            <span className="text-muted-foreground">{percent}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
