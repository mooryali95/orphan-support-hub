/**
 * السجلّ الذهبي — المنطق الخالص (بلا شبكة ولا قاعدة).
 *
 * الندوة مصدرٌ رئيس، ومنصّة التشغيل التي يديرها مكتب الدولة مصدرٌ مؤكِّد. لكل
 * حقلٍ مالكٌ ومؤكِّد ودرجة خطر، كما في `field_authority` (هجرة 20261126100000).
 * القاعدة هي الحارس: تعيد الفحص وتقرّر. هذا الملفّ يقرأ الملف المرفوع، ويُري
 * المشرف ما سيحدث قبل الإرسال، ويسمّي ما تعيده القاعدة.
 */
import { latinDigits, parseCsv, parseDate, parseGender } from "@/lib/data-entry";
import { normalize } from "@/lib/countries";

export type SourceRole = "wamy" | "office";
export type Owner = SourceRole | "platform";
export type Risk = "low" | "medium" | "critical";
export type OfficeMode = "none" | "shadow" | "active";
export type TrustState = "verified" | "single_source" | "conflict" | "stale" | "legacy" | "flagged";
export type FieldGroup =
  "identity" | "eligibility" | "current" | "reports" | "qualification" | "finance";

export type FieldRule = {
  field: string;
  group: FieldGroup;
  owner: Owner;
  verifier: Owner | null;
  risk: Risk;
  /** عناوين الأعمدة المقبولة في ملف الرفع، بالعربية والإنجليزية. */
  headers: readonly string[];
};

/** نسخة الواجهة من `field_authority`؛ يقفل التطابق `golden-record.test`. */
export const FIELD_RULES: readonly FieldRule[] = [
  {
    field: "display_name",
    group: "identity",
    owner: "wamy",
    verifier: "office",
    risk: "medium",
    headers: ["الاسم", "اسم اليتيم", "name"],
  },
  {
    field: "birth_date",
    group: "identity",
    owner: "wamy",
    verifier: "office",
    risk: "critical",
    headers: ["تاريخ الميلاد", "الميلاد", "birth date", "dob"],
  },
  {
    field: "gender",
    group: "identity",
    owner: "wamy",
    verifier: "office",
    risk: "critical",
    headers: ["الجنس", "gender", "sex"],
  },
  {
    field: "country",
    group: "identity",
    owner: "wamy",
    verifier: "office",
    risk: "critical",
    headers: ["رمز الدولة", "country code"],
  },
  {
    field: "program_status",
    group: "eligibility",
    owner: "wamy",
    verifier: "office",
    risk: "critical",
    headers: ["حالة البرنامج", "program status"],
  },
  {
    field: "sponsorship_eligible",
    group: "eligibility",
    owner: "wamy",
    verifier: "office",
    risk: "critical",
    headers: ["مؤهل للكفالة", "eligible"],
  },
  {
    field: "region",
    group: "current",
    owner: "office",
    verifier: "wamy",
    risk: "medium",
    headers: ["المنطقة", "region"],
  },
  {
    field: "city",
    group: "current",
    owner: "office",
    verifier: "wamy",
    risk: "low",
    headers: ["المدينة", "city"],
  },
  {
    field: "education_stage",
    group: "current",
    owner: "office",
    verifier: "wamy",
    risk: "low",
    headers: ["المرحلة الدراسية", "الصف", "education stage", "grade"],
  },
  {
    field: "guardian",
    group: "current",
    owner: "office",
    verifier: "wamy",
    risk: "medium",
    headers: ["الوصي", "guardian"],
  },
  {
    field: "living_situation",
    group: "current",
    owner: "office",
    verifier: "wamy",
    risk: "medium",
    headers: ["السكن", "الوضع المعيشي", "living situation"],
  },
  {
    field: "health_status",
    group: "current",
    owner: "office",
    verifier: "wamy",
    risk: "medium",
    headers: ["الحالة الصحية", "الصحة", "health"],
  },
  {
    field: "progress_report",
    group: "reports",
    owner: "office",
    verifier: null,
    risk: "low",
    headers: ["التقرير", "تقرير التقدم", "progress report"],
  },
  {
    field: "qualification_track",
    group: "qualification",
    owner: "office",
    verifier: "platform",
    risk: "low",
    headers: ["مسار التأهيل", "qualification track"],
  },
  {
    field: "sponsorship",
    group: "finance",
    owner: "platform",
    verifier: "wamy",
    risk: "critical",
    headers: [],
  },
];

