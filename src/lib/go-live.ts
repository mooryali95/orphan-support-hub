/**
 * جاهزية الاعتماد — متى يصحّ تحويل المنصّة من «تجربة» إلى «حقيقي»
 * (src/config/platform.ts). كلّ شرطٍ يُقرأ من حال المنصّة الفعلية، لا يُعلَّم يدوياً.
 *
 * ربط منصّة التشغيل لا يكفي فيه أن «وصلت دفعةٌ يوماً»: الداعم بعد التحويل يرى مستوى
 * الطفل وتقدّمه من المرآة، فالشرط أن يكون في المرآة أطفالٌ، وأن تكون المزامنة حديثة.
 * العقد كاملاً في docs/operating-platform-link.md.
 */
import { copyOf, defineCopy, pluralOf, type Locale } from "@/lib/locale";

/**
 * عمر المزامنة المقبول بالساعات. هو نفسه حدّ تنبيه «تأخّر المرآة» في صحّة التشغيل
 * (`mirror_lag` في هجرة ops_health): منصّةٌ بلا دفعةٍ منذ ٤٨ ساعة تُعدّ متأخّرة.
 */
export const SYNC_FRESH_HOURS = 48;

/** ما يلزم من `getOperatingLinks` (مجاميع عامّة، بلا اسمٍ ولا معرّف). */
export type GoLiveLink = {
  country: string;
  /** وقت آخر دفعةٍ طُبِّقت من منصّة التشغيل (ISO) */
  syncedAt: string;
  /** أطفالٌ في المرآة مرتبطون بمجموعات هذه المنصّة */
  orphans: number;
};

export type GoLiveInput = {
  /** ملفّات أطفالٍ منشورة في الدليل (معتمدة أو مكفولة) */
  published: number;
  /** روابط منصّات التشغيل؛ `null` ما دامت لم تُقرأ بعد */
  links: GoLiveLink[] | null;
  /** بوابة الدفع مهيّأة على الخادم (أسماء المفاتيح موجودة، بلا قيمها) */
  payments: boolean | null;
  /** الوقت الآن بالمللي ثانية (للاختبار) */
  now?: number;
};

export type GoLiveStep = {
  key: "children" | "operating" | "payments";
  title: string;
  done: boolean | null;
  detail: string;
};

const COPY = defineCopy("lib/go-live", {
  ar: {
    childrenTitle: "ملفّات أطفالٍ منشورة",
    childrenOk: (n: number) => `${n} ملفّاً منشوراً في الدليل.`,
    childrenNone: "لا ملفّ منشور بعد: تُدخلها الجهات وتعتمدها الإدارة من «طابور الاعتماد».",
    operatingTitle: "منصّة تشغيلٍ مربوطة ومتزامنة",
    operatingUnknown: "جارٍ التحقّق من ربط منصّات التشغيل.",
    operatingNone: "لا دولة مربوطة بعد: يُربط مكتبها من «الدول والمصادر».",
    operatingEmpty:
      "وصلت دفعةٌ من منصّة التشغيل، لكن لا طفل في المرآة بعد: تُرسَل المجموعات ثم الطلاب.",
    operatingStale: (hours: number) =>
      `منصّة التشغيل مربوطة، لكن آخر مزامنةٍ أقدم من ${hours} ساعة: يُراجَع مُرسِلها قبل التحويل.`,
    operatingOk: pluralOf(
      {
        one: "دولةٌ واحدة مربوطة ومزامنتها حديثة، تظهر في القاعة «حقيقية».",
        two: "دولتان مربوطتان ومزامنتهما حديثة، تظهران في القاعة «حقيقية».",
        few: "{0} دولٍ مربوطة ومزامنتها حديثة، تظهر في القاعة «حقيقية».",
        many: "{0} دولةً مربوطة ومزامنتها حديثة، تظهر في القاعة «حقيقية».",
        other: "{0} دولة مربوطة ومزامنتها حديثة، تظهر في القاعة «حقيقية».",
      },
      0,
      "ar",
    ),
    operatingLagging: pluralOf(
      {
        one: "ودولةٌ واحدة مربوطة تأخّرت مزامنتها أو لا أطفال فيها.",
        two: "ودولتان مربوطتان تأخّرت مزامنتهما أو لا أطفال فيهما.",
        few: "و{0} دولٍ مربوطة تأخّرت مزامنتها أو لا أطفال فيها.",
        many: "و{0} دولةً مربوطة تأخّرت مزامنتها أو لا أطفال فيها.",
        other: "و{0} دولة مربوطة تأخّرت مزامنتها أو لا أطفال فيها.",
      },
      0,
      "ar",
    ),
    paymentsTitle: "بوابة الدفع",
    paymentsUnknown: "تعذّر التحقّق من إعداد الدفع.",
    paymentsOk: "مفاتيح بوابة الدفع مهيّأة على الخادم.",
    paymentsMissing: "مفاتيح بوابة الدفع غير مهيّأة: تُضاف أسرارها في إعدادات المشروع.",
  },
  en: {
    childrenTitle: "Published child files",
    childrenOk: (n: number) => `${n} files published in the directory.`,
    childrenNone:
      "No file is published yet: organizations enter them and admins approve them from the approval queue.",
    operatingTitle: "An operating platform linked and in sync",
    operatingUnknown: "Checking the operating platform links.",
    operatingNone: "No country is linked yet: link its office from “Countries and sources”.",
    operatingEmpty:
      "A batch arrived from the operating platform, but no child is mirrored yet: send groups, then students.",
    operatingStale: (hours: number) =>
      `The operating platform is linked, but its last sync is older than ${hours} hours: check its sender before switching.`,
    operatingOk: pluralOf({
      one: "{0} country is linked and in sync, shown as real in the hall.",
      other: "{0} countries are linked and in sync, shown as real in the hall.",
    }),
    operatingLagging: pluralOf({
      one: "{0} other linked country is behind on sync or has no children.",
      other: "{0} other linked countries are behind on sync or have no children.",
    }),
    paymentsTitle: "Payment gateway",
    paymentsUnknown: "Could not verify the payment setup.",
    paymentsOk: "Payment gateway keys are configured on the server.",
    paymentsMissing:
      "Payment gateway keys are not configured: add their secrets in the project settings.",
  },
});

