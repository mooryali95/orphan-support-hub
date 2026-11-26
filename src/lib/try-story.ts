/**
 * «القصّة الموجّهة» (`/try/journey`): طفلةٌ واحدة نموذجية تُتبَع في سبع خطوات، كلٌّ منها
 * بعين صاحبها — الندوة، المنصّة، مشرف الدولة، الكافل، المكتب، الكافل، الإدارة.
 *
 * البذرة سيناريو مكتوب: البدء يضع سجلّ الندوة في طابور الربط (`storySeed`)، وكلّ خطوةٍ
 * تؤدّي فعلها بالمحاكاة القائمة (`try-verification`، عطاء `try-demo`، تقرير هنا). البدء من
 * منتصف القصّة يؤدّي ما قبلها عن الزائر. كلّه في `sessionStorage`، ويُمحى بإعادة القصّة
 * أو بـ«ابدأ من جديد». لا خادم، ولا دفع، ولا إشعار.
 */
import type { PublicVerification } from "@/lib/golden-record";
import type { ProgressReportView } from "@/lib/impact.functions";
import { registerDemo } from "@/lib/data-port";
import { copyOf, defineCopy, parseLocale, type Locale } from "@/lib/locale";
import { addGift, loadGifts, TRY_EVENT, TRY_STORY } from "@/lib/try-demo";
import { setStoryHooks } from "@/lib/try-sponsor-center";
import { tryStore } from "@/lib/try-store";
import {
  storyCreate,
  storyFacts,
  storySeed,
  storySettle,
  storyUpload,
  VERIFICATION_EVENT,
} from "@/lib/try-verification";

export const STORY_ID = TRY_STORY.id;
export const STORY_KEY = "try-story:v1";
export const STORY_EVENT = "try-story-change";
export const STORY_STEPS = 7;

export type StoryAudience = "sponsor" | "partner" | "admin";
/** من أين تبدأ كلّ جهة: الكافل من الشارة، والجهة الشريكة من الحسم، والإدارة من مركز الثقة. */
export const AUDIENCE_START: Record<StoryAudience, number> = { sponsor: 4, partner: 3, admin: 7 };

type StoryReport = { period: string; summary: string; education: string; at: string };
type StoryState = { v: 1; step: number; audience: StoryAudience | null; reports: StoryReport[] };

const COPY = defineCopy("lib/try-story", {
  ar: {
    summary: "انتظمت سلمى في الصف الخامس، وتحسّنت قراءتها. وصلت لوازمها المدرسية بمستند استلام.",
    education: "حضورٌ كامل هذا الشهر، وتقدّمٌ في القراءة والحساب.",
    noUpload: "المرفقات لا تُرفع في التجربة؛ التقرير يُرسل بدونها.",
  },
  en: {
    summary:
      "Salma kept up with Grade 5 and her reading has improved. Her school supplies were delivered with a receipt.",
    education: "Full attendance this month, with progress in reading and maths.",
    noUpload: "Attachments aren't uploaded in the trial; the report is sent without them.",
  },
});

const uiLocale = (): Locale =>
  typeof document === "undefined" ? "ar" : parseLocale(document.cookie);

function read(): StoryState | null {
  try {
    const v = JSON.parse(tryStore()?.getItem(STORY_KEY) ?? "null") as StoryState | null;
    return v && v.v === 1 && Number.isInteger(v.step) ? v : null;
  } catch {
    return null;
  }
}

function write(s: StoryState) {
  try {
    tryStore()?.setItem(STORY_KEY, JSON.stringify(s));
  } catch {
    /* محجوب: ذاكرة التبويب عبر try-store */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STORY_EVENT));
}

/** القصّة الجارية في الجلسة، أو `null` إن لم تبدأ. */
export const loadStory = read;

export const clampStep = (n: number) => Math.min(STORY_STEPS, Math.max(1, Math.round(n) || 1));

export function setStoryStep(step: number) {
  const s = read();
  if (s) write({ ...s, step: clampStep(step) });
}

const lastMonth = () => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** تقرير المكتب عن الطفلة (الخطوة ٥). الصحة والمرفقات لا تصل الكافل، فلا تُحفظ هنا. */
export function addStoryReport(r: {
  period?: string | undefined;
  summary?: string | undefined;
  education?: string | undefined;
}) {
  const s = read();
  if (!s) return;
  const t = copyOf(COPY, uiLocale());
  const report: StoryReport = {
    period: r.period && /^\d{4}-\d{2}$/.test(r.period) ? r.period : lastMonth(),
    summary: r.summary?.trim() || t.summary,
    education: r.education?.trim() ?? "",
    at: new Date().toISOString(),
  };
  write({ ...s, reports: [report, ...s.reports.filter((x) => x.period !== report.period)] });
}

