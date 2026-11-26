import { describe, expect, it } from "vitest";

import {
  agingTotal,
  shareOf,
  shareRuns,
  teamFlag,
  verificationHref,
  weekShare,
  weeklyCsv,
} from "./trust-center";

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
        recorded_from: "2026-11-23",
        weeks: [
          {
            week: "2026-11-16",
            opened: 0,
            opened_critical: 0,
            settled: 0,
            open_at_end: 0,
            files_observed: 0,
            verified_share: null,
            recorded: false,
          },
          {
            week: "2026-11-23",
            opened: 3,
            opened_critical: 1,
            settled: 2,
            open_at_end: 4,
            files_observed: 9,
            verified_share: 50,
            recorded: true,
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
        verifiedShare: "V",
      },
    );
    expect(csv).toBe("﻿W,O,C,S,E,F,V\r\n2026-11-16,0,0,0,0,0,\r\n2026-11-23,3,1,2,4,9,50\r\n");
  });

  it("reads a week's share only when it was recorded", () => {
    expect(weekShare({ recorded: true, verified_share: 0 })).toBe(0);
    expect(weekShare({ recorded: true, verified_share: null })).toBeNull();
    expect(weekShare({ recorded: false, verified_share: 40 })).toBeNull();
    // قاعدةٌ قبل الحزمة لا تُرسل الحقلين.
    expect(weekShare({} as never)).toBeNull();
  });

  it("splits the line at unrecorded weeks", () => {
    expect(shareRuns([null, null, 40, 42, null, 50])).toEqual([
      [
        { i: 2, v: 40 },
        { i: 3, v: 42 },
      ],
      [{ i: 5, v: 50 }],
    ]);
    expect(shareRuns([null, null])).toEqual([]);
  });
});
