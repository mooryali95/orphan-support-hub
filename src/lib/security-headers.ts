/**
 * الرؤوس الأمنية (M1).
 *
 * تُطبَّق في مدخل الخادم فتمرّ بها كل استجابة — صفحةً كانت أو مسار API.
 * ووضعها هناك لا في إعداد الاستضافة مقصود: الإعداد يتبع المنصة ويضيع عند
 * أي انتقال، وهذا يسافر مع الشيفرة.
 */

/**
 * مصادر السياسة.
 *
 * `'unsafe-inline'` للأنماط ضرورة لا اختيار: Tailwind وTanStack يحقنان
 * أنماطاً مضمَّنة، ومنعها يكسر الصفحة. أما السكربت فلا `unsafe-eval`
 * فيه — وهو الأخطر.
 *
 * والخطوط من Google تحتاج نطاقيها صراحةً، والصور تحتاج `data:` للصور
 * المضمَّنة و`blob:` لمعاينة ما يرفعه المستخدم قبل إرساله.
 */
function contentSecurityPolicy(supabaseOrigin: string | null): string {
  const connect = ["'self'", supabaseOrigin, "https://api.creem.io", "https://test-api.creem.io"]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    // 'unsafe-inline' للسكربت لازم لبيانات الترطيب التي تحقنها TanStack.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${supabaseOrigin ?? ""}`.trim(),
    `connect-src ${connect}`,
    // لا إطارات على الإطلاق: المنصة لا تُضمّن شيئاً ولا تُضمَّن.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    // النماذج لا تُرسَل إلا إلينا: يمنع نموذجاً محقوناً يسرّب إلى الخارج.
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(supabaseUrl: string | undefined): Record<string, string> {
  let origin: string | null = null;
  try {
    origin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  } catch {
    origin = null;
  }

  return {
    "content-security-policy": contentSecurityPolicy(origin),
    // frame-ancestors تكفي في المتصفّحات الحديثة، وهذا للقديمة منها.
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    // المُحيل لا يُرسل عبر النطاقات: مسارات مثل /orphans/<id> تكشف
    // أن هذا الزائر يطالع ملف طفل بعينه.
    "referrer-policy": "strict-origin-when-cross-origin",
    // المنصة لا تحتاج شيئاً من هذه، فتُغلق كلّها.
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

/** المسارات التي لا يجوز أن تُخزَّن في وسيط أو متصفّح. */
const NO_STORE = ["/dashboard", "/admin", "/org", "/guardian", "/auth"];

/**
 * المطابقة على حدّ المقطع لا على البادئة.
 *
 * `startsWith("/org")` يلتقط `/orphans` و`/organizations` أيضاً — وهما
 * صفحتان عامّتان يُراد تخزينهما. فالمطابقة إمّا على المسار نفسه أو على
 * ما يليه شرطة.
 */
function isPrivatePath(path: string): boolean {
  if (path.startsWith("/api/")) return true;
  return NO_STORE.some((p) => path === p || path.startsWith(`${p}/`));
}

export function applySecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [k, v] of Object.entries(securityHeaders(process.env["SUPABASE_URL"]))) {
    // لا يُدهس ما ضبطه المسار عمداً.
    if (!headers.has(k)) headers.set(k, v);
  }

  const path = new URL(request.url).pathname;
  if (isPrivatePath(path)) {
    // صفحات تحمل بيانات طفل أو مالاً: تخزينها في وسيط مشترك تسريب.
    headers.set("cache-control", "no-store, must-revalidate");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
