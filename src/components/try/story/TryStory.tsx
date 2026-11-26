import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  FlaskConical,
  HeartHandshake,
  LayoutDashboard,
  RotateCcw,
  ScanSearch,
  UserCheck,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Busy } from "@/components/admin/data/shared";
import { Alerts, Conflicts, LinkQueue } from "@/components/admin/data/SourcesPanel";
import { ReportForm } from "@/components/impact/ReportForm";
import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { ChildTimeline } from "@/components/sponsorship/ChildTimeline";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/demo-mode";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { localTryChild, TRY_CURRENCY, TRY_STORY } from "@/lib/try-demo";
import {
  clampStep,
  loadStory,
  onStoryChange,
  performStep,
  setStoryStep,
  startStory,
  STORY_ID,
  STORY_STEPS,
  stepDone,
  storyVerification,
  type StoryAudience,
} from "@/lib/try-story";
import {
  setVerificationActor,
  setVerificationEmail,
  setVerificationFocus,
  STORY_COUNTRY,
  STORY_RECORD,
  STORY_SECOND,
  STORY_SHIFTED,
  storyFacts,
  storyHandOver,
  VISITOR_EMAIL,
} from "@/lib/try-verification";
import { cn } from "@/lib/utils";

// مركز الثقة نفسه، يُحمَّل حين تبلغه القصّة.
const TrustCenter = lazy(() => import("@/components/admin/trust/TrustCenter"));

type Who = "wamy" | "platform" | "supervisor" | "sponsor" | "office" | "admin";
const WHO: Who[] = ["wamy", "platform", "supervisor", "sponsor", "office", "sponsor", "admin"];
const ICON: Record<Who, LucideIcon> = {
  wamy: Building2,
  platform: ScanSearch,
  supervisor: UserCheck,
  sponsor: HeartHandshake,
  office: ClipboardList,
  admin: LayoutDashboard,
};

type Step = { title: string; what: string; why: string; act: string; done: string };

