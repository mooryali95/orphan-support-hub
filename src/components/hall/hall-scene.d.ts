import type { HallLocale } from "@/lib/hall/copy";
import type { DonorHall } from "@/lib/hall/donor";
import type { HallStage, HallStep } from "@/lib/hall/history";
import type { HallLive } from "@/lib/hall/live";
import type { TrialDemo } from "@/lib/hall/trial";

/** يركّب قاعة الأثر داخل العنصر ويعيد دالةً تفكّها (المشهد والمستمعون والحلقة). */
export function mountHall(
  root: HTMLElement,
  opts: {
    brand: string;
    /** the interface language: the scene's strings, direction, numerals and country names */
    i18n: HallLocale;
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
    /**
     * the live hall's own strings, its one currency and its sample names, in the interface
     * language (`@/lib/hall/live`). Set for the live hall only: the trial and the donor's hall
     * never reach its panels.
     */
    text?: HallLive | null;
    /** the country the visitor was looking at on the pages: the hall lands on it once, on entry */
    start?: string | null;
    /**
     * the donor's own hall (`@/lib/hall/donor`): their real sponsorships as their dashboard reads
     * them (null when they could not be read), and the platform's kinds of giving by name. When
     * set, and outside the trial, the hall shows the world and their figures only: no simulated
     * country, support sheet or film.
     */
    mine?: { data: Promise<DonorHall | null>; kinds: Array<{ name: string }> } | null;
    /**
     * a vector mark to build in 3D (`./mark3d.js`): the gate's emblem and the seal in the floor.
     * Path data as in the approved file; `body` is lacquer, `trim` and `inlay` brushed metal.
     */
    mark?: {
      viewBox: string;
      parts: Array<{ d: string; role: "body" | "trim" | "inlay" }>;
      lightAt?: { x: number; y: number; r: number };
      colors: { body: string; metal: string; light: string };
    } | null;
    /** every stage the visitor reaches (the film reports only where it stopped) */
    onStage?: ((stage: HallStage) => void) | null;
    /** Escape, deeper than the hall floor: the page takes one step back in the history */
    onBack?: (() => void) | null;
  },
): HallHandle;

/** call it to dismantle the hall (scene, listeners, loop, GPU context) */
export type HallHandle = (() => void) & {
  /** walks the scene to a stage with its own moves; a move still playing is waited for */
  goTo(stage: "hall" | HallStep): void;
};
