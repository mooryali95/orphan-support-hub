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
import { registerChildUpdateDemos } from "@/lib/try-child-updates";
import { LIFECYCLE_ERRORS } from "@/lib/sponsorship-lifecycle";
import type { FeedItem } from "@/lib/journey.functions";
import type { LedgerMonth, SponsorshipLedger } from "@/lib/ledger.functions";
import type { SponsorQualification } from "@/lib/scopes.functions";
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
    payDemo: "الدفع في التجربة محاكاة، فلا يُفتح بابٌ للدفع ولا يُحصَّل شيء.",
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
    payDemo: "Payment in the trial is simulated, so no checkout opens and nothing is charged.",
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

/* ——— سجلّ الكفالة في التجربة ——— */

const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const ym = (d: Date) => monthOf(d, 0);
const hex4 = (s: string) => (hash(s) % 0x10000).toString(16).toUpperCase().padStart(4, "0");

/**
 * سجلّ كفالة التجربة بشكل `sponsorship_ledger`: من شهر العطاء إلى اليوم، وشهرٌ قادم للشهرية
 * الجارية. الفواتير نموذجية (`DEMO-INV-`، مزوّدها `demo`، بلا إيصال مزوّد)، ومعرّف الكفالة
 * `gift-…` لا يقبله `startCheckout` (يطلب UUID)، فلا يمسّ السجلّ دفعاً حقيقياً.
 */
export function tryLedger(
  sponsorshipId: string,
  locale: Locale = "ar",
  now: Date = new Date(),
  store: TryStore | null = safe(),
): SponsorshipLedger | null {
  const s = trySponsorships(locale, now, store).find((x) => x.id === sponsorshipId);
  const k = s?.orphan ? tryChild(s.orphan.id) : undefined;
  if (!s || !s.orphan || !k) return null;
  const started = new Date(s.started_at ?? s.created_at);
  const ended = s.ended_at ? new Date(s.ended_at) : null;
  const last = monthStart(ended && ended < now ? ended : now);
  const months: LedgerMonth[] = [];
  for (let d = monthStart(started); d <= last; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const month = ym(d);
    const first = month === ym(started);
    // الإيقاف يبدأ بعد آخر ما دُفع، فلا يمسّ شهراً مضى؛ يغيب الشهر القادم وحده.
    const billed = s.type === "monthly" || first;
    if (!billed) {
      months.push({
        month,
        upcoming: false,
        due: 0,
        paid: 0,
        payment_status: null,
        delivery_status: null,
        delivered_at: null,
        receipt: null,
        payments: [],
      });
      continue;
    }
    // الشهر الجاري يتقدّم بالأيام منذ الدفع؛ وما قبله وصل بمستند.
    const paidAt = first ? started : new Date(Math.max(d.getTime(), started.getTime()));
    const age = (now.getTime() - paidAt.getTime()) / 86_400_000;
    const delivery: LedgerMonth["delivery_status"] =
      month < ym(now) || age >= 10 ? "delivered" : age >= 3 ? "transferred" : "scheduled";
    const deliveredAt =
      delivery === "delivered" ? new Date(paidAt.getTime() + 10 * 86_400_000).toISOString() : null;
    const code = `${hex4(`${s.id}${month}`)}-${hex4(`${month}${s.id}`)}`;
    months.push({
      month,
      upcoming: false,
      due: s.amount,
      paid: s.amount,
      payment_status: "paid",
      delivery_status: delivery,
      delivered_at: deliveredAt,
      receipt: `DEMO-${code}`,
      payments: [
        {
          invoice_no: `DEMO-INV-${month.replace("-", "")}-${hex4(s.id)}`,
          provider: "demo",
          provider_payment_id: null,
          amount: s.amount,
          currency: s.currency,
          status: "paid",
          paid_at: paidAt.toISOString(),
          receipt_url: null,
        },
      ],
    });
  }
  const live = s.status === "active" && !s.cancel_effective_at && s.type === "monthly";
  const next = new Date(last);
  next.setUTCMonth(next.getUTCMonth() + 1);
  if (live)
    months.push({
      month: ym(next),
      upcoming: true,
      due: s.amount,
      paid: 0,
      payment_status: null,
      delivery_status: null,
      delivered_at: null,
      receipt: null,
      payments: [],
    });
  const paid = months.filter((m) => m.paid > 0);
  return {
    sponsorship: {
      id: s.id,
      amount: s.amount,
      currency: s.currency,
      status: s.status,
      type: s.type,
      started_at: s.started_at,
      // ما دُفع حتى: شهرٌ بعد البدء لكلّ شهرٍ مدفوع، كما يحسبه إيقاف التجربة وإنهاؤها
      next_charge_at:
        live || s.status === "paused" ? addMonthsTo(started.toISOString(), paid.length) : null,
      is_anonymous: false,
      message: null,
      message_status: "none",
      created_at: s.created_at,
    },
    orphan: {
      id: s.orphan.id,
      code: s.orphan.code,
      display_name: s.orphan.display_name,
      country: localTryChild(k, locale).country,
      region: null,
      age_band: "6-12",
    },
    months,
    totals: {
      paid: paid.reduce((a, m) => a + m.paid, 0),
      months_paid: paid.length,
      months_delivered: months.filter((m) => m.delivery_status === "delivered").length,
    },
  };
}