const RULE = new Map(FIELD_RULES.map((r) => [r.field, r]));
export const ruleOf = (field: string) => RULE.get(field) ?? null;

/** حقل المكتب يعود للندوة ما لم يكن المكتب «فعّالاً» (golden_effective_owner). */
export function effectiveOwner(owner: Owner, mode: OfficeMode): Owner {
  return owner === "office" && mode !== "active" ? "wamy" : owner;
}

/** الحقول التي يحقّ لمصدرٍ أن يرسلها: مالكاً أو مؤكِّداً، ولا شيء ماليّ. */
export function fieldsFrom(role: SourceRole): FieldRule[] {
  return FIELD_RULES.filter(
    (r) => r.owner !== "platform" && (r.owner === role || r.verifier === role),
  );
}

/** من يحكم كل مجموعةٍ الآن في دولةٍ بوضعها. */
export function authorityNow(
  mode: OfficeMode,
): Array<{ group: FieldGroup; owner: Owner; verifier: Owner | null }> {
  const seen = new Map<FieldGroup, { group: FieldGroup; owner: Owner; verifier: Owner | null }>();
  for (const r of FIELD_RULES) {
    if (seen.has(r.group)) continue;
    const owner = effectiveOwner(r.owner, mode);
    const verifier =
      owner === "wamy" && r.owner === "office"
        ? mode === "shadow"
          ? "office"
          : null
        : mode === "none" && r.verifier === "office"
          ? null
          : r.verifier;
    seen.set(r.group, { group: r.group, owner, verifier });
  }
  return [...seen.values()];
}

/* ── ملف الرفع ─────────────────────────────────────────────────── */

const REF_HEADERS = ["المعرف", "رقم الملف", "المعرف الخارجي", "external ref", "external_ref", "id"];
const AT_HEADERS = ["تاريخ الرصد", "تاريخ التحديث", "observed at", "observed_at", "updated at"];
const HEADER_INDEX = new Map<string, string>();
for (const h of REF_HEADERS) HEADER_INDEX.set(normalize(h), "external_ref");
for (const h of AT_HEADERS) HEADER_INDEX.set(normalize(h), "observed_at");
for (const r of FIELD_RULES) {
  HEADER_INDEX.set(normalize(r.field), r.field);
  for (const h of r.headers) HEADER_INDEX.set(normalize(h), r.field);
}

export type GoldenRecord = {
  external_ref: string;
  observed_at?: string;
  fields: Record<string, string | boolean>;
};

export type GoldenSheet = {
  records: GoldenRecord[];
  /** أعمدةٌ لم تُعرف، أو حقولٌ لا يرسلها هذا المصدر. */
  ignored: string[];
  /** الحقول التي سيُرسلها الملف. */
  fields: string[];
  /** أسطرٌ بلا معرّف (رقم السطر في الملف، والعناوين سطر 1). */
  missingRef: number[];
  /** أسطرٌ بقيمٍ لا تُقرأ: حقلها ورقم السطر. */
  invalid: Array<{ line: number; field: string }>;
};

export const MAX_GOLDEN_ROWS = 2000;

function cellValue(field: string, raw: string): string | boolean | null {
  const v = raw.trim();
  if (!v) return null;
  if (field === "birth_date") return parseDate(v);
  if (field === "gender") return parseGender(v);
  if (field === "country") return /^[a-z]{2}$/i.test(v) ? v.toUpperCase() : null;
  if (field === "sponsorship_eligible") {
    const k = normalize(v);
    if (["نعم", "yes", "true", "1"].map(normalize).includes(k)) return true;
    if (["لا", "no", "false", "0"].map(normalize).includes(k)) return false;
    return null;
  }
  if (field === "program_status") {
    const k = normalize(v);
    const map: Record<string, string> = {
      [normalize("نشط")]: "active",
      active: "active",
      [normalize("موقوف")]: "suspended",
      suspended: "suspended",
      [normalize("خرج")]: "exited",
      [normalize("خارج البرنامج")]: "exited",
      exited: "exited",
    };
    return map[k] ?? null;
  }
  return v.slice(0, field === "progress_report" ? 4000 : 200);
}

