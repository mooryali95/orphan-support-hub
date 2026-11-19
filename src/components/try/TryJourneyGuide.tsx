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
import { tryChildrenByWait } from "@/lib/try-demo";

/**
 * «الرحلة كاملة»: دليلٌ قصير لوضع التجربة يُريه العميل من أوّل فتح الموقع إلى ظهور الأثر،
 * وكلّ خطوةٍ رابطٌ إلى موضعها. لا يحفظ شيئاً، ولا يمسّ الدليل أو الدفع الحقيقيين.
 */
export function TryJourneyGuide({ variant = "bar" }: { variant?: "bar" | "hero" }) {
  const first = tryChildrenByWait()[0]!;
  const steps = [
    {
      icon: HeartHandshake,
      title: "اختر طفلاً",
      text: "ستة أطفالٍ افتراضيين، الأطول انتظاراً أوّلاً، كما في الدليل الحقيقي.",
      to: "/try" as const,
    },
    {
      icon: MapIcon,
      title: "ادخل قاعة الأثر",
      text: "بوابة الشعار، ثم الكرة الأرضية: اختر دولةً لترى مناطقها وأطفالها.",
      to: "/hall" as const,
      search: { try: 1 as const },
    },
    {
      icon: Clock3,
      title: "حرّك الزمن",
      text: "داخل الدولة: شريطٌ من قبل سنة إلى بعد سنة، وزر «شاهد السنة تمرّ».",
    },
    {
      icon: Box,
      title: `افتح ملف ${first.name}`,
      text: "حاجته الشهرية وما غُطّي منها، واختر شهرياً أو مرّةً واحدة، وترى الأثر قبل الدفع.",
      to: "/try/$childId" as const,
      params: { childId: first.id },
    },
    {
      icon: HandCoins,
      title: "ادفع دفعاً محاكى",
      text: "لا بطاقة ولا خصم: تهنئةٌ ثم انتقالٌ إلى «أثري».",
    },
    {
      icon: Sparkles,
      title: "شاهد أثرك",
      text: "«أثري» تبني كوكبة أثرك وتعرضها «منذ البداية»، و«الوضع الغامر» يطير بك إلى منطقة الطفل ليصل عطاؤك أمامك.",
      to: "/try/impact" as const,
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        {variant === "hero" ? (
          <Button size="lg" variant="outline">
            <RouteIcon className="size-4" aria-hidden="true" />
            الرحلة كاملة خطوةً خطوة
          </Button>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-bold text-primary hover:bg-secondary"
          >
            <RouteIcon className="size-4" aria-hidden="true" />
            الرحلة كاملة
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">رحلة التجربة كاملة</DialogTitle>
          <DialogDescription className="leading-7">
            من أوّل فتح الموقع إلى ظهور الأثر، في نحو ثلاث دقائق. كلّ ما هنا افتراضي، ولا يُخصم أي
            مبلغ.
          </DialogDescription>
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
              ابدأ الرحلة من الخريطة
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="flex-1">
            <Link to="/try/$childId" params={{ childId: first.id }}>
              ابدأ من ملف طفل
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
