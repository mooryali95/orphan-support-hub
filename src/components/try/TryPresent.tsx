import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Presentation, X } from "lucide-react";
import { useEffect } from "react";

import { ROLE_COPY } from "@/components/try/TryRoleChip";
import { defineCopy, dirOf, useCopy, useLocale } from "@/lib/locale";
import { roleOf, setPresenting, TOUR, tourIndex } from "@/lib/try-roles";
import { cn } from "@/lib/utils";

/** ما يُقال عند كلّ محطّة في سطرٍ واحد — يقرؤه المقدّم ويراه الحضور */
const COPY = defineCopy("components/try/TryPresent", {
  ar: {
    say: [
      "منصّةٌ واحدة، ستّة أدوار: نتبع ملفّ طفلٍ واحد من إدخاله حتى أثره.",
      "الجهة تُدخل ملفّ الطفل ومستنداته الإلزامية، وترسله للمراجعة.",
      "الإدارة توثّق كلّ مستند، ثم تعتمد الملفّ فيُنشر في الدليل.",
      "الكافل يرى الطفل المنشور، ويختار المبلغ، ويكفل — الدفع هنا محاكاة.",
      "المكتب يرسل تقرير الشهر الأوّل، وينفّذ التأهيل والدعم العيني في منطقته.",
      "المشرف المستقلّ يزور الطفل ويسجّل حاله — فيصير جزءاً من ملفّه.",
      "الكافل يرى أثره في «أثري»: تقرير المكتب، وزيارة المشرف، والتغطية.",
      "صاحب القرار يرى الشبكة كلّها — وكلّ ما فعلناه الآن يحرّك أرقامها.",
    ],
    off: "خارج مسار الجولة — التالي يعيدك إليها.",
    region: "وضع العرض",
    prev: "المحطّة السابقة",
    next: "التالي",
    close: "أغلق وضع العرض",
    start: "ابدأ العرض بالترتيب",
  },
  en: {
    say: [
      "One platform, six roles: we follow one child's file from entry to impact.",
      "The care organization enters the child's file and required documents, and sends it for review.",
      "Administration verifies each document, then approves the file and publishes it to the directory.",
      "The supporter sees the published child, chooses an amount and sponsors. Payment is simulated here.",
      "The office sends the first monthly report, and delivers training and in-kind support in its area.",
      "The independent supervisor visits the child and records how they are, which becomes part of the file.",
      "The supporter sees the impact in My impact: the office's report, the supervisor's visit, and coverage.",
      "The decision-maker sees the whole network, and everything we just did moves its figures.",
    ],
    off: "Off the tour. Next brings you back to it.",
    region: "Presentation mode",
    prev: "Previous stop",
    next: "Next",
    close: "Close presentation mode",
    start: "Start the guided demo",
  },
});

/** صفحة الطفل في الجولة: طفل الدورة إن نُشر، وإلا أوّل أطفال التجربة */
const childStop = (): Promise<string> =>
  import("@/lib/try-cycle").then((m) =>
    m.loadCycle().stage === "published" ? m.CYCLE_CHILD_ID : "try-01",
  );

/**
 * شريط وضع العرض: المحطّة الحالية ودورها وجملتها، وزرّا السابق والتالي — يقود المقدّم العرض
 * كلّه بنقرة، بترتيب الدورة الحقيقية. يظهر حين يُفعَّل من مدخل الأدوار، ويُغلق بزرّه.
 */
export function TryPresentBar() {
  const t = useCopy(COPY);
  const roles = useCopy(ROLE_COPY).role;
  // في الإنجليزية «التالي» إلى اليمين: الأسهم تتبع اتجاه القراءة
  const rtl = dirOf(useLocale()) === "rtl";
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const i = tourIndex(path);
  const at = i < 0 ? 0 : i;
  const role = TOUR[at]?.role ?? roleOf(path);

  const go = (k: number) => {
    const stop = TOUR[k];
    if (!stop) return;
    if (stop.to === "child")
      void childStop().then((childId) => navigate({ to: "/try/$childId", params: { childId } }));
    else void navigate({ to: stop.to });
    window.scrollTo({ top: 0 });
  };

  // الأسهم في لوحة المفاتيح، كما في أيّ عرض
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || e.key === "PageDown") go(at + 1);
      if (e.key === back || e.key === "PageUp") go(at - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, rtl]);

  return (
    <div
      role="region"
      aria-label={t.region}
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div className="flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-bridge/60 bg-background/95 p-2 ps-4 shadow-lg backdrop-blur">
        <span className="numeral me-auto shrink-0 text-2xl text-primary tabular-nums sm:me-0">
          {at + 1}
          <span className="text-base text-muted-foreground">/{TOUR.length}</span>
        </span>
        <span className="order-last w-full min-w-0 pb-1 text-sm leading-6 sm:order-none sm:w-auto sm:flex-1 sm:pb-0">
          {role && <span className="font-bold text-bridge-ink">{roles[role]} · </span>}
          {i < 0 ? t.off : t.say[at]}
        </span>
        <button
          type="button"
          onClick={() => go(at - 1)}
          disabled={at === 0}
          aria-label={t.prev}
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-border hover:bg-secondary disabled:opacity-40"
        >
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => go(i < 0 ? at : at + 1)}
          disabled={i >= 0 && at === TOUR.length - 1}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40",
          )}
        >
          {t.next}
          <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPresenting(false)}
          aria-label={t.close}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** زرّ بدء وضع العرض: يفتح الجولة من أوّلها */
export function TryPresentStart({ className }: { className?: string }) {
  const t = useCopy(COPY);
  return (
    <Link
      to="/try"
      onClick={() => setPresenting(true)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5",
        className,
      )}
    >
      <Presentation className="size-4" aria-hidden="true" />
      {t.start}
    </Link>
  );
}
