/**
 * جاهزية الاعتماد — متى يصحّ تحويل المنصّة من «تجربة» إلى «حقيقي»
 * (src/config/platform.ts). كلّ شرطٍ يُقرأ من حال المنصّة الفعلية، لا يُعلَّم يدوياً.
 */
export type GoLiveInput = {
  /** ملفّات أطفالٍ منشورة في الدليل (معتمدة أو مكفولة) */
  published: number;
  /** دولٌ متّصلةٌ منصّةُ تشغيلها فعلاً */
  linked: number;
  /** بوابة الدفع مهيّأة على الخادم (أسماء المفاتيح موجودة، بلا قيمها) */
  payments: boolean | null;
};

export type GoLiveStep = {
  key: "children" | "operating" | "payments";
  title: string;
  done: boolean | null;
  detail: string;
};

export function goLiveSteps(i: GoLiveInput): GoLiveStep[] {
  return [
    {
      key: "children",
      title: "ملفّات أطفالٍ منشورة",
      done: i.published > 0,
      detail:
        i.published > 0
          ? `${i.published} ملفّاً منشوراً في الدليل.`
          : "لا ملفّ منشور بعد: تُدخلها الجهات وتعتمدها الإدارة من «طابور الاعتماد».",
    },
    {
      key: "operating",
      title: "منصّة تشغيلٍ مربوطة",
      done: i.linked > 0,
      detail:
        i.linked > 0
          ? `${i.linked} ${i.linked === 1 ? "دولةٌ مربوطة" : "دولٍ مربوطة"}، تظهر في القاعة «حقيقية».`
          : "لا دولة مربوطة بعد: يُربط مكتبها من «الدول والمصادر».",
    },
    {
      key: "payments",
      title: "بوابة الدفع",
      done: i.payments,
      detail:
        i.payments === null
          ? "تعذّر التحقّق من إعداد الدفع."
          : i.payments
            ? "مفاتيح بوابة الدفع مهيّأة على الخادم."
            : "مفاتيح بوابة الدفع غير مهيّأة: تُضاف أسرارها في إعدادات المشروع.",
    },
  ];
}

export const readyToGoLive = (steps: GoLiveStep[]) => steps.every((s) => s.done === true);
