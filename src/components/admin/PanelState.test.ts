import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PanelState } from "./PanelState";

const render = (props: Parameters<typeof PanelState>[0]) =>
  renderToStaticMarkup(createElement(PanelState, props));

describe("PanelState", () => {
  it("التحميل هيكلٌ بشكل اللوحة لا فراغ", () => {
    const html = render({ pending: true, shape: "cards", count: 2, children: "x" });
    expect(html).toContain('data-panel-state="loading"');
    expect(html).toContain('role="status"');
    expect(html.match(/animate-pulse/g)?.length).toBe(2);
    expect(html).not.toContain(">x<");
  });

  it("التعذّر إطار تنبيهٍ بزرّ إعادة", () => {
    const html = render({ pending: false, failed: true, onRetry: () => {}, children: "x" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("<button");
  });

  it("الفراغ يقول الخطوة التالية", () => {
    const html = render({
      pending: false,
      empty: true,
      emptyTitle: "لا شيء",
      emptyNext: "افعل كذا",
      children: "x",
    });
    expect(html).toContain("لا شيء");
    expect(html).toContain("افعل كذا");
  });

  it("وإلا فالمحتوى", () => {
    expect(render({ pending: false, children: "x" })).toBe("x");
  });
});
