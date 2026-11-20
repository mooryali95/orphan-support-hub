/**
 * محطّات الداعم — تقديرٌ هادئ لما تحقّق فعلاً، والمحطّة القادمة ظاهرة. تُحسب من «أثري» نفسها
 * (أطفالٌ في الرعاية، أشهرها، حاجةٌ اكتملت)، فلا تُمنح بلا أصل.
 */
import type { MyImpact } from "@/lib/my-impact";

export type Milestone = {
  key: "first" | "m3" | "m6" | "complete" | "two" | "y1";
  title: string;
  hint: string;
  done: boolean;
};

export function milestones(m: MyImpact): Milestone[] {
  const longest = Math.max(0, ...m.children.map((c) => c.months));
  const completed = m.children.some((c) => c.active && c.share > 0 && c.covered >= 1);
  return [
    {
      key: "first",
      title: "الكفالة الأولى",
      hint: "بدأتَ: طفلٌ لم يعد ينتظر وحده.",
      done: m.children.length > 0,
    },
    {
      key: "complete",
      title: "أكملتَ حاجة طفل",
      hint: "حين تبلغ تغطية حاجته الشهرية 100% وأنت من كافليه.",
      done: completed,
    },
    {
      key: "m3",
      title: "ثلاثة أشهر",
      hint: "ثلاثة تقارير شهرية، كلٌّ بمستند تسليمه.",
      done: longest >= 3,
    },
    {
      key: "two",
      title: "طفلان في رعايتك",
      hint: "كفالةٌ ثانية جارية.",
      done: m.inCare >= 2,
    },
    {
      key: "m6",
      title: "نصف سنة",
      hint: "ستة أشهرٍ متّصلة: يظهر أثرها في دراسته.",
      done: longest >= 6,
    },
    {
      key: "y1",
      title: "سنةٌ كاملة",
      hint: "سنةٌ من الرعاية المتّصلة لطفلٍ واحد.",
      done: longest >= 12,
    },
  ];
}

/** أوّل محطّةٍ لم تتحقّق بعد، أو لا شيء إن تحقّقت كلّها */
export const nextMilestone = (list: Milestone[]) => list.find((x) => !x.done) ?? null;
