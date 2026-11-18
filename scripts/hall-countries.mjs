// قاعة الأثر — جولة آلية على كل دول الشبكة: تدخل كلّ دولة من الكرة وتتحقّق أنّ
// المرحلة صارت «الدولة»، وأنّ الدولة المعروضة هي المطلوبة، وألّا خطأ في الصفحة.
// التشغيل: خادم التطوير على BASE_URL (افتراضياً 127.0.0.1:5173) ثم
//   node scripts/hall-countries.mjs            (أو CODES=EG,SA لدولٍ بعينها)
import { createRequire } from "node:module";

// playwright is installed globally in CI and dev machines, not as a dependency
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.addInitScript(() => {
  window.__HALL_TEST = 1;
  window.__DTCAP = 1;
});
let errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));

await page.goto(BASE + "/vision/hall", { waitUntil: "networkidle" });
await page.waitForSelector("#enter:not([disabled])", { timeout: 60000 });
await page.click("#enter", { force: true });
await page.waitForTimeout(4000);
const codes = process.env.CODES?.split(",") ?? (await page.evaluate(() => window.__hall.codes()));

const failed = [];
for (const code of codes) {
  errors = [];
  await page.evaluate(() => window.__hall.enterWorld());
  await page.waitForTimeout(2500);
  await page.evaluate((c) => window.__hall.visit(c), code);
  await page
    .waitForFunction(() => window.__hall.S.stage === "country", null, { timeout: 30000 })
    .catch(() => {});
  const [stage, shown] = await page.evaluate(() => [window.__hall.S.stage, window.__hall.co()]);
  const ok = stage === "country" && shown === code && errors.length === 0;
  console.log(
    `${ok ? "✓" : "✗"} ${code}${ok ? "" : ` stage=${stage} shown=${shown} ${errors.slice(0, 2).join(" | ")}`}`,
  );
  if (!ok) failed.push(code);
}
await browser.close();
console.log(
  failed.length
    ? `\n${failed.length} failed: ${failed.join(", ")}`
    : `\nall ${codes.length} countries open`,
);
process.exit(failed.length ? 1 : 0);
