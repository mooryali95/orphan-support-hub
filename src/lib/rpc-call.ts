import { isMissingObject } from "@/lib/data-entry";

/**
 * نداء دوالّ القاعدة بلا أنواعٍ مولَّدة لها، وترجمة نتيجتها إلى شكلٍ واحد.
 *
 * - خطأ القاعدة: `missing` إن لم تُطبَّق الهجرة بعد، ورمزٌ قصير يمرّ كما هو،
 *   وما عداه `failed` فلا تتسرّب رسائل القاعدة إلى الواجهة.
 * - الدوالّ تعيد `{ ok:false, code }` لرفضٍ مفهوم؛ يُسمّى ولا يُخفى.
 */

export type DbError = { message: string; code?: string | null };

export type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: DbError | null }>;
};

export type RpcFailure = { ok: false; missing: boolean; error: string };
export type RpcResult<T> = { ok: true; data: T } | RpcFailure;

/** نافذة `rpc` على عميلٍ لا تعرف أنواعه الدالّة المطلوبة. */
export function untypedRpc(client: unknown): Rpc {
  return client as Rpc;
}

export async function callRpc<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const { data, error } = await untypedRpc(client).rpc(fn, args);
  if (error) {
    return {
      ok: false,
      missing: isMissingObject(error),
      error: /^[a-z_]{3,40}$/.test(error.message) ? error.message : "failed",
    };
  }
  const d = data as { ok?: boolean; code?: string } | null;
  if (d && d.ok === false) return { ok: false, missing: false, error: d.code ?? "failed" };
  return { ok: true, data: data as T };
}
