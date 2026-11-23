// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// المتغيّرات بلا بادئة VITE_ تخصّ الخادم وحده (أسرار البريد والدفع)،
// فتُحمَّل إلى process.env ولا تُحقن في حزمة المتصفّح.
Object.assign(process.env, loadEnv(process.env["NODE_ENV"] ?? "development", rootDir, ""));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      // مطابقة تامّة لا بادئة: parse5 يستورد entities/decode و entities/escape من نسخته
      // المتداخلة (v6+)، وتحويل كل ما يبدأ بـ entities إلى النسخة الجذرية (v4) يكسر البناء.
      alias: [
        {
          find: /^entities\/lib\/decode\.js$/,
          replacement: path.resolve(rootDir, "node_modules/entities/lib/decode.js"),
        },
        {
          find: /^entities\/lib\/encode\.js$/,
          replacement: path.resolve(rootDir, "node_modules/entities/lib/encode.js"),
        },
        { find: /^entities$/, replacement: path.resolve(rootDir, "node_modules/entities") },
      ],
    },
  },
});
