import { Link, useRouterState } from "@tanstack/react-router";
import {
  Box,
  Check,
  Clock3,
  DoorOpen,
  HandCoins,
  HeartHandshake,
  Map as MapIcon,
  MapPinned,
  Route as RouteIcon,
  Sparkles,
  Sprout,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";

import { useTryJourney } from "@/components/try/TryRealInvite";
import { useTryHallSearch } from "@/components/try/useTryHallSearch";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { localTryChild, tryChildrenByWait } from "@/lib/try-demo";
import { tryJourney, type TryStage, type TryStageState } from "@/lib/try-handoff";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/try/TryJourneyGuide", {
  ar: {
    choose: {
      title: "اختر طفلاً",
      text: "ستة أطفالٍ افتراضيين، الأطول انتظاراً أوّلاً، كما في الدليل الحقيقي.",
    },
    hall: {
      title: "ادخل قاعة الأثر",
      text: "بوابة الشعار، ثم الكرة الأرضية: اختر دولةً لترى مناطقها وأطفالها.",
    },
    time: {
      title: "حرّك الزمن",
      text: "داخل الدولة: شريطٌ من قبل سنة إلى بعد سنة، وزر «شاهد السنة تمرّ».",
    },
    file: {
      title: (name: string) => `افتح ملف ${name}`,
      text: "حاجته الشهرية وما غُطّي منها، واختر شهرياً أو مرّةً واحدة، وترى الأثر قبل الدفع.",
    },
    pay: {
      title: "ادفع دفعاً محاكى",
      text: "لا بطاقة ولا خصم: تهنئةٌ ثم انتقالٌ إلى «أثري».",
    },
    impact: {
      title: "شاهد أثرك",
      text: "«أثري» تبني كوكبة أثرك وتعرضها «منذ البداية»، و«الوضع الغامر» يطير بك إلى منطقة الطفل ليصل عطاؤك أمامك.",
    },
    place: {
      title: "ادعم منطقةً من الخريطة",
      text: "تأهيلٌ أو دعمٌ عيني لطفلٍ أو مجموعته أو منطقته أو دولته: اختر المكان، وفي بطاقته النوع والمبلغ.",
    },
    kinds: {
      title: "قارن الأثر بحسب نوع الدعم",
      text: "في «أثري» ثلاثة ألسنة: المادية سجلّ ما وصل، والتأهيل تطوّر المنطقة بجلساته وسماته، والعيني تسليمٌ بمستنده. و«قدّم شهراً» يحرّكها كلّها.",
    },
    real: {
      title: "ادخل الرحلة الحقيقية",
      text: "سجّل ببريدك وحده، ثم أكّد ما اخترته هنا: هناك يبدأ الأثر الحقيقي.",
      textRegistered: "حسابك جاهز: في «أثري» الحقيقية تجد ما اخترته مقترحاً ينتظر تأكيدك.",
    },
    stages: { choose: "اختر", give: "ادعم", impact: "شاهد أثرك", real: "الرحلة الحقيقية" },
    railLabel: "أين أنت في الرحلة الافتراضية",
    stateDone: "تمّت",
    stateCurrent: "أنت هنا",
    stateAhead: "لاحقاً",
    youAreHere: "أنت هنا",
    triggerHero: "الرحلة كاملة خطوةً خطوة",
    trigger: "الرحلة كاملة",
    title: "رحلة التجربة كاملة",
    description:
      "من أوّل فتح الموقع إلى ظهور الأثر، في نحو ثلاث دقائق. كلّ ما هنا افتراضي، ولا يُخصم أي مبلغ.",
    fromMap: "ابدأ الرحلة من الخريطة",
    fromFile: "ابدأ من ملف طفل",
  },
  en: {
    choose: {
      title: "Choose a child",
      text: "Six fictional children, longest wait first, as in the real directory.",
    },
    hall: {
      title: "Enter the Impact Hall",
      text: "Through the emblem gate to the globe: choose a country to see its regions and children.",
    },
    time: {
      title: "Move through time",
      text: "Inside a country: a timeline from a year ago to a year ahead, and a “Watch the year pass” button.",
    },
    file: {
      title: (name: string) => `Open ${name}'s file`,
      text: "The monthly need and how much is covered. Choose monthly or one-time, and see the impact before you pay.",
    },
    pay: {
      title: "Make a simulated payment",
      text: "No card and no charge: a word of thanks, then on to “My impact”.",
    },
    impact: {
      title: "See your impact",
      text: "“My impact” builds your constellation and replays it from the beginning; the immersive view takes you to the child's region to watch your gift arrive.",
    },
    place: {
      title: "Support a region from the map",
      text: "Qualification or in-kind support for a child, their group, their region or their country: choose the place, then the kind and the amount on its card.",
    },
    kinds: {
      title: "Compare impact by kind of support",
      text: "“My impact” has three tabs: financial is a record of what was delivered, qualification is the region's development in sessions and traits, and in-kind is a delivery with its document. “Advance a month” moves them all.",
    },
    real: {
      title: "Enter the real journey",
      text: "Register with just your email, then confirm what you chose here: that is where real impact begins.",
      textRegistered:
        "Your account is ready: your real “My impact” holds what you chose as a proposal awaiting your confirmation.",
    },
    stages: { choose: "Choose", give: "Give", impact: "See your impact", real: "The real journey" },
    railLabel: "Where you are in the virtual journey",
    stateDone: "Done",
    stateCurrent: "You are here",
    stateAhead: "Ahead",
    youAreHere: "You are here",
    triggerHero: "The full journey, step by step",
    trigger: "Full journey",
    title: "The full trial journey",
    description:
      "From opening the site to seeing your impact, in about three minutes. Everything here is sample data, and nothing is charged.",
    fromMap: "Start from the map",
    fromFile: "Start from a child's file",
  },
});

