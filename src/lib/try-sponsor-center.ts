/**
 * مركز الكافل في التجربة: النسخ التجريبية لشارة الثقة، والأطفال الجاهزين، وخطّ الطفل،
 * وإدارة الكفالة — تسجّلها هنا في منفذ البيانات فتعمل الشاشات الحقيقية نفسها تحت «جرّب»
 * بلا حسابٍ ولا خادم.
 *
 * كلّ شيءٍ مبنيٌّ على أطفال التجربة (`try-demo`، رموز DEMO-) وعطاءات الزائر المحاكاة في
 * جلسته. تعديلات الإدارة (إيقاف، استئناف، مبلغ، إنهاء) تُحفظ في الجلسة وحدها فوق العطاء،
 * بقواعد دوالّ القاعدة نفسها ورسائلها (`sponsorship-lifecycle`). لا شيء هنا يمسّ دفعاً
 * حقيقياً ولا معرّف طفلٍ قابلاً للدفع.
 */
import type { PublicVerification } from "@/lib/golden-record";
import type { PublicQualification, QualificationStage } from "@/integrations/supabase/types.extra";
import type { ProgressReportView } from "@/lib/impact.functions";
import { copyOf, defineCopy, parseLocale, type Locale } from "@/lib/locale";
import { registerDemo } from "@/lib/data-port";
import { LIFECYCLE_ERRORS } from "@/lib/sponsorship-lifecycle";
import type { MySponsorship, SuggestedOrphan } from "@/lib/sponsorships.functions";
import {
  gapOf,
  giftsAsSponsorships,
  loadGifts,
  localTryChild,
  TRY_CHILDREN,
  TRY_CURRENCY,
  TRY_EVENT,
  TRY_STORY,
  TRY_WORLD_CHILDREN,
  tryChild,
  type TryChild,
} from "@/lib/try-demo";
import { tryStore, type TryStore } from "@/lib/try-store";

/**
 * طفلة القصّة الموجّهة: شارتها وتقاريرها من حالة القصّة (`try-story`)، تسجّلها القصّة
 * حين تُحمَّل، فلا تدخل طبقة التحقق حزمة كلّ صفحات التجربة.
 */
type StoryHooks = {
  verification: (now: Date) => PublicVerification;
  reports: (locale: Locale) => ProgressReportView[];
};
let story: StoryHooks | null = null;
export function setStoryHooks(h: StoryHooks) {
  story = h;
}

