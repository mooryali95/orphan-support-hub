/** يركّب قاعة الأثر داخل العنصر ويعيد دالةً تفكّها (المشهد والمستمعون والحلقة). */
export function mountHall(
  root: HTMLElement,
  opts: {
    brand: string;
    linked?: string[] | Promise<string[]>;
    /** the client demo (/try): its fictional children by hall region, and the gift to replay */
    demo?: {
      kids: Array<{
        id: string;
        name: string;
        co: string;
        region: string;
        gap: number;
        mine?: boolean;
      }>;
      focus?: {
        co: string;
        region: string;
        name: string;
        cadence: "monthly" | "one_time";
      } | null;
    } | null;
  },
): () => void;
