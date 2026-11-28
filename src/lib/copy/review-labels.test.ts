import { describe, expect, it } from "vitest";

import { REJECTION_LABELS } from "@/lib/intake.functions";
import { SECTION_LABELS } from "@/lib/profile.functions";
import { REVIEW_LABELS_COPY } from "./review-labels";

describe("review labels copy", () => {
  it("matches the Arabic source tables and covers every key in English", () => {
    expect(REVIEW_LABELS_COPY.ar.rejection).toEqual(REJECTION_LABELS);
    expect(REVIEW_LABELS_COPY.ar.sections).toEqual(SECTION_LABELS);
    expect(Object.keys(REVIEW_LABELS_COPY.en.rejection).sort()).toEqual(
      Object.keys(REJECTION_LABELS).sort(),
    );
    expect(Object.keys(REVIEW_LABELS_COPY.en.sections).sort()).toEqual(
      Object.keys(SECTION_LABELS).sort(),
    );
  });
});
