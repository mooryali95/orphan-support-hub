import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";

import { useGivingCopy, type GivingTrack } from "@/config/giving-tracks";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/support/GivingTrackChoice", {
  ar: {
    legend: "نوع العطاء",
    monthlyTitle: (whom: string) => `كفالة مادية — ${whom}`,
    monthlyChild: (name: string) =>
      `مبلغٌ ثابت كلّ شهر لـ${name}، تراه في جدولٍ واحد: متى دُفع، ومتى وصله بمستند.`,
    monthlyPlace: (whom: string) =>
      `الكفالة المادية لطفلٍ بعينه. اختر من أطفال ${whom} من ينتظر كافلاً، فتبقى بطاقته وأثره بين يديك كلّ شهر.`,
    childPick: (whom: string) =>
      `ادعم طفلاً بعينه في ${whom}: اختره من الدليل، ثم ادعمه من صفحته بالأنواع الثلاثة.`,
  },
  en: {
    legend: "Kind of giving",
    monthlyTitle: (whom: string) => `Financial sponsorship — ${whom}`,
    monthlyChild: (name: string) =>
      `A fixed amount every month for ${name}, shown in one table: when it was paid, and when it reached them with a document.`,
    monthlyPlace: (whom: string) =>
      `Financial sponsorship is for one child. Choose a child waiting for a sponsor in ${whom}, and their card and impact stay with you every month.`,
    childPick: (whom: string) =>
      `Support one child in ${whom}: choose them from the directory, then support them from their page in all three ways.`,
  },
});

/** ترتيب المسارات الثلاثة كما في «اختر أثرك» على الصفحة الأولى. */
export const SHEET_TRACKS = [
  "qualification",
  "monthly",
  "in_kind",
] as const satisfies readonly GivingTrack[];

const chip = (on: boolean) =>
  cn(
    "flex min-h-11 flex-1 basis-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[background-color,border-color,transform] active:scale-[0.97] disabled:opacity-40",
    on
      ? "border-primary bg-primary text-primary-foreground shadow-soft"
      : "border-border bg-background hover:border-primary/60",
  );

/**
 * المسارات الثلاثة في ورقة الدعم — حقيقيةً وتجريبية، لكل هدف: طفل، أو مجموعة، أو منطقة، أو دولة،
 * أو مؤسسة. الأسماء ووعد كلّ مسار من مكانها الواحد (config/giving-tracks).
 */
export function GivingTrackChoice({
  value,
  onChange,
  disabled,
}: {
  value: GivingTrack;
  onChange: (track: GivingTrack) => void;
  disabled?: (track: GivingTrack) => boolean;
}) {
  const t = useCopy(COPY);
  const g = useGivingCopy();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.legend}</legend>
      <div className="flex gap-1.5">
        {SHEET_TRACKS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            data-kind={k}
            disabled={disabled?.(k)}
            onClick={() => onChange(k)}
            className={chip(value === k)}
          >
            {value === k && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
            <span className="truncate">{g.tracks[k].name}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{g.tracks[value].promise}</p>
    </fieldset>
  );
}

/**
 * الكفالة المادية في الورقة: لطفلٍ بعينه دائماً. على طفلٍ تقود إلى كفالته؛ وعلى مكانٍ إلى أطفاله.
 * `action` رابط الوجهة (حقيقية أو تجريبية) تمرّره الورقة.
 */
export function MonthlyTrackPanel({
  whom,
  childName,
  action,
}: {
  whom: string;
  childName?: string | null | undefined;
  action: ReactNode;
}) {
  const t = useCopy(COPY);
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4" data-monthly-panel>
      <p className="font-bold">{t.monthlyTitle(childName ?? whom)}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {childName ? t.monthlyChild(childName) : t.monthlyPlace(whom)}
      </p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

/** «طفلٌ بعينه» في مكانٍ لا يُختار فيه الطفل من البطاقة: الدليل ثم صفحته، بالأنواع الثلاثة. */
export function ChildPickPanel({ whom, action }: { whom: string; action: ReactNode }) {
  const t = useCopy(COPY);
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4" data-child-pick>
      <p className="text-sm leading-6">{t.childPick(whom)}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

/** زرّ الوجهة في اللوحتين: سهمٌ باتجاه اللغة. */
export function TrackArrow() {
  return <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />;
}
