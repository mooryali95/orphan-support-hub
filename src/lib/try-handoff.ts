/**
 * من الوضع التجريبي إلى الحقيقية: ما اختاره الزائر في التجربة (نوع الدعم، ودولته، ومبلغه،
 * ودوريّته) يُحمل **مقترحاً** إلى الجهة الحقيقية، ولا شيء غير ذلك.
 *
 * ثلاث قواعد لا تُكسر هنا:
 *  - المقترح يعيش في متصفّح الزائر وحده (`sessionStorage`: يختفي بإغلاق المتصفّح)؛ لا تُرسله هذه الوحدة إلى أي خادم، ولا
 *    تُنشئ كفالةً ولا تعهّداً ولا دفعاً. الجهة الحقيقية تعرضه، والزائر يضغط «استعمله» ثم زرّ
 *    التأكيد الحقيقي بنفسه.
 *  - لا يحمل طفلاً: أطفال التجربة بأسماءٍ مستعارة، فلا يُنقل معرّفٌ ولا اسمٌ مستعار. الدولة وحدها تعبر،
 *    والطفل الحقيقي يختاره الزائر من الدليل.
 *  - المبلغ كما كُتب وبعملته، بلا تحويل؛ وإن لم تُقبل العملة هناك لم يُعرض المقترح.
 *
 * الوحدة لا تستورد فهارس التجربة: تُسلَّم سجلّاتها من صفحات التجربة، فتبقى الصفحات الحقيقية
 * التي تقرأ المقترح خاليةً من بيانات العرض.
 */

export type TrialTrack = "sponsorship" | "qualification" | "in_kind";
export type TrialCadence = "monthly" | "one_time";

export type TrialProposal = {
  /** معرّف سجلّ التجربة الذي جاء منه (`gift-…` أو `DEMO-PLG-…`)؛ للتمييز والإخفاء فقط */
  id: string;
  track: TrialTrack;
  cadence: TrialCadence;
  /** رمز الدولة من حرفين */
  co: string;
  amount: number;
  currency: string;
  /** متى اختاره في التجربة */
  at: string;
};

type GiftLike = {
  id: string;
  childId: string;
  amount: number;
  cadence: TrialCadence;
  at: string;
  paid?: { amount: number; currency: string } | undefined;
};

type PledgeLike = {
  id: string;
  kind: "qualification" | "in_kind";
  co: string;
  amount: number;
  currency: string;
  at: string;
};

export const HANDOFF_KEY = "kh:try-handoff:v1";
export const HANDOFF_EVENT = "try-handoff-change";
export const HANDOFF_MAX = 6;
/** المقترح اقتراحُ لحظة: بعد أسبوعين لا يُعرض */
export const HANDOFF_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const TRACKS: readonly TrialTrack[] = ["sponsorship", "qualification", "in_kind"];

const cleanProposal = (v: unknown): TrialProposal | null => {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const id = typeof p["id"] === "string" ? p["id"].slice(0, 80) : "";
  const track = p["track"] as TrialTrack;
  const cadence = p["cadence"] === "one_time" ? "one_time" : "monthly";
  const co = String(p["co"] ?? "");
  const amount = Number(p["amount"]);
  const currency = String(p["currency"] ?? "");
  const at = String(p["at"] ?? "");
  if (!id || !TRACKS.includes(track) || !/^[A-Z]{2}$/.test(co)) return null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  if (!/^[A-Z]{3}$/.test(currency) || Number.isNaN(Date.parse(at))) return null;
  // التعهّدات شهرية دائماً؛ الدوريّة اختيارٌ في الكفالة المادية وحدها
  return {
    id,
    track,
    cadence: track === "sponsorship" ? cadence : "monthly",
    co,
    amount,
    currency,
    at,
  };
};

/**
 * سجلّات التجربة مقترحاتٍ، الأحدث أوّلاً. `coOf` يردّ دولة طفل التجربة (من فهرس التجربة عند
 * المنادي)، و`fileCurrency` عملة ملفّات التجربة. العطاء المدفوع بعملةٍ أخرى يُحمل بما كتبه
 * الزائر فعلاً، لا بما قُيِّد بعد التحويل.
 */