/** رحلة التأهيل كما يراها الكافل (`sponsor_qualification`): المرحلة وحدها، بلا جلساتٍ ولا درجات. */
export function trySponsorQualification(id: string, locale: Locale = "ar"): SponsorQualification {
  return {
    allowed: true,
    programs: tryQualificationTrack(id, locale).map((p) => ({
      program: p.program,
      status: p.status,
      stage: p.stage,
      started_at: p.stage_changed_at,
      accepted: 0,
      total: 0,
      units: [],
    })),
    growth: [],
  };
}

/** «رحلتي» في التجربة: بدء كلّ عطاء وآخر تقريرٍ نموذجيّ لطفله. */
export function tryJourneyFeed(locale: Locale = "ar", now: Date = new Date()): FeedItem[] {
  return trySponsorships(locale, now)
    .flatMap((s): FeedItem[] =>
      s.orphan
        ? [
            ...tryReports(s.orphan.id, locale, now).map((r) => ({
              kind: "timeline" as const,
              type: "report.published",
              at: r.published_at ?? r.created_at,
              orphan: s.orphan!.display_name,
              orphan_id: s.orphan!.id,
              text: r.summary,
            })),
          ]
        : [],
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ——— التسجيل في منفذ البيانات ——— */

type Input<T> = { data: T };
const uiLocale = (): Locale =>
  typeof document === "undefined" ? "ar" : parseLocale(document.cookie);

registerChildUpdateDemos();
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
registerDemo("sponsor.ledger", async ({ data }: Input<{ sponsorshipId: string }>) => {
  const ledger = tryLedger(data.sponsorshipId, uiLocale());
  return ledger ? { ok: true as const, ledger } : { ok: false as const, ledger: null };
});
registerDemo("sponsor.qualification", async ({ data }: Input<{ orphanId: string }>) =>
  JSON.stringify(trySponsorQualification(data.orphanId, uiLocale())),
);
registerDemo("impact.reports", async ({ data }: Input<{ orphanId: string }>) => ({
  ok: true as const,
  reports: tryReports(data.orphanId, uiLocale()),
}));
registerDemo(
  "sponsor.verifyReceipt",
  async ({ data }: Input<{ sponsorshipId: string; month: string; receipt: string }>) => {
    const m = tryLedger(data.sponsorshipId, uiLocale())?.months.find((x) => x.month === data.month);
    const clean = (v: string) => v.trim().toUpperCase();
    return m?.receipt
      ? { ok: true as const, match: clean(m.receipt) === clean(data.receipt), current: m.receipt }
      : { ok: false as const };
  },
);
registerDemo("impact.timeline", async () => ({ ok: true as const, events: [] }));
registerDemo("sponsor.journeyFeed", async () => tryJourneyFeed(uiLocale()));
registerDemo("sponsor.digestPreview", async () => ({
  ok: false as const,
  html: null,
  subject: null,
}));
// لا دفع في التجربة: «ادفع الآن» يقول إنّه محاكاة، ولا يفتح بوابة.
registerDemo("sponsor.pay", async () => ({
  ok: false as const,
  error: copyOf(COPY, uiLocale()).payDemo,
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
