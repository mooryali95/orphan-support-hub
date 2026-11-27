import { describe, expect, it } from "vitest";

import { DECISIONS_COPY } from "@/components/admin/decisions/copy";
import {
  flattenHits,
  isSecurity,
  relativeTime,
  sentenceOf,
  type DecisionEvent,
  type SentenceLabels,
} from "@/lib/admin-tools";
import { nextCursor, QUEUE_PAGE } from "@/lib/golden-record";

const labels: SentenceLabels = {
  fields: { birth_date: "تاريخ الميلاد" },
  signals: { age_shift: "تغيّر العمر" },
  statuses: { reviewed: "رُوجع" },
  roles: { supervisor: "مشرف", removed: "أُزيل" },
  modes: { none: "بلا منصّة", shadow: "ظلّ" },
};
const ev = (over: Partial<DecisionEvent>): DecisionEvent => ({
  id: "1",
  src: "audit",
  at: "2026-11-25T10:00:00Z",
  actor: "سارة",
  action: "golden_conflict_resolve",
  orphan_id: null,
  code: null,
  country: null,
  field: "birth_date",
  from: "2013-06-01",
  to: "2013-07-01",
  detail: {},
  ...over,
});

describe("decision sentences", () => {
  const ar = DECISIONS_COPY.ar.sentences;
  it("reads a conflict approval with both values", () => {
    expect(sentenceOf(ev({}), ar, labels)).toBe(
      "سارة اعتمد تاريخ الميلاد 2013-07-01 بدل 2013-06-01",
    );
    expect(sentenceOf(ev({}), DECISIONS_COPY.en.sentences, { ...labels, fields: {} })).toBe(
      "سارة approved birth_date 2013-07-01 instead of 2013-06-01",
    );
  });
  it("reads keep, alerts, mode and unknown actors", () => {
    expect(sentenceOf(ev({ action: "golden_conflict_keep" }), ar, labels)).toContain("أبقى");
    expect(
      sentenceOf(
        ev({ action: "golden_alert_resolve", detail: { signal: "age_shift", status: "reviewed" } }),
        ar,
        labels,
      ),
    ).toBe("سارة حسم تنبيه «تغيّر العمر»: رُوجع");
    expect(
      sentenceOf(
        ev({ action: "country_source_mode", detail: { from: "none", to: "shadow" } }),
        ar,
        labels,
      ),
    ).toContain("«بلا منصّة» إلى «ظلّ»");
    expect(sentenceOf(ev({ actor: null, action: "sec_mfa_required" }), ar, labels)).toBe(
      "رُفض حسمٌ بلا العامل الثاني · النظام",
    );
    expect(isSecurity({ action: "sec_x" })).toBe(true);
    expect(isSecurity({ action: "golden_ingest" })).toBe(false);
  });
  it("formats relative time", () => {
    const now = Date.parse("2026-11-27T10:00:00Z");
    expect(relativeTime("2026-11-25T10:00:00Z", "en", now)).toBe("2 days ago");
    expect(relativeTime("2026-11-25T10:00:00Z", "ar", now)).toBe("قبل يومين");
  });
});

describe("keyset helpers", () => {
  it("returns the last cursor only for a full page", () => {
    const full = Array.from({ length: QUEUE_PAGE }, (_, i) => ({
      cursor: { k: 0, at: "t", id: String(i) },
    }));
    expect(nextCursor(full)?.id).toBe(String(QUEUE_PAGE - 1));
    expect(nextCursor(full.slice(1))).toBeNull();
    expect(nextCursor([{}], 1)).toBeNull();
  });
  it("flattens search hits in display order", () => {
    const hits = flattenHits({
      children: [{ id: "c", code: "X", name: "n", country: "SN", status: "approved" }],
      sponsors: [{ id: "s", name: null, email: "a@example.org" }],
      sponsorships: [],
      transfers: [],
    });
    expect(hits.map((h) => h.kind)).toEqual(["child", "sponsor"]);
  });
});
