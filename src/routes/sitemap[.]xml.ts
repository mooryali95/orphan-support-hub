import { createFileRoute } from "@tanstack/react-router";

/**
 * خريطة الموقع الديناميكية.
 *
 * تُولَّد من الملفّات المنشورة وحدها. والصفحات المحمية (اللوحات، المسارات
 * تحت `/api`) خارجها عمداً: إدراجها يدعو الزواحف إلى أبواب مغلقة، ويكشف
 * بنية المنصة بلا فائدة.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = process.env["PUBLIC_BASE_URL"] ?? process.env["APP_ORIGIN"] ?? "";
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

        let orphanUrls: string[] = [];
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("orphans")
            .select("id, updated_at")
            .in("status", ["approved", "fully_sponsored"])
            .order("updated_at", { ascending: false })
            .limit(5000);

          orphanUrls = (data ?? []).map(
            (o) =>
              `<url><loc>${origin}/orphans/${o.id}</loc>` +
              `<lastmod>${String(o.updated_at).slice(0, 10)}</lastmod>` +
              `<changefreq>weekly</changefreq><priority>0.7</priority></url>`,
          );
        } catch (error) {
          // خريطة ناقصة خير من خمسمئة: الصفحات الثابتة تُقدَّم على أي حال.
          console.error("[sitemap] تعذّر جلب الملفّات", error);
        }

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
          orphanUrls.join("") +
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