/** ملفّ التجربة «قيد التحقق»: لا يقبل كفالةً جديدة، فتُعرض بدله ملفّاتٌ جاهزة. */
export const TRY_UNDER_REVIEW = "try-05";
/** ملفّات التجربة الموثّقة من مصدرين؛ وما سواها موثّقٌ من الندوة. */
const TWO_SOURCES = new Set(["try-01", "try-02", "try-06"]);

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const monthOf = (d: Date, back = 0) => {
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() - back;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

/** شارة طفل التجربة كما تعيدها `public_verification`: درجةٌ وقبولٌ وشهر، لا تفاصيل. */
export function tryVerification(id: string, now: Date = new Date()): PublicVerification | null {
  if (!tryChild(id)) return null;
  if (story && id === TRY_STORY.id) return story.verification(now);
  if (id === TRY_UNDER_REVIEW)
    return { level: "under_review", accepts: false, verified_month: null };
  const two = TWO_SOURCES.has(id) || (!id.startsWith("try-0") && hash(id) % 3 === 0);
  return {
    level: two ? "two_sources" : "primary_source",
    accepts: true,
    verified_month: monthOf(now, hash(id) % 3),
  };
}

/** أطفالٌ جاهزون بدل ملفٍّ قيد التحقق: يقبلون كفالةً جديدة، وفجوتهم أقرب إلى المبلغ. */
export function tryReadySimilar(
  orphanId: string,
  amount: number,
  locale: Locale = "ar",
): SuggestedOrphan[] {
  return [...TRY_CHILDREN, ...TRY_WORLD_CHILDREN]
    .filter((c) => c.id !== orphanId && gapOf(c) > 0 && tryVerification(c.id)?.accepts)
    .sort((a, b) => Math.abs(gapOf(a) - amount) - Math.abs(gapOf(b) - amount))
    .slice(0, 3)
    .map((k) => {
      const c = localTryChild(k, locale);
      return {
        id: c.id,
        code: c.code,
        display_name: c.name,
        currency: TRY_CURRENCY,
        monthly_need: c.need,
        funded_monthly: c.funded,
        gap: gapOf(c),
      };
    });
}

const COPY = defineCopy("lib/try-sponsor-center", {
  ar: {
    reports: [
      "انتظم في الدراسة هذا الشهر، وتحسّن تحصيله في القراءة. وصلت سلّة الغذاء بمستند استلام.",
      "اكتملت لوازمه المدرسية، وأتمّ الفحص الصحي الدوري. شارك في نشاط المجموعة الأسبوعي.",
      "أنهى الفصل الدراسي بتقدّم، ويواظب على حلقة التحفيظ. سُلِّمت الكفالة كاملةً بمستند.",
    ],
    programs: ["مسار القارئ الصغير", "مسار المهارات الحياتية", "مسار الحفظ المتقن"],
    programSummary: "مسار تأهيلٍ نموذجيٌّ في التجربة، بمحطّاتٍ ستّ تُعتمد كلٌّ منها بقياس.",
  },
  en: {
    reports: [
      "Attended school regularly this month and reading has improved. The food basket was delivered with a receipt.",
      "School supplies are complete and the routine health check is done. Joined the weekly group activity.",
      "Finished the term with good progress and keeps up with the Qur'an circle. The sponsorship was delivered in full with a receipt.",
    ],
    programs: ["Young reader track", "Life skills track", "Careful memorisation track"],
    programSummary:
      "A sample qualification track in the trial, with six stages each approved by a measure.",
  },
});

const STAGES: QualificationStage[] = [
  "concept",
  "trait",
  "system",
  "actions",
  "measurement",
  "qualified",
];

/** آخر تقريرٍ معتمد لطفل التجربة: نموذجيٌّ، بلا صحّةٍ ولا مرفقات كما يراه الكافل. */
export function tryReports(
  id: string,
  locale: Locale = "ar",
  now: Date = new Date(),
): ProgressReportView[] {
  if (!tryChild(id)) return [];
  if (story && id === TRY_STORY.id) return story.reports(locale);
  const t = copyOf(COPY, locale);
  const month = monthOf(now, 1);
  const period = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
  const published = `${monthOf(now)}-02T09:00:00.000Z`;
  return [
    {
      id: `demo-report-${id}-${month}`,
      period,
      status: "approved",
      summary: t.reports[hash(id) % t.reports.length]!,
      education_note: null,
      health_note: null,
      living_note: null,
      attachments: [],
      review_note: null,
      published_at: published,
      created_at: published,
    },
  ];
}

/** موضع طفل التجربة في مسار تأهيلٍ نموذجي (البطاقة العامّة وحدها). */
export function tryQualificationTrack(id: string, locale: Locale = "ar"): PublicQualification[] {
  if (!tryChild(id)) return [];
  const t = copyOf(COPY, locale);
  const h = hash(id);
  return [
    {
      enrollment_id: `demo-enrollment-${id}`,
      program: t.programs[h % t.programs.length]!,
      summary: t.programSummary,
      level: "foundational",
      concept: null,
      concept_intent: null,
      target_trait: null,
      target_trait_summary: null,
      inputs: [],
      processes: [],
      deliverables: [],
      stage: STAGES[1 + (h % 4)]!,
      stage_order: 2 + (h % 4),
      stage_changed_at: new Date().toISOString(),
      monthly_price: 0,
      currency: TRY_CURRENCY,
      status: "active",
      has_supervisor: true,
      has_consent: true,
    },
  ];
}

/* ——— إدارة كفالات الجلسة ——— */

/** ما غيّره الزائر في كفالته فوق عطائه المحاكى. */
export type TryChange = {
  amount?: number;
  status?: MySponsorship["status"];
  paused_until?: string | null;
  cancel_effective_at?: string | null;
  ended_at?: string | null;
  end_reason?: MySponsorship["end_reason"];
};

export const CHANGES_KEY = "try-sponsor-center:v1";
const safe = (): TryStore | null => tryStore();

export function loadChanges(store: Pick<Storage, "getItem"> | null = safe()) {
  try {
    const v = JSON.parse(store?.getItem(CHANGES_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, TryChange>) : {};
  } catch {
    return {};
  }
}

function saveChange(id: string, change: TryChange, store: TryStore | null = safe()) {
  const all = loadChanges(store);
  all[id] = { ...all[id], ...change };
  try {
    store?.setItem(CHANGES_KEY, JSON.stringify(all));
  } catch {
    /* محجوب: يبقى في ذاكرة التبويب عبر try-store */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRY_EVENT));
}

const addMonthsTo = (iso: string, n: number) => {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
};

/** ما دُفع حتى: عطاء التجربة دفع شهره الأوّل عند بدئه. */
const paidThrough = (s: MySponsorship) => addMonthsTo(s.started_at ?? s.created_at, 1);

/**
 * كفالات الزائر في التجربة بشكل `listMySponsorships`: العطاءات المحاكاة وفوقها ما غيّره.
 * ما حلّ موعده يحلّ كما في القاعدة: الإيقاف يُرفع في موعده، والإنهاء ينفذ في موعده.
 */
export function trySponsorships(
  locale: Locale = "ar",
  now: Date = new Date(),
  store: TryStore | null = safe(),
): MySponsorship[] {
  const changes = loadChanges(store);
  return giftsAsSponsorships(loadGifts(store), locale).map((base) => {
    const s: MySponsorship = { ...base, ...changes[base.id] };
    if (s.status === "paused" && s.paused_until && new Date(s.paused_until) <= now) {
      s.status = "active";
      s.paused_until = null;
    }
    if (
      s.cancel_effective_at &&
      s.status !== "cancelled" &&
      new Date(s.cancel_effective_at) <= now
    ) {
      s.status = "cancelled";
      s.ended_at = s.cancel_effective_at;
      s.end_reason = "sponsor_cancelled";
      s.paused_until = null;
    }
    return s;
  });
}

const findOne = (id: string, store: TryStore | null) =>
  trySponsorships("ar", new Date(), store).find((s) => s.id === id);

type Fail = { ok: false; error: string };
const fail = (k: keyof typeof LIFECYCLE_ERRORS): Fail => ({
  ok: false,
  error: LIFECYCLE_ERRORS[k],
});

/** إيقافٌ من شهرٍ إلى ثلاثة بعد ما دُفع — بقاعدة `sponsor_pause_sponsorship`. */
export function tryPause(id: string, months: number, now = new Date(), store = safe()) {
  if (!Number.isInteger(months) || months < 1 || months > 3) return fail("range");
  const s = findOne(id, store);
  if (!s) return fail("missing");
  if (s.status !== "active" || s.cancel_effective_at) return fail("state");
  const from = new Date(Math.max(now.getTime(), new Date(paidThrough(s)).getTime()));
  const pausedUntil = addMonthsTo(from.toISOString(), months);
  saveChange(id, { status: "paused", paused_until: pausedUntil }, store);
  return { ok: true as const, pausedUntil };
}

/** الاستئناف لإيقافٍ بطلب الكافل وحده — بقاعدة `sponsor_resume_sponsorship`. */
export function tryResume(id: string, store = safe()) {
  const s = findOne(id, store);
  if (!s) return fail("missing");
  if (s.status !== "paused" || !s.paused_until) return fail("state");
  saveChange(id, { status: "active", paused_until: null }, store);
  return { ok: true as const };
}

/** مبلغٌ جديد من التحويل القادم — بقاعدة `sponsor_change_amount`. */
export function tryChangeAmount(id: string, amount: number, store = safe()) {
  if (!Number.isInteger(amount) || amount < 5 || amount > 100000) return fail("range");
  const s = findOne(id, store);
  if (!s) return fail("missing");
  if (!["pending_payment", "active", "paused"].includes(s.status) || s.cancel_effective_at)
    return fail("state");
  if (amount !== s.amount) saveChange(id, { amount }, store);
  return { ok: true as const };
}

/** الإنهاء بعد آخر شهرٍ مدفوع، والمعلّق فوراً — بقاعدة `sponsor_cancel_sponsorship`. */
export function tryCancel(id: string, now = new Date(), store = safe()) {
  const s = findOne(id, store);
  if (!s) return fail("missing");
  if (s.status === "cancelled" || s.status === "completed" || s.cancel_effective_at)
    return fail("state");
  const effective =
    s.status === "pending_payment"
      ? now
      : new Date(Math.max(now.getTime(), new Date(paidThrough(s)).getTime()));
  const immediate = effective.getTime() <= now.getTime();
  const effectiveAt = effective.toISOString();
  saveChange(
    id,
    immediate
      ? {
          cancel_effective_at: effectiveAt,
          status: "cancelled",
          ended_at: effectiveAt,
          end_reason: "sponsor_cancelled",
          paused_until: null,
        }
      : { cancel_effective_at: effectiveAt },
    store,
  );
  return { ok: true as const, effectiveAt, immediate };
}

/* ——— التسجيل في منفذ البيانات ——— */

type Input<T> = { data: T };
const uiLocale = (): Locale =>
  typeof document === "undefined" ? "ar" : parseLocale(document.cookie);

registerDemo("verify.public", async ({ data }: Input<{ orphanId: string }>) =>
  tryVerification(data.orphanId),
);
registerDemo(
  "sponsor.readySimilar",
  async ({ data }: Input<{ orphanId: string; amount: number }>) => ({
    suggestions: tryReadySimilar(data.orphanId, data.amount, uiLocale()),
    error: null,
  }),
);
registerDemo("sponsor.timeline.reports", async ({ data }: Input<{ orphanId: string }>) => ({
  ok: true as const,
  reports: tryReports(data.orphanId, uiLocale()),
}));
registerDemo("sponsor.timeline.qualification", async ({ data }: Input<{ orphanId: string }>) => ({
  programs: tryQualificationTrack(data.orphanId, uiLocale()),
  error: null,
}));
registerDemo("sponsor.manage.list", async () => ({
  sponsorships: trySponsorships(uiLocale()),
  error: null,
}));
registerDemo("sponsor.manage.pause", async ({ data }: Input<{ id: string; months: number }>) =>
  tryPause(data.id, data.months),
);
registerDemo("sponsor.manage.resume", async ({ data }: Input<{ id: string }>) =>
  tryResume(data.id),
);
registerDemo("sponsor.manage.amount", async ({ data }: Input<{ id: string; amount: number }>) =>
  tryChangeAmount(data.id, data.amount),
);
registerDemo("sponsor.manage.cancel", async ({ data }: Input<{ id: string }>) =>
  tryCancel(data.id),
);

/** لصفحات التجربة: هل يقبل طفل التجربة كفالةً جديدة الآن؟ */
export const tryAccepts = (c: Pick<TryChild, "id">) => tryVerification(c.id)?.accepts !== false;
