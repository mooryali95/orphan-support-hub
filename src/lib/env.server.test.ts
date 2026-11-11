import { afterEach, describe, expect, it } from "vitest";

import { appBaseUrl, configSummary, parseServerEnv, resetServerConfig } from "./env.server";

const BASE = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
};

describe("ARC-12: إعداد الخادم", () => {
  afterEach(() => {
    resetServerConfig();
    delete process.env["PUBLIC_BASE_URL"];
    delete process.env["APP_ORIGIN"];
  });

  it("غياب القاعدة خطأٌ مسمّى", () => {
    const c = parseServerEnv({});
    expect(c.errors).toEqual(
      expect.arrayContaining(["SUPABASE_URL: مطلوب", "SUPABASE_PUBLISHABLE_KEY: مطلوب"]),
    );
  });

  it("القيمة المشوّهة تُسمّى ولا تُعاد قيمتها", () => {
    const c = parseServerEnv({ ...BASE, PUBLIC_BASE_URL: "ioco.app", LOVABLE_SEND_URL: "x" });
    expect(c.errors).toContain("PUBLIC_BASE_URL: قيمةٌ غير صالحة");
    expect(c.errors.join(" ")).not.toContain("ioco.app");
  });

  it("الفارغ غائب، والميزة الناقصة تُسمّي ما ينقصها", () => {
    const c = parseServerEnv({ ...BASE, LOVABLE_API_KEY: "  ", SUPABASE_SERVICE_ROLE_KEY: "k" });
    expect(c.errors).toEqual([]);
    expect(c.features.email.ready).toBe(false);
    expect(c.features.email.missing).toEqual(["LOVABLE_API_KEY", "PUBLIC_BASE_URL"]);
    expect(c.features.admin.ready).toBe(true);
  });

  it("عنوان الأصل واحد: PUBLIC_BASE_URL، وAPP_ORIGIN احتياطٌ قديم، ولا نطاق مخترع", () => {
    Object.assign(process.env, BASE);
    expect(appBaseUrl()).toBeNull();
    resetServerConfig();
    process.env["APP_ORIGIN"] = "https://old.example/";
    expect(appBaseUrl()).toBe("https://old.example");
    resetServerConfig();
    process.env["PUBLIC_BASE_URL"] = "https://new.example//";
    expect(appBaseUrl()).toBe("https://new.example");
  });

  it("ملخّص الصحّة يحمل أسماءً وقيماً منطقية فقط", () => {
    Object.assign(process.env, BASE, { LOVABLE_API_KEY: "secret-value" });
    const s = JSON.stringify(configSummary());
    expect(s).not.toContain("secret-value");
    expect(s).not.toContain("sb_publishable_x");
    delete process.env["LOVABLE_API_KEY"];
  });
});