export function proposalsFrom(
  gifts: readonly GiftLike[],
  pledges: readonly PledgeLike[],
  coOf: (childId: string) => string | undefined,
  fileCurrency: string,
): TrialProposal[] {
  const out: TrialProposal[] = [];
  for (const g of gifts) {
    const p = cleanProposal({
      id: g.id,
      track: "sponsorship",
      cadence: g.cadence,
      co: coOf(g.childId),
      amount: g.paid?.amount ?? g.amount,
      currency: g.paid?.currency ?? fileCurrency,
      at: g.at,
    });
    if (p) out.push(p);
  }
  for (const x of pledges) {
    const p = cleanProposal({ ...x, track: x.kind, cadence: "monthly" });
    if (p) out.push(p);
  }
  const seen = new Set<string>();
  return out
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, HANDOFF_MAX);
}

type Handoff = { v: 1; at: number; proposals: TrialProposal[]; dismissed: string[] };

/** يقرأ ما خُزّن ويتحقّق منه؛ التالف والقديم لا يُستعاد. المُخفى يبقى في `dismissed`. */
export function parseHandoff(raw: string | null | undefined, now = Date.now()): Handoff | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Partial<Handoff>;
    if (h.v !== 1 || typeof h.at !== "number") return null;
    if (now - h.at > HANDOFF_TTL_MS || h.at > now + 60_000) return null;
    const dismissed = Array.isArray(h.dismissed)
      ? h.dismissed.filter((x): x is string => typeof x === "string").slice(0, 60)
      : [];
    const proposals = (Array.isArray(h.proposals) ? h.proposals : [])
      .flatMap((x) => cleanProposal(x) ?? [])
      .slice(0, HANDOFF_MAX);
    return { v: 1, at: h.at, proposals, dismissed };
  } catch {
    return null;
  }
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};
const session = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};
const announce = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HANDOFF_EVENT));
};
const write = (store: Store | null, h: Handoff | null) => {
  try {
    if (h) store?.setItem(HANDOFF_KEY, JSON.stringify(h));
    else store?.removeItem(HANDOFF_KEY);
  } catch {
    /* التخزين محجوب: لا مقترح يُحمل، والرحلة الحقيقية تبدأ من أوّلها */
  }
  announce();
};

/**
 * تُنادى من صفحات التجربة كلّما تغيّرت سجلّاتها: المقترحات صورةٌ منها. ما أخفاه الزائر في الجهة
 * الحقيقية يبقى مخفياً، و«ابدأ من جديد» (لا سجلّات) يمحو كل شيء.
 */
export function syncHandoff(
  proposals: readonly TrialProposal[],
  store: Store | null = local(),
  now = Date.now(),
): void {
  if (proposals.length === 0) {
    let had = false;
    try {
      had = store?.getItem(HANDOFF_KEY) != null;
    } catch {
      /* nothing stored */
    }
    if (had) write(store, null);
    return;
  }
  let before: Handoff | null = null;
  try {
    before = parseHandoff(store?.getItem(HANDOFF_KEY), now);
  } catch {
    /* unreadable: start afresh */
  }
  const ids = new Set(proposals.map((p) => p.id));
  const dismissed = (before?.dismissed ?? []).filter((id) => ids.has(id));
  const next: Handoff = { v: 1, at: now, proposals: proposals.slice(0, HANDOFF_MAX), dismissed };
  const same =
    before != null &&
    JSON.stringify([before.proposals, before.dismissed]) ===
      JSON.stringify([next.proposals, next.dismissed]);
  // لا كتابة ولا حدث حين لم يتغيّر شيء، فلا تدور الصفحات حول نفسها
  if (!same) write(store, next);
}

/** المقترحات المعروضة: ما لم يُخفَ ولم ينتهِ أجله */
export function loadProposals(store: Store | null = local(), now = Date.now()): TrialProposal[] {
  try {
    const h = parseHandoff(store?.getItem(HANDOFF_KEY), now);
    return h ? h.proposals.filter((p) => !h.dismissed.includes(p.id)) : [];
  } catch {
    return [];
  }
}

