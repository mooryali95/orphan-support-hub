import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapStats } from "@/components/map/demo-stats";
import { SupportSheet } from "@/components/support/SupportSheet";
import { HANDOFF_KEY, loadProposals } from "@/lib/try-handoff";

/*
 * المقترح القادم من الرحلة الافتراضية داخل النموذج الحقيقي: لا يغيّر المبلغ من تلقاء نفسه، ولا
 * يُرسل شيئاً؛ يُطبَّق بضغطة الزائر وحدها، ولا يُخفى إلا بعد تسجيلٍ حقيقي ناجح.
 */
const { submit } = vi.hoisted(() => ({ submit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => submit }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("@/lib/support.functions", () => ({ createPledge: vi.fn() }));
vi.mock("@/components/auth/AuthDialog", () => ({ AuthDialog: () => null }));
vi.mock("@/components/SupporterModeGate", () => ({
  SupporterModeGate: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/kit/Celebrate", () => ({ CelebrateMark: () => null }));
vi.mock("@/lib/locale", () => ({
  defineCopy: (_key: string, copy: unknown) => copy,
  copyOf: (copy: { en: unknown }) => copy.en,
  pluralOf: () => (n: number) => `${n} children`,
  useCopy: (copy: { en: unknown }) => copy.en,
  useLocale: () => "en",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const fakeWindow = {
  sessionStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  },
  addEventListener: (type: string, f: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(f);
  },
  removeEventListener: (type: string, f: () => void) => void listeners.get(type)?.delete(f),
  dispatchEvent: (e: Event) => {
    for (const f of listeners.get(e.type) ?? []) f();
    return true;
  },
};
beforeAll(() => void Object.assign(globalThis, { window: fakeWindow }));
afterAll(() => void Reflect.deleteProperty(globalThis, "window"));
beforeEach(() => {
  memory.clear();
  submit.mockClear();
});

const stats: MapStats = {
  AL: {
    value: "Albania",
    total: 20,
    sponsored: 8,
    small: false,
    gap: 420,
    currency: "EUR",
    delivered: null,
    regions: {},
  },
};
const props = {
  ctx: { code: "AL", countryValue: "Albania", regionValue: null, regionName: null },
  stats,
  catalog: { countries: [], regions: [], groups: [], institutions: [] },
  signedIn: true,
  openedAt: 0,
};

const propose = (over: Record<string, unknown> = {}) =>
  memory.set(
    HANDOFF_KEY,
    JSON.stringify({
      v: 1,
      at: Date.now(),
      dismissed: [],
      proposals: [
        {
          id: "DEMO-PLG-1",
          track: "in_kind",
          cadence: "monthly",
          co: "AL",
          amount: 37,
          currency: "EUR",
          at: new Date().toISOString(),
          ...over,
        },
      ],
    }),
  );

async function sheet() {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(SupportSheet, props));
  });
  if (!renderer) throw new Error("Sheet did not mount");
  return renderer;
}
const amountOf = (s: ReactTestRenderer) => Number(s.root.findByType("input").props["value"]);
const text = (node: unknown): string =>
  typeof node === "string"
    ? node
    : Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object" && "children" in node
        ? text((node as { children: unknown }).children)
        : "";
const button = (s: ReactTestRenderer, label: string) =>
  s.root.findAllByType("button").find((b) => text(b.children).includes(label));
const offer = (s: ReactTestRenderer) =>
  s.root.findAll((n) => n.props["data-trial-offer"] !== undefined && typeof n.type === "string");

describe("a trial proposal on the real support sheet", () => {
  it("shows the proposal without touching the amount or the server", async () => {
    propose();
    const s = await sheet();
    expect(offer(s)).toHaveLength(1);
    expect(amountOf(s)).not.toBe(37);
    expect(submit).not.toHaveBeenCalled();
  });

  it("applies amount and kind only when the visitor presses, and still sends nothing", async () => {
    propose();
    const s = await sheet();
    await act(async () => button(s, "Use this amount")?.props["onClick"]());
    expect(amountOf(s)).toBe(37);
    expect(submit).not.toHaveBeenCalled();
    // the proposal stays until a real pledge is actually recorded
    expect(loadProposals(fakeWindow.sessionStorage)).toHaveLength(1);
  });

  it("hides the proposal only after the visitor's own confirmation succeeds", async () => {
    propose();
    const s = await sheet();
    await act(async () => button(s, "Use this amount")?.props["onClick"]());
    const confirm = s.root.findAllByType("button").find((b) => text(b.children).includes("37"));
    expect(confirm).toBeDefined();
    await act(async () => confirm?.props["onClick"]());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 37,
        kind: "in_kind",
        currency: "EUR",
        country: "AL",
      }),
    });
    expect(loadProposals(fakeWindow.sessionStorage)).toEqual([]);
  });

  it("keeps an amount the visitor typed after using the proposal", async () => {
    propose();
    const s = await sheet();
    await act(async () => button(s, "Use this amount")?.props["onClick"]());
    await act(async () => {
      s.root.findByType("input").props["onChange"]({ target: { value: "73" } });
    });
    await act(async () => s.update(createElement(SupportSheet, { ...props, stats: { ...stats } })));
    expect(amountOf(s)).toBe(73);
  });

  it("offers nothing for another country, another currency, or a sponsorship", async () => {
    propose({ co: "EG" });
    expect(offer(await sheet())).toHaveLength(0);
    propose({ currency: "JPY" });
    expect(offer(await sheet())).toHaveLength(0);
    propose({ track: "sponsorship" });
    expect(offer(await sheet())).toHaveLength(0);
  });

  it("lets the visitor decline, and the amount stays as it was", async () => {
    propose();
    const s = await sheet();
    const before = amountOf(s);
    await act(async () => button(s, "Not now")?.props["onClick"]());
    expect(offer(s)).toHaveLength(0);
    expect(amountOf(s)).toBe(before);
    expect(submit).not.toHaveBeenCalled();
  });
});
