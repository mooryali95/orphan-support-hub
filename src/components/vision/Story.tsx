/**
 * «شاهد القصّة» — جولةٌ آلية تمرّ بالأدوار الثلاثة على بيانات المتصفّح نفسها:
 * داعمٌ يتبرّع ← المال يُقيَّد ويُخصَّص ← المشرف يعقد الجلسات ويقيس ← صاحب
 * القرار يرى الفجوة تضيق ويعتمد. تعيش حال الجولة خارج React (الصفحات تُعاد
 * تركيبتها مع كلّ انتقال)، وتكتب في المحرّك عبر التخزين ثم تُعلم الصفحة.
 */
import { useRouter } from "@tanstack/react-router";
import { Pause, Play, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { KEY, PERSONA_KEY, type Persona, SYNC_EVENT } from "@/components/vision/VisionStore";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import {
  type Action,
  groupCostOf,
  isFunded,
  recommend,
  reduce,
  revive,
  seed,
  SESSIONS_PER_CYCLE,
  type VisionState,
} from "@/lib/vision-engine";

type Cap =
  "intro" | "donate" | "money" | "ops" | "sessions" | "measure" | "decision" | "approve" | "done";
export const CAPTIONS: Cap[] = [
  "intro",
  "donate",
  "money",
  "ops",
  "sessions",
  "measure",
  "decision",
  "approve",
  "done",
];

type Snap = { running: boolean; paused: boolean; cap: Cap | null; i: number };
let snap: Snap = { running: false, paused: false, cap: null, i: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<Snap>) => {
  snap = { ...snap, ...p };
  subs.forEach((f) => f());
};
let token = 0;

const read = (): VisionState => {
  try {
    return revive(JSON.parse(sessionStorage.getItem(KEY) ?? "null"));
  } catch {
    return seed();
  }
};
function apply(a: Action) {
  const next = reduce(read(), a);
  sessionStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SYNC_EVENT));
  return next;
}
function persona(p: Persona) {
  sessionStorage.setItem(PERSONA_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export async function runStory(
  go: (to: string) => Promise<unknown>,
  names: { donor: string; supervisor: string; decider: string },
) {
  const my = ++token;
  set({ running: true, paused: false, i: 0, cap: "intro" });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = async (ms: number) => {
    const end = Date.now() + (reduceMotion ? ms * 1.3 : ms);
    while (Date.now() < end || snap.paused) {
      if (my !== token) throw new Error("stopped");
      await new Promise((r) => setTimeout(r, 120));
    }
  };
  const step = async (cap: Cap, ms: number, act?: () => unknown) => {
    set({ cap, i: CAPTIONS.indexOf(cap) });
    await act?.();
    await wait(ms);
  };
  try {
    await step("intro", 3200, () => go("/vision"));
    // الداعم يتبرّع لأوّل مجموعةٍ تنتظر — بما يكمل تمويلها بعد الرسوم.
    const s0 = read();
    // مجموعةٌ في تيرانا إن وُجدت (هي ما يديره المشرف في الجولة)، وإلا أيّ مجموعةٍ تنتظر.
    const g =
      s0.groups.find((x) => x.city === "tirana" && !isFunded(x)) ??
      s0.groups.find((x) => !isFunded(x)) ??
      s0.groups[0]!;
    const focus = () =>
      document
        .getElementById(g.id)
        ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    const need = Math.max(600, groupCostOf(g) - g.funded);
    const gross = Math.ceil(need / (1 - s0.feePercent / 100) / 10) * 10;
    await step("donate", 4200, async () => {
      persona({ role: "supporter", name: names.donor });
      await go("/vision/me");
      await wait(900);
      apply({
        type: "donate",
        donor: names.donor,
        amount: gross,
        method: "card",
        target: { kind: "group", id: g.id },
        at: Date.now(),
      });
    });
    await step("money", 4200, () => go("/vision/payments"));
    await step("ops", 3000, async () => {
      persona({ role: "supervisor", name: names.supervisor });
      await go("/vision/me");
    });
    await step("sessions", 900, focus);
    const left = SESSIONS_PER_CYCLE - (read().groups.find((x) => x.id === g.id)?.sessionsDone ?? 0);
    for (let k = 0; k < left; k++) {
      apply({ type: "session", group: g.id, at: Date.now() });
      await wait(650);
    }
    await step("measure", 3600, () => apply({ type: "measure", group: g.id, at: Date.now() }));
    await step("decision", 4200, async () => {
      persona({ role: "decider", name: names.decider });
      await go("/vision/me");
    });
    await step("approve", 3800, () => {
      const r = recommend(read())[0];
      if (r) apply({ type: "apply", key: r.key, at: Date.now() });
    });
    await step("done", 0);
    set({ running: false });
  } catch {
    /* أُوقفت */
  }
}

export function stopStory() {
  token++;
  set({ running: false, paused: false, cap: null });
}

function useSnap() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => snap,
    () => snap,
  );
}