const COPY = defineCopy("components/try/story/TryStory", {
  ar: {
    eyebrow: "قصّة الثقة · دقيقتان",
    title: "سلمى، من سجلّ الندوة إلى أثر كافلها",
    lead: "طفلةٌ واحدة نتبعها في سبع خطوات، كلٌّ بعين صاحبها وعلى شاشته الحقيقية. في كلّ خطوةٍ فعلٌ واحد يبني الثقة؛ أدّه بنفسك أو اضغط «أرني».",
    sample: "بيانات نموذجية",
    sampleLead:
      "سلمى طفلةٌ مستعارة (DEMO-…). كلّ فعلٍ هنا محاكاةٌ في جلستك وحدها: لا يُخصم شيء، ولا يُرسل بريدٌ ولا إشعار.",
    audience: {
      sponsor: "تبدأ بعين الكافل: الملفّ وصل وتُحقّق منه، فترى ما يطمئنك قبل أن تكفل وبعده.",
      partner:
        "تبدأ بعين فريق الدولة: تغييرٌ مريب ينتظر الحسم، ولا يحسمه من رفعه. ثم ترى أثره عند الكافل والإدارة.",
      admin:
        "تبدأ بعين الإدارة: ما جرى للملفّ في مركز الثقة. ثم تعود القصّة إلى أوّلها لترى كيف وصل إلى هنا.",
    } satisfies Record<StoryAudience, string>,
    who: {
      wamy: "الندوة",
      platform: "المنصّة",
      supervisor: "مشرف الدولة",
      sponsor: "الكافل",
      office: "المكتب الميداني",
      admin: "الإدارة",
    } satisfies Record<Who, string>,
    youAre: "أنت الآن بعين",
    stepOf: (n: number, total: number) => `الخطوة ${n} من ${total}`,
    stepsLabel: "خطوات القصّة",
    what: "ما يحدث",
    why: "لماذا يبني الثقة",
    back: "السابق",
    next: "التالي",
    loop: "من البداية",
    showMe: "أرني",
    restart: "أعد القصّة",
    locked: "أدِّ فعل هذه الخطوة أو اضغط «أرني» لتنتقل.",
    steps: [
      {
        title: "سجلّ الطفلة يصل من الندوة",
        what: "الندوة هي المصدر الأوّل. سجلّ سلمى ينتظر في طابور الربط، والإدارة وحدها تنشئ منه ملفاً.",
        why: "لا ملفّ بلا سجلٍّ من الندوة، ولا دمج بالاسم: طفلان باسمٍ واحد لا يصيران ملفاً واحداً.",
        act: "اضغط «أنشئ ملفاً» على السجلّ في الطابور.",
        done: "أُنشئ الملف من سجلّ الندوة، ووصل سجلّ المكتب للطفلة نفسها بمرجعه، فتطابق المصدران.",
      },
      {
        title: "المنصّة ترصد تغييراً مريباً",
        what: "يصل من منصّة المكتب تاريخ ميلادٍ أقدم بعشر سنوات. المنصّة ترصد الإزاحة وحدها، وتعلّم الملفّ وتوقف الكفالة الجديدة.",
        why: "لا يمرّ تغييرٌ في الهويّة بصمت: الكشف آليّ، والملفّ يُجمَّد قبل أن يدخله مال.",
        act: "استقبل رفع منصّة المكتب.",
        done: "رُصدت إزاحة الميلاد تنبيهاً حرجاً، والملفّ الآن «قيد التحقق» ولا يقبل كفالةً جديدة.",
      },
      {
        title: "مشرف الدولة يراجع ويحسم",
        what: "المشرف الأوّل هو من رفع التغيير، فلا يحسمه. يتسلّمه مشرفٌ ثانٍ، فيبقي التاريخ الأصلي ويغلق التنبيه.",
        why: "عينان لا عينٌ واحدة: لا أحد يرفع تغييراً ثم يعتمده بنفسه.",
        act: "جرّب الحسم بعين المشرف الأوّل، ثم بدّل إلى الثاني واحسم التعارض والتنبيه.",
        done: "حُسم التغيير بيد مشرفٍ ثانٍ، وعاد الملفّ موثّقاً من مصدرين.",
      },
      {
        title: "الكافل يرى الشارة ويكفل",
        what: "الكافل لا يرى سبب التنبيه ولا حقول الملفّ؛ يرى درجةً من ثلاث وشهرها. والآن: «موثّق من مصدرين».",
        why: "الثقة بلا كشفٍ لخصوصية الطفلة: درجةٌ تكفي للقرار، وتفاصيلها للإدارة وحدها.",
        act: "اكفل سلمى (محاكاة، لا يُخصم شيء).",
        done: "سُجّلت كفالةٌ شهرية محاكاة في جلستك. لم يُخصم شيء.",
      },
      {
        title: "المكتب يرفع تقرير المتابعة",
        what: "المكتب الميداني يكتب تقرير الشهر. الصحة والمرفقات تبقى لدائرة الطفلة، والخلاصة والتعليم تصل الكافل بعد الاعتماد.",
        why: "ما يصل الكافل كتبه من رأى الطفلة، واعتمدته الإدارة. في التجربة يُعتمد محاكاةً فور إرساله.",
        act: "املأ التقرير وأرسله للمراجعة.",
        done: "أُرسل التقرير واعتُمد محاكاةً، فصار في خطّ الطفلة عند كافلها.",
      },
      {
        title: "الكافل يرى التقرير في خطّ الطفلة",
        what: "في «أثري» يرى الكافل حالة الملفّ، وآخر تقريرٍ معتمد، ومسار التأهيل.",
        why: "المتابعة دليلٌ لا وعد: ما كُتب في الميدان يصل الكافل بلا وسيط.",
        act: "",
        done: "",
      },
      {
        title: "الإدارة ترى الأثر في مركز الثقة",
        what: "العدّادات وسجلّ القرارات: إنشاء الملفّ، ورفع المكتب، وحسم المشرف الثاني باسمه.",
        why: "كلّ قرارٍ مسجّلٌ باسم صاحبه، فيُراجَع لاحقاً ولا يضيع.",
        act: "",
        done: "",
      },
    ] satisfies Step[],
    record: "السجلّ الوارد من الندوة",
    recordFields: {
      ref: "مرجع الندوة",
      name: "الاسم",
      birth: "تاريخ الميلاد",
      gender: "الجنس",
      country: "الدولة",
    },
    female: "أنثى",
    lanka: "سريلانكا",
    upload: "استقبل رفع منصّة المكتب",
    incoming: "يصل من منصّة المكتب",
    birthFrom: "تاريخ الميلاد",
    badgeNow: "ما يراه الكافل الآن",
    blocked: "الكفالة الجديدة موقوفة حتى يُحسم الملف.",
    open: "مفتوحة",
    persona: "من أمام اللوحة؟",
    personaA: "المشرف الأوّل · رفع التغيير",
    personaB: "المشرف الثاني",
    personaHintA: "جرّب الحسم: ستمنعك القاعدة لأنك رفعت التغيير بنفسك.",
    personaHintB: "يحسم في السجلّ باسم",
    sponsor: (amount: string) => `اكفل سلمى بـ${amount} شهرياً`,
    sponsored: "كفلتَها في هذه الجلسة",
    fullPage: "افتح ملفّها كاملاً",
    need: (amount: string) => `حاجتها الشهرية ${amount}`,
    trustLink: "افتح مركز الثقة كاملاً",
  },
  en: {
    eyebrow: "The trust story · two minutes",
    title: "Salma, from WAMY's record to her sponsor's impact",
    lead: "One child, followed through seven steps, each through its owner's eyes and on their real screen. Each step has one action that builds trust; do it yourself or press “Show me”.",
    sample: "Sample data",
    sampleLead:
      "Salma is a fictional child (DEMO-…). Every action here is simulated in your session only: nothing is charged and no email or notification is sent.",
    audience: {
      sponsor:
        "You start as a sponsor: the file has arrived and been verified, so you see what reassures you before and after you sponsor.",
      partner:
        "You start as a country team: a suspicious change waits to be settled, and whoever uploaded it can't settle it. Then you see its effect for the sponsor and the administration.",
      admin:
        "You start as the administration: what happened to the file, in the trust center. Then the story loops back to show how it got there.",
    } satisfies Record<StoryAudience, string>,
    who: {
      wamy: "WAMY",
      platform: "Platform",
      supervisor: "Country supervisor",
      sponsor: "Sponsor",
      office: "Field office",
      admin: "Administration",
    } satisfies Record<Who, string>,
    youAre: "You are now seeing it as",
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
    stepsLabel: "Story steps",
    what: "What happens",
    why: "Why it builds trust",
    back: "Back",
    next: "Next",
    loop: "From the start",
    showMe: "Show me",
    restart: "Restart the story",
    locked: "Do this step's action, or press “Show me”, to move on.",
    steps: [
      {
        title: "The child's record arrives from WAMY",
        what: "WAMY is the primary source. Salma's record waits in the link queue, and only the administration creates a file from it.",
        why: "No file without a WAMY record, and no merging by name: two children with one name never become one file.",
        act: "Press “Create file” on the record in the queue.",
        done: "The file was created from WAMY's record, and the office's record for the same child matched by reference, so the two sources agree.",
      },
      {
        title: "The platform detects a suspicious change",
        what: "The office platform sends a birth date ten years earlier. The platform detects the shift on its own, flags the file and stops new sponsorships.",
        why: "No identity change passes silently: detection is automatic, and the file is frozen before any money reaches it.",
        act: "Receive the office platform's upload.",
        done: "The birth-date shift raised a critical alert; the file is now “under verification” and takes no new sponsorship.",
      },
      {
        title: "The country supervisor reviews and settles",
        what: "The first supervisor uploaded the change, so they can't settle it. A second supervisor takes it, keeps the original date and closes the alert.",
        why: "Four eyes, not two: nobody uploads a change and then approves it themselves.",
        act: "Try settling as the first supervisor, then switch to the second and settle the conflict and the alert.",
        done: "A second supervisor settled the change, and the file is verified by two sources again.",
      },
      {
        title: "The sponsor sees the badge and sponsors",
        what: "The sponsor never sees the alert's reason or the file's fields; they see one of three levels and its month. Now: “Verified by two sources”.",
        why: "Trust without exposing the child: a level is enough to decide, and the details stay with the administration.",
        act: "Sponsor Salma (simulated, nothing is charged).",
        done: "A simulated monthly sponsorship was recorded in your session. Nothing was charged.",
      },
      {
        title: "The office uploads a progress report",
        what: "The field office writes the month's report. Health and attachments stay within the child's circle; the summary and education reach the sponsor once approved.",
        why: "What reaches the sponsor was written by someone who saw the child and approved by the administration. In the trial it is approved as soon as it is sent.",
        act: "Fill in the report and send it for review.",
        done: "The report was sent and approved (simulated), so it is now in the child's timeline for her sponsor.",
      },
      {
        title: "The sponsor sees the report in the child's timeline",
        what: "In “My impact” the sponsor sees the file's status, the latest approved report and the qualification track.",
        why: "Follow-up is evidence, not a promise: what was written in the field reaches the sponsor directly.",
        act: "",
        done: "",
      },
      {
        title: "The administration sees the effect in the trust center",
        what: "The counts and the decision log: the file's creation, the office's upload, and the second supervisor's settlement under their name.",
        why: "Every decision is logged under its owner's name, so it can be reviewed later and is never lost.",
        act: "",
        done: "",
      },
    ] satisfies Step[],
    record: "The record arriving from WAMY",
    recordFields: {
      ref: "WAMY reference",
      name: "Name",
      birth: "Birth date",
      gender: "Gender",
      country: "Country",
    },
    female: "Female",
    lanka: "Sri Lanka",
    upload: "Receive the office platform's upload",
    incoming: "Arriving from the office platform",
    birthFrom: "Birth date",
    badgeNow: "What the sponsor sees now",
    blocked: "New sponsorship is paused until the file is settled.",
    open: "open",
    persona: "Who is at the screen?",
    personaA: "First supervisor · uploaded it",
    personaB: "Second supervisor",
    personaHintA: "Try settling: the rule stops you because you uploaded the change yourself.",
    personaHintB: "Settles in the log as",
    sponsor: (amount: string) => `Sponsor Salma for ${amount} a month`,
    sponsored: "You sponsored her in this session",
    fullPage: "Open her full file",
    need: (amount: string) => `Monthly need ${amount}`,
    trustLink: "Open the full trust center",
  },
});

