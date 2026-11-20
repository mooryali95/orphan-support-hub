import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";

export type StatTone = "primary" | "gold" | "muted" | "need" | "thrive";

const TONE: Record<StatTone, string> = {
  primary: "text-primary",
  gold: "text-bridge-ink",
  muted: "text-foreground",
  need: "text-shore-need",
  thrive: "text-shore-thrive",
};

/**
 * مؤشّرٌ واحد: رقمٌ كبير وتسميةٌ تحته. موحّدٌ في كل اللوحات (UI-13) كي يُقرأ
 * المؤشّر بالعين نفسها أينما ظهر — لا نسخةٌ ثانية بالتسمية فوق الرقم.
 *
 * `loading` يرسم هيكلاً بارتفاع الرقم نفسه، فلا يقفز ما تحته حين يصل (RT-07).
 *
 * العدد الصحيح المجرّد يُعدّ مرّةً واحدة حين يدخل الشاشة من تحت الطيّة (CountUp)؛ وما كان
 * ظاهراً عند الفتح، والمبالغ والنسب والنصوص، تبقى ثابتة.
 */
const PLAIN_INTEGER = /^\d{1,9}$/;

export function StatTile({
  label,
  value,
  hint,
  tone = "primary",
  loading = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      {loading ? (
        <Skeleton className="h-9 w-20" aria-hidden="true" />
      ) : (
        <p className={cn("text-[1.75rem] leading-9 font-extrabold tabular-nums", TONE[tone])}>
          {PLAIN_INTEGER.test(value) ? <CountUp value={Number(value)} /> : value}
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
  );
}