const COPY = defineCopy("components/vision/Story", {
  ar: {
    watch: "شاهد القصّة",
    watchLead: "جولةٌ آلية من دقيقة: تبرّعٌ واحد يمرّ بالأدوار الثلاثة حتى يعود قراراً.",
    donor: "داعمٌ من الرياض",
    supervisor: "المشرف «أ. ر.»",
    decider: "صاحب القرار",
    pause: "إيقافٌ مؤقّت",
    resume: "متابعة",
    stop: "إنهاء الجولة",
    again: "أعد الجولة",
    caps: {
      intro: "ثلاث طبقاتٍ حول يتيمٍ واحد: التشغيل، والدعم، والقرار. لنتبع تبرّعاً واحداً.",
      donate: "داعمٌ يدخل دون حساب، ويتبرّع لمجموعةٍ تنتظر التمويل — بالبطاقة.",
      money: "المال يُقيَّد في حساب الندوة بفاتورته ورسومه، ثم يُخصَّص للمجموعة ويُصرف للمكتب.",
      ops: "اكتمل تمويل المجموعة، فتصل إلى المشرف في منصّة التشغيل.",
      sessions: "المشرف يسجّل الجلسات الستّ — كلّ جلسةٍ تصل الداعم والقرار فوراً.",
      measure: "القياس البعدي: ترتفع السمة، ويخرج الأطفال من قائمة الحاجة.",
      decision: "صاحب القرار يرى المجموع وحده: الفجوة ضاقت، والتوصيات تغيّرت.",
      approve: "يعتمد أعلى توصية — فتعود إلى الميدان مجموعةً أو حملة.",
      done: "اكتملت الدورة: تبرّعٌ ← تشغيل ← قياس ← قرار. جرّبها بنفسك بأيّ دور.",
    } as Record<Cap, string>,
  },
  en: {
    watch: "Watch the story",
    watchLead:
      "A one-minute guided run: one donation passes through all three roles until it returns as a decision.",
    donor: "A supporter from Riyadh",
    supervisor: "Supervisor “A. R.”",
    decider: "Decision-maker",
    pause: "Pause",
    resume: "Resume",
    stop: "End the tour",
    again: "Replay",
    caps: {
      intro:
        "Three layers around one orphan: operations, support and decision. Let's follow one donation.",
      donate: "A supporter enters with no account and donates by card to a group awaiting funding.",
      money:
        "The money is recorded in WAMY's account with its invoice and fee, then allocated to the group and disbursed.",
      ops: "The group is now fully funded and reaches its supervisor in operations.",
      sessions:
        "The supervisor records all six sessions — each reaches the supporter and the board at once.",
      measure: "Follow-up measurement: the trait rises and the children leave the need list.",
      decision:
        "The decision-maker sees aggregates only: the gap narrowed, the recommendations changed.",
      approve:
        "They approve the top recommendation — it returns to the field as a group or a campaign.",
      done: "The cycle is complete: donation → operations → measurement → decision. Try it yourself in any role.",
    } as Record<Cap, string>,
  },
});

/** زرّ تشغيل الجولة. */
export function WatchStory({ className, dark }: { className?: string; dark?: boolean }) {
  const c = useCopy(COPY);
  const router = useRouter();
  const s = useSnap();
  return (
    <button
      type="button"
      disabled={s.running}
      onClick={() =>
        void runStory((to) => router.navigate({ to: to as "/vision", viewTransition: true }), {
          donor: c.donor,
          supervisor: c.supervisor,
          decider: c.decider,
        })
      }
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-full px-7 font-bold transition-transform hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60",
        dark ? "border border-gold/50 text-gold-soft hover:bg-white/5" : "bg-wine text-ivory",
        className,
      )}
    >
      <Play className="size-4 fill-current" aria-hidden="true" />
      {c.watch}
    </button>
  );
}

/** شريط التعليق أسفل الشاشة أثناء الجولة: النصّ، والتقدّم، والتحكّم. */
export function StoryBar() {
  const c = useCopy(COPY);
  const router = useRouter();
  const s = useSnap();
  if (!s.cap) return null;
  const last = s.cap === "done";
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      style={{ viewTransitionName: "story-bar" }}
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-2xl rounded-3xl bg-[linear-gradient(135deg,var(--color-wine),var(--color-wine-deep))] p-5 text-ivory shadow-[0_24px_60px_-20px_rgb(43_11_20/0.75)] ring-1 ring-gold/30"
      >
        <div className="flex items-start gap-4">
          <p key={s.cap} className="vision-rise flex-1 leading-7">
            {c.caps[s.cap]}
          </p>
          <div className="flex shrink-0 gap-1">
            {!last && (
              <button
                type="button"
                aria-label={s.paused ? c.resume : c.pause}
                onClick={() => set({ paused: !s.paused })}
                className="grid size-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 active:scale-[0.94]"
              >
                {s.paused ? (
                  <Play className="size-4 fill-current" />
                ) : (
                  <Pause className="size-4 fill-current" />
                )}
              </button>
            )}
            <button
              type="button"
              aria-label={c.stop}
              onClick={stopStory}
              className="grid size-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 active:scale-[0.94]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {CAPTIONS.map((k, i) => (
            <span
              key={k}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-500",
                i <= s.i ? "bg-gold" : "bg-white/15",
              )}
            />
          ))}
        </div>
        {last && (
          <button
            type="button"
            onClick={() =>
              void runStory(
                (to) => router.navigate({ to: to as "/vision", viewTransition: true }),
                {
                  donor: c.donor,
                  supervisor: c.supervisor,
                  decider: c.decider,
                },
              )
            }
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-gold px-5 text-sm font-bold text-wine-deep active:scale-[0.97]"
          >
            <Play className="size-3.5 fill-current" aria-hidden="true" />
            {c.again}
          </button>
        )}
      </div>
    </div>
  );
}