/** نسخة حالة القصّة: تتغيّر مع كلّ فعلٍ في الملفّ أو العطاء أو الخطوة. */
let version = 0;
const subscribe = (fn: () => void) =>
  onStoryChange(() => {
    version++;
    fn();
  });
const snapshot = () => version;
const useStoryVersion = () => useSyncExternalStore(subscribe, snapshot, () => 0);

const noop = () => {};

/** القصّة الموجّهة: سبع خطوات، طفلةٌ واحدة، وشاشاتٌ حقيقية بعين صاحب كلٍّ منها. */
export function TryStory({ audience }: { audience: StoryAudience | null }) {
  const t = useCopy(COPY);
  const demo = useDemo();
  const qc = useQueryClient();
  useStoryVersion();
  const [ready, setReady] = useState(false);

  // البدء: قصّةٌ جديدة لجهةٍ جديدة، وإلا تُستأنف من خطوتها في الجلسة.
  useEffect(() => {
    if (!demo) return;
    const s = loadStory();
    if (!s || (audience && s.audience !== audience)) startStory(audience);
    setVerificationFocus(true);
    setReady(true);
    return () => {
      setVerificationFocus(false);
      setVerificationActor(null);
      setVerificationEmail(null);
      void qc.invalidateQueries({ queryKey: ["demo"] });
    };
  }, [demo, audience, qc]);

  // كلّ تغيّرٍ في الملفّ يعيد قراءة الشاشات الحقيقية.
  useEffect(() => onStoryChange(() => void qc.invalidateQueries({ queryKey: ["demo"] })), [qc]);

  const story = ready ? loadStory() : null;
  const step = clampStep(story?.step ?? 1);
  const done = ready && stepDone(step);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const go = useCallback((n: number) => {
    moved.current = true;
    setStoryStep(n);
  }, []);
  useEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true });
    if (moved.current) heading.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  const who = WHO[step - 1]!;
  const s = t.steps[step - 1]!;
  const Icon = ICON[who];
  const last = step === STORY_STEPS;

  return (
    <div className="pb-28 sm:pb-10">
      <header className="try-rise">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="mt-3 text-3xl leading-[1.35] font-bold text-balance sm:text-4xl">
          {t.title}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-base leading-8 text-pretty">
          {audience ? t.audience[audience] : t.lead}
        </p>
      </header>

      <div
        role="note"
        className="border-bridge/60 bg-bridge/10 mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-7"
      >
        <FlaskConical className="text-bridge-ink mt-1 size-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-pretty">
          <strong>{t.sample}</strong> — {t.sampleLead}
        </p>
      </div>

      <Stepper step={step} ready={ready} onGo={go} />

      {!ready ? (
        <Busy />
      ) : (
        <section
          key={step}
          aria-labelledby="story-step-title"
          className="animate-in fade-in motion-safe:slide-in-from-bottom-2 mt-6 duration-300 ease-out"
        >
          {/* علامة تبدّل العين: الدور بلونه وأيقونته قبل العنوان */}
          <div className="bg-primary/8 border-primary/25 inline-flex items-center gap-2 rounded-full border py-1 ps-1 pe-4 text-sm">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-full">
              <Icon className="size-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="text-muted-foreground">{t.youAre}</span>
            <strong>{t.who[who]}</strong>
          </div>
          <p className="text-muted-foreground mt-4 text-xs font-bold tabular-nums">
            {t.stepOf(step, STORY_STEPS)}
          </p>
          <h2
            id="story-step-title"
            ref={heading}
            tabIndex={-1}
            className="mt-1 scroll-mt-24 text-2xl leading-[1.4] font-bold text-balance focus:outline-none"
          >
            {s.title}
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border-border bg-card rounded-2xl border p-4">
              <dt className="text-muted-foreground text-xs font-bold">{t.what}</dt>
              <dd className="mt-1 text-sm leading-7 text-pretty">{s.what}</dd>
            </div>
            <div className="border-border bg-card rounded-2xl border p-4">
              <dt className="text-shore-thrive text-xs font-bold">{t.why}</dt>
              <dd className="mt-1 text-sm leading-7 text-pretty">{s.why}</dd>
            </div>
          </dl>
          {s.act && (
            <p
              role="status"
              className={cn(
                "mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm leading-7",
                done ? "bg-shore-thrive/10" : "bg-secondary",
              )}
            >
              {done && (
                <Check className="text-shore-thrive mt-1.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{done ? s.done : s.act}</span>
            </p>
          )}
          <div className="mt-6">
            <Stage step={step} />
          </div>
        </section>
      )}

      {/* شريط التنقّل: ملتصقٌ بأسفل الجوال، وفي آخر القصّة على الشاشة الكبيرة */}
      <nav
        aria-label={t.stepsLabel}
        className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur sm:static sm:mt-10 sm:rounded-2xl sm:border sm:px-4"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={step === 1}
            onClick={() => go(step - 1)}
          >
            <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden="true" />
            {t.back}
          </Button>
          <div className="ms-auto flex items-center gap-2">
            {ready && !done && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => performStep(step)}
              >
                <Wand2 className="size-4" aria-hidden="true" />
                {t.showMe}
              </Button>
            )}
            <Button
              type="button"
              className="min-h-11"
              disabled={!done}
              aria-describedby={done ? undefined : "story-locked"}
              onClick={() => go(last ? 1 : step + 1)}
            >
              {last ? t.loop : t.next}
              <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {!done && (
          <p id="story-locked" className="sr-only">
            {t.locked}
          </p>
        )}
      </nav>

      <div className="mt-6 flex justify-center">
        <Button
          type="button"
          variant="link"
          className="text-muted-foreground min-h-11"
          onClick={() => {
            moved.current = true;
            startStory(audience);
          }}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {t.restart}
        </Button>
      </div>
    </div>
  );
}

