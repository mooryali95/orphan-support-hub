#!/usr/bin/env node
// تغيير اسم المنصّة بأمرٍ واحد:  bun run brand:sync
//
// المصدر: src/config/brand.json. السكربت:
//   ١) يولّد شعار البريد (الاسم مكتوباً بخطّ أميري) — الصورة الوحيدة التي تحمل الاسم.
//   ٢) يكتب هجرةً تُحدّث الاسم في القاعدة (platform_settings.brand_name)
//      إن لم تكن مكتوبةً لهذا الاسم من قبل.
//   ٣) يطبع ما بقي خارج الكود: إعدادات لا يصلها المستودع.
// الواجهة كلّها تقرأ الاسم من brand.json مباشرة، وفحص brand.test.ts يفشل
// إن كُتب الاسم حرفياً في ملفٍ آخر.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const brand = JSON.parse(readFileSync("src/config/brand.json", "utf8"));
const name = brand.name;

// ١) شعار البريد — يحتاج Playwright؛ إن غاب يُتخطّى بتنبيهٍ ولا يوقف الباقي.
let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.warn(
    "⚠ Playwright غير مثبّت: شعار البريد لم يُولَّد (npx playwright install chromium ثم أعد التشغيل).",
  );
}
const mark = readFileSync("public/favicon.svg", "utf8")
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#FFFFFF"');
const html = `<html><head><link href="https://fonts.googleapis.com/css2?family=Amiri:wght@700&display=block" rel="stylesheet"></head>
<body style="margin:0;background:transparent;display:flex;align-items:center;gap:14px;height:100vh;padding:0 12px;direction:rtl">
<svg viewBox="-102 -102 220 204" style="height:64px">${mark}</svg>
<span style="font-family:Amiri;font-weight:700;font-size:46px;color:#fff;line-height:1;white-space:nowrap">${name}</span></body></html>`;
if (chromium) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 90 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const width = await page.evaluate(() => Math.ceil(document.body.scrollWidth));
  await page.setViewportSize({ width: Math.min(Math.max(width, 200), 600), height: 90 });
  await page.screenshot({ path: "public/brand/email-logo-white.png", omitBackground: true });
  await browser.close();
  console.log("✓ public/brand/email-logo-white.png");
}

// ٢) هجرة الاسم في القاعدة
const sqlName = name.replace(/'/g, "''");
const already = readdirSync("supabase/migrations").some((f) => {
  if (!f.endsWith("_brand_name.sql")) return false;
  return readFileSync(`supabase/migrations/${f}`, "utf8").includes(`brand_name = '${sqlName}'`);
});
if (already) {
  console.log("✓ هجرة الاسم موجودة سلفاً لهذا الاسم");
} else {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const file = `supabase/migrations/${stamp}_brand_name.sql`;
  writeFileSync(
    file,
    `-- يولّده scripts/brand-sync.mjs من src/config/brand.json — لا تعدّله يدوياً.\nUPDATE public.platform_settings SET brand_name = '${sqlName}', updated_at = now() WHERE id;\n`,
  );
  console.log(`✓ ${file}`);
}

// ٣) ما لا يصله المستودع
console.log(`
بقي خارج الكود (مرّة واحدة):
  • Lovable ← إعدادات المشروع: اسم المشروع والنطاق إن تغيّر.
  • Lovable Cloud ← المتغيّرات: EMAIL_FROM (اسم المرسِل الظاهر).
  • Creem: أسماء المنتجات إن ظهر فيها الاسم.
  • القاعدة الحيّة: الهجرة الجديدة تدخل حزمة النشر (scripts/release-bundle.sh).
`);
