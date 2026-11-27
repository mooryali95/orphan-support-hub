import { toCsv } from "@/lib/csv";

/**
 * مركز الثقة في الإدارة: أنواع ما تعيده دوالّ `admin_trust_*` وحسابٌ صافٍ
 * عليها (الحصّة، العينان، ملفّ الأسابيع) يُختبر بلا قاعدة.
 */

export type OfficeMode = "none" | "shadow" | "active";

export type TrustCountry = {
  code: string;
  name_ar: string;
  name_local: string | null;
  office_mode: OfficeMode;
  office_source: string | null;
  files: number;
  verified: number;
  critical: number;
  other: number;
  link_pending: number;
  last_wamy: string | null;
  last_office: string | null;
};

export type AgingBucket = {
  code: string;
  name_ar: string;
  name_local: string | null;
  lt1: number;
  d1_3: number;
  d3_7: number;
  gt7: number;
  oldest: string | null;
};

export type AgingItem = {
  kind: "conflict" | "alert";
  id: string;
  country: string;
  file_code: string | null;
  field: string;
  signal: string | null;
  created_at: string;
};

export type TrustAging = { buckets: AgingBucket[]; oldest: AgingItem[]; total: number };

export type TeamRow = {
  code: string;
  name_ar: string;
  name_local: string | null;
  supervisors: number;
  data_entry: number;
  viewers: number;
  active_supervisors: number;
  pending: number;
};

export const DECISION_ACTIONS = [
  "golden_conflict_resolve",
  "golden_alert_resolve",
  "country_staff_set",
  "country_source_mode",
  "golden_ingest",
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export type Decision = {
  id: string;
  action: DecisionAction;
  created_at: string;
  actor_email: string | null;
  country: string | null;
  file_code: string | null;
  detail: Record<string, string | number>;
};
export type DecisionPage = { rows: Decision[]; has_more: boolean };

export type WeekRow = {
  week: string;
  opened: number;
  opened_critical: number;
  settled: number;
  open_at_end: number;
  files_observed: number;
  /** حصّة الموثَّق من لقطة الأسبوع (`trust_snapshots`)، و`null` بلا لقطة أو بلا ملفّات. */
  verified_share: number | null;
  /** هل أُخذت لقطةٌ لهذا الأسبوع؟ قبل أوّل لقطة: «لم يُسجَّل»، لا صفر. */
  recorded: boolean;
};
export type TrustWeekly = {
  country: string;
  files: number;
  verified_now: number;
  /** أوّل أسبوعٍ سُجّلت فيه لقطة لهذه الدولة، و`null` قبل أيّ لقطة. */
  recorded_from: string | null;
  weeks: WeekRow[];
};

/** حصّة الأسبوع المسجَّلة وحدها: ما لم يُسجَّل (أو جاء من قاعدةٍ قبل الحزمة) `null`. */
export function weekShare(r: Pick<WeekRow, "recorded" | "verified_share">): number | null {
  return r.recorded === true && typeof r.verified_share === "number" ? r.verified_share : null;
}

/**
 * مقاطع الخطّ: تتابعاتٌ من الأسابيع المسجَّلة بفهارسها، تنقطع عند كل أسبوعٍ
 * لم يُسجَّل، فلا يُوصل خطٌّ فوق فجوة ولا تُختلَق قيمة.
 */
export function shareRuns(values: Array<number | null>): Array<Array<{ i: number; v: number }>> {
  const runs: Array<Array<{ i: number; v: number }>> = [];
  let cur: Array<{ i: number; v: number }> = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) runs.push(cur);
  return runs;
}

/** الحصّة بنسبةٍ صحيحة، و`null` لدولةٍ بلا ملفّات (لا «0٪» مضلِّلة). */
export function shareOf(verified: number, files: number): number | null {
  if (files <= 0) return null;
  // أرضيّة لا تقريب: 3799 من 3800 تُقرأ 99٪ لا «كلّها».
  return Math.floor((verified / files) * 100);
}

export type TeamFlag = "no_team" | "one_supervisor" | "invited_only" | "ok";

/** العينان تحتاجان مشرفَين داخلَين: الأقلّ منهما يُعلَّم. */
export function teamFlag(r: TeamRow): TeamFlag {
  if (r.supervisors + r.data_entry + r.viewers === 0) return "no_team";
  if (r.supervisors < 2) return "one_supervisor";
  if (r.active_supervisors < 2) return "invited_only";
  return "ok";
}

export const AGING_KEYS = ["lt1", "d1_3", "d3_7", "gt7"] as const;
export type AgingKey = (typeof AGING_KEYS)[number];

export const agingTotal = (b: AgingBucket) => b.lt1 + b.d1_3 + b.d3_7 + b.gt7;

export type WeeklyHead = {
  week: string;
  opened: string;
  openedCritical: string;
  settled: string;
  openAtEnd: string;
  filesObserved: string;
  verifiedShare: string;
};

/** ملفّ الأسابيع لدولة: صفٌّ لكل أسبوع بما يُعاد بناؤه من الطوابع، وحصّة اللقطة إن وُجدت. */
export function weeklyCsv(w: TrustWeekly, head: WeeklyHead): string {
  return toCsv(
    w.weeks.map((r) => ({
      [head.week]: r.week,
      [head.opened]: r.opened,
      [head.openedCritical]: r.opened_critical,
      [head.settled]: r.settled,
      [head.openAtEnd]: r.open_at_end,
      [head.filesObserved]: r.files_observed,
      // فارغٌ لما لم يُسجَّل: الخانة الفارغة صادقة، والصفر كذب.
      [head.verifiedShare]: weekShare(r) ?? "",
    })),
  );
}

/** رابط الدولة في «مصادر التحقق» القائمة. */
export const verificationHref = (code: string) =>
  `/admin?tab=data&area=sources&country=${encodeURIComponent(code)}`;
