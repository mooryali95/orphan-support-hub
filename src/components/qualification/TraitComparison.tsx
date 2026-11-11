import { ArrowLeftRight } from "lucide-react";

import { compareAssessments, CORE_TRAIT_THRESHOLD } from "@/lib/qualification.functions";
import type { AssessmentRow } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

const TRAIT_NAMES: Record<string, string> = {
  dirayah: "الدراية",
  himmah: "الحمية",
  azm: "العزم",
  rushd: "الرشد",
  maalat: "المآلات",
  tadbir: "التدبير",
};

const PHASE_NAMES: Record<string, string> = {
  baseline: "أوّلي",
  progress: "مرحلي",
  final: "ختامي",
};

/**
 * مقياس ما قبل البرنامج وبعده جنباً إلى جنب.
 *
 * ولا أسهم خضراء وحمراء هنا عمداً: **الخريطة نسبية مجموعها مئة**،
 * فانخفاض سمةٍ قد يكون إعادةَ توزيعٍ لا تراجعاً. وتلوينُ الفروق يقرأ
 * الأداة قراءةً خاطئة ويحكم على طفلٍ بما لا تقوله أرقامه — والمنهجية
 * تقول صراحةً: **القياس أداة بناء لا اختبار**.
 *
 * فالدالّ هو استقرار البناء حول سمة قائدة، وهو ما يتصدّر؛ والفروق
 * تُعرض عدداً محايداً.
 */
export function TraitComparison({ assessments }: { assessments: AssessmentRow[] }) {
  const c = compareAssessments(assessments);
  if (!c) {
    const hasBaseline = assessments.some((a) => a.phase === "baseline");
    return (
      <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs leading-6 text-muted-foreground">
        {hasBaseline
          ? "لا مقارنة بعد: يلزم قياسٌ ثانٍ بعد الأوّلي."
          : "لا مقارنة بعد: يلزم قياسٌ أوّليّ قبل بدء البرنامج، وإلا فلا يُعرف من أين بدأ."}
      </p>
    );
  }

  const verdict = c.settled
    ? "استقرّ البناء حول سمةٍ قائدة بعد أن لم يكن مستقرّاً."
    : c.unsettled
      ? "كان البناء مستقرّاً حول سمةٍ قائدة ولم يعد — والقياس يُظهره ولا يُخفيه."
      : c.after.below
        ? "لم تستقرّ سمةٌ قائدة بعد — والبناء متّصل."
        : c.coreChanged
          ? `تحوّلت السمة القائدة من ${c.before.core} إلى ${c.after.core}.`
          : `السمة القائدة ${c.after.core} — ثابتةٌ بين القياسين.`;

  return (
    <section className="mt-3" aria-labelledby="trait-compare">
      <h5 id="trait-compare" className="flex items-center gap-1.5 text-xs font-bold">
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        ما قبل البرنامج وبعده
      </h5>

      <p className="mt-2 rounded-xl bg-secondary/60 p-3 text-xs leading-6">
        <strong>{verdict}</strong>
        <span className="mt-1 block text-muted-foreground">
          أعلى نصيب: {c.topBefore}٪ ← {c.topAfter}٪. والسمة تُعتمد قائدةً عند {CORE_TRAIT_THRESHOLD}
          ٪.
        </span>
      </p>

      <table className="mt-3 w-full text-xs">
        <caption className="sr-only">
          مقارنة توزيع السمات بين القياس {PHASE_NAMES[c.before.phase]} والقياس{" "}
          {PHASE_NAMES[c.after.phase]}
        </caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="pb-1 text-start font-medium">
              السمة
            </th>
            <th scope="col" className="pb-1 text-start font-medium">
              {PHASE_NAMES[c.before.phase]} — {formatDate(c.before.at)}
            </th>
            <th scope="col" className="pb-1 text-start font-medium">
              {PHASE_NAMES[c.after.phase]} — {formatDate(c.after.at)}
            </th>
            <th scope="col" className="pb-1 text-start font-medium">
              الفرق
            </th>
          </tr>
        </thead>
        <tbody>
          {c.deltas.map((d) => (
            <tr key={d.slug} className="border-t border-border/60">
              <th scope="row" className="py-1.5 text-start font-medium">
                {TRAIT_NAMES[d.slug] ?? d.slug}
              </th>
              <td className="py-1.5">
                <Bar value={d.before} muted />
              </td>
              <td className="py-1.5">
                <Bar value={d.after} />
              </td>
              {/* عدداً محايداً بلا لون: الانخفاض هنا إعادةُ توزيعٍ لا حكم.
                  و`bdi` لازمة: الإشارة محايدةُ الاتجاه، فتنقلب في سطرٍ
                  عربيّ فيُقرأ «+20» عشرين ناقصاً. */}
              <td className="py-1.5 text-muted-foreground">
                <bdi dir="ltr" className="tabular-nums">
                  {d.shift > 0 ? `+${d.shift}` : String(d.shift)}
                </bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        الخريطة نسبية مجموعها مئة، فانخفاض سمةٍ قد يكون إعادةَ توزيعٍ لا تراجعاً — نمت غيرُها فأخذت
        من نصيبها. ولذلك لا تُلوَّن الفروق: القياس أداة بناء لا اختبار.
      </p>
    </section>
  );
}

function Bar({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-border">
        <span
          className={`absolute inset-y-0 end-0 rounded-full ${muted ? "bg-muted-foreground/50" : "bg-shore-need"}`}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="tabular-nums">{value}٪</span>
    </span>
  );
}
