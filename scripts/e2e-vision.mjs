#!/usr/bin/env node
// اختبار المتصفّح لمنصة الرؤية والتوجهات (/vision) — لا يحتاج قاعدة بيانات:
// المنظومة كلّها في متصفّح الزائر، فيُشغَّل في CI على ناتج البناء.
//
//   npx vite build && (node scripts/serve-worker.mjs &) && node scripts/e2e-vision.mjs
//   BASE_URL=http://127.0.0.1:5173 node scripts/e2e-vision.mjs     # على خادم التطوير
//
// ١) كلّ صفحة بالعربية والإنجليزية، حاسوباً وجوالاً: تُحمَّل، ولها عنوانٌ رئيسي،
//    واتجاهها صحيح، ولا أخطاء JavaScript، ولا تمرير أفقي.
// ٢) الرحلات بالأدوار الثلاثة: الداعم يتبرّع فيرى ملفات الأطفال وإيصاله؛ المشرف
//    يسجّل جلسة؛ صاحب القرار يقدّم شهراً ويجرّب «ماذا لو» ويعتمد قراراً.
// ٣) فحص الوصول (axe، WCAG A/AA) داخل كلّ دور بعد الدخول — إن توفّر axe-core.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
let axeSrc = null;
try {
  axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  console.warn("! axe-core غير مثبّت — يُتخطّى فحص الوصول");
}

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const PAGES = [
  "/vision",
  "/vision/operations",
  "/vision/decision",
  "/vision/network",
  "/vision/impact",
  "/vision/cycle",
  "/vision/payments",
  "/vision/me",
];
// ميزانية الأداء: ما يُنزَّل من JS وCSS مضغوطاً لكلّ صفحة (اليوم نحو 340–350KB).
const BUDGET_KB = Number(process.env.VISION_BUDGET_KB ?? 380);
const IGNORE = [/Failed to load resource/i, /net::ERR_/i];
const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

const browser = await chromium.launch();

