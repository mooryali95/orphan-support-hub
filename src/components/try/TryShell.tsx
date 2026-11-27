import { Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { enterDemo, exitDemo } from "@/lib/demo-mode";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TryJourneyGuide, TryJourneyRail } from "@/components/try/TryJourneyGuide";
import { TryRoleChip, usePresenting } from "@/components/try/TryRoleChip";
import { roleOf } from "@/lib/try-roles";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { TryJourneyContext, TryRealButton, useTryJourney } from "@/components/try/TryRealInvite";
import { useAuth } from "@/hooks/useAuth";
import { defineCopy, useCopy } from "@/lib/locale";
import { loadGifts, resetGifts, TRY_CURRENCY, TRY_EVENT, tryChild } from "@/lib/try-demo";
import { resetTrialSession } from "@/lib/try-store";
import { registerSponsorCenterDemos } from "@/lib/try-sponsor-center";
import {
  firstLeave,
  markResume,
  proposalsFrom,
  syncHandoff,
  takeResume,
  type TrialProposal,
} from "@/lib/try-handoff";
import { loadPledges, resetPledges } from "@/lib/try-support";

// نسخ مركز الكافل في منفذ البيانات: تُسجَّل في المتصفّح مع الغلاف، قبل أن تُرسم صفحات «جرّب».
// (`beforeLoad` لا يُعاد في المتصفّح عند الدخول من رابطٍ مباشر بعد رسم الخادم؛ والنداء صريح
// لأنّ `sideEffects: false` يُسقط الاستيراد العاري — كان سبب هيكلٍ بلا نهاية في صفحة الكفالة.)
registerSponsorCenterDemos();

/*
 * نصوص غلاف التجربة هنا لا في ملفّ المسار: ما في ملفّ المسار يدخل حزمة الدخول لكلّ الصفحات
 * (العنوان والوصف يحتاجهما `head`)، وهذه لا يحتاجها إلا من فتح `/try`.
 */
const COPY = defineCopy("components/try/TryShell", {
  ar: {
    mode: "الوضع التجريبي",
    modeLabel: "أنت الآن في الوضع التجريبي",
    noteShort: "أنت الآن في الوضع التجريبي: لا يُخصم شيء. الرحلة الحقيقية تبدأ بتسجيلك.",
    noteLong:
      "أنت الآن في الوضع التجريبي: الأطفال بأسماءٍ مستعارة والدفع محاكاة، فلا يُخصم شيء ولا يُرسل. تدخل الرحلة الحقيقية بتسجيلك.",
    noteRegistered:
      "أنت الآن في الوضع التجريبي، وحسابك جاهز: ما تختاره هنا يبقى محاكاة حتى تؤكّده في «أثري» الحقيقية.",
    leftTitle: "غادرت الوضع التجريبي",
    leftText: "ما اخترته محفوظٌ في متصفّحك مقترحاً. سجّل ببريدك لتدخل الرحلة الحقيقية.",
    leftAction: "ادخل الحقيقية",
    dialogTitle: "ادخل الرحلة الحقيقية",
    dialogHint:
      "بريدك وحده: يصلك رمزٌ من ستة أرقام، ويُنشأ حسابك عند أوّل دخول. أو بضغطةٍ بحساب جوجل. لا كلمة مرور.",
    restarted: "بدأت التجربة من جديد",
    restart: "ابدأ من جديد",
  },
  en: {
    mode: "Demo mode",
    modeLabel: "You are now in demo mode",
    noteShort:
      "You are now in demo mode: nothing is charged. The real one begins when you register.",
    noteLong:
      "You are now in demo mode: the children are under pseudonyms and payment is simulated, so nothing is charged or sent. You enter the real journey by registering.",
    noteRegistered:
      "You are now in demo mode, and your account is ready: what you choose here stays simulated until you confirm it in your real “My impact”.",
    leftTitle: "You have left demo mode",
    leftText:
      "What you chose is kept in your browser as a proposal. Register with your email to enter the real journey.",
    leftAction: "Enter the real one",
    dialogTitle: "Enter the real journey",
    dialogHint:
      "Just your email: a six-digit code arrives, and your account is created the first time you sign in. Or one tap with Google. No password.",
    restarted: "The trial has started over",
    restart: "Start over",
  },
});