/** نصّ CSV ← سجلّاتٌ لمصدرٍ واحد. الحقل الذي لا يرسله المصدر يُتجاهل ويُسمّى. */
export function readGoldenSheet(input: string, role: SourceRole): GoldenSheet {
  const [header, ...body] = parseCsv(input);
  const allowed = new Set(fieldsFrom(role).map((r) => r.field));
  const out: GoldenSheet = { records: [], ignored: [], fields: [], missingRef: [], invalid: [] };
  if (!header) return out;
  const cols = header.map((h) => {
    const key = HEADER_INDEX.get(normalize(h)) ?? null;
    if (key === "external_ref" || key === "observed_at") return key;
    if (key && allowed.has(key)) return key;
    if (h) out.ignored.push(h);
    return null;
  });
  out.fields = [
    ...new Set(cols.filter((c): c is string => !!c && c !== "external_ref" && c !== "observed_at")),
  ];
  body.forEach((cells, i) => {
    const line = i + 2;
    const rec: GoldenRecord = { external_ref: "", fields: {} };
    cols.forEach((col, j) => {
      const raw = latinDigits(cells[j] ?? "");
      if (!col || !raw.trim()) return;
      if (col === "external_ref") rec.external_ref ||= raw.trim().slice(0, 120);
      else if (col === "observed_at") {
        const d = parseDate(raw);
        if (d) rec.observed_at = `${d}T00:00:00Z`;
        else out.invalid.push({ line, field: col });
      } else if (rec.fields[col] === undefined) {
        const v = cellValue(col, raw);
        if (v === null) out.invalid.push({ line, field: col });
        else rec.fields[col] = v;
      }
    });
    if (!rec.external_ref) out.missingRef.push(line);
    else if (Object.keys(rec.fields).length > 0) out.records.push(rec);
  });
  return out;
}

/** قالب الرفع لمصدر: معرّفٌ وتاريخ رصد ثم حقوله، بعناوين عربية. */
export function goldenTemplate(role: SourceRole): string {
  const cols = ["المعرف", "تاريخ الرصد", ...fieldsFrom(role).map((r) => r.headers[0] ?? r.field)];
  return `\uFEFF${cols.join(",")}\n`;
}

/* ── ما تعيده القاعدة ─────────────────────────────────────────── */

export type CountryHealth = {
  code: string;
  name_ar: string;
  status: string;
  office_source: string | null;
  office_mode: OfficeMode;
  stale_after_days: number;
  platforms: Array<{ key: string; name: string }>;
  trust: Record<TrustState, number>;
  conflicts: { critical: number; other: number };
  alerts: { critical: number; warning: number; info: number };
  link_pending: number;
  last_wamy: string | null;
  last_office: string | null;
};

/** قيمة حقلٍ كما تحفظها القاعدة (JSONB بسيط). */
export type FieldValue = string | number | boolean | null;

/** صفحة الطوابير: كم بنداً في كلّ طلب، والمؤشّر الذي يحمله آخر بندٍ لطلب ما بعده. */
export const QUEUE_PAGE = 20;
export type QueueCursor = { k: number; at: string; id: string };
/** المؤشّر بعد صفحةٍ وصلت، أو `null` إن كانت الأخيرة (أقصر من حجمها أو بلا مؤشّر). */
export function nextCursor(
  page: ReadonlyArray<{ cursor?: QueueCursor | null }>,
  size: number = QUEUE_PAGE,
): QueueCursor | null {
  return page.length >= size ? (page[page.length - 1]?.cursor ?? null) : null;
}

