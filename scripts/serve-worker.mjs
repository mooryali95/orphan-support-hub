#!/usr/bin/env node
// يخدم ناتج البناء (`vite build`، إعداد Cloudflare) محلّياً بـ Node، لاختبار
// المتصفّح في CI حيث لا wrangler: `vite preview` لا يشغّل عامل Cloudflare.
//
//   npx vite build && node scripts/serve-worker.mjs &   # http://127.0.0.1:4173
//   PORT=4310 node scripts/serve-worker.mjs
//
// الملفّات الثابتة من .output/public، والباقي إلى fetch العامل نفسه
// (.output/server/index.mjs) — الرؤوس الأمنية والأحادية وكلّ شيءٍ كما في الإنتاج.
// يقرأ .env (القيم العامة)؛ بلا مفتاح الخدمة تعمل الصفحات العامة.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = resolve(process.argv[2] ?? ".");
const port = Number(process.env.PORT ?? 4173);
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const worker = (await import(pathToFileURL(join(root, ".output/server/index.mjs")).href)).default;
const pub = join(root, ".output/public");
const TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};
// كما تفعل الحافة في الإنتاج: ضغط النصوص، وتخزينٌ دائم لما في اسمه بصمة
// (.output/public/_headers)، فقياس السرعة محلّياً يشبه ما يراه الزائر.
const TEXT = /^(text\/|image\/svg|application\/(json|manifest\+json|javascript))/;
const packed = new Map();
function pack(key, body, type, accept) {
  if (!TEXT.test(type) || body.length < 1024) return { body };
  // الملفّات تُضغط مرّةً وتُحفظ (brotli)؛ والصفحات تُضغط مع كلّ طلب (gzip أسرع).
  const enc = key && /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
  if (!enc) return { body };
  const k = key ? `${enc}:${key}` : null;
  let out = k ? packed.get(k) : undefined;
  if (!out) {
    out = enc === "br" ? brotliCompressSync(body) : gzipSync(body);
    if (k) packed.set(k, out);
  }
  return { body: out, enc };
}
// كما في public/_headers.
const cacheFor = (pathname) =>
  pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : /^\/(geo|brand)\/|^\/favicon\./.test(pathname)
      ? "public, max-age=86400, stale-while-revalidate=604800"
      : "public, max-age=3600";

const env = { ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const file = join(pub, decodeURIComponent(url.pathname));
    if (
      file.startsWith(pub) &&
      url.pathname !== "/" &&
      existsSync(file) &&
      statSync(file).isFile()
    ) {
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      const p = pack(file, readFileSync(file), type, String(req.headers["accept-encoding"] ?? ""));
      res.writeHead(200, {
        "content-type": type,
        "cache-control": cacheFor(url.pathname),
        vary: "accept-encoding",
        ...(p.enc ? { "content-encoding": p.enc } : {}),
      });
      res.end(p.body);
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const r = await worker.fetch(
      new Request(url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(chunks),
      }),
      { ...env, ...process.env },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const out = {};
    r.headers.forEach((v, k) => (out[k] = v));
    const p = pack(
      null,
      Buffer.from(await r.arrayBuffer()),
      out["content-type"] ?? "",
      out["content-encoding"] ? "" : String(req.headers["accept-encoding"] ?? ""),
    );
    if (p.enc) {
      out["content-encoding"] = p.enc;
      delete out["content-length"];
    }
    res.writeHead(r.status, out);
    res.end(p.body);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
