/**
 * مساعد الداعمين في العرض التفاعلي: إجاباتٌ جاهزة من نصوص المنصّة المنشورة، تُسجَّل في منفذ
 * البيانات (`assistant.reply`) فتُجيب الشاشة الحقيقية نفسها دون أن يُنادى الخادم أو بوّابة
 * الذكاء الاصطناعي. ما يُذكر عن طفلٍ هو ما على بطاقته العامّة النموذجية وحده.
 * (من ملفّات التجربة في `trial.manifest.json`.)
 */
import { registerDemo } from "@/lib/data-port";
import { copyOf, defineCopy } from "@/lib/locale";
import { localTryChild, tryChild } from "@/lib/try-demo";

const COPY = defineCopy("lib/try-ask", {
  ar: {
    start:
      "تبدأ الكفالة من دليل الأيتام: اختر ملفّاً منشوراً، ثم المبلغ الشهري، ثم سجّل الدخول وادفع. بعد أوّل دفعة تصلك تقارير الأثر من المكتب المتابع. [خطوات الكفالة](/how-it-works)",
    pause:
      "نعم. من صفحة الكفالة في حسابك تختار الإيقاف المؤقّت أو الإنهاء، ويُخبَر المكتب المتابع ليبحث للطفل عن كافلٍ آخر. لا يُخصم شيءٌ بعد الإيقاف.",
    privacy:
      "لا يُنشر من ملفّ الطفل إلا بطاقته العامّة: الاسم المنشور ورمز الملفّ والبلد والمرحلة. الصور والعنوان ومعلومات الأسرة تبقى خلف بوّابة الوصول، ولا يراها إلا من له صلةٌ موثّقة بالطفل.",
    general:
      "أجيب في هذا العرض عن ثلاثة أمور: بدء الكفالة، وإيقافها، وحماية معلومات الطفل. جرّب أحد الأسئلة المقترحة، أو اختر ملفّاً من القائمة.",
    child: (name: string, code: string, country: string, stage: string, covers: string) =>
      `من البطاقة العامّة للملفّ ${code}: ${name} في ${country}، ${stage}. الكفالة الشهرية تغطّي ${covers}. هذا كلّ ما هو منشور، وبقية الملفّ محميّة.`,
  },
  en: {
    start:
      "A sponsorship starts in the orphan directory: pick a published file, choose the monthly amount, then sign in and pay. After the first payment, impact reports arrive from the office that follows the child. [Sponsorship steps](/how-it-works)",
    pause:
      "Yes. From the sponsorship page in your account you can pause or end it, and the following office is told so it can look for another sponsor. Nothing is charged after you pause.",
    privacy:
      "Only a child's public card is published: the published name, file code, country and stage. Photos, address and family details stay behind the access gate, visible only to those with a verified link to the child.",
    general:
      "In this demo I answer three things: starting a sponsorship, pausing it, and how a child's information is protected. Try a suggested question, or pick a file from the list.",
    child: (name: string, code: string, country: string, stage: string, covers: string) =>
      `From the public card of file ${code}: ${name} in ${country}, ${stage}. The monthly sponsorship covers ${covers}. That is all that is published; the rest of the file is protected.`,
  },
});

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

/** الإجابة الجاهزة لسؤال، من البطاقة العامّة إن اختير ملفّ. */
export function preparedAnswer(question: string, locale: string, orphanId?: string): string {
  const c = copyOf(COPY, locale);
  const q = question.toLowerCase();
  if (has(q, ["أوقف", "إيقاف", "pause", "stop", "end"])) return c.pause;
  if (has(q, ["تُحمى", "حماية", "خصوص", "protect", "privacy", "private"])) return c.privacy;
  if (has(q, ["أبدأ", "ابدأ", "بدء", "start", "begin", "how do i"])) return c.start;
  const raw = orphanId ? tryChild(orphanId) : undefined;
  if (raw) {
    const k = localTryChild(raw, locale === "ar" ? "ar" : "en");
    return c.child(k.name, k.code, k.country, k.stage, k.covers);
  }
  return c.general;
}

/**
 * يسجّل الإجابات الجاهزة. تناديه صفحة `/try/ask` صراحةً
 * (`package.json` يعلن `sideEffects: false`، فالاستيراد المجرّد يُحذف من الحزمة).
 */
export function registerAskDemos() {
  registerDemo(
    "assistant.reply",
    async ({ data }: { data: { question: string; locale: string; orphanId?: string } }) =>
      preparedAnswer(data.question, data.locale, data.orphanId),
  );
}
