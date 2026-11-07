import { describe, expect, it, vi } from "vitest";

// الصفحة تستورد عميل المتصفّح؛ رأس الصفحة لا يحتاجه.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { Route } from "@/routes/orphans.$orphanId";

/**
 * رأس صفحة الطفل العامّة — APP-01 وCP-13.
 *
 * TanStack تكتب أبناء `scripts` في الصفحة كما هي (`__html`)، فاسمٌ يحمل
 * `</script>` كان يُغلق كتلة JSON-LD ويفتح سكربتاً للمهاجم. والصفحة نفسها
 * كانت تُعرض للزواحف «عرضاً» بسعرٍ و«متوفّر/نفد».
 */
const PAYLOAD = "Ali</script><script>window.__pwned=document.cookie</script>";

type HeadOut = {
  meta?: Array<{ name?: string; property?: string; content?: string; title?: string }>;
  scripts?: Array<{ children?: string; type?: string }>;
  links?: unknown[];
};

function headFor(orphan: Record<string, unknown> | null, locale: "ar" | "en" = "ar"): HeadOut {
  const head = Route.options.head as unknown as (ctx: unknown) => HeadOut;
  return head({
    loaderData: orphan ? { orphan } : { orphan: null },
    match: { context: { locale } },
  });
}

const orphan = {
  id: "a9200000-0000-4000-8000-000000000001",
  display_name: PAYLOAD,
  country: "ألبانيا",
  monthly_need: 120,
  funded_monthly: 20,
  currency: "EUR",
  status: "approved",
};

describe("رأس صفحة الطفل", () => {
  for (const locale of ["ar", "en"] as const) {
    it(`[${locale}] لا يُخرج اسماً يكسر سكربتاً — لا سكربت يحمل بيانات الطفل`, () => {
      const out = headFor(orphan, locale);
      for (const s of out.scripts ?? []) {
        // ما يُكتب خاماً داخل <script> لا يجوز أن يحمل «<» أصلاً.
        expect(s.children ?? "").not.toMatch(/<\/?script/i);
        expect(s.children ?? "").not.toContain("<");
        expect(s.children ?? "").not.toContain("Ali");
      }
      expect(out.scripts ?? []).toHaveLength(0);
    });

    it(`[${locale}] لا يُفهرَس ولا يُخزَّن في محرّكات البحث`, () => {
      const robots = headFor(orphan, locale).meta?.find((m) => m.name === "robots");
      expect(robots?.content).toContain("noindex");
      expect(robots?.content).toContain("noarchive");
      expect(robots?.content).toContain("noimageindex");
    });

    it(`[${locale}] لا يصف الطفل سلعةً بسعر ولا «متوفّراً/نفد»`, () => {
      const raw = JSON.stringify(headFor(orphan, locale));
      expect(raw).not.toMatch(/Offer|InStock|SoldOut|priceCurrency|"price"/);
    });

    it(`[${locale}] معاينة المشاركة لا تحمل اسم الطفل`, () => {
      const meta = headFor(orphan, locale).meta ?? [];
      for (const m of meta.filter(
        (x) => x.property?.startsWith("og:") || x.name?.startsWith("twitter:"),
      )) {
        expect(m.content ?? "").not.toContain("Ali");
      }
    });
  }

  it("الملف الغائب يبقى خارج الفهرس", () => {
    const robots = headFor(null).meta?.find((m) => m.name === "robots");
    expect(robots?.content).toContain("noindex");
  });
});
