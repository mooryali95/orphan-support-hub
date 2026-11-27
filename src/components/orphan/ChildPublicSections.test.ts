import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// the badge reads public_verification over the network; here it only proves it is placed
vi.mock("@/components/orphans/VerificationBadge", () => ({
  VerificationBadge: ({ orphanId }: { orphanId: string }) =>
    createElement("span", { "data-badge": orphanId }),
}));

const { ChildPublicHeader, SponsorCtaPanel } = await import("./ChildPublicSections");

const ID = "33333333-3333-4333-8333-333333333333";

describe("ChildPublicSections", () => {
  it("renders one h1 with the name, the verification badge and the public meta", () => {
    const html = renderToStaticMarkup(
      createElement(ChildPublicHeader, {
        orphanId: ID,
        name: "Amina",
        code: "K-0001",
        meta: ["Girl", false, "Grade 4"],
      }),
    );
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(">Amina</h1>");
    expect(html).toContain(`data-badge="${ID}"`);
    expect(html).toContain("Grade 4");
    expect(html).not.toMatch(/<img/);
  });

  it("offers a 44px sponsor CTA with its label", () => {
    const html = renderToStaticMarkup(
      createElement(SponsorCtaPanel, {
        label: "Sponsor Amina",
        verifying: false,
        verifyingText: "Under verification",
        similarLabel: "Ready children",
        hasSimilar: false,
      }),
    );
    const cta = html.match(/<a[^>]*href="#sponsor-form"[^>]*>/)?.[0] ?? "";
    expect(cta).toMatch(/\bh-11\b/);
    expect(html).toContain("Sponsor Amina");
  });

  it("never offers a failing sponsor button while verifying", () => {
    const html = renderToStaticMarkup(
      createElement(SponsorCtaPanel, {
        label: "Sponsor Amina",
        verifying: true,
        verifyingText: "Under verification",
        similarLabel: "Ready children",
        hasSimilar: true,
      }),
    );
    expect(html).not.toContain("Sponsor Amina");
    expect(html).toContain("Ready children");
  });
});
