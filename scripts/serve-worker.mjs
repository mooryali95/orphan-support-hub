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
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
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
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
