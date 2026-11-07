/**
 * ما اختاره الزائر قبل أن يُطلب منه الدخول (UX-09): المبلغ، ورسالته للطفل،
 * وإخفاء اسمه. كان يضيع عند الدخول فيعود إلى الصفحة ليجد المبلغ الافتراضي
 * وحقل الرسالة فارغاً.
 *
 * يُحفظ في `sessionStorage` (هذا التبويب وحده، ويزول بإغلاقه) بمفتاحٍ لكل
 * طفل، ولا يُستعاد بعد ساعتين. والمفتاح ضمن بادئات بيانات العمل في
 * client-state فيُمحى عند الخروج وعند تبدّل المستخدم.
 */
export const SPONSOR_DRAFT_PREFIX = "kh:sponsor-draft:";
const TTL_MS = 2 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SponsorDraft = {
  orphanId: string;
  /** الاسم المعروض كما في الملفّ العامّ — لتذكير الزائر في صفحة الدخول. */
  name: string;
  amount: string;
  message: string;
  anonymous: boolean;
  currency: string;
  at: number;
};

/** يقرأ مسودّةً مخزّنة ويتحقّق منها؛ التالف والقديم وغير المطابق لا يُستعاد. */
export function parseDraft(
  raw: string | null,
  orphanId: string,
  now = Date.now(),
): SponsorDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SponsorDraft>;
    if (d.orphanId !== orphanId) return null;
    if (typeof d.at !== "number" || now - d.at > TTL_MS || d.at > now + 60_000) return null;
    const amount = String(d.amount ?? "");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount)) return null;
    return {
      orphanId,
      name: String(d.name ?? "").slice(0, 120),
      amount,
      message: String(d.message ?? "").slice(0, 1000),
      anonymous: d.anonymous === true,
      currency: /^[A-Z]{3}$/.test(String(d.currency)) ? String(d.currency) : "EUR",
      at: d.at,
    };
  } catch {
    return null;
  }
}

/** الطفل الذي يعود إليه رابط «بعد الدخول» إن كان صفحة طفل. */
export function orphanIdOfPath(path: string): string | null {
  const id = /^\/orphans\/([^/?#]+)/.exec(path)?.[1] ?? null;
  return id && UUID.test(id) ? id : null;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(d: Omit<SponsorDraft, "at">): void {
  try {
    store()?.setItem(SPONSOR_DRAFT_PREFIX + d.orphanId, JSON.stringify({ ...d, at: Date.now() }));
  } catch {
    /* التخزين محجوب: يعود الزائر إلى الافتراضي كما كان */
  }
}

export function loadDraft(orphanId: string): SponsorDraft | null {
  try {
    return parseDraft(store()?.getItem(SPONSOR_DRAFT_PREFIX + orphanId) ?? null, orphanId);
  } catch {
    return null;
  }
}

export function clearDraft(orphanId: string): void {
  try {
    store()?.removeItem(SPONSOR_DRAFT_PREFIX + orphanId);
  } catch {
    /* لا شيء يُفعل */
  }
}
