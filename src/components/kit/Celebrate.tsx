import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * لحظة الإتمام — نادرةٌ فتستحقّ الحركة: حلقةٌ ذهبية تتّسع، وعلامةٌ تُرسم،
 * وأوراقٌ من الشعار تتفتّح حولها ثم تسكن. مرّةً واحدة، أقلّ من ثانيتين،
 * وبلا حركةٍ لمن طلب تقليلها. والمعنى في النصّ لا في الحركة.
 */
const LEAVES = 12;

export function CelebrateMark({ className }: { className?: string }) {
  return (
    <div className={cn("relative z-0 mx-auto size-28", className)} aria-hidden="true">
      {Array.from({ length: LEAVES }, (_, i) => (
        <span
          key={i}
          className="celebrate-leaf absolute start-1/2 top-1/2 z-10"
          style={{
            ["--a" as string]: `${(360 / LEAVES) * i}deg`,
            ["--d" as string]: `${i * 18}ms`,
          }}
        >
          <svg
            viewBox="0 0 10 16"
            className={cn("size-3", i % 3 === 0 ? "fill-bridge" : "fill-primary/70")}
          >
            <path d="M5 0C9 4 9 11 5 16 1 11 1 4 5 0Z" />
          </svg>
        </span>
      ))}
      <span className="celebrate-ring absolute inset-2 rounded-full bg-primary shadow-[0_12px_32px_-8px_color-mix(in_oklch,var(--color-primary)_60%,transparent)] ring-4 ring-bridge/40" />
      <svg viewBox="0 0 48 48" className="absolute inset-2 text-primary-foreground">
        <path
          d="M14 25l7 7 13-15"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="celebrate-check"
          pathLength={1}
        />
      </svg>
    </div>
  );
}

/** نافذة احتفالٍ فوق الصفحة: تُركّز على زرّها، وتُغلق بـ Escape. */
export function CelebrateOverlay({
  title,
  text,
  action,
  onClose,
}: {
  title: string;
  text?: ReactNode;
  action: string;
  onClose: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // التركيز للوحة المفاتيح وقارئ الشاشة، بلا إطارٍ ظاهر لمن جاء بالفأرة.
    btn.current?.focus({ focusVisible: false } as FocusOptions);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="celebrate-title"
      className="fixed inset-0 z-[60] grid place-items-center bg-foreground/25 p-4 backdrop-blur-[3px] map-rise"
    >
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)]">
        <CelebrateMark />
        <h2
          id="celebrate-title"
          className="celebrate-text mt-6 font-serif text-3xl font-bold text-primary"
        >
          {title}
        </h2>
        {text && (
          <p className="celebrate-text mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
        )}
        <button
          ref={btn}
          type="button"
          onClick={onClose}
          className="celebrate-text mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97]"
        >
          {action}
        </button>
      </div>
    </div>
  );
}
