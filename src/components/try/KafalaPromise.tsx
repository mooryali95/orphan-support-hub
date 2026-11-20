/**
 * الحديث الذي منه اسم المنصّة، عند لحظة القرار: سطرٌ واحد بلفظه ومصدره. «هكذا» اسم إشارةٍ إلى
 * حركة اليد، فيبقى معها وصفها.
 *
 * `plate`: the same line set large in the display face on a wine field (the sign-in panel).
 */
export function KafalaPromise({
  className = "",
  plate = false,
}: {
  className?: string;
  plate?: boolean;
}) {
  return (
    <blockquote className={`${plate ? "" : "text-center"} ${className}`}>
      <p
        className={
          plate
            ? "font-quran text-[2rem] leading-[1.8] text-white xl:text-[2.5rem]"
            : "font-quran text-lg leading-9 text-foreground"
        }
        lang="ar"
        dir="rtl"
      >
        «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى.
      </p>
      <cite
        className={
          plate
            ? "mt-4 block text-sm text-white/75 not-italic"
            : "mt-0.5 block text-xs text-muted-foreground not-italic"
        }
      >
        رواه البخاري (6005)
      </cite>
    </blockquote>
  );
}
