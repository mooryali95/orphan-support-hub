import { activeReporters, type ErrorReport } from "./error-reporter";
import { currentRequest } from "./request-context";

/**
 * سجلّ الخادم المنظَّم ورسائل الخطأ العامّة (ARC-05 + APP-11).
 *
 * كلّ فشلٍ يُكتب سطرَ JSON واحداً بمعرّف الطلب والحدث والرمز والرسالة الخام
 * (سجلّات Workers / Logpush)، ويُرسل إلى المُبلِّغ إن ضُبط. أمّا المتصفّح
 * والشريك فلا يريان الخام: أسماء القيود والجداول والدوالّ تفصيلٌ داخلي.
 * يريان رسالةً عربية بمرجعٍ يطابق سطر السجلّ.
 *
 * ويُستثنى من التنقية ما كُتب ليُعرض: الرسائل العربية في RAISE EXCEPTION
 * داخل الهجرات، ورموز snake_case التي تفرّعها الواجهة (`last_owner`…).
 */

export type ErrorCode =
  | "conflict"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "unauthenticated"
  | "unavailable"
  | "internal";

export const PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  conflict: "هذا موجودٌ من قبل، أو تغيّر في أثناء طلبك.",
  forbidden: "لا صلاحية لك لهذا الإجراء.",
  invalid_input: "البيانات المُدخلة غير صالحة.",
  not_found: "لم يُعثر على المطلوب.",
  unauthenticated: "انتهت الجلسة. سجّل الدخول من جديد.",
  unavailable: "الخدمة غير متاحة الآن. أعد المحاولة بعد قليل.",
  internal: "تعذّر تنفيذ الطلب.",
};

const SQLSTATE: Array<[RegExp, ErrorCode]> = [
  [/^23505$/, "conflict"],
  [/^40001$|^40P01$/, "conflict"],
  [/^42501$|^PGRST301$/, "forbidden"],
  [/^22|^23/, "invalid_input"],
  [/^P0002$|^PGRST116$/, "not_found"],
  [/^42883$|^42P01$|^42703$|^PGRST202$|^PGRST204$|^PGRST205$/, "unavailable"],
  [/^08|^57|^53/, "unavailable"],
];

const MESSAGE: Array<[RegExp, ErrorCode]> = [
  [/duplicate key|already exists|could not serialize|deadlock/i, "conflict"],
  [/row-level security|permission denied|not authori[sz]ed|insufficient_privilege/i, "forbidden"],
  [/JWT|invalid token|not authenticated|unauthori[sz]ed|auth session missing/i, "unauthenticated"],
  [
    /violates (foreign key|check|not-null)|invalid input|out of range|value too long|malformed|invalid_type|Expected .* received/i,
    "invalid_input",
  ],
  [/schema cache|does not exist|could not find the/i, "unavailable"],
  [/fetch failed|timed? ?out|ECONN|network|socket|503|502/i, "unavailable"],
  [/no rows|not found/i, "not_found"],
];

type ErrLike = { code?: unknown; message?: unknown };

function partsOf(error: unknown): { message: string; sqlstate?: string } {
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    const e = error as ErrLike;
    const message = typeof e.message === "string" ? e.message : String(error);
    const code = typeof e.code === "string" ? e.code : undefined;
    return code ? { message, sqlstate: code } : { message };
  }
  return { message: String(error) };
}

export function classifyError(error: unknown): ErrorCode {
  const { message, sqlstate } = partsOf(error);
  if (sqlstate) for (const [re, code] of SQLSTATE) if (re.test(sqlstate)) return code;
  for (const [re, code] of MESSAGE) if (re.test(message)) return code;
  return "internal";
}

const ARABIC = /[؀-ۿ]/;
const APP_CODE = /^[a-z][a-z0-9_]{2,63}$/;

/** هل كُتبت الرسالة لتُعرض؟ عربيةٌ من هجراتنا، أو رمزٌ تفرّعه الواجهة. */
export function isCuratedMessage(message: string): boolean {
  return ARABIC.test(message) || APP_CODE.test(message.trim());
}

/** الرسالة التي تصل المتصفّح أو الشريك. */
export function publicError(error: unknown, ref: string | null): string {
  const { message } = partsOf(error);
  if (isCuratedMessage(message)) return message;
  const text = PUBLIC_MESSAGES[classifyError(error)];
  return ref ? `${text} (المرجع: ${ref})` : text;
}

/**
 * ينقّي نتيجة دالّة خادمٍ فاشلة ({ ok:false, error }) ويُبقي ما سواها كما هو.
 * يضيف errorCode وerrorRef ليطابق الدعمُ الشكوى بسطر السجلّ.
 */
export function sanitizeFailure<T>(result: T, ref: string | null): T {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;
  if (r["ok"] !== false) return result;
  const raw = r["error"];
  if (typeof raw !== "string" || raw === "") return { ...r, errorRef: ref } as T;
  if (isCuratedMessage(raw)) return { ...r, errorRef: ref } as T;
  return {
    ...r,
    error: publicError(raw, ref),
    errorCode: classifyError(raw),
    errorRef: ref,
  } as T;
}

function emit(level: "error" | "warn" | "info", line: Record<string, unknown>): void {
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

/** سطر سجلٍّ منظَّم لحدثٍ غير خاطئ (تشغيل مجدول، تحذير إعداد…). */
export function logServerEvent(
  level: "info" | "warn",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  emit(level, {
    ts: new Date().toISOString(),
    level,
    event,
    request_id: currentRequest()?.requestId ?? null,
    ...fields,
  });
}

/**
 * يسجّل الفشل ويبلّغ عنه، ويُعيد المرجع (معرّف الطلب) ليُعرض للمستخدم.
 * الرسالة الخام هنا وحدها — لا في الردّ.
 */
export function logServerError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
  level: "error" | "warn" = "error",
): string | null {
  const ctx = currentRequest();
  const { message, sqlstate } = partsOf(error);
  const report: ErrorReport = {
    ts: new Date().toISOString(),
    level,
    event,
    request_id: ctx?.requestId ?? null,
    code: classifyError(error),
    ...(sqlstate ? { sqlstate } : {}),
    message: message.slice(0, 2000),
    ...(error instanceof Error && error.stack ? { stack: error.stack.slice(0, 4000) } : {}),
    ...fields,
  };
  emit(level, report);

  for (const reporter of activeReporters()) {
    try {
      const p = Promise.resolve(reporter(report)).catch(() => {});
      ctx?.waitUntil?.(p);
    } catch {
      // المُبلِّغ لا يُسقط الطلب أبداً.
    }
  }
  return ctx?.requestId ?? null;
}