/** يُخفى مقترحٌ واحد: بعد استعماله في تأكيدٍ حقيقي، أو حين يقول الزائر «ليس الآن» */
export function dismissProposal(id: string, store: Store | null = local(), now = Date.now()): void {
  let h: Handoff | null = null;
  try {
    h = parseHandoff(store?.getItem(HANDOFF_KEY), now);
  } catch {
    return;
  }
  if (!h || h.dismissed.includes(id)) return;
  write(store, { ...h, dismissed: [...h.dismissed, id] });
}

export function clearHandoff(store: Store | null = local()): void {
  write(store, null);
}

/**
 * المقترح الذي يناسب موضعاً حقيقياً: من المسارات المطلوبة، وفي الدولة نفسها أوّلاً. في بطاقة
 * مكانٍ (`sameCountryOnly`) لا يُعرض مقترحُ دولةٍ أخرى؛ وفي ملفّ طفلٍ يُعرض أحدث مقترح كفالة.
 */
export function matchProposal(
  proposals: readonly TrialProposal[],
  want: {
    tracks: readonly TrialTrack[];
    co?: string | null | undefined;
    sameCountryOnly?: boolean;
  },
): TrialProposal | null {
  const of = proposals.filter((p) => want.tracks.includes(p.track));
  const here = want.co ? of.find((p) => p.co === want.co) : undefined;
  return here ?? (want.sameCountryOnly ? null : (of[0] ?? null));
}

/* ── أين أنا في الرحلة ─────────────────────────────────────────────── */

export const TRY_STAGES = ["choose", "give", "impact", "real"] as const;
export type TryStage = (typeof TRY_STAGES)[number];
export type TryStageState = "done" | "current" | "ahead";

/** محطّة الصفحة الحالية: الفهرس اختيار، و«أثري» أثر، وكلّ ما بينهما (ملفّ، دفع، خريطة، قاعة) عطاء */
export function tryStageOf(pathname: string): Exclude<TryStage, "real"> {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/try" || path === "") return "choose";
  if (path === "/try/impact") return "impact";
  return "give";
}

/**
 * حال المحطّات الأربع: الحالية من المسار، وما قبلها مُنجز، والاختيار والعطاء مُنجزان متى وُجد
 * عطاءٌ محاكى. «الرحلة الحقيقية» أمام الزائر دائماً حتى يسجّل.
 */
export function tryJourney(
  pathname: string,
  has: boolean,
  registered = false,
): Array<{ stage: TryStage; state: TryStageState }> {
  const current = TRY_STAGES.indexOf(tryStageOf(pathname));
  return TRY_STAGES.map((stage, i) => ({
    stage,
    state:
      stage === "real"
        ? registered
          ? "done"
          : "ahead"
        : i === current
          ? "current"
          : i < current || (has && i < 2)
            ? "done"
            : "ahead",
  }));
}

/* ── علامتان في هذا التبويب وحده ───────────────────────────────────── */

const RESUME_KEY = "kh:try-handoff:resume";
const LEFT_KEY = "kh:try-handoff:left";

/** طلب الزائر دخول الرحلة الحقيقية وغادر الصفحة للدخول (جوجل): يُكمل إليها حين يعود */
export function markResume(store: Store | null = session()): void {
  try {
    store?.setItem(RESUME_KEY, "1");
  } catch {
    /* يعود إلى صفحة التجربة، ومنها الزرّ نفسه */
  }
}

/** تُقرأ مرّةً وتُمحى */
export function takeResume(store: Store | null = session()): boolean {
  try {
    const on = store?.getItem(RESUME_KEY) === "1";
    if (on) store?.removeItem(RESUME_KEY);
    return on;
  } catch {
    return false;
  }
}

/** دعوة المغادرة تُقال مرّةً واحدة في التبويب: `true` في المرّة الأولى وحدها */
export function firstLeave(store: Store | null = session()): boolean {
  try {
    if (!store || store.getItem(LEFT_KEY) === "1") return false;
    store.setItem(LEFT_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
