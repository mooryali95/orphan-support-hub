/**
 * أدوات الإدارة (هجرة 20261203100000_admin_pass2): أنواع البحث الموحّد وعدّادات الطوابير
 * وسجلّ القرارات، وتحويل حدث السجلّ إلى جملةٍ مقروءة. صافٍ بلا React ولا خادم
 * (admin-tools.test.ts): الجملة تُبنى من قوالب النصوص التي يمرّرها المكوّن.
 */
import type { FieldValue } from "@/lib/golden-record";

export type QueueCounts = { conflicts: number; alerts: number; links: number; updates: number };
export const NO_COUNTS: QueueCounts = { conflicts: 0, alerts: 0, links: 0, updates: 0 };
/** شريط «اليوم» لفريق الدولة: ما يحسمه المتّصل، ومنه ما تجاوز مهلته (عددٌ دقيق). */
export type TodayStrip = { settle: number; overdue: number };

export const sumCounts = (c: QueueCounts) => c.conflicts + c.alerts + c.links + c.updates;

/** ما تعرضه قوائم الإدارة من الطفل، لا أكثر. */
export type SearchChild = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  status: string;
};
export type SearchSponsor = { id: string; name: string | null; email: string | null };
export type SearchSponsorship = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  code: string;
  child: string;
  sponsor: string | null;
  created_at: string;
};
export type SearchTransfer = {
  id: string;
  ref: string;
  amount: number;
  currency: string;
  status: string;
  code: string;
  bank_reference: string | null;
  created_at: string;
};
export type SearchResults = {
  children: SearchChild[];
  sponsors: SearchSponsor[];
  sponsorships: SearchSponsorship[];
  transfers: SearchTransfer[];
  /** مديرٌ بجلسة aal1: الكفلاء والكفالات والتحويلات محجوبة حتى العامل الثاني (N2). */
  mfa_required?: boolean;
};
export const NO_RESULTS: SearchResults = {
  children: [],
  sponsors: [],
  sponsorships: [],
  transfers: [],
};
export type SearchHit =
  | { kind: "child"; item: SearchChild }
  | { kind: "sponsor"; item: SearchSponsor }
  | { kind: "sponsorship"; item: SearchSponsorship }
  | { kind: "transfer"; item: SearchTransfer };

/** النتائج مسطّحةً بترتيب العرض، لتنقّل الأسهم. */
export function flattenHits(r: SearchResults): SearchHit[] {
  return [
    ...r.children.map((item) => ({ kind: "child" as const, item })),
    ...r.sponsors.map((item) => ({ kind: "sponsor" as const, item })),
    ...r.sponsorships.map((item) => ({ kind: "sponsorship" as const, item })),
    ...r.transfers.map((item) => ({ kind: "transfer" as const, item })),
  ];
}

/** أقصر استعلامٍ يُرسل: حرفان بعد التطبيع، كما في القاعدة. */
export const SEARCH_MIN = 2;

/* ── سجلّ القرارات ─────────────────────────────────────────────── */

export type DecisionKind = "decisions" | "security";
export type DecisionEvent = {
  id: string;
  src: "audit" | "conflict" | "security";
  at: string;
  actor: string | null;
  action: string;
  orphan_id: string | null;
  code: string | null;
  country: string | null;
  field: string | null;
  from: FieldValue;
  to: FieldValue;
  detail: Record<string, string | number>;
};
export type DecisionLogPage = { rows: DecisionEvent[]; has_more: boolean };

export const isSecurity = (e: Pick<DecisionEvent, "action">) => e.action.startsWith("sec_");

/** القوالب التي تُبنى منها الجملة؛ تمرّرها نصوص المكوّن بلغتها. */
export type SentenceCopy = {
  someone: string;
  empty: string;
  approved: (who: string, field: string, to: string, from: string) => string;
  approvedNew: (who: string, field: string, to: string) => string;
  kept: (who: string, field: string, from: string, to: string) => string;
  alert: (who: string, signal: string, status: string) => string;
  updateApproved: (who: string) => string;
  updateRejected: (who: string) => string;
  staff: (who: string, from: string, to: string) => string;
  mode: (who: string, from: string, to: string) => string;
  ingest: (who: string, n: number) => string;
  security: (what: string, who: string) => string;
  other: (who: string, action: string) => string;
  secKinds: Record<string, string>;
  actions: Record<string, string>;
};
export type SentenceLabels = {
  fields: Record<string, string>;
  signals: Record<string, string>;
  statuses: Record<string, string>;
  roles: Record<string, string>;
  modes: Record<string, string>;
};

export const showValue = (v: FieldValue, empty: string) =>
  v === null || v === undefined || v === "" ? empty : String(v);

/** جملةٌ واحدة لكلّ حدث: «سارة اعتمد تاريخ الميلاد 2013-07-01 بدل 2013-06-01». */
export function sentenceOf(e: DecisionEvent, t: SentenceCopy, l: SentenceLabels): string {
  const who = e.actor?.trim() || t.someone;
  const str = (k: string) => {
    const v = e.detail[k];
    return v === undefined || v === null ? "" : String(v);
  };
  const field = e.field ? (l.fields[e.field] ?? e.field) : "";
  if (isSecurity(e)) {
    const kind = e.action.slice(4);
    return t.security(t.secKinds[kind] ?? kind, who);
  }
  switch (e.action) {
    case "golden_conflict_resolve":
      return e.from === null || e.from === undefined || e.from === ""
        ? t.approvedNew(who, field, showValue(e.to, t.empty))
        : t.approved(who, field, showValue(e.to, t.empty), showValue(e.from, t.empty));
    case "golden_conflict_keep":
      return t.kept(who, field, showValue(e.from, t.empty), showValue(e.to, t.empty));
    case "golden_alert_resolve": {
      const sg = str("signal");
      const st = str("status");
      return t.alert(who, l.signals[sg] ?? sg, l.statuses[st] ?? st);
    }
    case "child_update_review":
      return str("decision") === "reject" ? t.updateRejected(who) : t.updateApproved(who);
    case "country_staff_set":
      return t.staff(
        who,
        l.roles[str("from")] ?? (str("from") || t.empty),
        l.roles[str("to") || "removed"] ?? str("to"),
      );
    case "country_source_mode":
      return t.mode(who, l.modes[str("from")] ?? t.empty, l.modes[str("to")] ?? t.empty);
    case "golden_ingest":
      return t.ingest(who, Number(e.detail["records"] ?? 0));
    default:
      return t.other(who, t.actions[e.action] ?? e.action);
  }
}

/** «قبل يومين» بلغة الواجهة؛ الأقرب وحدةً كاملة. */
export function relativeTime(at: string, locale: string, now: number = Date.now()): string {
  const s = Math.round((new Date(at).getTime() - now) / 1000);
  // «auto» للثواني وحدها («الآن»)؛ ما بعدها بالعدد («قبل يومين» لا «أول أمس»).
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const a = Math.abs(s);
  if (a < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 30 * 86_400) return rtf.format(Math.round(s / 86_400), "day");
  if (a < 365 * 86_400) return rtf.format(Math.round(s / (30 * 86_400)), "month");
  return rtf.format(Math.round(s / (365 * 86_400)), "year");
}
