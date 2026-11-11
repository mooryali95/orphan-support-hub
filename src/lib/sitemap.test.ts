import { describe, expect, it, vi } from "vitest";

// لو عادت الخريطة تقرأ الملفّات لوجدت طفلاً هنا.
const from = vi.hoisted(() =>
  vi.fn(() => {
    const q = {
      select: () => q,
      in: () => q,
      order: () => q,
      limit: async () => ({
        data: [{ id: "a9200000-0000-4000-8000-000000000001", updated_at: "2026-11-01" }],
        error: null,
      }),
    };
    return q;
  }),
);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));

import { Route } from "@/routes/sitemap[.]xml";

type Handler = (ctx: unknown) => Promise<Response>;

describe("خريطة الموقع (CP-13)", () => {
  it("لا تُدرج صفحة أيّ طفل، والدليل وحده مدرَج", async () => {
    const server = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server;
    const res = await server.handlers.GET({ request: new Request("https://x.test/sitemap.xml") });
    const xml = await res.text();
    expect(xml).not.toMatch(/\/orphans\/[^<]/);
    expect(xml).toContain("/orphans</loc>");
    expect(from).not.toHaveBeenCalled();
  });
});
