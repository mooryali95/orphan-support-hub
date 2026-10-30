#!/usr/bin/env node
// فهرس نصوص الواجهة — من كل `defineCopy("ns", { ar, en })` في src.
//
//   node scripts/i18n-extract.mjs        # يكتب src/i18n/catalog.json
//
// لكل نصٍّ مفتاحٌ ثابت (`ns.path`) ونصّاه العربي والإنجليزي وبصمتهما. البصمة
// تتغيّر حين يتغيّر الأصل، فتُعرف الترجمة التي قدمت فتُراجَع ولا تُعرض.
//
// ما يُترجم: النصوص، والقوالب البسيطة `(n, m) => \`صفحة ${n} من ${m}\``
// (تُحفظ بمواضع مرقّمة «{0} … {1}»). ما لا يُترجم: نصٌّ يُبنى من متغيّرات
// الوحدة (`${BRAND.name} …`)، والشروط داخل القوالب — يبقى بالإنجليزية في
// اللغات الأخرى، ويُذكر في الفهرس تحت `skipped` كي يُبسَّط لاحقاً.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ts = createRequire(import.meta.url)("typescript");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CATALOG_PATH = join(ROOT, "src/i18n/catalog.json");

function sources(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(e) && !/\.(test|gen)\.tsx?$/.test(e) ? [p] : [];
  });
}

const unwrap = (n) => {
  while (
    n &&
    (ts.isAsExpression(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isSatisfiesExpression?.(n) ||
      ts.isTypeAssertionExpression?.(n))
  )
    n = n.expression;
  return n;
};
const propName = (p) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;

/** يحوّل عقدة نصٍّ إلى {text, kind, params} أو null إن لم تكن قابلةً للترجمة. */
function leaf(node) {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { text: node.text, kind: "text" };
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const params = node.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));
    let body = node.body;
    if (ts.isBlock(body)) return null;
    body = unwrap(body);
    if (ts.isStringLiteral(body) || ts.isNoSubstitutionTemplateLiteral(body))
      return { text: body.text, kind: "template", params: params.length };
    if (!ts.isTemplateExpression(body)) return null;
    let text = body.head.text;
    for (const span of body.templateSpans) {
      const e = unwrap(span.expression);
      const i = ts.isIdentifier(e) ? params.indexOf(e.text) : -1;
      if (i < 0) return null;
      text += `{${i}}` + span.literal.text;
    }
    return { text, kind: "template", params: params.length };
  }
  return null;
}

function walk(node, key, out, skipped) {
  node = unwrap(node);
  if (!node) return;
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      const k = propName(p);
      if (k && ts.isPropertyAssignment(p)) walk(p.initializer, `${key}.${k}`, out, skipped);
    }
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((e, i) => walk(e, `${key}.${i}`, out, skipped));
    return;
  }
  // pluralOf({ one, other }, by): كل فئةٍ مفتاحٌ مستقلّ — key.one، key.other…
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "pluralOf" &&
    ts.isObjectLiteralExpression(unwrap(node.arguments[0]))
  ) {
    for (const p of unwrap(node.arguments[0]).properties) {
      const k = propName(p);
      const v = k && ts.isPropertyAssignment(p) ? unwrap(p.initializer) : null;
      if (v && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)))
        out.set(`${key}.${k}`, { text: v.text, kind: "plural" });
    }
    return;
  }
  const l = leaf(node);
  if (l) out.set(key, l);
  else if (!(
    node.kind === ts.SyntaxKind.NullKeyword ||
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node)
  ))
    skipped.push(key);
}

export function extract() {
  const entries = {};
  const skipped = [];
  const seen = new Map();
  for (const file of sources(join(ROOT, "src")).sort()) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("defineCopy(")) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "defineCopy" &&
        n.arguments.length === 2 &&
        ts.isStringLiteral(n.arguments[0])
      ) {
        const ns = n.arguments[0].text;
        const rel = relative(ROOT, file);
        if (seen.has(ns)) throw new Error(`مساحة اسمٍ مكرّرة «${ns}» في ${rel} و${seen.get(ns)}`);
        seen.set(ns, rel);
        const obj = unwrap(n.arguments[1]);
        const side = (name) =>
          obj.properties.find((p) => propName(p) === name && ts.isPropertyAssignment(p))
            ?.initializer;
        const en = new Map();
        const ar = new Map();
        const skip = [];
        walk(side("en"), ns, en, skip);
        walk(side("ar"), ns, ar, []);
        for (const [key, l] of en) {
          const a = ar.get(key)?.text ?? "";
          entries[key] = {
            en: l.text,
            ar: a,
            kind: l.kind,
            ...(l.kind === "template" ? { params: l.params } : {}),
            hash: createHash("sha1").update(`${l.text}\u0000${a}`).digest("hex").slice(0, 12),
            file: rel,
          };
        }
        skipped.push(...skip);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((k) => [k, entries[k]]),
  );
  return {
    version: 1,
    count: Object.keys(sorted).length,
    entries: sorted,
    skipped: skipped.sort(),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cat = extract();
  writeFileSync(CATALOG_PATH, JSON.stringify(cat, null, 1) + "\n");
  console.log(`✓ ${cat.count} نصّاً في الفهرس، و${cat.skipped.length} لا يُترجم (انظر skipped)`);
}
