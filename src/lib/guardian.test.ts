import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONSENT_AR } from "./guardian.functions";
import { CONSENT_SQ } from "./i18n";

/**
 * نصّ الموافقة الذي يقرؤه الوليّ قبل الضغط يجب أن يطابق حرفياً ما يُحفظ
 * في السجلّ (consent_statement في القاعدة) — وإلا وافق على نصٍّ وحُفظ غيره.
 */
describe("نصّ الموافقة", () => {
  const sql = readFileSync("supabase/migrations/20260920100000_guardian_consents.sql", "utf8");
  for (const [key, text] of Object.entries(CONSENT_AR)) {
    it(`«${key}» في الواجهة = في القاعدة`, () => {
      expect(sql).toContain(`WHEN '${key}' THEN '${text}'`);
    });
    it(`«${key}» له ترجمة ألبانية`, () => {
      expect(CONSENT_SQ[key]).toBeTruthy();
    });
  }
});
