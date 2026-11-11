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
  /** أحادية CSP لهذا الطلب (APP-08). */
  nonce?: string | undefined;
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

/** أحاديةٌ عشوائية ١٢٨ بت بترميز base64 — لكلّ طلبٍ واحدة. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * الموجّه (src/router.tsx) يُبنى في الخادم والمتصفّح معاً، فلا يستورد هذه
 * الوحدة (node:async_hooks). يقرأ الأحادية من هذا الموصّل على globalThis، وهو
 * لا يُضبط إلا في الخادم ويقرأ سياق الطلب الجاري — فلا تتسرّب بين طلبين.
 */
export const NONCE_ACCESSOR = "__iocoCspNonce";
export function installNonceAccessor(): void {
  (globalThis as Record<string, unknown>)[NONCE_ACCESSOR] = () => storage.getStore()?.nonce;
}