// شريط وضع العرض يُحمَّل حين يُفعَّل وحده
const TryPresentBar = lazy(() =>
  import("@/components/try/TryPresent").then((m) => ({ default: m.TryPresentBar })),
);

/** the paths that are still the trial, or already the way into the real journey */
const stillInside = (path: string) =>
  path === "/try" ||
  path.startsWith("/try/") ||
  path === "/hall" ||
  path === "/auth" ||
  path === "/dashboard";

/** يفتح نافذة الدخول عند كلّ طلب */
function OpenOnAsk({ open, ask }: { open: () => void; ask: number }) {
  useEffect(() => {
    if (ask > 0) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);
  return null;
}

/**
 * حال رحلة التجربة لكل ما تحت `/try`، تُقرأ مرّةً واحدة هنا: سجلّات التجربة مقترحاتٍ، وحال
 * الدخول، ونافذة التسجيل الواحدة. التسجيل من داخل التجربة بأقصر طريق (بريدٌ ورمز، أو جوجل)،
 * ثم إلى «أثري» الحقيقية حيث ينتظر المقترح. لا يُرسل من التجربة شيءٌ إلى الخادم غير الدخول نفسه.
 */
function TryJourneyProvider({ children }: { children: ReactNode }) {
  const c = useCopy(COPY);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [proposals, setProposals] = useState<TrialProposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    const read = () => {
      setProposals(
        proposalsFrom(loadGifts(), loadPledges(), (id) => tryChild(id)?.co, TRY_CURRENCY),
      );
      setLoaded(true);
    };
    read();
    window.addEventListener(TRY_EVENT, read);
    return () => window.removeEventListener(TRY_EVENT, read);
  }, []);
  const value = useMemo(
    () => ({
      proposals,
      has: proposals.length > 0,
      registered: !!user,
      ready: !loading,
      loaded,
      register: () => setAsk((n) => n + 1),
    }),
    [proposals, user, loading, loaded],
  );
  return (
    <TryJourneyContext.Provider value={value}>
      {children}
      <AuthDialog
        simple
        title={c.dialogTitle}
        hint={c.dialogHint}
        // جوجل يغادر الصفحة ويعود إليها: العلامة تُكمل به إلى «أثري» حين يعود داخلاً
        onOpen={markResume}
        onDone={() => {
          takeResume();
          // الرحلة الحقيقية تبدأ: يُغادَر الوضع التجريبي قبلها
          exitDemo();
          void navigate({ to: "/dashboard" });
        }}
        trigger={(open) => <OpenOnAsk open={open} ask={ask} />}
      />
    </TryJourneyContext.Provider>
  );
}

export function TryShell() {
  // كلّ ما تحت «جرّب» داخل الوضع التجريبي: من فتح رابطاً منها مباشرةً يرى شريطه ومخرجه.
  useEffect(() => enterDemo(), []);
  return (
    <TryJourneyProvider>
      <TryShellInner />
    </TryJourneyProvider>
  );
}

/**
 * غلاف صفحات التجربة: الشريط الدائم «رحلة افتراضية» بمحطّاته وبابه إلى الحقيقية، وسطر الشرح،
 * وحفظ ما اختاره الزائر مقترحاً في متصفّحه، ودعوة المغادرة.
 */
