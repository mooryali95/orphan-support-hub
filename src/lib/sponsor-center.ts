/**
 * مركز الكافل — المنطق الصافي لشاشات الكافل: خطّ الطرد لكلّ شهر، وما يحتاج إجراءه،
 * والمحطّات المستحقّة، وسجلّ التبرّعات السنوي، وأثر تغيير المبلغ. لا نداء خادمٍ هنا ولا
 * نصّ واجهة: كلّه من حقول `sponsorship_ledger` و`listMySponsorships` كما تعيدها القاعدة،
 * فيعمل في المنصّة وفي التجربة بالقواعد نفسها.
 *
 * لا جمع بين عملتين أبداً: كلّ مجموعٍ هنا بعملته.
 */
import type { LedgerMonth, LedgerPayment, SponsorshipLedger } from "@/lib/ledger.functions";
import type { MySponsorship } from "@/lib/sponsorships.functions";

/* ——— خطّ الطرد: مُجدول ← حُوِّل ← وصل ——— */

export type PackageStep = "scheduled" | "transferred" | "delivered";
export const PACKAGE_STEPS: readonly PackageStep[] = ["scheduled", "transferred", "delivered"];

export type PackageLine = {
  month: string;
  /** آخر محطّةٍ بلغها الشهر، أو null إن لم يُدفع ولم يُجدول بعد */
  reached: PackageStep | null;
  /** الدفع تعذّر أو نوزع فيه: يحتاج إجراء الكافل */
  issue: "failed" | "disputed" | null;
  refunded: boolean;
};

/** الشهر الجاري من السجلّ: آخر شهرٍ غير قادم. */
export function currentMonth(ledger: Pick<SponsorshipLedger, "months">): LedgerMonth | null {
  const past = ledger.months.filter((m) => !m.upcoming);
  return [...past].sort((a, b) => a.month.localeCompare(b.month)).at(-1) ?? null;
}

/** خطّ الطرد لشهرٍ واحد، بما سجّلته القاعدة فقط. */
export function packageLine(m: LedgerMonth): PackageLine {
  const reached: PackageStep | null =
    m.delivery_status === "delivered"
      ? "delivered"
      : m.delivery_status === "transferred"
        ? "transferred"
        : m.delivery_status === "scheduled" || Number(m.paid) > 0
          ? "scheduled"
          : null;
  const issue =
    m.payment_status === "failed" ? "failed" : m.payment_status === "disputed" ? "disputed" : null;
  return { month: m.month, reached, issue, refunded: m.payment_status === "refunded" };
}

/** هل بلغ الخطّ هذه المحطّة؟ */
export function stepReached(line: Pick<PackageLine, "reached">, step: PackageStep): boolean {
  return (
    line.reached !== null && PACKAGE_STEPS.indexOf(line.reached) >= PACKAGE_STEPS.indexOf(step)
  );
}

/* ——— ما يحتاج إجراء الكافل ——— */

export type ActionItem =
  | { kind: "pending"; sponsorshipId: string }
  | { kind: "failed" | "disputed"; sponsorshipId: string; month: string }
  | { kind: "resumes"; sponsorshipId: string; on: string };

/** الإيقاف الذي يُستأنف خلال هذه المدّة يظهر في الشريط. */
export const RESUME_SOON_DAYS = 14;

/**
 * سطرٌ لكلّ ما ينتظر الكافل، ولا شيء إن لم ينتظر شيء. الشهر المتعثّر من آخر
 * سجلٍّ معروف، والمنتهية لا تطلب شيئاً.
 */
export function actionItems(
  list: readonly MySponsorship[],
  ledgers: Readonly<Record<string, SponsorshipLedger | undefined>>,
  now: Date = new Date(),
): ActionItem[] {
  const out: ActionItem[] = [];
  for (const s of list) {
    if (s.status === "pending_payment") {
      out.push({ kind: "pending", sponsorshipId: s.id });
      continue;
    }
    if (s.status === "cancelled" || s.status === "completed") continue;
    const l = ledgers[s.id];
    for (const m of l?.months ?? []) {
      if (m.upcoming) continue;
      const issue = packageLine(m).issue;
      if (issue) out.push({ kind: issue, sponsorshipId: s.id, month: m.month });
    }
    if (s.status === "paused" && s.paused_until) {
      const days = (new Date(s.paused_until).getTime() - now.getTime()) / 86_400_000;
      if (days >= 0 && days <= RESUME_SOON_DAYS)
        out.push({ kind: "resumes", sponsorshipId: s.id, on: s.paused_until });
    }
  }
  return out;
}

/* ——— قائمة الأطفال: المرشّحات والبطاقة المختصرة ——— */

export type ChildFilter = "all" | "active" | "paused" | "ended";
export const CHILD_FILTERS: readonly ChildFilter[] = ["all", "active", "paused", "ended"];
/** من هذا العدد تصير البطاقات قائمةً مختصرة بمرشّحات */
export const COMPACT_FROM = 4;

