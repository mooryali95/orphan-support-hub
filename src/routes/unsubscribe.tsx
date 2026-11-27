import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { compact, searchUuid } from "@/lib/search-params";
import { Loader2, MailX, CircleAlert, CircleCheck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { unsubscribeByToken } from "@/lib/notification-prefs.functions";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("routes/unsubscribe", {
  ar: {
    title: "إلغاء الاشتراك",
    description: (n: string) => `إيقاف رسائل البريد من ${n}.`,
    doneH: "أُوقف البريد",
    doneP: (n: string) =>
      `لن تصلك رسائل بريدية من ${n} بعد الآن، ومنها إيصالات الدفع. وإشعاراتك تبقى ظاهرةً داخل المنصّة، وإيصالاتك السابقة محفوظة في حسابك.`,
    doneUndo: "ولو غيّرت رأيك، تُعيده من تفضيلات الإشعارات بعد الدخول.",
    home: "العودة إلى الصفحة الرئيسة",
    account: "إيصالاتي في الحساب",
    badH: "رابط غير صالح",
    badP: "هذا الرابط ناقص أو لم يعد صالحاً. يمكنك إيقاف البريد من تفضيلات الإشعارات بعد تسجيل الدخول.",
    signIn: "تسجيل الدخول",
    errH: "تعذّر التنفيذ",
    errP: "حدث خطأ غير متوقّع. حاول مرّة أخرى بعد قليل.",
    retry: "أعد المحاولة",
    idleH: (n: string) => `إيقاف البريد من ${n}`,
    idleP:
      "بالضغط أدناه تتوقّف كل رسائل البريد، بما فيها إيصالات الدفع وتنبيهات تعثّره. وتبقى إشعاراتك ظاهرةً داخل المنصّة، وإيصالاتك السابقة في حسابك.",
    confirm: "تأكيد إيقاف البريد",
    working: "جارٍ إيقاف البريد",
    or: "أو",
    back: "العودة دون تغيير",
  },
  en: {
    title: "Unsubscribe",
    description: (n: string) => `Stop email from ${n}.`,
    doneH: "Email stopped",
    doneP: (n: string) =>
      `You will no longer receive email from ${n}, including payment receipts. Your notifications stay visible inside the platform, and past receipts remain in your account.`,
    doneUndo:
      "If you change your mind, turn it back on from notification preferences after signing in.",
    home: "Back to the home page",
    account: "My receipts in the account",
    badH: "Invalid link",
    badP: "This link is incomplete or no longer valid. You can stop email from notification preferences after signing in.",
    signIn: "Sign in",
    errH: "Could not complete",
    errP: "Something unexpected happened. Please try again shortly.",
    retry: "Try again",
    idleH: (n: string) => `Stop email from ${n}`,
    idleP:
      "Pressing below stops all email, including payment receipts and failed payment alerts. Your notifications stay visible inside the platform, and past receipts stay in your account.",
    confirm: "Confirm stopping email",
    working: "Stopping email",
    or: "or",
    back: "go back without changes",
  },
});

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
  validateSearch: (raw: Record<string, unknown>): { token?: string } =>
    compact({ token: searchUuid(raw["token"]) }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [
        { title: pageTitle(c.title, false, l) },
        { name: "description", content: c.description(brandFor(l).name) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: UnsubscribePage,
});

type State = "idle" | "working" | "done" | "bad-token" | "error";

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const run = useServerFn(unsubscribeByToken);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const c = useCopy(COPY);
  const name = brandFor(useLocale()).name;
  const h1 = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!token) setState("bad-token");
  }, [token]);

  useEffect(() => {
    if (state !== "idle" && state !== "working") h1.current?.focus();
  }, [state]);
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

  const hc = "mt-5 text-2xl font-extrabold outline-none";
  const pc = "mt-3 text-sm leading-8 text-muted-foreground";
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 py-20">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          {state === "done" ? (
            <>
              <CircleCheck className="mx-auto size-10 text-shore-thrive" aria-hidden="true" />
              <h1 ref={h1} tabIndex={-1} className={hc}>
                {c.doneH}
              </h1>
              <p className={pc}>{c.doneP(name)}</p>
              <p className={pc}>{c.doneUndo}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button asChild className="min-h-11">
                  <Link to="/">{c.home}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/account">{c.account}</Link>
                </Button>
              </div>
            </>
          ) : state === "bad-token" ? (
            <>
              <CircleAlert className="mx-auto size-10 text-shore-need" aria-hidden="true" />
              <h1 ref={h1} tabIndex={-1} className={hc}>
                {c.badH}
              </h1>
              <p className={pc}>{c.badP}</p>
              <Button asChild variant="outline" className="mt-7 min-h-11">
                <Link to="/auth">{c.signIn}</Link>
              </Button>
            </>
          ) : state === "error" ? (
            <>
              <CircleAlert className="mx-auto size-10 text-shore-need" aria-hidden="true" />
              <h1 ref={h1} tabIndex={-1} className={hc}>
                {c.errH}
              </h1>
              <p className={pc}>{message ?? c.errP}</p>
              <Button onClick={confirm} className="mt-7 min-h-11">
                {c.retry}
              </Button>
            </>
          ) : (
            <>
              <MailX className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-extrabold">{c.idleH(name)}</h1>
              <p className={pc}>{c.idleP}</p>
              <Button
                onClick={confirm}
                disabled={state === "working"}
                className="mt-7 min-h-11 gap-2"
              >
                {state === "working" && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                {c.confirm}
              </Button>
              <p role="status" className="sr-only">
                {state === "working" ? c.working : ""}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {c.or}{" "}
                <Link
                  to="/"
                  className="inline-flex min-h-11 items-center underline hover:text-foreground"
                >
                  {c.back}
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
