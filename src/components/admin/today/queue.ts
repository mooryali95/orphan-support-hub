/**
 * طابور «اليوم»: ما ينتظر قراراً من كل المصادر القائمة في شكلٍ واحد، يُركَّب في
 * المتصفّح من الدوالّ الموجودة (صندوق القرارات، التنبيهات، التعارضات، طابور الربط).
 *
 * `can_settle` تلميحٌ للواجهة لا حارس: القاعدة تحرس العينين و`country_can` وجلسة aal2،
 * والواجهة تشرح فقط لماذا لا يظهر زرّ الحسم. صافٍ بلا React (queue.test.ts).
 */
import {
  canDo,
  type Conflict,
  type CountryAccess,
  type DataAlert,
  type LinkItem,
} from "@/lib/golden-record";
import type { PendingChildUpdate } from "@/lib/child-updates";
import type { InboxItem, InboxKind } from "@/lib/inbox.functions";
import type { AgingKey } from "@/lib/trust-center";

export type QueueSource = "inbox" | "alert" | "conflict" | "link" | "update";
export type QueueKind = InboxKind | "alert" | "conflict" | "link" | "child_update";
export type BlockReason = "own_upload" | "needs_aal2" | "scope";
export type Severity = "critical" | "normal";

/** ما يعيده المصدر، ومعه علامة «رفعتَه أنت» حين يعرفها المصدر (التجربة اليوم). */
type Mine = { mine?: boolean | null };

export type QueueItem = {
  key: string;
  source: QueueSource;
  kind: QueueKind;
  id: string;
  country_code: string | null;
  /** ملفّ الطفل إن وُجد: يُفتح من الصفّ بلا قيمٍ في الصفّ نفسه. */
  orphan_id: string | null;
  /** رمز الملفّ أو عنوان البند كما تعرضه قائمته الأصلية (لا قيم حقول). */
  title: string;
  subtitle: string;
  created_at: string;
  severity: Severity;
  /** هل رفعه المستخدم نفسه؟ `null`: المصدر لا يقول. */
  mine: boolean | null;
  can_settle: boolean;
  settle_block_reason?: BlockReason;
  alert?: DataAlert;
  conflict?: Conflict;
  link?: LinkItem;
  inbox?: InboxItem;
  update?: PendingChildUpdate;
};

/** مهلة كل نوعٍ بالساعات: إعدادٌ في الكود لا في القاعدة. */
export const SLA_HOURS = {
  alert_critical: 24,
  alert: 72,
  conflict: 72,
  link: 72,
  transfer: 48,
  orphan: 120,
  other: 72,
} as const;

export function slaHours(it: Pick<QueueItem, "kind" | "severity">): number {
  if (it.kind === "alert")
    return it.severity === "critical" ? SLA_HOURS.alert_critical : SLA_HOURS.alert;
  if (it.kind === "conflict") return SLA_HOURS.conflict;
  if (it.kind === "link") return SLA_HOURS.link;
  if (it.kind === "transfer") return SLA_HOURS.transfer;
  if (it.kind === "orphan") return SLA_HOURS.orphan;
  return SLA_HOURS.other;
}

const DAY = 86_400_000;

/** الأعمار نفسها في `admin_trust_aging`: أقلّ من يوم، ١–٣، ٣–٧، أكثر من ٧. */
export function ageBucket(createdAt: string, now: number = Date.now()): AgingKey {
  const d = (now - Date.parse(createdAt)) / DAY;
  if (d < 1) return "lt1";
  if (d < 3) return "d1_3";
  if (d < 7) return "d3_7";
  return "gt7";
}

export const isOverdue = (it: QueueItem, now: number = Date.now()) =>
  now - Date.parse(it.created_at) > slaHours(it) * 3_600_000;

/** مرشّح «النوع» يقبل أنواعاً مجمّعة: «السلامة» طلبات الفكّ والاختلافات من المصدر. */
export const KIND_GROUPS: Readonly<Record<string, readonly QueueKind[]>> = {
  integrity: ["unlock", "discrepancy"],
  golden: ["alert", "conflict", "link"],
  updates: ["child_update"],
  money: ["transfer", "money_issue", "pledge"],
};
export const kindMatches = (filter: string, kind: QueueKind) =>
  !filter || filter === kind || (KIND_GROUPS[filter]?.includes(kind) ?? false);

/**
 * ما رفعه المستخدم لا يحسمه هو (العينان): التنبيه، والتغيير الحرج. الفرق غير الحرج بين
 * المصدرين يحسمه رافعه. التلميح أحوط من القاعدة، والقاعدة تقرّر.
 */
function ownBlocks(it: { source: QueueSource; severity: Severity; conflict?: Conflict }): boolean {
  if (it.source === "alert" || it.source === "update") return true;
  if (it.source === "conflict")
    return it.severity === "critical" || it.conflict?.kind !== "disagreement";
  return false;
}

function hint(
  access: CountryAccess,
  base: Omit<QueueItem, "can_settle" | "settle_block_reason">,
): Pick<QueueItem, "can_settle" | "settle_block_reason"> {
  if (base.source === "inbox")
    return access.admin
      ? { can_settle: true }
      : { can_settle: false, settle_block_reason: "scope" };
  if (!base.country_code || !canDo(access, base.country_code, "approve"))
    return { can_settle: false, settle_block_reason: "scope" };
  if (base.mine === true && ownBlocks(base))
    return { can_settle: false, settle_block_reason: "own_upload" };
  return { can_settle: true };
}

export type QueueInput = {
  inbox?: readonly InboxItem[];
  alerts?: ReadonlyArray<DataAlert & Mine>;
  conflicts?: ReadonlyArray<Conflict & Mine>;
  links?: ReadonlyArray<LinkItem & Mine>;
  updates?: readonly PendingChildUpdate[];
};

