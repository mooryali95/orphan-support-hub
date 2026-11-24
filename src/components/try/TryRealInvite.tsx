import { Link } from "@tanstack/react-router";
import { ArrowLeft, DoorOpen } from "lucide-react";
import { createContext, useContext } from "react";
import { exitDemo } from "@/lib/demo-mode";

import { ProposalLine } from "@/components/try/TrialProposal";
import { Button } from "@/components/ui/button";
import { defineCopy, useCopy } from "@/lib/locale";
import type { TrialProposal } from "@/lib/try-handoff";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/try/TryRealInvite", {
  ar: {
    enter: "ادخل الرحلة الحقيقية",
    enterShort: "الرحلة الحقيقية",
    enterTiny: "الحقيقية",
    continue: "أكمل إلى رحلتك الحقيقية",
    eyebrow: "من الافتراضي إلى الحقيقي",
    title: "هذه رحلةٌ افتراضية. الحقيقية تبدأ بتسجيلك",
    titleRegistered: "حسابك جاهز. رحلتك الحقيقية تنتظرك",
    text: "كلّ ما رأيته هنا محاكاة: لم يُخصم شيء، ولم يُكفل طفل. سجّل ببريدك وحده، فتجد ما اخترته مقترحاً ينتظرك هناك.",
    textRegistered:
      "ما رأيته هنا محاكاة. في «أثري» الحقيقية تجد ما اخترته مقترحاً، ولا يبدأ شيءٌ قبل أن تؤكّده.",
    chosen: "ما اخترته في التجربة",
    promises: [
      "لا يُنقل شيءٌ تلقائياً: ما اخترته يصير مقترحاً فقط.",
      "تؤكّد كلّ مبلغٍ بنفسك، ولا يتغيّر مبلغٌ دون علمك.",
      "أطفال التجربة افتراضيون؛ هناك تختار طفلاً من دليل الملفات المعتمدة.",
    ],
    fields: "حقلٌ واحد: بريدك.",
    after: "هذه رحلةٌ افتراضية: لم يُخصم شيء. الحقيقية تبدأ بتسجيلك.",
    line: "هذا عطاءٌ افتراضي: لم يُسجَّل شيءٌ حقيقي.",
    lineRegistered: "هذا عطاءٌ افتراضي. الحقيقي تؤكّده في «أثري».",
  },
  en: {
    enter: "Enter the real journey",
    enterShort: "The real journey",
    enterTiny: "Go real",
    continue: "Continue to your real journey",
    eyebrow: "From virtual to real",
    title: "This is a virtual journey. The real one begins when you register",
    titleRegistered: "Your account is ready. Your real journey is waiting",
    text: "Everything you saw here is simulated: nothing was charged, and no child was sponsored. Register with just your email and find what you chose waiting there as a proposal.",
    textRegistered:
      "What you saw here is simulated. In your real “My impact” you will find what you chose as a proposal, and nothing begins before you confirm it.",
    chosen: "What you chose in the trial",
    promises: [
      "Nothing is carried over automatically: what you chose becomes a proposal only.",
      "You confirm every amount yourself; no amount changes without you.",
      "The trial's children are fictional; there you choose a child from the directory of approved files.",
    ],
    fields: "One field: your email.",
    after: "This is a virtual journey: nothing was charged. The real one begins when you register.",
    line: "This gift is virtual: nothing real was recorded.",
    lineRegistered: "This gift is virtual. You confirm the real one in “My impact”.",
  },
});

export type TryJourneyState = {
  /** ما اختاره الزائر في التجربة، مقترحاتٍ (الأحدث أوّلاً) */
  proposals: TrialProposal[];
  /** له عطاءٌ محاكى واحد على الأقل */
  has: boolean;
  /** داخلٌ بحسابٍ حقيقي */
  registered: boolean;
  /** عُرفت حال الدخول (قبلها لا تُعرض دعوةٌ قد تنقلب) */
  ready: boolean;
  /** قُرئت سجلّات التجربة من المتصفّح (قبلها القائمة الفارغة لا تعني «لا سجلّات») */
  loaded: boolean;
  /** يفتح نافذة التسجيل فوق الصفحة (غلاف التجربة يحملها مرّةً واحدة) */
  register: () => void;
};

/*
 * السياق هنا بلا مزوّده: المزوّد في غلاف التجربة (`TryShell`) لأنه يحمل الدخول ونافذته، وهذه
 * الوحدة تستوردها صفحات التجربة كلّها، فتبقى خفيفةً ولا تجرّ الدخول إلى حزمها.
 */
