import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { MapStats } from "@/components/map/demo-stats";
import { SupportSheet } from "./SupportSheet";

const { submit } = vi.hoisted(() => ({ submit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => submit }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("@/lib/support.functions", () => ({ createPledge: vi.fn() }));
vi.mock("@/components/auth/AuthDialog", () => ({ AuthDialog: () => null }));
vi.mock("@/components/kit/Celebrate", () => ({ CelebrateMark: () => null }));
vi.mock("@/lib/locale", () => ({
  defineCopy: (_key: string, copy: unknown) => copy,
  pluralOf: () => (n: number) => `${n} children`,
  useCopy: (copy: { en: unknown }) => copy.en,
  useLocale: () => "en",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const stats: MapStats = {
  AL: { value: "Albania", total: 20, sponsored: 8, small: false, gap: 420,
    currency: "EUR", delivered: null, regions: {} },
};
const props = {
  ctx: { code: "AL", countryValue: "Albania", regionValue: null, regionName: null },
  stats,
  catalog: { countries: [], regions: [], groups: [], institutions: [
    { id: "institution-1", name: "Institution", kind: null, country: "AL", region: null },
  ] },
  signedIn: false,
  openedAt: 0,
};

async function chosenSheet() {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => { renderer = create(createElement(SupportSheet, props)); });
  if (!renderer) throw new Error("Sheet did not mount");
  const sheet = renderer;
  await act(async () => {
    sheet.root.findAllByType("button").find((b) => b.children.includes("Institution"))?.props.onClick();
  });
  await act(async () => { sheet.root.findByType("input").props.onChange({ target: { value: "73" } }); });
  return sheet;
}

describe("support choices survive same-place renders", () => {
  it("keeps the institution when map context and catalog objects are recreated", async () => {
    const sheet = await chosenSheet();
    await act(async () => { sheet.update(createElement(SupportSheet, {
      ...props, ctx: { ...props.ctx }, catalog: { ...props.catalog },
    })); });
    expect(sheet.root.findAllByType("button").find((b) => b.children.includes("Institution"))?.props["aria-pressed"]).toBe(true);
    await act(async () => { sheet.unmount(); });
  });

  it("keeps 73 after sign-in and an equivalent stats refresh, and submits the chosen recipient", async () => {
    submit.mockClear();
    const sheet = await chosenSheet();
    await act(async () => { sheet.update(createElement(SupportSheet, {
      ...props, signedIn: true, ctx: { ...props.ctx }, stats: { AL: { ...stats.AL } } as MapStats,
    })); });
    expect(sheet.root.findByType("input").props.value).toBe(73);
    await act(async () => {
      sheet.root.findAllByType("button").find((b) => b.props.className?.includes("w-full"))?.props.onClick();
    });
    expect(submit).toHaveBeenCalledWith({ data: expect.objectContaining({
      targetType: "institution", target: "institution-1", amount: 73, kind: "in_kind",
    }) });
    await act(async () => { sheet.unmount(); });
  });
});