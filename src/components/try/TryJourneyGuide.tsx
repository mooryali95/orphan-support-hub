import { Link } from "@tanstack/react-router";
import {
  Box,
  Clock3,
  HandCoins,
  HeartHandshake,
  Map as MapIcon,
  Route as RouteIcon,
  Sparkles,
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
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { localTryChild, tryChildrenByWait } from "@/lib/try-demo";

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
    triggerHero: "The full journey, step by step",
    trigger: "Full journey",
    title: "The full trial journey",
    description:
      "From opening the site to seeing your impact, in about three minutes. Everything here is sample data, and nothing is charged.",
    fromMap: "Start from the map",
    fromFile: "Start from a child's file",
  },
});

/**
 * «الرحلة كاملة»: دليلٌ قصير لوضع التجربة يُريه العميل من أوّل فتح الموقع إلى ظهور الأثر،
 * وكلّ خطوةٍ رابطٌ إلى موضعها. لا يحفظ شيئاً، ولا يمسّ الدليل أو الدفع الحقيقيين.
 */
export function TryJourneyGuide({ variant = "bar" }: { variant?: "bar" | "hero" }) {
  const c = useCopy(COPY);
  const first = localTryChild(tryChildrenByWait()[0]!, useLocale());
  const steps = [
    {
      icon: HeartHandshake,
      title: c.choose.title,
      text: c.choose.text,
      to: "/try" as const,
    },
    {
      icon: MapIcon,
      title: c.hall.title,
      text: c.hall.text,
      to: "/hall" as const,
      search: { try: 1 as const },
    },
    {
      icon: Clock3,
      title: c.time.title,
      text: c.time.text,
    },
    {
      icon: Box,
      title: c.file.title(first.name),
      text: c.file.text,
      to: "/try/$childId" as const,
      params: { childId: first.id },
    },
    {
      icon: HandCoins,
      title: c.pay.title,
      text: c.pay.text,
    },
    {
      icon: Sparkles,
      title: c.impact.title,
      text: c.impact.text,
      to: "/try/impact" as const,
    },
  ];

  return (
    <Dialog>
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
            const body = (
              <>
                <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-primary">
                  <s.icon className="size-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">
                    {i + 1}. {s.title}
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
        </ol>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button asChild size="lg" className="flex-1">
            <Link to="/hall" search={{ try: 1 }}>
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
