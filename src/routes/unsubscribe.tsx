import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2, MailX, CircleAlert, CircleCheck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { unsubscribeByToken } from "@/lib/notification-prefs.functions";

const TITLE = "إلغاء الاشتراك — IOCO";

/**
 * إلغاء الاشتراك بنقرة، بلا تسجيل دخول.
 *
 * الرابط يُنقر من صندوق البريد حيث لا جلسة، فاشتراط الدخول يُبطل معنى
 * الإلغاء. والرمز UUID عشوائي هو الحارس.
 *
 * والتنفيذ لا يقع عند فتح الصفحة بل عند الضغط: بعض عملاء البريد يجلبون
 * الروابط مسبقاً لفحصها، فإلغاءٌ عند الفتح قد يقع بلا نيّة صاحبه.
 */
export const Route = createFileRoute("/unsubscribe")({
  validateSearch: z.object({ token: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "إيقاف رسائل البريد من IOCO." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

type State = "idle" | "working" | "done" | "bad-token" | "error";

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const run = useServerFn(unsubscribeByToken);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setState("bad-token");
  }, [token]);

  async function confirm() {
    if (!token) return;
    setState("working");
    try {
      const res = await run({ data: { token } });
      if (res.error) {
        setMessage(res.error);
        setState("error");
      } else {
        setState(res.ok ? "done" : "bad-token");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 py-20">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          {state === "done" ? (
            <>
              <CircleCheck className="mx-auto size-10 text-shore-thrive" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-extrabold">أُوقف البريد</h1>
              <p className="mt-3 text-sm leading-8 text-muted-foreground">
                لن تصلك رسائل بريدية من IOCO بعد الآن. وإشعاراتك تبقى ظاهرةً داخل المنصّة، فما يجري
                في كفالتك يبقى معلوماً لك.
              </p>
              <p className="mt-3 text-sm leading-8 text-muted-foreground">
                ولو غيّرت رأيك، تُعيده من <strong>تفضيلات الإشعارات</strong> بعد الدخول.
              </p>
              <Button asChild className="mt-7">
                <Link to="/">العودة إلى الصفحة الرئيسة</Link>
              </Button>
            </>
          ) : state === "bad-token" ? (
            <>
              <CircleAlert className="mx-auto size-10 text-shore-need" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-extrabold">رابط غير صالح</h1>
              <p className="mt-3 text-sm leading-8 text-muted-foreground">
                هذا الرابط ناقص أو لم يعد صالحاً. يمكنك إيقاف البريد من{" "}
                <strong>تفضيلات الإشعارات</strong> بعد تسجيل الدخول.
              </p>
              <Button asChild variant="outline" className="mt-7">
                <Link to="/auth">تسجيل الدخول</Link>
              </Button>
            </>
          ) : state === "error" ? (
            <>
              <CircleAlert className="mx-auto size-10 text-shore-need" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-extrabold">تعذّر التنفيذ</h1>
              <p className="mt-3 text-sm leading-8 text-muted-foreground">
                {message ?? "حدث خطأ غير متوقّع. حاول مرّة أخرى بعد قليل."}
              </p>
              <Button onClick={confirm} className="mt-7">
                أعد المحاولة
              </Button>
            </>
          ) : (
            <>
              <MailX className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-extrabold">إيقاف البريد من IOCO</h1>
              <p className="mt-3 text-sm leading-8 text-muted-foreground">
                بالضغط أدناه تتوقّف كل رسائل البريد — بما فيها إيصالات الدفع وتنبيهات تعثّره. وتبقى
                إشعاراتك ظاهرةً داخل المنصّة.
              </p>
              <Button onClick={confirm} disabled={state === "working"} className="mt-7 gap-2">
                {state === "working" && <Loader2 className="size-4 animate-spin" />}
                تأكيد إيقاف البريد
              </Button>
              <p className="mt-4 text-xs text-muted-foreground">
                أو{" "}
                <Link to="/" className="underline hover:text-foreground">
                  العودة دون تغيير
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