/** يوحّد المصادر في صفوفٍ واحدة، بلا تكرارٍ ولا قيم حقول في العنوان. */
export function buildQueue(input: QueueInput, access: CountryAccess): QueueItem[] {
  const out: QueueItem[] = [];
  const seen = new Set<string>();
  const push = (b: Omit<QueueItem, "can_settle" | "settle_block_reason">) => {
    if (seen.has(b.key)) return;
    seen.add(b.key);
    out.push({ ...b, ...hint(access, b) });
  };
  for (const it of input.inbox ?? [])
    push({
      key: `inbox:${it.kind}:${it.id}`,
      source: "inbox",
      kind: it.kind,
      id: it.id,
      country_code: null,
      orphan_id: null,
      title: it.title,
      subtitle: it.subtitle,
      created_at: it.created_at,
      severity: it.kind === "money_issue" || it.kind === "discrepancy" ? "critical" : "normal",
      mine: null,
      inbox: it,
    });
  for (const a of input.alerts ?? [])
    push({
      key: `alert:${a.id}`,
      source: "alert",
      kind: "alert",
      id: a.id,
      country_code: a.country,
      orphan_id: a.orphan_id,
      title: a.code ?? "",
      subtitle: a.name ?? "",
      created_at: a.created_at,
      severity: a.severity === "critical" ? "critical" : "normal",
      mine: typeof a.mine === "boolean" ? a.mine : null,
      alert: a,
    });
  for (const x of input.conflicts ?? [])
    push({
      key: `conflict:${x.id}`,
      source: "conflict",
      kind: "conflict",
      id: x.id,
      country_code: x.country,
      orphan_id: x.orphan_id,
      title: x.code,
      subtitle: x.name,
      created_at: x.created_at,
      severity: x.risk === "critical" ? "critical" : "normal",
      mine: typeof x.mine === "boolean" ? x.mine : null,
      conflict: x,
    });
  for (const l of input.links ?? [])
    push({
      key: `link:${l.id}`,
      source: "link",
      kind: "link",
      id: l.id,
      country_code: l.country,
      orphan_id: null,
      title: l.external_ref,
      subtitle: l.name ?? "",
      created_at: l.created_at,
      severity: "normal",
      mine: typeof l.mine === "boolean" ? l.mine : null,
      link: l,
    });
  for (const u of input.updates ?? [])
    push({
      key: `update:${u.id}`,
      source: "update",
      kind: "child_update",
      id: u.id,
      country_code: u.country_code,
      orphan_id: u.orphan_id,
      title: u.orphan_code,
      subtitle: u.orphan_name,
      created_at: u.created_at,
      severity: "normal",
      mine: u.mine,
      update: u,
    });
  // الأقدم أوّلاً داخل كل مجموعة: الحرج المتأخّر لا يغرق تحت الجديد.
  return out.sort(
    (a, b) =>
      Number(b.severity === "critical") - Number(a.severity === "critical") ||
      a.created_at.localeCompare(b.created_at),
  );
}

export type Group = "overdue" | "today" | "waiting";
export const GROUPS: readonly Group[] = ["overdue", "today", "waiting"];

/** «ينتظر غيرك»: ما لا تحسمه أنت (رفعتَه، أو خارج دورك)؛ وإلا متأخّرٌ أو لليوم. */
export function groupOf(it: QueueItem, now: number = Date.now()): Group {
  if (!it.can_settle) return "waiting";
  return isOverdue(it, now) ? "overdue" : "today";
}

export type Filters = {
  kind: string;
  country: string;
  sev: string;
  age: string;
  settle: boolean;
  q: string;
};
export const NO_FILTERS: Filters = {
  kind: "",
  country: "",
  sev: "",
  age: "",
  settle: false,
  q: "",
};

/** المرشّحات من العنوان: ما لا يُعرف يُهمل بصمت. */
export function filtersFrom(search: Record<string, unknown>): Filters {
  const s = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : "");
  return {
    kind: s("kind"),
    country: /^[A-Z]{2}$/.test(s("country")) ? s("country") : "",
    sev: s("sev") === "critical" || s("sev") === "normal" ? s("sev") : "",
    age: ["lt1", "d1_3", "d3_7", "gt7", "overdue"].includes(s("age")) ? s("age") : "",
    settle: search["settle"] === 1 || search["settle"] === "1" || search["settle"] === true,
    q: s("q").slice(0, 80),
  };
}

export function applyFilters(
  items: readonly QueueItem[],
  f: Filters,
  match: (q: string, ...hay: Array<string | null | undefined>) => boolean,
  now: number = Date.now(),
): QueueItem[] {
  return items.filter(
    (it) =>
      kindMatches(f.kind, it.kind) &&
      (!f.country || it.country_code === f.country) &&
      (!f.sev || it.severity === f.sev) &&
      (!f.age ||
        (f.age === "overdue" ? isOverdue(it, now) : ageBucket(it.created_at, now) === f.age)) &&
      (!f.settle || it.can_settle) &&
      match(f.q, it.title, it.subtitle),
  );
}

/**
 * أعمار الحرج من البنود الذهبية بفئات `admin_trust_aging` (التعارض والتنبيه الحرجان
 * المفتوحان): الرقم نفسه في «مركز الثقة» وفي «اليوم».
 */
export function agingCounts(items: readonly QueueItem[], now: number = Date.now()) {
  const c: Record<AgingKey, number> = { lt1: 0, d1_3: 0, d3_7: 0, gt7: 0 };
  for (const it of items)
    if ((it.source === "alert" || it.source === "conflict") && it.severity === "critical")
      c[ageBucket(it.created_at, now)]++;
  return c;
}
