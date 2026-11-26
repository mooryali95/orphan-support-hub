import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/KafalaPromise", {
  ar: {
    hadith: "«أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى.",
    source: "رواه البخاري (6005)",
  },
  en: {
    hadith:
      "“I and the one who sponsors an orphan will be in Paradise like this,” and he gestured with his index and middle fingers.",
    source: "Narrated by al-Bukhari (6005)",
  },
});

/**
 * الحديث الذي منه اسم المنصّة، عند لحظة القرار: سطرٌ واحد بلفظه ومصدره. «هكذا» اسم إشارةٍ إلى
 * حركة اليد، فيبقى معها وصفها.
 *
 * `plate`: the same line set large in the display face on a wine field (the sign-in panel). The
 * plate keeps the Arabic wording in every language; the inline line follows the interface language.
 */
export function KafalaPromise({
  className = "",
  plate = false,
}: {
  className?: string;
  plate?: boolean;
}) {
  const locale = useLocale();
  const c = useCopy(COPY);
  // اللوحة بلفظ الحديث العربي دائماً؛ والسطر داخل الرحلة بلغة الواجهة.
  const arabic = plate || locale === "ar";
  const t = arabic ? COPY.ar : c;
  return (
    <blockquote className={`${plate ? "" : "text-center"} ${className}`}>
      <p
        className={
          plate
            ? "font-quran text-[2rem] leading-[1.8] text-white xl:text-[2.5rem]"
            : arabic
              ? "font-quran text-lg leading-9 text-foreground"
              : "font-display text-base leading-7 text-foreground"
        }
        {...(arabic ? { lang: "ar", dir: "rtl" as const } : {})}
      >
        {t.hadith}
      </p>
      <cite
        className={
          plate
            ? "mt-4 block text-sm text-white/75 not-italic"
            : "mt-0.5 block text-xs text-muted-foreground not-italic"
        }
      >
        {t.source}
      </cite>
    </blockquote>
  );
}