export function filterOf(s: Pick<MySponsorship, "status">): Exclude<ChildFilter, "all"> {
  if (s.status === "cancelled" || s.status === "completed") return "ended";
  if (s.status === "paused") return "paused";
  return "active";
}

export function applyFilter<T extends Pick<MySponsorship, "status">>(
  list: readonly T[],
  f: ChildFilter,
): T[] {
  return f === "all" ? [...list] : list.filter((s) => filterOf(s) === f);
}

/** الأحدث أولاً: بتاريخ البدء، وإلا بتاريخ الطلب. */
export function newestFirst<T extends Pick<MySponsorship, "started_at" | "created_at">>(
  list: readonly T[],
): T[] {
  return [...list].sort((a, b) =>
    (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at),
  );
}

/** الشهر الأوّل: تنتظر الدفع، أو بدأت قبل أقلّ من 30 يوماً. */
export function isFirstMonth(
  s: Pick<MySponsorship, "status" | "started_at">,
  now: Date = new Date(),
): boolean {
  if (s.status === "pending_payment") return true;
  if (s.status !== "active" || !s.started_at) return false;
  return now.getTime() - new Date(s.started_at).getTime() < 30 * 86_400_000;
}

/* ——— محطّات الرحلة (لحظات الأثر) ——— */

export type Milestone =
  { kind: "first_delivered"; month: string } | { kind: "anniversary"; years: number; on: string };

/** أوّل شهرٍ وصل الطفلَ بمستند، والذكرى السنوية الأولى والثانية إن حلّتا. */
export function childMilestones(
  ledger: Pick<SponsorshipLedger, "months" | "sponsorship">,
  now: Date = new Date(),
): Milestone[] {
  const out: Milestone[] = [];
  const first = [...ledger.months]
    .filter((m) => !m.upcoming && m.delivery_status === "delivered")
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  if (first) out.push({ kind: "first_delivered", month: first.month });
  const started = ledger.sponsorship.started_at;
  if (started) {
    for (const years of [1, 2]) {
      const d = new Date(started);
      d.setUTCFullYear(d.getUTCFullYear() + years);
      if (d <= now) out.push({ kind: "anniversary", years, on: d.toISOString() });
    }
  }
  return out;
}

/* ——— خطّ الرحلة الموحّد في صفحة الطفل ——— */

export type JourneyReport = { id: string; period: string; published_at: string | null };
export type JourneyEvent =
  | { kind: "month"; month: string; m: LedgerMonth }
  | { kind: "report"; month: string; report: JourneyReport }
  | { kind: "learned"; month: string; titles: string[] }
  | { kind: "milestone"; month: string; milestone: Milestone };

const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * ما حدث في الكفالة مجموعاً بالشهر، الأحدث أولاً: الأشهر بمحطّاتها، والتقارير المعتمدة
 * (تصل الكافلَ معتمدةً وحدها)، وما اجتازه الطفل، والمحطّات.
 */
export function journeyByMonth(
  ledger: Pick<SponsorshipLedger, "months" | "sponsorship">,
  reports: readonly JourneyReport[] = [],
  learned: Readonly<Record<string, string[]>> = {},
  now: Date = new Date(),
): Array<{ month: string; events: JourneyEvent[] }> {
  const groups = new Map<string, JourneyEvent[]>();
  const add = (e: JourneyEvent) => groups.set(e.month, [...(groups.get(e.month) ?? []), e]);
  for (const ms of childMilestones(ledger, now))
    add({
      kind: "milestone",
      month: ms.kind === "first_delivered" ? ms.month : monthKey(ms.on),
      milestone: ms,
    });
  for (const r of reports) {
    if (r.published_at) add({ kind: "report", month: monthKey(r.published_at), report: r });
  }
  for (const [month, titles] of Object.entries(learned)) {
    if (titles.length) add({ kind: "learned", month, titles });
  }
  for (const m of ledger.months) if (!m.upcoming) add({ kind: "month", month: m.month, m });
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, events]) => ({ month, events }));
}

/* ——— الأدلّة بعدد الأشهر لا بنسبةٍ مفترضة ——— */

/** «8 من 9 أشهرٍ مدفوعة وصلت بمستند»: كلّه، أو بعضه، أو لا شيء بعد. */
export function deliveredShare(totals: SponsorshipLedger["totals"]): {
  delivered: number;
  paid: number;
  all: boolean;
} {
  const paid = Number(totals.months_paid);
  const delivered = Math.min(Number(totals.months_delivered), paid);
  return { delivered, paid, all: paid > 0 && delivered === paid };
}

/* ——— الإدارة: الإيقاف والمبلغ والإنهاء ——— */

const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

/**
 * موعد الاستئناف كما تحسبه القاعدة: الإيقاف يبدأ بعد آخر ما دُفع (أو من اليوم إن لم
 * يُعرف) ويطول شهراً إلى ثلاثة.
 */
