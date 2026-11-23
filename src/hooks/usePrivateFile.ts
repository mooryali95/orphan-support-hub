import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * ملفٌّ خاصّ يُنزَّل بجلسة القارئ نفسه، ويُعرض من ذاكرة الصفحة (blob:) —
 * بلا رابطٍ موقَّع يُنسخ أو يُتداول.
 *
 * الرابط الموقَّع لا يُسحب بعد إصداره: من احتفظ به يرى الملفّ حتى ينقضي.
 * هنا كلّ عرضٍ طلبٌ جديد تفحصه سياسات الخزنة لحظتها، فسحب الإذن (موافقة
 * الوليّ أو عضوية المكتب) يمنع العرض التالي فوراً. ورابط blob: لا يعمل
 * خارج هذه الصفحة، ويُحرَّر حين يغادرها المكوّن.
 */
export function usePrivateFile(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!path) return;
    let alive = true;
    let objectUrl: string | null = null;
    void supabase.storage
      .from(bucket)
      .download(path)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bucket, path]);

  return { url, failed };
}

/** يفتح ملفّاً خاصّاً في تبويبٍ جديد من ذاكرة الصفحة، بلا رابطٍ موقَّع. */
export async function openPrivateFile(bucket: string, path: string): Promise<boolean> {
  // يُفتح التبويب قبل الانتظار، فلا يحجبه المتصفّح بوصفه نافذةً منبثقة.
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    tab?.close();
    return false;
  }
  const objectUrl = URL.createObjectURL(data);
  if (tab) tab.location.href = objectUrl;
  else window.location.href = objectUrl;
  // يكفي التبويبَ أن يحمّله؛ ثم يُحرَّر.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return true;
}
