import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, X } from "lucide-react";

import { dirOf, LocaleProvider, nativeName, setMessages } from "@/lib/locale";
import { getPreviewMessages } from "@/lib/ui-i18n-admin.functions";

const COOKIE = "kh_preview";
const read = () => /(?:^|;\s*)kh_preview=([a-z]{2,3})(?:;|$)/.exec(document.cookie)?.[1] ?? null;
const clear = () => {
  document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

/**
 * معاينة لغةٍ قبل نشرها — للمراجع والإدارة وحدهما.
 *
 * تبدأ من «عاين الموقع» في صفحة المراجعة (كعكة kh_preview). المتصفّح يجلب
 * المسودّات بجلسة المراجع، ويرسم الموقع بها مع شريطٍ ظاهر يقول إنها معاينة.
 * الزائر لا يملك الكعكة، ومن ليس مراجعاً يُرفض طلبه فتُمحى الكعكة بصمت.
 */
export function PreviewBridge({ children }: { children: ReactNode }) {
  const fetchPreview = useServerFn(getPreviewMessages);
  const [locale, setLocale] = useState<string | null>(null);

  useEffect(() => {
    const want = read();
    if (!want) return;
    void fetchPreview({ data: { locale: want } })
      .then((r) => {
        if (!r.ok) return clear();
        setMessages(want, r.data);
        document.documentElement.lang = want;
        document.documentElement.dir = dirOf(want);
        setLocale(want);
      })
      .catch(clear);
  }, [fetchPreview]);

  if (!locale) return <>{children}</>;
  return (
    <LocaleProvider locale={locale}>
      {children}
      <div
        role="status"
        dir="rtl"
        lang="ar"
        className="fixed inset-x-3 bottom-3 z-[90] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-lg"
      >
        <Eye className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          معاينة <bdi lang={locale}>{nativeName(locale)}</bdi> بالمسودّات — لا يراها الزائر.
        </span>
        <button
          type="button"
          onClick={() => {
            clear();
            window.location.reload();
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-background/15"
        >
          <X className="size-4" aria-hidden="true" /> أنهِ المعاينة
        </button>
      </div>
    </LocaleProvider>
  );
}
