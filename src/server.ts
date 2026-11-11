import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders } from "./lib/security-headers";
import { newRequestId, runWithRequestContext } from "./lib/request-context";
import { logServerError } from "./lib/server-log";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  logServerError(
    "ssr.swallowed",
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

type WaitUntilCtx = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

let configChecked = false;

/**
 * التحقّق من الإعداد عند أوّل طلب (ARC-12): Workers لا تملك لحظة إقلاعٍ تقرأ
 * البيئة قبلها. النقص يُكتب سطراً واحداً بالأسماء لا بالقيم، ويظهر في
 * /api/ops/health؛ وكلّ ميزةٍ ناقصة تتوقّف عند بابها لا هنا.
 */
async function checkConfigOnce(): Promise<void> {
  if (configChecked) return;
  configChecked = true;
  const { serverConfig } = await import("./lib/env.server");
  const c = serverConfig();
  const missing = Object.entries(c.features)
    .filter(([, f]) => !f.ready)
    .map(([k, f]) => `${k}: ${f.missing.join(",")}`);
  if (c.errors.length > 0) {
    logServerError("config.invalid", new Error(c.errors.join("; ")), { features_off: missing });
  } else if (missing.length > 0) {
    const { logServerEvent } = await import("./lib/server-log");
    logServerEvent("warn", "config.features_off", { features_off: missing });
  }
}

function withRequestId(response: Response, requestId: string): Response {
  if (response.headers.has("x-request-id")) return response;
  try {
    response.headers.set("x-request-id", requestId);
    return response;
  } catch {
    // ترويساتٌ غير قابلة للتعديل (استجابة fetch مُمرَّرة): نسخةٌ جديدة.
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = newRequestId(request);
    const waitUntilCtx = ctx as WaitUntilCtx;
    return runWithRequestContext(
      {
        requestId,
        waitUntil: waitUntilCtx?.waitUntil ? (p) => waitUntilCtx.waitUntil!(p) : undefined,
      },
      async () => withRequestId(await handle(request, env, ctx), requestId),
    );
  },
};

async function handle(request: Request, env: unknown, ctx: unknown): Promise<Response> {
  await checkConfigOnce();
  try {
    const handler = await getServerEntry();
    const response = await handler.fetch(request, env, ctx);
    const normalised = await normalizeCatastrophicSsrResponse(response);
    // كل استجابة تمرّ من هنا، فالرؤوس تُطبَّق مرّة واحدة على الجميع
    // بدل تكرارها في كل مسار — والتكرار يعني نسياناً في مسار ما.
    return applySecurityHeaders(request, normalised);
  } catch (error) {
    logServerError("request.unhandled", error, { path: new URL(request.url).pathname });
    return applySecurityHeaders(
      request,
      new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
}
