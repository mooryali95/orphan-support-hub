/**
 * مسارات العطاء الثلاثة — أسماؤها في مكانٍ واحد كي تُعاد تسميتها مرّةً واحدة.
 *
 * تصوّر المالك: ثلاثة أبوابٍ متساوية تحت «اختر أثرك» — «تبرع تأهيل»،
 * و«كفالة مادية»، و«تبرع عيني». كل ما يعرض هذه المسارات للزائر يقرأ أسماءها
 * من هنا (الصفحة الأولى، وألسنة الدعم في صفحة الطفل)، فإن تغيّر اسمٌ تغيّر
 * في كل مكانٍ معاً.
 *
 * المفاتيح هي مفاتيح القاعدة نفسها (`monthly` كفالة، و`qualification`
 * و`in_kind` أنواع الدعم) — الاسم يتغيّر، والمفتاح لا.
 */
import { copyOf, defineCopy, type Locale, useLocale } from "@/lib/locale";

export const GIVING_TRACKS = ["qualification", "monthly", "in_kind"] as const;
export type GivingTrack = (typeof GIVING_TRACKS)[number];

type TrackCopy = { name: string; promise: string; cta: string };

export const GIVING_COPY = defineCopy("config/giving-tracks", {
  ar: {
    heading: "اختر أثرك",
    lead: "ثلاثة أبوابٍ متساوية. اختر ما يناسبك، ولمن: يتيمٌ بعينه، أو مجموعته، أو منطقة، أو دولة، أو مؤسسة تعمل معهم.",
    tracks: {
      qualification: {
        name: "تبرع تأهيل",
        promise: "تموّل رحلة تأهيلٍ بجلساتها ومشرفها، وتُقاس سمات الطفل قبلها وبعدها.",
        cta: "ادعم التأهيل",
      },
      monthly: {
        name: "كفالة مادية",
        promise: "مبلغٌ ثابت كل شهر لطفلٍ بعينه، ترى في جدولٍ واحد متى دُفع ومتى وصله موثّقاً.",
        cta: "اختر من الدليل",
      },
      in_kind: {
        name: "تبرع عيني",
        promise: "حقائب وكسوة وأجهزة، يجهّزها المكتب ويسلّمها ويوثّقها بالصور.",
        cta: "تبرّع عيناً",
      },
    } satisfies Record<GivingTrack, TrackCopy>,
  },
  en: {
    heading: "Choose your impact",
    lead: "Three equal doors. Choose what suits you, and for whom: a specific child, their group, a region, a country, or an organization working with them.",
    tracks: {
      qualification: {
        name: "Qualification giving",
        promise:
          "Fund a qualification journey, session by session with a supervisor, with the child's traits measured before and after.",
        cta: "Support qualification",
      },
      monthly: {
        name: "Financial sponsorship",
        promise:
          "A fixed amount each month for one child. One table shows when it was paid and when it reached them, with a document.",
        cta: "Choose from the directory",
      },
      in_kind: {
        name: "In-kind giving",
        promise:
          "School bags, clothing and devices, prepared, delivered and documented with photos by the local office.",
        cta: "Give in kind",
      },
    } satisfies Record<GivingTrack, TrackCopy>,
  },
});

export const givingCopy = (locale: Locale) => copyOf(GIVING_COPY, locale);
export const useGivingCopy = () => givingCopy(useLocale());