/** هل أُدّي الفعل الذي يفتح ما بعد الخطوة؟ */
export function stepDone(step: number): boolean {
  const f = storyFacts();
  switch (step) {
    case 1:
      return f.linked;
    case 2:
      return f.flagged;
    case 3:
      return f.settled;
    case 4:
      return loadGifts().some((g) => g.childId === STORY_ID);
    case 5:
      return (read()?.reports.length ?? 0) > 0;
    default:
      return true;
  }
}

/** «أرني»: يؤدّي فعل الخطوة عن الزائر، بالمحاكاة نفسها التي تناديها الشاشة. */
export function performStep(step: number) {
  if (stepDone(step)) return;
  const t = copyOf(COPY, uiLocale());
  switch (step) {
    case 1:
      return storyCreate();
    case 2:
      return storyUpload();
    case 3:
      return storySettle();
    case 4:
      addGift({ childId: STORY_ID, amount: TRY_STORY.need - TRY_STORY.funded, cadence: "monthly" });
      return;
    case 5:
      return addStoryReport({ summary: t.summary, education: t.education });
  }
}

function dropStoryGifts() {
  const store = tryStore();
  try {
    const all = JSON.parse(store?.getItem("try-demo:v1") ?? "[]") as Array<{ childId?: string }>;
    if (Array.isArray(all))
      store?.setItem("try-demo:v1", JSON.stringify(all.filter((g) => g?.childId !== STORY_ID)));
  } catch {
    /* لا شيء يُمحى */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRY_EVENT));
}

/**
 * يبدأ القصّة من جديد: يمحو أثرها السابق كلّه، ويبذر سجلّ الندوة، ثم يؤدّي ما قبل
 * خطوة البدء عن الزائر — فتصل جهةٌ تبدأ من الخطوة الرابعة إلى ملفٍّ حُسم فعلاً.
 */
export function startStory(audience: StoryAudience | null = null) {
  const at = audience ? AUDIENCE_START[audience] : 1;
  dropStoryGifts();
  storySeed();
  write({ v: 1, step: 1, audience, reports: [] });
  for (let n = 1; n < at; n++) performStep(n);
  write({ ...read()!, step: at });
}

/** شارة الطفلة كما تعيدها `public_verification`: من حالة ملفّها في القصّة. */
export function storyVerification(now: Date = new Date()): PublicVerification {
  const f = storyFacts();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!f.linked || f.trust === "flagged" || f.trust === "conflict")
    return { level: "under_review", accepts: false, verified_month: null };
  return {
    level: f.trust === "verified" ? "two_sources" : "primary_source",
    accepts: true,
    verified_month: month,
  };
}

/** تقارير الطفلة كما يراها الكافل: الخلاصة والتعليم، بلا صحّةٍ ولا مرفقات. */
export function storyReports(locale: Locale = "ar"): ProgressReportView[] {
  return (read()?.reports ?? []).map((r) => ({
    id: `demo-story-report-${r.period}`,
    period: new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${r.period}-01T00:00:00Z`)),
    status: "approved",
    summary: r.summary,
    education_note: r.education || null,
    health_note: null,
    living_note: null,
    attachments: [],
    review_note: null,
    published_at: r.at,
    created_at: r.at,
  }));
}

/** يُعلم من يصغي بأيّ تغيّرٍ في القصّة: خطوتها، أو ملفّها، أو عطاؤها. */
export function onStoryChange(fn: () => void) {
  const names = [STORY_EVENT, VERIFICATION_EVENT, TRY_EVENT, "try-role-change"];
  for (const n of names) window.addEventListener(n, fn);
  return () => {
    for (const n of names) window.removeEventListener(n, fn);
  };
}

type Input<T> = { data: T };

// تقرير المكتب في التجربة: يُحفظ لطفلة القصّة، ولا يصل خادماً ولا خزنة.
registerDemo(
  "impact.submitReport",
  async ({
    data,
  }: Input<{ orphanId: string; period: string; summary?: string; educationNote?: string }>) => {
    if (data.orphanId === STORY_ID)
      addStoryReport({
        period: data.period,
        summary: data.summary,
        education: data.educationNote,
      });
    return { ok: true as const, id: `demo-report-${data.orphanId}-${data.period}` };
  },
);
registerDemo("intake.uploadUrl", async () => ({
  ok: false as const,
  error: copyOf(COPY, uiLocale()).noUpload,
}));

setStoryHooks({ verification: storyVerification, reports: storyReports });