export function resumesOn(paidThrough: string | null, months: number, now = new Date()): string {
  const from = new Date(Math.max(now.getTime(), paidThrough ? new Date(paidThrough).getTime() : 0));
  return addMonths(from, months).toISOString();
}

/** موعد نفاذ الإنهاء: المعلّق فوراً، والجارية بعد آخر ما دُفع. */
export function endsOn(
  s: Pick<MySponsorship, "status">,
  paidThrough: string | null,
  now = new Date(),
): { at: string; immediate: boolean } {
  if (s.status === "pending_payment" || !paidThrough || new Date(paidThrough) <= now)
    return { at: now.toISOString(), immediate: true };
  return { at: new Date(paidThrough).toISOString(), immediate: false };
}

/**
 * تغطية حاجة الطفل الشهرية بعد المبلغ الجديد، 0..100. ما سُجّل للكفالة الجارية داخلٌ
 * في `funded_monthly` فيُستبدل، والمعلّقة لم تدخل بعد فيُضاف.
 */
export function coverageWith(
  s: Pick<MySponsorship, "amount" | "status" | "type" | "orphan">,
  amount: number,
): number | null {
  const o = s.orphan;
  const need = Number(o?.monthly_need ?? 0);
  if (!o || need <= 0) return null;
  const counted = s.type === "monthly" && (s.status === "active" || s.status === "paused");
  const others = Number(o.funded_monthly) - (counted ? Number(s.amount) : 0);
  const next = Math.max(0, others) + (s.type === "monthly" ? Math.max(0, amount) : 0);
  return Math.min(100, Math.round((next / need) * 100));
}

/* ——— سجلّ التبرّعات السنوي ——— */

export type StatementLine = {
  invoice_no: string;
  month: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  receipt_url: string | null;
};
export type StatementChild = {
  sponsorshipId: string;
  name: string;
  code: string;
  paid: StatementLine[];
  refunded: StatementLine[];
};
export type CurrencyLine = { currency: string; received: number; refunded: number; net: number };
export type Statement = { year: number; children: StatementChild[]; totals: CurrencyLine[] };

/** السنة التي تُنسب إليها الفاتورة: يوم الدفع، وإلا شهرها في السجلّ. */
const yearOf = (p: LedgerPayment, month: string) => Number((p.paid_at ?? month).slice(0, 4));

const lineOf = (p: LedgerPayment, month: string): StatementLine => ({
  invoice_no: p.invoice_no,
  month,
  amount: Number(p.amount),
  currency: p.currency,
  paid_at: p.paid_at,
  receipt_url: p.receipt_url,
});

/**
 * سجلّ سنةٍ ميلادية من سجلّات الكفالات: ما دُفع (`paid`) يُعدّ، وما رُدّ (`refunded`) يُسرد
 * وحده ويُطرح؛ وما سوى ذلك (معلّق، متعثّر، منازع) لا يدخل. المجاميع بكلّ عملةٍ وحدها.
 */
export function statementFor(year: number, ledgers: readonly SponsorshipLedger[]): Statement {
  const totals = new Map<string, CurrencyLine>();
  const bump = (cur: string, k: "received" | "refunded", v: number) => {
    const t = totals.get(cur) ?? { currency: cur, received: 0, refunded: 0, net: 0 };
    t[k] += v;
    t.net = t.received - t.refunded;
    totals.set(cur, t);
  };
  const children: StatementChild[] = [];
  for (const l of ledgers) {
    const paid: StatementLine[] = [];
    const refunded: StatementLine[] = [];
    for (const m of l.months) {
      for (const p of m.payments ?? []) {
        if (yearOf(p, m.month) !== year) continue;
        if (p.status === "paid") paid.push(lineOf(p, m.month));
        else if (p.status === "refunded") refunded.push(lineOf(p, m.month));
      }
    }
    // المردود دُفع ثم رُدّ: يدخل فيما وصل، ويُطرح بسطره.
    for (const p of paid) bump(p.currency, "received", p.amount);
    for (const p of refunded) {
      bump(p.currency, "received", p.amount);
      bump(p.currency, "refunded", p.amount);
    }
    if (paid.length || refunded.length)
      children.push({
        sponsorshipId: l.sponsorship.id,
        name: l.orphan.display_name,
        code: l.orphan.code,
        paid: paid.sort((a, b) => a.month.localeCompare(b.month)),
        refunded: refunded.sort((a, b) => a.month.localeCompare(b.month)),
      });
  }
  return {
    year,
    children,
    totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

/** السنوات التي فيها فاتورةٌ في أيّ سجلّ، الأحدث أولاً. */
export function statementYears(ledgers: readonly SponsorshipLedger[]): number[] {
  const ys = new Set<number>();
  for (const l of ledgers)
    for (const m of l.months) for (const p of m.payments ?? []) ys.add(yearOf(p, m.month));
  return [...ys].sort((a, b) => b - a);
}