function TryShellInner() {
  const c = useCopy(COPY);
  const { proposals, has, registered, ready, loaded } = useTryJourney();
  const router = useRouter();
  const navigate = useNavigate();
  const path = useRouterState({ select: (st) => st.location.pathname });
  // صفحات الأدوار تُظهر الدور بدل محطّات رحلة الكافل، فلا يقول الشريط «ادعم» في لوحة الإدارة
  const role = roleOf(path);
  const present = usePresenting();

  /* ما اختاره الزائر يُحفظ مقترحاً في متصفّحه كلّما تغيّر؛ «ابدأ من جديد» يمحوه. لا خادم هنا. */
  useEffect(() => {
    // before the browser has been read, an empty list must not wipe a stored proposal
    if (loaded) syncHandoff(proposals);
  }, [proposals, loaded]);

  /* عاد من الدخول بجوجل بعد أن طلب الرحلة الحقيقية: يُكمل إليها */
  useEffect(() => {
    if (ready && registered && takeResume()) {
      exitDemo();
      void navigate({ to: "/dashboard" });
    }
  }, [ready, registered, navigate]);

  /* عند المغادرة، مرّةً واحدة في التبويب ولمن له عطاءٌ محاكى ولم يسجّل: دعوةٌ هادئة لا نافذة */
  const leaving = useRef({ has, registered, c });
  leaving.current = { has, registered, c };
  useEffect(
    () => () => {
      const now = leaving.current;
      if (stillInside(router.state.location.pathname)) return;
      if (!now.has || now.registered || !firstLeave()) return;
      toast(now.c.leftTitle, {
        description: now.c.leftText,
        duration: 12_000,
        action: {
          label: now.c.leftAction,
          onClick: () => void router.navigate({ to: "/auth", search: { redirect: "/dashboard" } }),
        },
      });
    },
    [router],
  );

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      {/* الشريط الدائم: «رحلة افتراضية»، وأين أنت فيها، وبابها إلى الحقيقية. يبقى تحت الترويسة. */}
      <div
        role="note"
        aria-label={c.modeLabel}
        data-try-bar
        className="sticky z-40 border-b border-bridge/30 bg-background/85 backdrop-blur"
        style={{ top: "calc(var(--demo-bar-h, 0px) + var(--site-header-h, 4rem))" }}
      >
        <div className="mx-auto flex min-h-11 max-w-6xl items-center gap-x-2 px-4 text-sm">
          <span className="inline-flex shrink-0 items-center gap-2 font-bold text-bridge-ink">
            <span aria-hidden="true" className="size-2 rotate-45 border border-bridge" />
            {c.mode}
          </span>
          {role ? (
            <TryRoleChip role={role} />
          ) : (
            <TryJourneyRail className="flex-1 overflow-hidden px-1" />
          )}
          <TryRealButton size="sm" variant="outline" short className="shrink-0 bg-card" />
        </div>
      </div>
      <div className={present ? "hidden" : "border-b border-border bg-bridge/8"}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-sm">
          <p className="min-w-0 basis-full py-1 leading-6 text-foreground sm:flex-1 sm:basis-auto">
            {registered ? (
              c.noteRegistered
            ) : (
              <>
                <span className="sm:hidden">{c.noteShort}</span>
                <span className="hidden sm:inline">{c.noteLong}</span>
              </>
            )}
          </p>
          <TryJourneyGuide />
          <button
            type="button"
            onClick={() => {
              // التجربة كلّها: العطاءات والتعهّدات وحالة القاعة والرؤية والمقترحات.
              resetGifts();
              resetPledges();
              resetTrialSession();
              // بلا هذا لا يتغيّر شيءٌ أمام الزائر خارج «أثري»، فلا يعرف أنّ ضغطته سُجّلت.
              toast.success(c.restarted);
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{c.restart}</span>
            <span className="sr-only sm:hidden">{c.restart}</span>
          </button>
        </div>
      </div>
      <main
        id="main"
        tabIndex={-1}
        className={
          present
            ? "try-page mx-auto max-w-6xl px-4 pt-10 pb-32"
            : "try-page mx-auto max-w-6xl px-4 py-10"
        }
      >
        <Outlet />
      </main>
      {present && (
        <Suspense fallback={null}>
          <TryPresentBar />
        </Suspense>
      )}
      <SiteFooter />
    </div>
  );
}
