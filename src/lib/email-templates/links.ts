/**
 * بناء روابط البريد.
 *
 * الرابط في `notifications.link` مسارٌ نسبي (`/dashboard`) لأنه كُتب
 * ليُنقر داخل المنصّة. والبريد يُقرأ خارجها، فالمسار النسبي فيه يقود إلى
 * لا شيء — ولا يظهر العطب في أي فحص واجهة، بل عند أول مستلم.
 *
 * فُصلت هنا لتُفحص وحدها.
 */

/** إزالة الشرطات الأخيرة، فـ`https://x.com/` + `/a` = `//a`. */
export function normalizeBase(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

/**
 * مسارٌ نسبي يصير مطلقاً، ورابطٌ مطلق يبقى كما هو.
 *
 * ويُقبل المطلق لأن بعض الإشعارات قد تشير إلى وجهة خارج المنصّة
 * (إيصال عند مزوّد الدفع مثلاً).
 */
export function resolveEmailLink(base: string, link?: string | null): string {
  const root = normalizeBase(base);
  if (!link) return root;

  const trimmed = link.trim();
  if (!trimmed) return root;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return `${root}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

/** رابط إلغاء الاشتراك برمز صاحبه. */
export function unsubscribeUrl(base: string, token: string): string {
  return `${normalizeBase(base)}/unsubscribe?token=${encodeURIComponent(token)}`;
}
