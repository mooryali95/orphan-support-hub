/**
 * ما تقدّمه المنصّة الآن — من مكانٍ واحد.
 *
 * اليوم: كفالةٌ شهرية لطفلٍ بعينه، ودعمٌ لبرامج التأهيل (طفل، مجموعة،
 * منطقة، دولة، مؤسسة). ليس تبرّعاً عاماً: كل مبلغٍ مربوطٌ بطفلٍ أو برنامجٍ
 * مسمّى، ويعود أثره تقريراً. والتبرّعات العامة تُضاف لاحقاً — حين تُفعَّل
 * يُغيَّر `donations` هنا فتتغيّر النصوص معها.
 */
import { defineCopy } from "@/lib/locale";

/** نصّ العرض للواجهة — في الفهرس فيُترجم لكل لغةٍ مفعّلة. */
export const OFFERING_COPY = defineCopy("config/offering", {
  ar: {
    title: "كفالةٌ ودعمٌ للتأهيل — لا تبرّعٌ عام",
    text: "ما تقدّمه هنا كفالةٌ شهرية لطفلٍ بعينه، أو دعمٌ لبرنامج تأهيلٍ مسمّى. كل مبلغٍ مربوطٌ بطفلٍ أو برنامج، وتتابع ما بُني به جلسةً جلسة.",
    later: "التبرّعات العامة ستُضاف لاحقاً.",
  },
  en: {
    title: "Sponsorship and qualification support — not a general donation",
    text: "What you give here is a monthly sponsorship for a specific child, or support for a named qualification program. Every amount is tied to a child or a program, and you follow what it built, session by session.",
    later: "General donations will be added later.",
  },
});

export const OFFERING = {
  donations: false,
  ...OFFERING_COPY.ar,
  en: OFFERING_COPY.en,
} as const;
