import type { TrialDemo } from "@/lib/hall/trial";

/** يركّب قاعة الأثر داخل العنصر ويعيد دالةً تفكّها (المشهد والمستمعون والحلقة). */
export function mountHall(
  root: HTMLElement,
  opts: {
    brand: string;
    linked?: string[] | Promise<string[]>;
    /**
     * the client demo (/try): the trial model, its copy and its two writes, all from the trial
     * catalogue (`@/lib/hall/trial`). When set, the hall reads no figure of its own.
     */
    demo?: TrialDemo | null;
    /** the real directory's aggregate counts by country (geo_stats); small cohorts carry no numbers */
    live?: Promise<
      Array<{
        code: string | null;
        value: string;
        total: number | null;
        sponsored: number | null;
        small: boolean;
      }>
    > | null;
    /** the country the visitor was looking at on the pages: the hall lands on it once, on entry */
    start?: string | null;
  },
): () => void;
