/**
 * فحص دفعة المرآة قبل أن تبلغ القاعدة.
 *
 * `mirror_apply` يحوّل النصوص إلى أعدادٍ وتواريخ داخل القاعدة. قيمةٌ واحدة لا
 * تتحوّل (عمرٌ «تسع»، تاريخٌ مشوّه، درجةٌ فوق سقفها) تُسقط الدفعة كلّها بخطأ
 * قاعدةٍ لا يقول للمُرسِل أيّ سجلٍّ ولا أيّ حقل — فيعيد المحاولة إلى ما لا نهاية.
 * هنا يُردّ الخطأ قبل القاعدة برمزٍ ثابت وموضعٍ محدّد، ولا يُطبَّق من الدفعة شيء.
 *
 * ما لا يفحصه هذا الملف عمداً: المراجع غير المحلولة (طالبٌ أو سمةٌ لم تصل
 * بعد) والسجلّ بلا `external_ref` — تلك يتخطّاها `mirror_apply` ويذكرها في
 * `skipped`، والدفعة تمضي.
 *
 * الملف يبدأ بـ«-» كي لا يعدّه الموجّه مساراً.
 */

export type MirrorEntity = "groups" | "students" | "trait_dimensions" | "traits" | "trait_scores";

export type RecordIssue = {
  /** موضع السجلّ في `records` (من صفر)؛ -1 لما هو خارجها */
  index: number;
  /** `external_ref` إن عُرف، ليجد المُرسِل سجلّه */
  ref: string | null;
  field: string;
  reason:
    | "not_an_object"
    | "not_an_integer"
    | "not_a_number"
    | "not_a_timestamp"
    | "not_text"
    | "out_of_range"
    | "above_scale_max"
    | "label_required";
};

/** أقصى ما يُعاد من الأخطاء: يكفي المُرسِل ليصلح، ولا يُضخّم الردّ. */
export const MAX_ISSUES = 20;
/** سقف العمر المقبول: فوقه خطأ إدخالٍ لا طفل. */
export const MAX_AGE = 40;
/** سقف الدرجة الافتراضي في `mirror_apply` حين يغيب `scale_max`. */
export const DEFAULT_SCALE_MAX = 100;

const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2})(?::?(\d{2}))?)?)?$/;

/** غائبٌ كما تراه القاعدة: `NULLIF(_r->>'x', '')`. */
const absent = (v: unknown) => v === undefined || v === null || v === "";