export type Conflict = {
  cursor?: QueueCursor;
  id: string;
  orphan_id: string;
  code: string;
  name: string;
  country: string;
  field: string;
  field_group: FieldGroup;
  kind: "disagreement" | "critical_change" | "held_locked";
  risk: Risk;
  current: FieldValue;
  proposed: FieldValue;
  wamy: FieldValue;
  office: FieldValue;
  created_at: string;
};

export type AlertSignal =
  | "hidden_characters"
  | "mixed_script"
  | "cosmetic_change"
  | "subtle_edit"
  | "age_shift"
  | "flip_flop"
  | "change_after_sponsorship"
  | "possible_duplicate"
  | "bulk_change";

export type DataAlert = {
  cursor?: QueueCursor;
  id: string;
  orphan_id: string | null;
  code: string | null;
  name: string | null;
  country: string;
  field: string;
  signal: AlertSignal;
  severity: "info" | "warning" | "critical";
  role: SourceRole | null;
  source: string | null;
  detail: Record<string, string | number | boolean | null>;
  hits: number;
  created_at: string;
  updated_at: string;
};

/** شارة الكافل كما تعيدها `public_verification`: لا حقول ولا أسباب. */
export type PublicVerification = {
  level: "two_sources" | "primary_source" | "under_review";
  /** يقبل كفالةً جديدة الآن (`golden_accepts_new_support`، الحارس نفسه على الإدراج). */
  accepts: boolean;
  verified_month: string | null;
};

export type LinkItem = {
  cursor?: QueueCursor;
  id: string;
  role: SourceRole;
  source: string;
  external_ref: string;
  country: string;
  name: string | null;
  birth_date: string | null;
  gender: string | null;
  created_at: string;
  candidates: Array<{
    id: string;
    code: string;
    name: string;
    birth_date: string | null;
    region: string | null;
  }>;
};

export type IngestResult = {
  ok: true;
  observed: number;
  unlinked: number;
  skipped_count: number;
  skipped: Array<{ index: number; ref: string | null; field?: string; reason: string }>;
  open_conflicts: number;
};

/** نسبة الملفّات الموثّقة من الملفّات المُدارة (بلا الإرث الذي سبق الطبقة). */
export function verifiedShare(trust: Record<TrustState, number>): number | null {
  const managed =
    trust.verified + trust.single_source + trust.conflict + trust.stale + trust.flagged;
  return managed === 0 ? null : Math.round((trust.verified / managed) * 100);
}

/** القيمة كما تُعرض: نصٌّ، أو نعم/لا، أو شرطة غياب. */
export function showValue(
  v: FieldValue | undefined,
  yes: string,
  no: string,
  none: string,
): string {
  if (v === null || v === undefined || v === "") return none;
  if (typeof v === "boolean") return v ? yes : no;
  return String(v);
}

/* ── صلاحيات الدول (country_staff) ───────────────────────────── */

export type CountryRole = "supervisor" | "data_entry" | "viewer";
export type CountryNeed = "read" | "import" | "upload" | "approve" | "manage";

/** ما يعيده `my_country_access`: الإدارة، أو أدوار الدول. */
export type CountryAccess = {
  admin: boolean;
  countries: Array<{ code: string; name_ar: string; role: CountryRole }>;
};

export const ADMIN_ACCESS: CountryAccess = { admin: true, countries: [] };

/**
 * نسخة الواجهة من `country_can`: تُخفي ما لا يحقّ، والقاعدة تحرس. (العينان
 * وجلسة aal2 تفحصهما القاعدة وحدها.)
 */
export function canDo(access: CountryAccess, country: string, need: CountryNeed): boolean {
  if (access.admin) return true;
  const role = access.countries.find((c) => c.code === country)?.role;
  if (!role) return false;
  if (need === "read") return true;
  if (need === "import" || need === "upload") return role === "supervisor" || role === "data_entry";
  return role === "supervisor";
}

/** الأدوار التي يمنحها صاحب الصلاحية: الإدارة كلّها، والمشرف ما دونه. */
export function grantableRoles(access: CountryAccess, country: string): CountryRole[] {
  if (access.admin) return ["supervisor", "data_entry", "viewer"];
  return canDo(access, country, "manage") ? ["data_entry", "viewer"] : [];
}

