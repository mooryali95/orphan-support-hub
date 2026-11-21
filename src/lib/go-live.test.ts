import { describe, expect, it } from "vitest";

import { goLiveSteps, linkHealth, readyToGoLive, SYNC_FRESH_HOURS, syncFresh } from "./go-live";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const link = (country: string, hours: number, orphans = 12) => ({
  country,
  syncedAt: hoursAgo(hours),
  orphans,
});
const operating = (links: Parameters<typeof goLiveSteps>[0]["links"]) =>
  goLiveSteps({ published: 3, links, payments: true, now: NOW }).find(
    (s) => s.key === "operating",
  )!;

describe("جاهزية الاعتماد", () => {
  it("لا جاهزية بلا ملفّاتٍ منشورة، ولو رُبطت المنصّة والدفع", () => {
    const s = goLiveSteps({
      published: 0,
      links: [link("AL", 1), link("XK", 2)],
      payments: true,
      now: NOW,
    });
    expect(s.find((x) => x.key === "children")!.done).toBe(false);
    expect(readyToGoLive(s)).toBe(false);
  });

  it("تعذّر التحقّق من الدفع ليس «جاهزاً»", () => {
    expect(
      readyToGoLive(
        goLiveSteps({ published: 3, links: [link("AL", 1)], payments: null, now: NOW }),
      ),
    ).toBe(false);
  });

  it("جاهزةٌ حين تتحقّق الشروط الثلاثة", () => {
    expect(
      readyToGoLive(
        goLiveSteps({ published: 3, links: [link("AL", 1)], payments: true, now: NOW }),
      ),
    ).toBe(true);
  });
});

describe("جاهزية ربط منصّة التشغيل", () => {
  it("روابط لم تُقرأ بعد «غير معروف» لا «غير مربوط»", () => {
    expect(operating(null).done).toBeNull();
    expect(
      readyToGoLive(goLiveSteps({ published: 3, links: null, payments: true, now: NOW })),
    ).toBe(false);
  });

  it("لا دولة مربوطة: لم يتحقّق", () => {
    const s = operating([]);
    expect(s.done).toBe(false);
    expect(s.detail).toContain("لا دولة مربوطة");
  });

  it("دفعةٌ وصلت بلا أطفال في المرآة ليست ربطاً جاهزاً", () => {
    const s = operating([link("AL", 1, 0)]);
    expect(s.done).toBe(false);
    expect(s.detail).toContain("لا طفل في المرآة");
  });

  it("مزامنةٌ أقدم من الحدّ تُسقط الجاهزية", () => {
    const s = operating([link("AL", SYNC_FRESH_HOURS + 1)]);
    expect(s.done).toBe(false);
    expect(s.detail).toContain(String(SYNC_FRESH_HOURS));
    expect(operating([link("AL", SYNC_FRESH_HOURS - 1)]).done).toBe(true);
  });

  it("وقت مزامنةٍ لا يُقرأ أو من المستقبل لا يُعدّ حديثاً", () => {
    expect(syncFresh("", NOW)).toBe(false);
    expect(syncFresh("null", NOW)).toBe(false);
    expect(syncFresh(hoursAgo(-5), NOW)).toBe(false);
    expect(syncFresh(hoursAgo(0), NOW)).toBe(true);
  });

  it("دولةٌ سليمة تكفي، والمتأخّرة تُذكر ولا تُخفى", () => {
    const s = operating([link("AL", 1), link("XK", 200), link("BA", 1, 0)]);
    expect(s.done).toBe(true);
    expect(s.detail).toContain("دولةٌ واحدة مربوطة");
    expect(s.detail).toContain("ودولتان");
  });

  it("منصّتان في دولةٍ واحدة تُعدّان دولةً واحدة بأحسن حالَيها", () => {
    expect(linkHealth([link("AL", 200), link("AL", 1)], NOW)).toEqual({
      linked: 1,
      healthy: 1,
      withChildren: 1,
    });
    expect(linkHealth([link("AL", 1), link("AL", 200, 0)], NOW).healthy).toBe(1);
  });

  it("النصوص بالإنجليزية حين تُطلب", () => {
    const s = goLiveSteps(
      { published: 3, links: [link("AL", 1), link("XK", 1)], payments: false, now: NOW },
      "en",
    );
    expect(s.map((x) => x.title)).toEqual([
      "Published child files",
      "An operating platform linked and in sync",
      "Payment gateway",
    ]);
    expect(s[1]!.detail).toBe("2 countries are linked and in sync, shown as real in the hall.");
  });
});
