// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Route as AuthPreview } from "./auth/preview";
import { Route as TransactionalPreview } from "./transactional/preview";

/**
 * The two email preview routes render every template the platform sends, in the recipient's
 * locale: Arabic right to left by default, English left to right when `locale: "en"` is passed.
 * The send path carries the same locale (auth: `lang` on the return URL; notifications: the
 * account's `user_metadata.locale`, returned by `claim_email_batch`).
 */
type Handler = (ctx: { request: Request }) => Promise<Response>;
const post = (route: unknown): Handler =>
  (route as { options: { server: { handlers: { POST: Handler } } } }).options.server.handlers.POST;

const KEY = "test-preview-key";
let saved: string | undefined;
beforeAll(() => {
  saved = process.env["LOVABLE_API_KEY"];
  process.env["LOVABLE_API_KEY"] = KEY;
});
afterAll(() => {
  if (saved === undefined) delete process.env["LOVABLE_API_KEY"];
  else process.env["LOVABLE_API_KEY"] = saved;
});

const call = (route: unknown, key = KEY, body: unknown = {}) =>
  post(route)({
    request: new Request("http://localhost/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });

const ARABIC_RTL = (html: string, name: string) => {
  expect(html, name).toMatch(/<html[^>]*lang="ar"/);
  expect(html, name).toMatch(/<html[^>]*dir="rtl"/);
};
const ENGLISH_LTR = (html: string, name: string) => {
  expect(html, name).toMatch(/<html[^>]*lang="en"/);
  expect(html, name).toMatch(/<html[^>]*dir="ltr"/);
  // the shell and body copy are English: no Arabic letters outside the sample data
  const shell = html.replace(/<[^>]+>/g, " ");
  expect(shell, name).not.toMatch(/[\u0600-\u06FF]/);
};
const AUTH_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "reauthentication",
];

describe("auth email preview", () => {
  it("refuses a caller without the key", async () => {
    expect((await call(AuthPreview, "wrong", { type: "signup" })).status).toBe(401);
  });

  it.each(AUTH_TYPES)("%s renders in English, left to right, when asked", async (type) => {
    const res = await call(AuthPreview, KEY, { type, locale: "en" });
    expect(res.status).toBe(200);
    ENGLISH_LTR(await res.text(), type);
  });

  it.each(AUTH_TYPES)("%s renders in Arabic, right to left", async (type) => {
    const res = await call(AuthPreview, KEY, { type });
    expect(res.status).toBe(200);
    ARABIC_RTL(await res.text(), type);
  });

  it("refuses an inherited key as a template name", async () => {
    expect((await call(AuthPreview, KEY, { type: "constructor" })).status).toBe(400);
  });
});

describe("transactional email preview", () => {
  it("refuses a caller without the key", async () => {
    expect((await call(TransactionalPreview, "wrong")).status).toBe(401);
  });

  it("renders every template in Arabic, right to left", async () => {
    const res = await call(TransactionalPreview);
    expect(res.status).toBe(200);
    const raw = (await res.json()) as unknown;
    const list = (
      Array.isArray(raw) ? raw : ((raw as { templates?: unknown[] }).templates ?? [])
    ) as Array<{ templateName: string; html: string; status: string }>;
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      expect(t.status, t.templateName).toBe("ready");
      ARABIC_RTL(t.html, t.templateName);
    }
  });

  it("renders every template in English, left to right, when asked", async () => {
    const res = await call(TransactionalPreview, KEY, { locale: "en" });
    expect(res.status).toBe(200);
    const raw = (await res.json()) as unknown;
    const list = (
      Array.isArray(raw) ? raw : ((raw as { templates?: unknown[] }).templates ?? [])
    ) as Array<{ templateName: string; html: string; status: string; subject: string }>;
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      expect(t.status, t.templateName).toBe("ready");
      ENGLISH_LTR(t.html, t.templateName);
      expect(t.subject).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
