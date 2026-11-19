/**
 * الحديث الذي منه اسم المنصّة، عند لحظة القرار: سطرٌ واحد بلفظه ومصدره. «هكذا» اسم إشارةٍ إلى
 * حركة اليد، فيبقى معها وصفها.
 */
export function KafalaPromise({ className = "" }: { className?: string }) {
  return (
    <blockquote className={`text-center ${className}`}>
      <p className="font-quran text-base leading-8 text-shore-need" lang="ar" dir="rtl">
        «أنا وكافلُ اليتيمِ في الجنّةِ هكذا» وأشارَ بالسبّابةِ والوسطى.
      </p>
      <cite className="mt-0.5 block text-[0.6875rem] text-muted-foreground not-italic">
        رواه البخاري (6005)
      </cite>
    </blockquote>
  );
}