export const TryJourneyContext = createContext<TryJourneyState>({
  proposals: [],
  has: false,
  registered: false,
  ready: false,
  loaded: false,
  register: () => {},
});

export const useTryJourney = () => useContext(TryJourneyContext);

/** زرّ الدعوة: يفتح التسجيل، أو يقود الداخل إلى «أثري» الحقيقية */
export function TryRealButton({
  size = "lg",
  variant = "default",
  short,
  className,
}: {
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline";
  short?: boolean;
  className?: string;
}) {
  const c = useCopy(COPY);
  const { registered, register } = useTryJourney();
  if (registered)
    return (
      <Button asChild size={size} variant={variant} className={className}>
        <Link to="/dashboard" data-try-real="continue" onClick={exitDemo}>
          {short ? (
            <>
              <span className="sm:hidden" aria-hidden="true">
                {c.enterTiny}
              </span>
              <span className="hidden sm:inline">{c.enterShort}</span>
              <span className="sr-only sm:hidden">{c.continue}</span>
            </>
          ) : (
            c.continue
          )}
          <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      </Button>
    );
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      data-try-real="register"
      onClick={register}
    >
      {short ? (
        <>
          <span className="sm:hidden" aria-hidden="true">
            {c.enterTiny}
          </span>
          <span className="hidden sm:inline">{c.enterShort}</span>
          <span className="sr-only sm:hidden">{c.enter}</span>
        </>
      ) : (
        c.enter
      )}
      <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
    </Button>
  );
}

/** بعد الدفع المحاكى، داخل التهنئة: سطرٌ يذكّر بأنّ ما تمّ افتراضي */
export function TryVirtualNote({ className }: { className?: string }) {
  const c = useCopy(COPY);
  return <span className={className}>{c.after}</span>;
}

/** الدعوة سطراً واحداً، بعد عطاءٍ محاكى داخل بطاقةٍ ضيّقة (بطاقة المكان في الخريطة) */
export function TryRealLine({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const { registered, register } = useTryJourney();
  const link =
    "inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline";
  return (
    <p
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2 text-xs leading-5 text-muted-foreground",
        className,
      )}
    >
      <span>{registered ? c.lineRegistered : c.line}</span>
      {registered ? (
        <Link to="/dashboard" className={link}>
          {c.continue}
        </Link>
      ) : (
        <button type="button" data-try-real="register" onClick={register} className={link}>
          {c.enter}
        </button>
      )}
    </p>
  );
}

/**
 * الدعوة كاملةً، في اللحظة الطبيعية (آخر «أثري» التجربة): هذه رحلةٌ افتراضية، وما اخترته فيها،
 * وما الذي يحدث ولا يحدث حين تسجّل. تظهر بعد أن تُعرف حال الدخول، فلا تنقلب أمام الزائر.
 */
export function TryRealInvite({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const { proposals, registered, ready } = useTryJourney();
  if (!ready) return null;
  return (
    <section
      aria-labelledby="try-real"
      data-try-invite
      className={cn(
        "overflow-hidden rounded-3xl border border-bridge/40 bg-card shadow-soft",
        className,
      )}
    >
      <span aria-hidden="true" className="rule-champagne block w-full" />
      <div className="grid gap-x-10 gap-y-4 p-6 md:grid-cols-[1fr_1.1fr] md:p-9">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-bridge-ink">
            <DoorOpen className="size-4" strokeWidth={1.5} aria-hidden="true" />
            {c.eyebrow}
          </p>
          <h2
            id="try-real"
            className="mt-3 font-display text-3xl leading-[1.4] font-bold text-balance md:text-4xl"
          >
            {registered ? c.titleRegistered : c.title}
          </h2>
          <p className="mt-3 max-w-xl text-base leading-8 text-muted-foreground">
            {registered ? c.textRegistered : c.text}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <TryRealButton />
            {!registered && <span className="text-sm text-muted-foreground">{c.fields}</span>}
          </div>
        </div>
        <div>
          {proposals.length > 0 && (
            <>
              <p className="text-xs font-bold text-muted-foreground">{c.chosen}</p>
              <ul className="mt-2 mb-5 divide-y divide-border border-y border-border">
                {proposals.slice(0, 3).map((p) => (
                  <li key={p.id} className="py-2.5">
                    <ProposalLine p={p} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul className="space-y-2.5 text-sm leading-7">
            {c.promises.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-3 size-1.5 shrink-0 rotate-45 bg-bridge" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
