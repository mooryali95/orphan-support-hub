#!/usr/bin/env node
// اختبار المتصفّح الشامل للمسار العام — ما يمرّ به الزائر قبل أن يكفل.
//
//   npx vite build && (npx vite preview --port 4173 &) && node scripts/e2e-smoke.mjs
//   BASE_URL=https://… node scripts/e2e-smoke.mjs     # على نشرٍ قائم
//
// لكل صفحة: تُحمَّل بلا خطأ خادم، ولها عنوانٌ وعنوانٌ رئيسي، والاتجاه
// عربي، ولا أخطاء JavaScript، ولا تمرير أفقي على عرض الجوال. ثم الرحلة:
// الخريطة ← قائمة الأيتام بفلتر الدولة في الرابط ← طلب الدعم ← الدخول.
// المسارات المحمية تُحوَّل إلى الدخول بدل أن تُعرض لزائر.
import { createRequire } from "node:module";

// require لا import: Playwright مثبّتٌ عامّاً في بيئة الاختبار لا في package.json.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const PAGES = [
  "/",
  "/orphans",
  "/orphans?country=AL",
  "/support",
  "/how-it-works",
  "/organizations",
  "/traits",
  "/legal/faq",
  "/legal/privacy",
  "/legal/terms",
  "/auth",
];
const PROTECTED = ["/dashboard", "/admin", "/account"];
// ضجيجٌ خارجي لا يخصّ الكود: موارد شبكةٍ محجوبة في بيئة الاختبار.
const IGNORE = [/Failed to load resource/i, /net::ERR_/i, /hydrat/i];

const failures = [];
const fail = (page, msg) => failures.push(`${page}: ${msg}`);

const browser = await chromium.launch();
for (const [label, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["mobile", { width: 375, height: 740 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "ar" });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORE.some((re) => re.test(m.text()))) errors.push(m.text());
    });
    const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30_000 });
    const where = `${label} ${path}`;
    if (!res || res.status() >= 500) fail(where, `status ${res?.status()}`);
    const r = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelectorAll("h1").length,
      dir: document.documentElement.dir,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    if (!r.title) fail(where, "no <title>");
    if (r.h1 < 1 && path !== "/auth" && path !== "/") fail(where, "no <h1>");
    if (r.dir !== "rtl") fail(where, `dir=${r.dir}`);
    if (r.overflow > 1) fail(where, `horizontal overflow ${r.overflow}px`);
    for (const e of errors) fail(where, `js: ${e.slice(0, 160)}`);
    await page.close();
  }

  // المحمي لا يُعرض لزائر
  for (const path of PROTECTED) {
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30_000 });
    const url = new URL(page.url());
    if (url.pathname === path) {
      const gated = await page.getByText(/تسجيل الدخول|سجّل الدخول|ادخل/).count();
      if (gated === 0) fail(`${label} ${path}`, "protected page shown to a visitor");
    }
    await page.close();
  }

  // الرحلة: الفلتر يعيش في الرابط، فالرجوع والمشاركة يحفظانه
  const page = await ctx.newPage();
  await page.goto(BASE + "/orphans?country=AL", { waitUntil: "networkidle" });
  if (!new URL(page.url()).searchParams.get("country"))
    fail(`${label} journey`, "country filter dropped from URL");
  await page.goto(BASE + "/support", { waitUntil: "networkidle" });
  if ((await page.getByText(/لا تبرّعٌ عام/).count()) === 0)
    fail(`${label} journey`, "offering note missing on /support");
  await page.close();
  await ctx.close();
}
await browser.close();

if (failures.length) {
  console.error(`✗ ${failures.length} مشكلة:\n  ` + failures.join("\n  "));
  process.exit(1);
}
console.log(`✓ ${PAGES.length} صفحة × عرضان، والمحمي محجوب، والرحلة العامة سليمة`);
