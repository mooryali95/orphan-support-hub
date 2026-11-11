import { currentRequest } from "@/lib/request-context";

/**
 * نبض «الرجل الميّت» (ARC-06): مسارات المجدول تنقر رابط مراقبٍ خارجي
 * (healthchecks.io أو Better Stack أو ما يقبل GET) بعد كلّ تشغيل. فإن مات
 * المجدول أو التطبيق انقطع النبض، ونبّه المراقب من خارج المنصّة — وهو ما لا
 * يستطيعه تنبيهٌ يسكن داخلها.
 *
 * الرابط من البيئة (HEARTBEAT_URL_OPS / HEARTBEAT_URL_DISPATCH / HEARTBEAT_URL_RECONCILE)؛ بلاه لا شيء.
 * والفشل يُرسل إلى `<url>/fail` (اصطلاح healthchecks.io). ولا يُسقط النبضُ
 * المسارَ أبداً.
 */
export function pingHeartbeat(
  name: "HEARTBEAT_URL_OPS" | "HEARTBEAT_URL_DISPATCH" | "HEARTBEAT_URL_RECONCILE",
  ok: boolean,
): void {
  const url = process.env[name]?.trim();
  if (!url) return;
  const target = ok ? url : `${url.replace(/\/+$/, "")}/fail`;
  const p = fetch(target, { method: "GET" }).then(
    () => undefined,
    () => undefined,
  );
  currentRequest()?.waitUntil?.(p);
}
