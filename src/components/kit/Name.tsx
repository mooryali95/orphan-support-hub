import type { ReactNode } from "react";

/**
 * اسمٌ أو رمزٌ من البيانات وسط سطرٍ قد يكون عكس اتجاهه (UI-03/A11Y-05).
 *
 * «Arta S.» في سطرٍ عربي تأخذ نقطتها الختامية اتجاه الفقرة فتُرسم «.Arta S»،
 * والأرقام بعد نصٍّ لاتيني تنقلب. `<bdi dir="auto">` يعزل الاسم ويعطيه اتجاه
 * أوّل حرفٍ قويّ فيه، فيُقرأ كما كُتب في أي سطر. وللنصوص (عناوين، تسميات
 * وصول) `isolate()` من format.ts بالفكرة نفسها.
 */
export function Name({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="auto" className={className}>
      {children}
    </bdi>
  );
}