/** المؤشّر: سبع محطّات بأيقونة صاحب كلٍّ منها. ما أُنجز وما يليه يُفتح بالضغط. */
function Stepper({
  step,
  ready,
  onGo,
}: {
  step: number;
  /** قبل قراءة الجلسة (وعلى الخادم) لا يُعرف ما أُنجز: المؤشّر محايد */
  ready: boolean;
  onGo: (n: number) => void;
}) {
  const t = useCopy(COPY);
  // أبعد خطوةٍ يجوز بلوغها: كلّ ما قبلها أُدّي فعله
  let reach = 1;
  while (ready && reach < STORY_STEPS && stepDone(reach)) reach++;
  return (
    <ol aria-label={t.stepsLabel} className="mt-6 grid grid-cols-7 gap-1 sm:gap-2">
      {WHO.map((w, i) => {
        const n = i + 1;
        const Icon = ICON[w];
        const current = n === step;
        const passed = ready && (n < step || (n !== step && stepDone(n) && n < reach));
        return (
          <li key={n} className="min-w-0">
            <button
              type="button"
              disabled={n > reach}
              aria-current={current ? "step" : undefined}
              aria-label={`${t.stepOf(n, STORY_STEPS)} · ${t.who[w]}`}
              onClick={() => onGo(n)}
              className={cn(
                "group focus-visible:ring-ring flex min-h-11 w-full flex-col items-center gap-1 rounded-xl py-1.5 transition-[background-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] disabled:opacity-40",
                current ? "bg-primary/10" : "hover:bg-secondary",
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border transition-colors",
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : passed
                      ? "border-shore-thrive bg-shore-thrive/10 text-shore-thrive"
                      : "border-border bg-card text-muted-foreground",
                )}
              >
                {passed ? (
                  <Check className="size-4" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                )}
              </span>
              <span
                className={cn(
                  "hidden w-full truncate px-1 text-center text-[11px] leading-5 sm:block",
                  current ? "text-foreground font-bold" : "text-muted-foreground",
                )}
              >
                {t.who[w]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** الشاشة الحقيقية للخطوة، بصلاحية صاحبها، على ملفّ القصّة وحده. */
function Stage({ step }: { step: number }) {
  switch (step) {
    case 1:
      return <WamyStage />;
    case 2:
      return <PlatformStage />;
    case 3:
      return <SupervisorStage />;
    case 4:
      return <SponsorStage />;
    case 5:
      return <OfficeStage />;
    case 6:
      return <TimelineStage />;
    default:
      return <AdminStage />;
  }
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("border-border bg-card rounded-3xl border p-4 shadow-soft sm:p-6", className)}
    >
      {children}
    </div>
  );
}

function WamyStage() {
  const t = useCopy(COPY);
  setVerificationActor(null);
  const r = STORY_RECORD;
  const rows: Array<[string, string, boolean]> = [
    [t.recordFields.ref, r.external_ref, true],
    [t.recordFields.name, r.name, false],
    [t.recordFields.birth, r.birth_date, true],
    [t.recordFields.gender, t.female, false],
    [t.recordFields.country, t.lanka, false],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Frame className="bg-secondary/40">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Building2 className="size-4" aria-hidden="true" />
          {t.record}
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          {rows.map(([k, v, ltr]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums" dir={ltr ? "ltr" : undefined}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </Frame>
      <Frame>
        <LinkQueue country={STORY_COUNTRY} canApprove onOpen={noop} />
      </Frame>
    </div>
  );
}

function PlatformStage() {
  const t = useCopy(COPY);
  setVerificationActor(null);
  const f = storyFacts();
  const v = storyVerification();
  return (
    <div className="space-y-4">
      {!f.flagged && (
        <Frame className="bg-secondary/40">
          <p className="text-sm font-bold">{t.incoming}</p>
          <p className="mt-2 text-sm">
            {t.birthFrom}:{" "}
            <bdi className="line-through opacity-60 tabular-nums">{STORY_RECORD.birth_date}</bdi> →{" "}
            <bdi className="text-destructive font-bold tabular-nums">{STORY_SHIFTED}</bdi>
          </p>
          <Button type="button" className="mt-4 min-h-11" onClick={() => performStep(2)}>
            {t.upload}
          </Button>
        </Frame>
      )}
      {f.flagged && (
        <>
          <Frame>
            <p className="text-muted-foreground text-xs font-bold">{t.badgeNow}</p>
            <div className="mt-2">
              <VerificationBadge orphanId={STORY_ID} />
            </div>
            {!v.accepts && <p className="text-destructive mt-3 text-sm font-bold">{t.blocked}</p>}
          </Frame>
          <Frame>
            <Alerts country={STORY_COUNTRY} canApprove={false} onOpen={noop} />
          </Frame>
        </>
      )}
    </div>
  );
}

function SupervisorStage() {
  const t = useCopy(COPY);
  const f = storyFacts();
  setVerificationActor({ country: STORY_COUNTRY, role: "supervisor" });
  const second = !f.mine;
  return (
    <div className="space-y-4">
      <fieldset className="border-border bg-card rounded-2xl border p-4">
        <legend className="text-muted-foreground px-1 text-xs font-bold">{t.persona}</legend>
        <div className="flex flex-wrap gap-2">
          {[false, true].map((b) => (
            <button
              key={String(b)}
              type="button"
              aria-pressed={second === b}
              disabled={f.settled}
              onClick={() => storyHandOver(b)}
              className={cn(
                "focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] disabled:opacity-60",
                second === b
                  ? "border-primary bg-primary text-primary-foreground font-bold"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <UserCheck className="size-4" aria-hidden="true" />
              {b ? t.personaB : t.personaA}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mt-3 text-sm leading-7">
          {second ? (
            <>
              {t.personaHintB} <bdi dir="ltr">{STORY_SECOND}</bdi>
            </>
          ) : (
            <>
              {t.personaHintA} (<bdi dir="ltr">{VISITOR_EMAIL}</bdi>)
            </>
          )}
        </p>
      </fieldset>
      <Frame>
        <Conflicts country={STORY_COUNTRY} canApprove onOpen={noop} />
      </Frame>
      <Frame>
        <Alerts country={STORY_COUNTRY} canApprove onOpen={noop} />
      </Frame>
    </div>
  );
}

function SponsorStage() {
  const t = useCopy(COPY);
  const locale = useLocale();
  const c = localTryChild(TRY_STORY, locale);
  const gap = c.need - c.funded;
  const done = stepDone(4);
  return (
    <Frame className="max-w-xl">
      <p className="text-xl font-bold">{c.name}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {c.country} · {c.stage} · <bdi dir="ltr">{c.code}</bdi>
      </p>
      <div className="mt-3">
        <VerificationBadge orphanId={STORY_ID} />
      </div>
      <p className="mt-3 text-sm">{t.need(formatMoney(c.need, TRY_CURRENCY, locale))}</p>
      {done ? (
        <p className="text-shore-thrive mt-4 flex items-center gap-2 text-sm font-bold">
          <Check className="size-4" aria-hidden="true" />
          {t.sponsored}
        </p>
      ) : (
        <Button type="button" size="lg" className="mt-4 w-full" onClick={() => performStep(4)}>
          <HeartHandshake className="size-4" aria-hidden="true" />
          {t.sponsor(formatMoney(gap, TRY_CURRENCY, locale))}
        </Button>
      )}
      <Link
        to="/try/$childId"
        params={{ childId: STORY_ID }}
        className="text-primary mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold underline-offset-4 hover:underline"
      >
        {t.fullPage}
        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
    </Frame>
  );
}

function OfficeStage() {
  const t = useCopy(COPY);
  const done = stepDone(5);
  return (
    <Frame>
      {done ? (
        <p className="text-shore-thrive flex items-center gap-2 text-sm font-bold">
          <Check className="size-4" aria-hidden="true" />
          {t.steps[4]!.done}
        </p>
      ) : (
        <ReportForm orphanId={STORY_ID} onDone={noop} onCancel={noop} />
      )}
    </Frame>
  );
}

function TimelineStage() {
  const locale = useLocale();
  const c = localTryChild(TRY_STORY, locale);
  return (
    <Frame>
      <ChildTimeline orphanId={STORY_ID} name={c.name} />
    </Frame>
  );
}

function AdminStage() {
  const t = useCopy(COPY);
  setVerificationActor(null);
  return (
    <div>
      <Suspense fallback={<Busy />}>
        <TrustCenter openCountry={noop} />
      </Suspense>
      <Link
        to="/try/admin"
        className="text-primary mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold underline-offset-4 hover:underline"
      >
        {t.trustLink}
        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
    </div>
  );
}
