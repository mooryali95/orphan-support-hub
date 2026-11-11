/**
 * مُبلِّغ الأخطاء — قابلٌ للتبديل، ولا يربط المنصّة بمزوّد (ARC-05).
 *
 * السجلّ المنظَّم (server-log.ts) يذهب إلى سجلّات Workers دائماً، وتلتقطها
 * Logpush إلى أيّ مخزن. وفوق ذلك، إن ضُبط متغيّرٌ هنا، يُرسل كلّ خطأٍ إلى:
 *
 *   ERROR_REPORT_WEBHOOK_URL  — JSON بسيط بـPOST (أيّ مستقبِل: Slack/Discord
 *                               عبر وسيط، أو خدمة سجلّاتٍ تقبل HTTP)
 *   SENTRY_DSN                — حدثٌ بصيغة Sentry envelope، بلا SDK
 *
 * بلا أيٍّ منهما لا يُرسل شيء. والإرسال لا يُسقط الطلب أبداً، ويُبقى حيّاً
 * بعد الردّ بـwaitUntil.
 */

export type ErrorReport = {
  ts: string;
  level: "error" | "warn";
  event: string;
  request_id: string | null;
  code: string;
  message: string;
  sqlstate?: string;
  [k: string]: unknown;
};

export type ErrorReporter = (report: ErrorReport) => Promise<void> | void;

export function parseSentryDsn(dsn: string): { endpoint: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !project || !/^\d+$/.test(project.split("/").pop() ?? "")) return null;
    const id = project.split("/").pop();
    const prefix = project.split("/").slice(0, -1).join("/");
    return {
      endpoint: `${u.protocol}//${u.host}/${prefix ? `${prefix}/` : ""}api/${id}/envelope/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

function webhookReporter(url: string): ErrorReporter {
  return async (report) => {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
    });
  };
}

function sentryReporter(dsn: string): ErrorReporter | null {
  const target = parseSentryDsn(dsn);
  if (!target) return null;
  return async (report) => {
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: report.ts,
      platform: "javascript",
      level: report.level === "warn" ? "warning" : "error",
      logger: report.event,
      message: { formatted: `${report.event}: ${report.message}` },
      tags: { code: report.code, request_id: report.request_id ?? "" },
      extra: report,
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=ioco/1`,
      },
      body,
    });
  };
}

export function reportersFromEnv(env: Record<string, string | undefined>): ErrorReporter[] {
  const out: ErrorReporter[] = [];
  const hook = env["ERROR_REPORT_WEBHOOK_URL"]?.trim();
  if (hook) out.push(webhookReporter(hook));
  const dsn = env["SENTRY_DSN"]?.trim();
  if (dsn) {
    const s = sentryReporter(dsn);
    if (s) out.push(s);
  }
  return out;
}

let override: ErrorReporter[] | null = null;
let fromEnv: ErrorReporter[] | null = null;

/** للاختبار أو لربط مُبلِّغٍ آخر برمجياً؛ null يعيد القراءة من البيئة. */
export function setErrorReporters(reporters: ErrorReporter[] | null): void {
  override = reporters;
  fromEnv = null;
}

export function activeReporters(): ErrorReporter[] {
  if (override) return override;
  if (!fromEnv) fromEnv = reportersFromEnv(process.env as Record<string, string | undefined>);
  return fromEnv;
}