const STAGE_TO: Partial<Record<TryStage, "/try" | "/try/impact">> = {
  choose: "/try",
  impact: "/try/impact",
};

/** حال محطّات الرحلة الأربع للصفحة الحالية */
function useStages() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { has, registered } = useTryJourney();
  return tryJourney(path, has, registered);
}

const dot = (state: TryStageState, real: boolean) =>
  cn(
    "grid size-5 shrink-0 place-items-center rounded-full border text-xs leading-none font-bold tabular-nums transition-colors",
    state === "current"
      ? "border-primary bg-primary text-primary-foreground"
      : state === "done"
        ? "border-primary/50 text-primary"
        : real
          ? "border-bridge text-bridge-ink"
          : "border-border text-muted-foreground",
  );

/**
 * «أين أنا»: المحطّات الأربع في سطرٍ واحد داخل شريط الرحلة الافتراضية: ما تمّ، وأين أنت، وما
 * بعده، وآخرها «الرحلة الحقيقية» التي يفتحها التسجيل. على الجوال تبقى النقاط واسم المحطّة الحالية.
 */
export function TryJourneyRail({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const stages = useStages();
  const state = { done: c.stateDone, current: c.stateCurrent, ahead: c.stateAhead };
  return (
    <ol aria-label={c.railLabel} className={cn("flex min-w-0 items-center", className)}>
      {stages.map((s, i) => {
        const real = s.stage === "real";
        const to = STAGE_TO[s.stage];
        const label = (
          <span
            aria-hidden="true"
            className={cn(
              "whitespace-nowrap",
              s.state === "current"
                ? "hidden font-bold text-foreground sm:inline"
                : real
                  ? "hidden font-medium text-bridge-ink md:inline"
                  : "hidden text-muted-foreground md:inline",
            )}
          >
            {c.stages[s.stage]}
          </span>
        );
        const inner = (
          <>
            <span className={dot(s.state, real)} aria-hidden="true">
              {s.state === "done" ? <Check className="size-3" strokeWidth={2.5} /> : i + 1}
            </span>
            {label}
            <span className="sr-only">
              {/* الاسم الظاهر زينةٌ للعين (ويُخفى على الجوال): قارئ الشاشة يسمعه هنا مع حاله */}
              {c.stages[s.stage]} ({state[s.state]})
            </span>
          </>
        );
        return (
          <li
            key={s.stage}
            data-stage={s.stage}
            data-state={s.state}
            aria-current={s.state === "current" ? "step" : undefined}
            className="flex min-w-0 items-center text-sm"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 h-px w-2.5 sm:w-5",
                  s.state === "ahead" ? "bg-border" : "bg-primary/20",
                )}
              />
            )}
            {to && s.state !== "current" ? (
              <Link
                to={to}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg hover:text-foreground"
              >
                {inner}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * «الرحلة كاملة»: دليلٌ قصير لوضع التجربة يُريه العميل من أوّل فتح الموقع إلى ظهور الأثر،
 * وكلّ خطوةٍ رابطٌ إلى موضعها، بحالها (تمّت، أنت هنا)، وآخرها باب الرحلة الحقيقية: التسجيل.
 * لا يحفظ شيئاً، ولا يمسّ الدليل أو الدفع الحقيقيين.
 */
export function TryJourneyGuide({ variant = "bar" }: { variant?: "bar" | "hero" }) {
  const c = useCopy(COPY);
  const first = localTryChild(tryChildrenByWait()[0]!, useLocale());
  const { registered, register } = useTryJourney();
  const stageState = Object.fromEntries(useStages().map((s) => [s.stage, s.state])) as Record<
    TryStage,
    TryStageState
  >;
  const [open, setOpen] = useState(false);
  const hallSearch = useTryHallSearch();
  const steps = [
    {
      stage: "choose" as const,
      icon: HeartHandshake,
      title: c.choose.title,
      text: c.choose.text,
      to: "/try" as const,
    },
    {
      stage: "give" as const,
      icon: MapIcon,
      title: c.hall.title,
      text: c.hall.text,
      to: "/hall" as const,
      search: hallSearch,
    },
    {
      stage: "give" as const,
      icon: Clock3,
      title: c.time.title,
      text: c.time.text,
    },
    {
      stage: "give" as const,
      icon: Box,
      title: c.file.title(first.name),
      text: c.file.text,
      to: "/try/$childId" as const,
      params: { childId: first.id },
    },
    {
      stage: "give" as const,
      icon: HandCoins,
      title: c.pay.title,
      text: c.pay.text,
    },
    {
      stage: "impact" as const,
      icon: Sparkles,
      title: c.impact.title,
      text: c.impact.text,
      to: "/try/impact" as const,
    },
    {
      stage: "give" as const,
      icon: MapPinned,
      title: c.place.title,
      text: c.place.text,
      to: "/try/support" as const,
      search: { c: "EG", r: "EGY-1533", kind: "qualification" as const },
    },
    {
      stage: "impact" as const,
      icon: Sprout,
      title: c.kinds.title,
      text: c.kinds.text,
      to: "/try/impact" as const,
      search: { kind: "qualification" as const },
    },
  ];
  const realBody = (
    <>
      <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-bridge bg-card text-bridge-ink">
        <DoorOpen className="size-4.5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="min-w-0 text-start">
        <span className="block font-bold">
          {steps.length + 1}. {c.real.title}
        </span>
        <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">
          {registered ? c.real.textRegistered : c.real.text}
        </span>
      </span>
    </>
  );
  const realRow =
    "flex w-full gap-3 rounded-2xl border border-bridge/40 bg-bridge/8 p-2 transition-colors hover:bg-bridge/10";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "hero" ? (
          <Button size="lg" variant="outline">
            <RouteIcon className="size-4" aria-hidden="true" />
            {c.triggerHero}
          </Button>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-bold text-primary hover:bg-secondary"
          >
            <RouteIcon className="size-4" aria-hidden="true" />
            {c.trigger}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{c.title}</DialogTitle>
          <DialogDescription className="leading-7">{c.description}</DialogDescription>
        </DialogHeader>
        <ol className="relative mt-2 space-y-1 before:absolute before:inset-y-5 before:start-5 before:w-px before:bg-border">
          {steps.map((s, i) => {
            const state = stageState[s.stage];
            const body = (
              <>
                <span
                  className={cn(
                    "relative z-10 grid size-10 shrink-0 place-items-center rounded-full border bg-card",
                    state === "current"
                      ? "border-primary text-primary"
                      : state === "done"
                        ? "border-primary/40 text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  <s.icon className="size-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 font-bold">
                    <span>
                      {i + 1}. {s.title}
                    </span>
                    {state === "done" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        {c.stateDone}
                      </span>
                    )}
                    {state === "current" && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {c.youAreHere}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">
                    {s.text}
                  </span>
                </span>
              </>
            );
            return (
              <li key={s.title}>
                {s.to ? (
                  <Link
                    to={s.to}
                    {...("search" in s ? { search: s.search } : {})}
                    {...("params" in s ? { params: s.params } : {})}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 rounded-2xl p-2 transition-colors hover:bg-secondary"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 p-2">{body}</div>
                )}
              </li>
            );
          })}
          {/* the door out of the trial: the last step is the real journey itself */}
          <li className="pt-1">
            {registered ? (
              <Link to="/dashboard" className={realRow}>
                {realBody}
              </Link>
            ) : (
              <button
                type="button"
                data-try-real="register"
                onClick={() => {
                  // one dialog at a time: the guide closes, then the sign-in opens
                  setOpen(false);
                  register();
                }}
                className={realRow}
              >
                {realBody}
              </button>
            )}
          </li>
        </ol>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button asChild size="lg" className="flex-1">
            <Link to="/hall" search={hallSearch}>
              {c.fromMap}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="flex-1">
            <Link to="/try/$childId" params={{ childId: first.id }}>
              {c.fromFile}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
