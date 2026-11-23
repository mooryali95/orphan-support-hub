import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Presentation, X } from "lucide-react";
import { useEffect } from "react";

import { ROLE_NAME } from "@/components/try/TryRoleChip";
import { roleOf, setPresenting, TOUR, tourIndex } from "@/lib/try-roles";
import { cn } from "@/lib/utils";

/** ما يُقال عند كلّ محطّة في سطرٍ واحد — يقرؤه المقدّم ويراه الحضور */
const SAY = [
  "منصّةٌ واحدة، ستّة أدوار: نتبع ملفّ طفلٍ واحد من إدخاله حتى أثره.",
  "الجهة تُدخل ملفّ الطفل ومستنداته الإلزامية، وترسله للمراجعة.",
  "الإدارة توثّق كلّ مستند، ثم تعتمد الملفّ فيُنشر في الدليل.",
  "الكافل يرى الطفل المنشور، ويختار المبلغ، ويكفل — الدفع هنا محاكاة.",
  "المكتب يرسل تقرير الشهر الأوّل، وينفّذ التأهيل والدعم العيني في منطقته.",
  "المشرف المستقلّ يزور الطفل ويسجّل حاله — فيصير جزءاً من ملفّه.",
  "الكافل يرى أثره في «أثري»: التقرير، والتغطية، وما بعدها.",
  "صاحب القرار يرى الشبكة كلّها — وكلّ ما فعلناه الآن يحرّك أرقامها.",
] as const;

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
      if (e.key === "ArrowLeft" || e.key === "PageDown") go(at + 1);
      if (e.key === "ArrowRight" || e.key === "PageUp") go(at - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  return (
    <div
      role="region"
      aria-label="وضع العرض"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div className="flex w-full max-w-4xl items-center gap-3 rounded-2xl border border-bridge/60 bg-background/95 p-2 ps-4 shadow-lg backdrop-blur">
        <span className="numeral shrink-0 text-2xl text-primary tabular-nums">
          {at + 1}
          <span className="text-base text-muted-foreground">/{TOUR.length}</span>
        </span>
        <span className="min-w-0 flex-1 text-sm leading-6">
          {role && <span className="font-bold text-bridge-ink">{ROLE_NAME[role]} · </span>}
          {i < 0 ? "خارج مسار الجولة — التالي يعيدك إليها." : SAY[at]}
        </span>
        <button
          type="button"
          onClick={() => go(at - 1)}
          disabled={at === 0}
          aria-label="المحطّة السابقة"
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
          التالي
          <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPresenting(false)}
          aria-label="أغلق وضع العرض"
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
      ابدأ العرض بالترتيب
    </Link>
  );
}