async function watch(page, where) {
  page.on("pageerror", (e) => fail(where, `pageerror ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE.some((r) => r.test(m.text())))
      fail(where, `console ${m.text().slice(0, 160)}`);
  });
}

async function axe(page, where) {
  if (!axeSrc) return;
  // بعد انتهاء حركات الظهور: axe يقيس التباين على الشفافية الوسيطة فيخطئ.
  await page.waitForTimeout(1200);
  await page.addScriptTag({ content: axeSrc });
  const v = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    // preload:false — لا يجلب أوراق الأنماط الخارجية بنفسه (يخالف connect-src).
    (
      await axe.run("main", {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
        preload: false,
      })
    ).violations.map((x) => `${x.id}(${x.nodes.length}) ${x.nodes[0]?.target}`),
  );
  if (v.length) fail(where, `axe ${v.join(" | ")}`);
}

// ── ١) الصفحات ─────────────────────────────────────────────────────
for (const [lang, dir] of [
  ["ar", "rtl"],
  ["en", "ltr"],
])
  for (const [vp, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies([{ name: "kh_lang", value: lang, url: BASE }]);
    const page = await ctx.newPage();
    const where = `${lang} ${vp}`;
    await watch(page, where);
    for (const path of PAGES) {
      const r = await page.goto(BASE + path, { waitUntil: "networkidle" });
      if (!r || r.status() >= 400) fail(`${where} ${path}`, `status ${r?.status()}`);
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => ({
        dir: document.documentElement.dir,
        h1: document.querySelectorAll("h1").length,
        over: document.documentElement.scrollWidth - window.innerWidth,
      }));
      if (s.dir !== dir) fail(`${where} ${path}`, `dir=${s.dir}`);
      if (!s.h1) fail(`${where} ${path}`, "no h1");
      if (s.over > 1) fail(`${where} ${path}`, `horizontal overflow ${s.over}px`);
    }
    ok(`${where}: ${PAGES.length} pages`);
    await ctx.close();
  }

// ── الميزانية ───────────────────────────────────────────────────────
{
  // سياقٌ جديد لكلّ صفحة: بلا ذاكرةٍ مخبّأة، كأوّل زيارة.
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    // الأجسام تُقرأ بعد الاستجابة؛ تُجمع الوعود وتُنتظر قبل الجمع.
    const sizes = [];
    page.on("response", (r) => {
      if (!/\.(js|css)$/.test(new URL(r.url()).pathname)) return;
      sizes.push(
        r.body().then(
          (b) => gzipSync(b).length,
          () => 0,
        ),
      );
    });
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const gz = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
    const kb = Math.round(gz / 1024);
    if (kb > BUDGET_KB) fail(`budget ${path}`, `${kb}KB gzip > ${BUDGET_KB}KB`);
    console.log(`  · ${path}: ${kb}KB gzip`);
    await ctx.close();
  }
  ok(`budget ≤ ${BUDGET_KB}KB gzip per page`);
}

// ── ٢ و٣) الأدوار ───────────────────────────────────────────────────
{
  // bypassCSP: لحقن axe وحده — سياسة الإنتاج تمنع أيّ سكربتٍ مضمَّن بلا nonce.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage();
  await watch(page, "roles");
  const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle" });

  // الداعم
  await go("/vision/me");
  await page.getByRole("button", { name: /ادخل كداعم/ }).click();
  const form = page.locator("form");
  await form.locator("input[type=number]").fill("6000");
  await form.getByRole("button", { name: "تبرّع الآن" }).click();
  await page.waitForTimeout(800);
  const files = await page.locator("#files-h ~ div li button").count();
  if (files < 1) fail("supporter", "no child files after donating");
  const receipt = page.getByRole("link", { name: /DEMO-INV-/ }).first();
  if (!(await receipt.count())) fail("supporter", "no receipt link");
  await axe(page, "supporter");
  ok(`supporter: donated, ${files} child files`);
  await receipt.click();
  await page.waitForURL(/\/vision\/receipt\//);
  await page.waitForTimeout(600);
  if (!(await page.getByText(/SHA-256/).count())) fail("receipt", "no fingerprint");
  ok("receipt opens with its fingerprint");

  // المشرف
  await go("/vision/me");
  await page.getByRole("button", { name: /تبديل الدور/ }).click();
  await page.getByRole("button", { name: /ادخل كمشرف/ }).click();
  const sessions = () =>
    page.evaluate(() =>
      (JSON.parse(localStorage.getItem("vision-engine:v1") ?? "{}").groups ?? []).reduce(
        (a, g) => a + g.sessionsDone,
        0,
      ),
    );
  const before = await sessions();
  await page.getByRole("button", { name: "سجّل جلسة" }).first().click();
  await page.waitForTimeout(400);
  if ((await sessions()) !== before + 1) fail("supervisor", "session did not register");
  await axe(page, "supervisor");
  ok("supervisor: recorded a session");

  // صاحب القرار
  await page.getByRole("button", { name: /تبديل الدور/ }).click();
  await page.getByRole("button", { name: /ادخل كصاحب قرار/ }).click();
  const month0 = await page.locator("nav[aria-label] >> text=/2026|2027/").first().innerText();
  await page.getByRole("button", { name: "تقدّم شهراً" }).click();
  await page.waitForTimeout(600);
  const month1 = await page.locator("nav[aria-label] >> text=/2026|2027/").first().innerText();
  if (month0 === month1) fail("decider", "month did not advance");
  const approve = page.getByRole("button", { name: "اعتمد" }).first();
  if (await approve.count()) await approve.click();
  await axe(page, "decider");
  await go("/vision/decision");
  await page.getByRole("tab", { name: "ماذا لو" }).click();
  await page.getByRole("button", { name: "اعتمد السيناريو" }).click();
  await page.waitForTimeout(400);
  if (!(await page.getByText(/اعتُمد —/).count())) fail("decider", "scenario not applied");
  ok("decider: advanced a month, approved a decision and a scenario");

  // البقاء بعد إعادة التحميل
  await page.reload({ waitUntil: "networkidle" });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("vision-engine:v1") ?? "{}"),
  );
  if (!(saved.donations?.length >= 2 && saved.month >= 1)) fail("persistence", "state not kept");
  ok("state persists across reloads");
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n✗ ${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\n✓ vision e2e passed");
