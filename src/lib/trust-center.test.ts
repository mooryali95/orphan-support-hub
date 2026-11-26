import { describe, expect, it } from "vitest";

import { agingTotal, shareOf, teamFlag, verificationHref, weeklyCsv } from "./trust-center";

const team = {
  code: "SD",
  name_ar: "السودان",
  name_local: "Sudan",
  data_entry: 0,
  viewers: 0,
  pending: 0,
};

describe("trust center", () => {
  it("has no share for a country without files", () => {
    expect(shareOf(0, 0)).toBeNull();
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(3, 3)).toBe(100);
    expect(shareOf(3799, 3800)).toBe(99);
  });

  it("flags teams that cannot do four-eyes", () => {
    expect(teamFlag({ ...team, supervisors: 0, active_supervisors: 0 })).toBe("no_team");
    expect(teamFlag({ ...team, supervisors: 1, active_supervisors: 1 })).toBe("one_supervisor");
    expect(teamFlag({ ...team, supervisors: 2, active_supervisors: 1, pending: 1 })).toBe(
      "invited_only",
    );
    expect(teamFlag({ ...team, supervisors: 2, active_supervisors: 2 })).toBe("ok");
  });

  it("sums aging buckets", () => {
    expect(
      agingTotal({
        code: "TH",
        name_ar: "",
        name_local: null,
        lt1: 1,
        d1_3: 2,
        d3_7: 3,
        gt7: 4,
        oldest: null,
      }),
    ).toBe(10);
  });

  it("links to the country in verification sources", () => {
    expect(verificationHref("LK")).toBe("/admin?tab=data&area=sources&country=LK");
  });

  it("exports one row per week", () => {
    const csv = weeklyCsv(
      {
        country: "SN",
        files: 2,
        verified_now: 1,
        weeks: [
          {
            week: "2026-11-23",
            opened: 3,
            opened_critical: 1,
            settled: 2,
            open_at_end: 4,
            files_observed: 9,
          },
        ],
      },
      {
        week: "W",
        opened: "O",
        openedCritical: "C",
        settled: "S",
        openAtEnd: "E",
        filesObserved: "F",
      },
    );
    expect(csv).toBe("﻿W,O,C,S,E,F\r\n2026-11-23,3,1,2,4,9\r\n");
  });
});
