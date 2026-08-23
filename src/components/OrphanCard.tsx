import { Link } from "@tanstack/react-router";
import { MapPin, GraduationCap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
        {orphan.photo_url ? (
          <img
            src={orphan.photo_url}
            alt={`صورة رمزية لملف ${orphan.display_name}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="surface-warm flex size-full items-center justify-center text-4xl font-extrabold text-primary/40">
            {orphan.display_name.slice(0, 1)}
          </div>
        )}
        <Badge
          className="absolute end-3 top-3"
          variant={full ? "secondary" : "default"}
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
          <Progress value={percent} className="h-2" />
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
