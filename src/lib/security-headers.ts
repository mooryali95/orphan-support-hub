/**
 * الرؤوس الأمنية (M1).
 *
 * تُطبَّق في مدخل الخادم فتمرّ بها كل استجابة — صفحةً كانت أو مسار API.
 * ووضعها هناك لا في إعداد الاستضافة مقصود: الإعداد يتبع المنصّة ويضيع عند
 * أي انتقال، وهذا يسافر مع الشيفرة.
 */

/**
 * مصادر السياسة.
 *
 * `'unsafe-inline'` للأنماط ضرورة لا اختيار: Tailwind وTanStack يحقنان
 * أنماطاً مضمَّنة، ومنعها يكسر الصفحة. أما السكربت فلا `unsafe-eval`
 * فيه — وهو الأخطر.
 *
 * والخطوط من أصلنا (src/lib/fonts.ts) فلا نطاق خارجي لها، والصور تحتاج `data:` للصور
 * المضمَّنة و`blob:` لمعاينة ما يرفعه المستخدم قبل إرساله.
 */
/**
 * السكربت (APP-08): أحاديةٌ لكلّ طلب يولّدها src/server.ts وتمرّرها TanStack
 * (router.options.ssr.nonce) إلى كلّ سكربتٍ تكتبه — بيانات الترطيب وسكربتات
 * الصفحة. فلا `'unsafe-inline'`: سكربتٌ محقونٌ بلا الأحادية لا يعمل.
 * و`'self'` للحزم الخارجية من أصلنا. بلا أحادية (ردّ JSON مثلاً) لا يُسمح
 * بسكربتٍ مضمَّن أصلاً. ووضع التطوير وحده يُبقي `'unsafe-inline'` لأدوات
 * المحرّر التي تحقن سكربتاتها.
 */
function scriptSource(nonce: string | null | undefined, allowInline: boolean): string {
  if (allowInline) return "script-src 'self' 'unsafe-inline'";
  return nonce ? `script-src 'self' 'nonce-${nonce}'` : "script-src 'self'";
}

function contentSecurityPolicy(
  supabaseOrigin: string | null,
  nonce?: string | null,
  allowInline = false,
): string {
  const connect = ["'self'", supabaseOrigin, "https://api.creem.io", "https://test-api.creem.io"]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    scriptSource(nonce, allowInline),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${supabaseOrigin ?? ""}`.trim(),
    `connect-src ${connect}`,
    // لا إطارات على الإطلاق: المنصّة لا تُضمّن شيئاً ولا تُضمَّن.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    // النماذج لا تُرسَل إلا إلينا: يمنع نموذجاً محقوناً يسرّب إلى الخارج.
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(
  supabaseUrl: string | undefined,
  nonce?: string | null,
  allowInline = false,
): Record<string, string> {
  let origin: string | null = null;
  try {
    origin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  } catch {
    origin = null;
  }

  return {
    "content-security-policy": contentSecurityPolicy(origin, nonce, allowInline),
    // frame-ancestors تكفي في المتصفّحات الحديثة، وهذا للقديمة منها.
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    // المُحيل لا يُرسل عبر النطاقات: مسارات مثل /orphans/<id> تكشف
    // أن هذا الزائر يطالع ملفّ طفل بعينه.
    "referrer-policy": "strict-origin-when-cross-origin",
    // المنصّة لا تحتاج شيئاً من هذه، فتُغلق كلّها.
    "permissions-policy": [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
    // سنة كاملة مع النطاقات الفرعية: أقلّ من ذلك يترك نافذة للهبوط إلى HTTP.
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "cross-origin-opener-policy": "same-origin",
  };
}

/**
 * صفحة الطفل الواحد ليست للفهرسة (CP-13): اسمه وعمره وحاجته تبقى في
 * خزائن البحث ومعايناته بعد أن تنتهي الموافقة. فلا فهرسة ولا نسخة مخزّنة
 * ولا مقتطف ولا صورة. والوسم نفسه في رأس الصفحة وفي رأس الاستجابة: الأوّل
 * لمن يقرأ HTML، والثاني لمن لا يقرؤه (المعاينات، الصور، الزواحف المستعجلة).
 */
export const CHILD_PAGE_ROBOTS = "noindex, noarchive, nosnippet, noimageindex";

/** `/orphans/<id>` وما تحته — لا الدليل `/orphans` نفسه، فهو المفهرَس. */
function isChildPath(path: string): boolean {
  return /^\/orphans\/[^/]+/.test(path);
}

/**
 * الصفحات العامّة التي يجوز تخزينها (N4). المنع هو الافتراض: ما لم يُذكر هنا
 * لا يُخزَّن، فأيّ صفحةٍ محميّة تُضاف لاحقاً تُحمى دون أن يتذكّرها أحد.
 * الجذر بالضبط، والبقيّة بحدّ المقطع (`/orphans` لا يلتقط `/orphansX`).
 */
export const PUBLIC_CACHEABLE = [
  "/developers",
  "/hall",
  "/how-it-works",
  "/legal",
  "/organizations",
  "/orphans",
  "/support",
  "/traits",
  "/try",
  "/vision",
] as const;

/** ملفّات ثابتة عامّة بأسمائها (الأصول المجزّأة والأيقونات والزواحف). */
const PUBLIC_FILE =
  /^\/(?:assets\/[^/]+|[A-Za-z0-9._-]+\.(?:xml|txt|ico|png|svg|webmanifest|json|js|css|woff2?))$/;

/**
 * المطابقة على حدّ المقطع لا على البادئة.
 *
 * `startsWith("/org")` يلتقط `/orphans` و`/organizations` أيضاً؛ فالمطابقة إمّا
 * على المسار نفسه أو على ما يليه شرطة.
 */
export function isPrivatePath(path: string): boolean {
  if (path.startsWith("/api/")) return true;
  // نتائج دوالّ الخادم (GET) تحمل بيانات المستخدم كما تحملها /api.
  if (path.startsWith("/_serverFn/")) return true;
  if (path === "/" || path === "") return false;
  if (PUBLIC_FILE.test(path)) return false;
  return !PUBLIC_CACHEABLE.some((p) => path === p || path.startsWith(`${p}/`));
}

export function applySecurityHeaders(
  request: Request,
  response: Response,
  nonce?: string | null,
  allowInline = false,
): Response {
  const headers = new Headers(response.headers);

  for (const [k, v] of Object.entries(
    securityHeaders(process.env["SUPABASE_URL"], nonce, allowInline),
  )) {
    // لا يُدهس ما ضبطه المسار عمداً.
    if (!headers.has(k)) headers.set(k, v);
  }

  const path = new URL(request.url).pathname;
  if (isPrivatePath(path)) {
    // صفحات تحمل بيانات طفل أو مالاً: تخزينها في وسيط مشترك تسريب.
    headers.set("cache-control", "no-store, must-revalidate");
  }
  if (isChildPath(path)) headers.set("x-robots-tag", CHILD_PAGE_ROBOTS);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