/** نصّ القيمة كما يقرؤه `->>` في القاعدة؛ null لما ليس نصّاً ولا عدداً. */
function scalar(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * ISO 8601 بتاريخٍ موجود: التاريخ وحده، أو معه وقتٌ وإزاحة (`Z`، `+02`، `+02:00`).
 * يُفحص بالأجزاء لا بـ`Date.parse`: ذاك يقبل 31 فبراير ويزحلقه، ويرفض `+02`
 * التي تقبلها القاعدة.
 */
export function isIsoTimestamp(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = ISO_TIMESTAMP.exec(v.trim());
  if (!m) return false;
  const [y, mo, d, h, mi, sec, oh, om] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  if (h! > 23 || mi! > 59 || sec! > 59 || oh! > 15 || om! > 59) return false;
  const probe = new Date(Date.UTC(y!, mo! - 1, d!));
  return (
    y! >= 1900 &&
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo! - 1 &&
    probe.getUTCDate() === d
  );
}

function integer(v: unknown): number | null {
  const s = scalar(v);
  return s !== null && /^[+-]?\d{1,9}$/.test(s) ? Number(s) : null;
}

function numeric(v: unknown): number | null {
  const s = scalar(v);
  if (s === null || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * يفحص السجلّات، ويُعيد ما يمنع تطبيق الدفعة (فارغٌ = سليمة).
 * كل قاعدةٍ هنا تقابل تحويلاً أو قيداً في `mirror_apply` وجداوله.
 */
export function validateMirrorRecords(entity: MirrorEntity, records: unknown[]): RecordIssue[] {
  const issues: RecordIssue[] = [];
  const add = (index: number, ref: string | null, field: string, reason: RecordIssue["reason"]) => {
    if (issues.length < MAX_ISSUES) issues.push({ index, ref, field, reason });
  };

  records.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      add(index, null, "", "not_an_object");
      return;
    }
    const r = raw as Record<string, unknown>;
    const ref = scalar(r["external_ref"]) ?? scalar(r["key"]);
    const int = (field: string, min: number, max: number) => {
      if (absent(r[field])) return;
      const n = integer(r[field]);
      if (n === null) add(index, ref, field, "not_an_integer");
      else if (n < min || n > max) add(index, ref, field, "out_of_range");
    };
    const stamp = (field: string) => {
      if (!absent(r[field]) && !isIsoTimestamp(r[field])) add(index, ref, field, "not_a_timestamp");
    };
    // المراجع تُقرأ نصّاً في القاعدة؛ كائنٌ أو مصفوفة مكانها يصير نصّاً لا يطابق شيئاً.
    for (const field of ["external_ref", "key", "group_ref", "student_ref", "trait_ref"]) {
      if (!absent(r[field]) && scalar(r[field]) === null) add(index, ref, field, "not_text");
    }

    switch (entity) {
      case "groups":
        stamp("updated_at");
        break;
      case "students":
        int("age", 0, MAX_AGE);
        break;
      case "trait_dimensions":
        int("sort_order", -100_000, 100_000);
        // الاسم إلزامي في الجدول، وبديله `key`؛ سجلٌّ بـexternal_ref وحده يُسقط الدفعة.
        if (absent(r["label_ar"]) && absent(r["key"]))
          add(index, ref, "label_ar", "label_required");
        break;
      case "traits":
        int("sort_order", -100_000, 100_000);
        break;
      case "trait_scores": {
        stamp("observed_at");
        const max = absent(r["scale_max"]) ? DEFAULT_SCALE_MAX : numeric(r["scale_max"]);
        if (max === null) add(index, ref, "scale_max", "not_a_number");
        else if (max <= 0) add(index, ref, "scale_max", "out_of_range");
        if (!absent(r["score"])) {
          const score = numeric(r["score"]);
          if (score === null) add(index, ref, "score", "not_a_number");
          else if (score < 0) add(index, ref, "score", "out_of_range");
          else if (max !== null && max > 0 && score > max)
            add(index, ref, "score", "above_scale_max");
        }
        break;
      }
    }
  });
  return issues;
}

/** المعرّفات في `deleted` و`reconcile` نصوصٌ أو أعداد؛ غيرها يصير نصّاً لا يطابق شيئاً. */
export function invalidRefs(refs: unknown[]): number[] {
  const bad: number[] = [];
  refs.forEach((v, i) => {
    const s = scalar(v);
    if ((s === null || s === "") && bad.length < MAX_ISSUES) bad.push(i);
  });
  return bad;
}

/** `cursor.at` يُحوَّل إلى وقتٍ في القاعدة؛ غيابه مقبول. */
export function cursorIssue(cursor: unknown): RecordIssue | null {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== "object" || Array.isArray(cursor))
    return { index: -1, ref: null, field: "cursor", reason: "not_an_object" };
  const c = cursor as Record<string, unknown>;
  if (!absent(c["at"]) && !isIsoTimestamp(c["at"]))
    return { index: -1, ref: null, field: "cursor.at", reason: "not_a_timestamp" };
  if (!absent(c["ref"]) && scalar(c["ref"]) === null)
    return { index: -1, ref: null, field: "cursor.ref", reason: "not_text" };
  return null;
}

/**
 * طلبٌ للحارس بلا `Idempotency-Key`.
 *
 * حارس الإعادة يترك الكتابة التي تحمل مفتاح تكرار لمن يحجز المفتاح (بوّابة
 * الاستيراد). بوّابة المرآة لا تحجز مفاتيح تكرار، فلو مرّت الترويسة كما هي
 * لأسقطت الحارس: دفعةٌ ملتقَطة تُعاد داخل نافذة الختم، فتردّ قياساً أحدث إلى
 * قيمته الأقدم. بنزعها تأخذ الدفعة بصمة الطلب (أو `X-Api-Nonce`) كأيّ كتابة.
 */
export function withoutIdempotencyKey(request: Request): Request {
  if (!request.headers.has("idempotency-key")) return request;
  const headers = new Headers(request.headers);
  headers.delete("idempotency-key");
  return new Request(request.url, { method: request.method, headers });
}
