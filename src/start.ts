import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// مسارات /lovable/* (ويبهوك البريد والمعاينة) تصادق نفسها بنفسها،
// فلا تمرّ على حراسة CSRF ولا على أي إعادة توجيه.
const isLovableRoute = (request: Request) => new URL(request.url).pathname.startsWith("/lovable/");

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (isLovableRoute(request)) return next();
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn" && !isLovableRoute(ctx.request),
});

/**
 * رصد دوالّ الخادم (ARC-05 + APP-11). كلّ فشلٍ — نتيجة `{ ok: false }` أو
 * استثناء — يُكتب سطراً منظَّماً بمعرّف الطلب واسم الدالّة. ثم يُنقّى ما يصل
 * المتصفّح: رسائل القاعدة الخام (أسماء القيود والجداول) تصير رسالةً عربية
 * بمرجعٍ يطابق السطر؛ وما كُتب ليُعرض (عربيٌّ من الهجرات، أو رمزٌ تفرّعه
 * الواجهة) يمرّ كما هو. التوجيه وnotFound وResponse تمرّ بلا لمس.
 */
const serverFnObservability = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    const { isRedirect, isNotFound } = await import("@tanstack/react-router");
    const log = await import("@/lib/server-log");
    const fn = serverFnMeta?.name ?? "unknown";
    const fields = { fn, file: serverFnMeta?.filename };
    try {
      const out = await next();
      const result = (out as { result?: unknown }).result;
      if (result && typeof result === "object" && (result as { ok?: unknown }).ok === false) {
        const raw = (result as { error?: unknown }).error;
        let ref: string | null;
        if (typeof raw === "string" && raw !== "" && !log.isCuratedMessage(raw)) {
          ref = log.logServerError(`serverFn.${fn}`, raw, fields);
        } else {
          log.logServerEvent("warn", `serverFn.${fn}`, { ...fields, outcome: "ok_false", raw });
          ref = (await import("@/lib/request-context")).currentRequest()?.requestId ?? null;
        }
        return { ...out, result: log.sanitizeFailure(result, ref) } as typeof out;
      }
      return out;
    } catch (error) {
      if (isRedirect(error) || isNotFound(error) || error instanceof Response) throw error;
      const ref = log.logServerError(`serverFn.${fn}`, error, fields);
      const message = error instanceof Error ? error.message : String(error);
      if (log.isCuratedMessage(message)) throw error;
      throw new Error(log.publicError(error, ref));
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [serverFnObservability, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
