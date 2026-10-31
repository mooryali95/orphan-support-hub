import { Camera, FileCheck2, Hammer, type LucideIcon } from "lucide-react";

import { defineCopy, pluralOf, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const PROFILE_SECTIONS_TOTAL = 6;

const COPY = defineCopy("components/orphan/TrustSignals", {
  ar: {
    label: "ما نعرفه عن هذا الطفل",
    profile: (n: number, t: number) => `${n} من ${t} أقسام بروفايله موثّقة`,
    profileShort: (n: number, t: number) => `${n}/${t}`,
    photo: "موافقةُ صورةٍ موثّقة",
    noPhoto: "لا موافقة صورة",
    building: "برنامج تأهيلٍ قائم",
    noBuilding: "لم يبدأ برنامج التأهيل بعد",
    report: "تقريرٌ معتمد آخر ٩٠ يوماً",
    noReport: "لا تقرير حديث",
    dotsLabel: (n: number, t: number) => `اكتمال البروفايل: ${n} من ${t}`,
    missing: "ينقصه:",
    complete: "البروفايل مكتمل",
  },
  en: {
    label: "What we know about this child",
    profile: pluralOf({
      one: "{0} of {1} profile section documented",
      other: "{0} of {1} profile sections documented",
    }),
    profileShort: (n: number, t: number) => `${n}/${t}`,
    photo: "Documented photo consent",
    noPhoto: "No photo consent",
    building: "Qualification program under way",
    noBuilding: "Qualification program not started yet",
    report: "Approved report in the last 90 days",
    noReport: "No recent report",
    dotsLabel: pluralOf({
      one: "Profile completeness: {0} of {1}",
      other: "Profile completeness: {0} of {1}",
    }),
    missing: "Missing:",
    complete: "Profile complete",
  },
});

/**
 * ستّ نقاط — واحدةٌ لكل قسمٍ من البروفايل. نقاطٌ لا نسبة: النسبة توحي
 * بتنافسٍ بين الأطفال، والنقاط تقول «هذا ما عُبّئ» فحسب.
 */
export function ProfileDots({
  filled,
  total = PROFILE_SECTIONS_TOTAL,
  size = "sm",
  className,
}: {
  filled: number;
  total?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useCopy(COPY);
  const n = Math.max(0, Math.min(total, filled));
  return (
    <span
      role="img"
      aria-label={t.dotsLabel(n, total)}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "rounded-full transition-colors",
            size === "md" ? "size-2.5" : "size-1.5",
            i < n ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

/**
 * أربع إشاراتٍ تُغني عن النصّ وتبني الثقة قبل النقر. ما غاب يُعرض خافتاً
 * لا مخفيّاً، فلا يُظنّ أنّ الإشارة غير موجودة.
 */
export function TrustSignals({
  profileSections,
  consentDocumented,
  building,
  recentReport,
  compact = false,
  className,
}: {
  profileSections: number | undefined;
  consentDocumented: boolean | undefined;
  building: boolean;
  recentReport: boolean | undefined;
  compact?: boolean;
  className?: string;
}) {
  const t = useCopy(COPY);
  const n = profileSections ?? 0;
  const items: Array<{ key: string; on: boolean; icon?: LucideIcon; text: string; dots?: true }> = [
    {
      key: "profile",
      on: n > 0,
      text: compact
        ? t.profileShort(n, PROFILE_SECTIONS_TOTAL)
        : t.profile(n, PROFILE_SECTIONS_TOTAL),
      dots: true,
    },
    {
      key: "photo",
      on: Boolean(consentDocumented),
      icon: Camera,
      text: consentDocumented ? t.photo : t.noPhoto,
    },
    { key: "building", on: building, icon: Hammer, text: building ? t.building : t.noBuilding },
    {
      key: "report",
      on: Boolean(recentReport),
      icon: FileCheck2,
      text: recentReport ? t.report : t.noReport,
    },
  ];
  return (
    <ul
      aria-label={t.label}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs", className)}
    >
      {/* الشارات الأربع دائماً — في البطاقة أيقوناتٌ ونصّها للقارئ والتلميح؛
          الحاضرة بلونها والغائبة خافتة، فيُقرأ «ما ينقص» بقدر «ما يوجد». */}
      {items.map(({ key, on, icon: Icon, text, dots }) => (
        <li
          key={key}
          title={dots ? t.profile(n, PROFILE_SECTIONS_TOTAL) : text}
          className={cn(
            "inline-flex items-center gap-1.5",
            on
              ? key === "building"
                ? "text-shore-thrive"
                : "text-foreground"
              : "text-muted-foreground/60",
          )}
        >
          {dots ? (
            <ProfileDots filled={n} />
          ) : (
            Icon && <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className={cn(compact && !dots && "sr-only")}>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/** عنوانٌ صغير للدائرة: النقاط، وأسماء الأقسام الناقصة. */
export function CompletenessLine({
  filled,
  missing,
  labels,
  className,
}: {
  filled: number;
  missing: string[];
  labels: Record<string, string>;
  className?: string;
}) {
  const t = useCopy(COPY);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      <ProfileDots filled={filled} size="md" />
      <span className="tabular-nums font-medium">
        {t.profileShort(filled, PROFILE_SECTIONS_TOTAL)}
      </span>
      {missing.length === 0 ? (
        <span className="text-primary">{t.complete}</span>
      ) : (
        <span className="text-muted-foreground">
          {t.missing} {missing.map((m) => labels[m] ?? m).join("، ")}
        </span>
      )}
    </div>
  );
}