export type StaffMember = {
  user_id: string;
  email: string;
  role: CountryRole;
  /** دُعي ولم يدخل بعد */
  pending?: boolean;
  created_at: string;
};

/* ── مركز عمل الفريق: الحسم الجماعي، والبحث، وملف الطفل ─────────── */

/** خيارات الحسم الجماعي: لا «قبول» ولا قيمة يدوية، والقاعدة ترفض غيرها. */
export type BulkChoice = "use_wamy" | "use_office" | "keep";
/** حدّ الدفعة الواحدة، كما في `admin_conflicts_resolve_bulk`. */
export const MAX_BULK = 200;

/** يُحسم جماعياً: فرقٌ بين المصدرين غير حرج. الحرج واحداً واحداً بعينين، دائماً. */
export function bulkEligible(d: Pick<Conflict, "kind" | "risk">): boolean {
  return d.kind === "disagreement" && d.risk !== "critical";
}

export type BulkResult = {
  ok: true;
  done: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; code: string | null }>;
};

/** أشيع سبب رفضٍ في دفعة، ليُسمّى مرةً لا مئة. */
export function topFailure(r: BulkResult): string | null {
  const n = new Map<string, number>();
  for (const x of r.results) {
    if (x.ok) continue;
    const k = x.code ?? "failed";
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** مفتاح بحثٍ يتسامح مع الهمزات والتشكيل وحالة الحروف والأرقام الهندية. */
export function searchKey(s: string): string {
  return normalize(latinDigits(s));
}

/** هل يطابق البندُ البحث (رمز الطفل، أو اسمه، أو معرّفه الخارجي)؟ */
export function matchesQuery(q: string, ...hay: Array<string | null | undefined>): boolean {
  const k = searchKey(q);
  if (!k) return true;
  return hay.some((h) => !!h && searchKey(h).includes(k));
}

/** أسطر الملف المرفوع ومشكلاتها، مرتّبةً بالسطر: ما يراه المدخل قبل الإرسال. */
export type RowIssue = { line: number; missingRef: boolean; fields: string[] };
export function rowIssues(sheet: GoldenSheet): RowIssue[] {
  const by = new Map<number, RowIssue>();
  const at = (line: number) => {
    let r = by.get(line);
    if (!r) by.set(line, (r = { line, missingRef: false, fields: [] }));
    return r;
  };
  for (const line of sheet.missingRef) at(line).missingRef = true;
  for (const x of sheet.invalid) at(x.line).fields.push(x.field);
  return [...by.values()].sort((a, b) => a.line - b.line);
}

export type Observation = { value: FieldValue; observed_at: string; source: string } | null;

export type ChildFileField = {
  field: string;
  field_group: FieldGroup;
  risk: Risk;
  owner: Owner;
  value: FieldValue;
  from_role: SourceRole | "manual" | null;
  applied_at: string | null;
  pinned: boolean;
  wamy: Observation;
  office: Observation;
  open_conflict: boolean;
};

export type ChildFileEvent = {
  field: string;
  role: SourceRole;
  source: string;
  value: FieldValue;
  was: FieldValue;
  changed: boolean;
  observed_at: string;
  received_at: string;
};

/** ما يعيده `country_child_file`: بلا صور ولا مواقع، بنطاق الدولة. */
export type ChildFile = {
  id: string;
  code: string;
  name: string;
  country: string;
  status: string;
  trust: TrustState | null;
  office_mode: OfficeMode;
  fields: ChildFileField[];
  history: ChildFileEvent[];
};

/** تاريخ الحقل: ما غيّر القيمة فقط، الأحدث أولاً. */
export function changesOf(file: ChildFile, field: string): ChildFileEvent[] {
  return file.history.filter((h) => h.field === field && h.changed);
}

/** هل يختلف المصدران على هذا الحقل الآن (بعد التطبيع)؟ */
export function sourcesDiffer(f: ChildFileField): boolean {
  if (!f.wamy || !f.office) return false;
  const a = f.wamy.value;
  const b = f.office.value;
  return typeof a === "string" && typeof b === "string" ? searchKey(a) !== searchKey(b) : a !== b;
}
