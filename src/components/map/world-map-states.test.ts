import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { WorldMap } from "./WorldMap";
import { toMapStats } from "./demo-stats";
import { EMPTY_GEO, type MapSourceStatus } from "./map-source";

/**
 * الخريطة كما تُرسم للزائر خارج وضع العرض (ARC-11/PRD-15): أثناء التحميل
 * وعند تعذّر القاعدة لا رقم ولا «أقل من ٥» ولا «لا ملفّات هنا».
 */
function render(status: MapSourceStatus | undefined) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(WorldMap, {
        stats: toMapStats(EMPTY_GEO),
        selection: { country: null, region: null },
        onSelect: () => {},
        ...(status ? { status } : {}),
      }),
    ),
  );
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("الخريطة بلا أرقامٍ بعد", () => {
  it("أثناء التحميل: هيكلٌ بلا أيّ رقم", () => {
    const html = render("loading");
    expect(html).toContain('aria-busy="true"');
    expect(textOf(html)).not.toMatch(/[0-9٠-٩]/);
    expect(html).not.toContain("بيانات تجريبية");
  });

  it("عند التعذّر: «غير متاحة الآن» بلا أيّ رقم", () => {
    const html = render("unavailable");
    expect(html).toContain("غير متاحة الآن");
    expect(textOf(html)).not.toMatch(/[0-9٠-٩]/);
    expect(html).not.toContain("بيانات تجريبية");
  });

  it("الجاهزة تعرض المجموع كما كانت", () => {
    const html = render("ready");
    expect(html).toContain("ملفاً موثّقاً في");
  });
});
