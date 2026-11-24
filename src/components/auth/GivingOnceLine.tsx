import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/auth/GivingOnceLine", {
  ar: {
    line: (name: string, amount: string) =>
      `أنت على وشك دعم ${name} بـ${amount} مرّةً واحدة. بعد الدخول تعود إلى الملفّ بما اخترته.`,
  },
  en: {
    line: (name: string, amount: string) =>
      `You're about to give ${name} ${amount} once. After signing in you'll return to their file with what you chose.`,
  },
});

/** سطر صفحة الدخول لمن اختار عطاءً لمرّة واحدة: لا يُقال له «شهرياً». */
export function GivingOnceLine({ name, amount }: { name: string; amount: string }) {
  return <>{useCopy(COPY).line(name, amount)}</>;
}
