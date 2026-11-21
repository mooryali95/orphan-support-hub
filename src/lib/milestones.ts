/**
 * محطّات الداعم — تقديرٌ هادئ لما تحقّق فعلاً، والمحطّة القادمة ظاهرة. تُحسب من «أثري» نفسها
 * (أطفالٌ في الرعاية، أشهرها، حاجةٌ اكتملت)، فلا تُمنح بلا أصل.
 */
import { copyOf, defineCopy, type Locale } from "@/lib/locale";
import type { MyImpact } from "@/lib/my-impact";

const COPY = defineCopy("lib/milestones", {
  ar: {
    first: ["الكفالة الأولى", "بدأتَ: طفلٌ لم يعد ينتظر وحده."],
    complete: ["أكملتَ حاجة طفل", "حين تبلغ تغطية حاجته الشهرية 100% وأنت من كافليه."],
    m3: ["ثلاثة أشهر", "ثلاثة تقارير شهرية، كلٌّ بمستند تسليمه."],
    two: ["طفلان في رعايتك", "كفالةٌ ثانية جارية."],
    m6: ["نصف سنة", "ستة أشهرٍ متّصلة: يظهر أثرها في دراسته."],
    y1: ["سنةٌ كاملة", "سنةٌ من الرعاية المتّصلة لطفلٍ واحد."],
  },
  en: {
    first: ["First sponsorship", "You have begun: one child no longer waits alone."],
    complete: [
      "A child's need completed",
      "When a child's monthly need reaches 100% and you are among the sponsors.",
    ],
    m3: ["Three months", "Three monthly reports, each with its delivery record."],
    two: ["Two children in your care", "A second sponsorship under way."],
    m6: ["Half a year", "Six unbroken months: it shows in the child's schooling."],
    y1: ["A full year", "A year of unbroken care for one child."],
  },
});

export type Milestone = {
  key: "first" | "m3" | "m6" | "complete" | "two" | "y1";
  title: string;
  hint: string;
  done: boolean;
};

export function milestones(m: MyImpact, locale: Locale = "ar"): Milestone[] {
  const t = copyOf(COPY, locale);
  const text = (key: Milestone["key"]) => ({ key, title: t[key][0]!, hint: t[key][1]! });
  const longest = Math.max(0, ...m.children.map((c) => c.months));
  const completed = m.children.some((c) => c.active && c.share > 0 && c.covered >= 1);
  return [
    { ...text("first"), done: m.children.length > 0 },
    { ...text("complete"), done: completed },
    { ...text("m3"), done: longest >= 3 },
    { ...text("two"), done: m.inCare >= 2 },
    { ...text("m6"), done: longest >= 6 },
    { ...text("y1"), done: longest >= 12 },
  ];
}

/** أوّل محطّةٍ لم تتحقّق بعد، أو لا شيء إن تحقّقت كلّها */
export const nextMilestone = (list: Milestone[]) => list.find((x) => !x.done) ?? null;