/** هل المزامنة ضمن العمر المقبول؟ وقتٌ لا يُقرأ أو في المستقبل البعيد ليس حديثاً. */
export function syncFresh(syncedAt: string, now = Date.now()): boolean {
  const at = Date.parse(syncedAt);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  // ساعةٌ من انحراف الساعات مقبولة؛ ما بعدها وقتٌ لا يُصدَّق.
  return age <= SYNC_FRESH_HOURS * 3_600_000 && age >= -3_600_000;
}

/** الدول المربوطة بحسب صحّة ربطها: لكلّ دولةٍ أحسنُ منصّاتها. */
export function linkHealth(links: GoLiveLink[], now = Date.now()) {
  const byCountry = new Map<string, { children: boolean; fresh: boolean }>();
  for (const l of links) {
    const fresh = syncFresh(l.syncedAt, now);
    const children = l.orphans > 0;
    const was = byCountry.get(l.country);
    if (!was || (children && fresh)) byCountry.set(l.country, { children, fresh });
  }
  const all = [...byCountry.values()];
  return {
    linked: all.length,
    healthy: all.filter((c) => c.children && c.fresh).length,
    withChildren: all.filter((c) => c.children).length,
  };
}

export function goLiveSteps(i: GoLiveInput, locale: Locale = "ar"): GoLiveStep[] {
  const t = copyOf(COPY, locale);
  const h = i.links ? linkHealth(i.links, i.now) : null;
  const lagging = h ? h.linked - h.healthy : 0;
  return [
    {
      key: "children",
      title: t.childrenTitle,
      done: i.published > 0,
      detail: i.published > 0 ? t.childrenOk(i.published) : t.childrenNone,
    },
    {
      key: "operating",
      title: t.operatingTitle,
      done: h ? h.healthy > 0 : null,
      detail: !h
        ? t.operatingUnknown
        : h.linked === 0
          ? t.operatingNone
          : h.healthy > 0
            ? lagging > 0
              ? `${t.operatingOk(h.healthy)} ${t.operatingLagging(lagging)}`
              : t.operatingOk(h.healthy)
            : h.withChildren === 0
              ? t.operatingEmpty
              : t.operatingStale(SYNC_FRESH_HOURS),
    },
    {
      key: "payments",
      title: t.paymentsTitle,
      done: i.payments,
      detail:
        i.payments === null ? t.paymentsUnknown : i.payments ? t.paymentsOk : t.paymentsMissing,
    },
  ];
}

export const readyToGoLive = (steps: GoLiveStep[]) => steps.every((s) => s.done === true);
