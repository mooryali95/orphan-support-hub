import { AsyncLocalStorage } from "node:async_hooks";

/**
 * سياق الطلب على الخادم: معرّفه، ووسيلة إبقاء العمل بعد الردّ (waitUntil).
 *
 * يُفتح في src/server.ts لكلّ طلب، فكلّ سطر سجلٍّ أو بلاغ خطأٍ بعده يحمل
 * المعرّف نفسه الذي يجده المستخدم في رسالة الخطأ وفي ترويسة x-request-id.
 * وAsyncLocalStorage متاحة على Workers (TanStack Start تعتمد عليها أصلاً).
 */
export type RequestContext = {
  requestId: string;
  waitUntil?: ((p: Promise<unknown>) => void) | undefined;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * معرّف الطلب: cf-ray من Cloudflare إن وُجد (يربط سجلّنا بسجلّها)، وإلا
 * معرّفٌ جديد. ولا يُقبل من العميل: معرّفٌ يختاره الزائر يُفسد الربط.
 */
export function newRequestId(request: Request): string {
  const ray = request.headers.get("cf-ray");
  if (ray && /^[0-9a-f]{8,32}(-[A-Z]{3})?$/i.test(ray)) return ray;
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
