#!/usr/bin/env node
// حذف وضع التجربة (/try) يوم الإطلاق — أمرٌ واحد. (docs/trial-mode.ar.md)
//
//   node scripts/remove-trial.mjs            # تشغيلٌ جافّ: يسرد ما سيُحذف وما سيتغيّر، ولا يمسّ شيئاً
//   node scripts/remove-trial.mjs --apply    # يحذف ويغيّر ويعيد التوليد
//   node scripts/remove-trial.mjs --apply --no-build   # بلا `vite build` (لمن يبني بعده بنفسه)
//
// ما يفعله `--apply`:
//   ١) يحذف كلّ ملفٍّ يطابق `trial.manifest.json` (files)، والمجلّدات التي تفرغ بعده.
//   ٢) يضبط مفاتيح الإعداد في `config.file` (PLATFORM_MODE = "live"، KEEP_TRIAL_PUBLIC = false).
//   ٣) يعيد فهرس النصوص (`node scripts/i18n-extract.mjs`) فتسقط نصوص التجربة منه.
//   ٤) يعيد توليد شجرة المسارات (`src/routeTree.gen.ts`) ببناء `vite build`، فتزول مسارات /try.
// الكود الحقيقي لا يستورد ملفّ تجربة (src/lib/trial-manifest.test.ts)، فلا يُعدَّل فيه سطر:
// `src/lib/trial-gate.ts` يرى غياب مدخل التجربة فتختفي روابطها وجلستها وحدها.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const BUILD = !args.has("--no-build");

const manifest = JSON.parse(readFileSync(join(ROOT, "trial.manifest.json"), "utf8"));

/** نمط الملفّ إلى تعبير: `**` أيّ عمق، `*` داخل مقطعٍ واحد. */
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (ch === "*") re += "[^/]*";
    else re += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const SKIP = new Set(["node_modules", ".git", "dist", ".output", ".vinxi", ".claude", ".lovable"]);
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const patterns = manifest.files.map(globToRegExp);
const rel = (p) => relative(ROOT, p).split(sep).join("/");
const roots = [...new Set(manifest.files.map((g) => g.split("/")[0]))];
const matched = roots
  .filter((r) => existsSync(join(ROOT, r)))
  .flatMap((r) => walk(join(ROOT, r)))
  .map(rel)
  .filter((f) => patterns.some((re) => re.test(f)))
  .sort();

const cfgPath = join(ROOT, manifest.config.file);
const cfgSrc = readFileSync(cfgPath, "utf8");
const cfgChanges = Object.entries(manifest.config.set).map(([name, value]) => {
  const re = new RegExp(`(export const ${name}(?:\\s*:\\s*[^=]+)?\\s*=\\s*)([^;]+);`);
  const m = re.exec(cfgSrc);
  if (!m) throw new Error(`${manifest.config.file}: لم يوجد \`export const ${name}\``);
  return { name, from: m[2].trim(), to: value, re };
});

console.log(`وضع التجربة — ${APPLY ? "حذف" : "تشغيلٌ جافّ (لا يُمسّ شيء؛ أضف --apply للحذف)"}\n`);
console.log(`الملفّات (${matched.length}):`);
for (const f of matched) console.log(`  - ${f}`);
console.log(`\nالإعداد (${manifest.config.file}):`);
for (const c of cfgChanges) console.log(`  ${c.name}: ${c.from} → ${c.to}`);
console.log("\nثم: فهرس النصوص (scripts/i18n-extract.mjs)، وشجرة المسارات (vite build).");

if (!APPLY) process.exit(0);
if (matched.length === 0) console.log("\nلا ملفّات تجربة: حُذفت من قبل.");

for (const f of matched) unlinkSync(join(ROOT, f));
// المجلّدات التي فرغت (src/components/try)
const dirs = [...new Set(matched.map((f) => dirname(join(ROOT, f))))].sort(
  (a, b) => b.length - a.length,
);
for (const d of dirs) if (existsSync(d) && readdirSync(d).length === 0) rmdirSync(d);

let cfg = cfgSrc;
for (const c of cfgChanges) cfg = cfg.replace(c.re, `$1${c.to};`);
writeFileSync(cfgPath, cfg);

const run = (cmd, argv) => {
  console.log(`\n$ ${cmd} ${argv.join(" ")}`);
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`فشل: ${cmd} ${argv.join(" ")}`);
    process.exit(r.status ?? 1);
  }
};
run(process.execPath, [join(ROOT, "scripts/i18n-extract.mjs")]);
if (BUILD) run("npx", ["vite", "build"]);
else console.log("\n(--no-build: شجرة المسارات تُعاد عند أوّل `vite build` أو `vite dev`.)");

console.log(`
حُذفت التجربة. الخطوات التالية:
  1) npx tsc --noEmit && npx vitest run${BUILD ? "" : " && npx vite build"}
  2) راجع الفرق: git status && git diff --stat
  3) التزم وادفع (Lovable يرى الالتزام). للتراجع: git revert <الالتزام> — لا دفع بالقوّة.
`);
