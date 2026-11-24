import { createFileRoute } from "@tanstack/react-router";

/**
 * خريطة الموقع الديناميكية.
 *
 * الصفحات العامّة وحدها. والصفحات المحمية (اللوحات، المسارات تحت `/api`)
 * خارجها عمداً: إدراجها يدعو الزواحف إلى أبواب مغلقة، ويكشف بنية المنصّة
 * بلا فائدة.
 *
 * ولا صفحة لطفلٍ بعينه (CP-13): كانت تُدرَج هنا كلّ الملفّات المعتمدة —
 * حتى ما حُذف من مصدره — فيبقى اسم الطفل وعمره وحاجته في خزائن البحث
 * بعد أن تنتهي الموافقة. الدليل `/orphans` هو المفهرَس، وصفحة الطفل
 * `noindex`.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { appBaseUrl } = await import("@/lib/env.server");
        const origin = appBaseUrl() ?? "";
        const now = new Date().toISOString().slice(0, 10);

        const staticPages: Array<[string, string, string]> = [
          ["/", "daily", "1.0"],
          ["/orphans", "daily", "0.9"],
          ["/organizations", "weekly", "0.6"],
          ["/how-it-works", "monthly", "0.6"],
          ["/legal/privacy", "yearly", "0.3"],
          ["/legal/terms", "yearly", "0.3"],
          ["/legal/faq", "monthly", "0.4"],
        ];

        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          staticPages
            .map(
              ([path, freq, priority]) =>
                `<url><loc>${origin}${path}</loc><lastmod>${now}</lastmod>` +
                `<changefreq>${freq}</changefreq><priority>${priority}</priority></url>`,
            )
            .join("") +
          `</urlset>`;

        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
