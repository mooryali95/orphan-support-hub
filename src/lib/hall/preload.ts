/**
 * the hall's heavy chunks (three.js and the scene; the trial catalogue in the trial), asked for
 * ahead of the page that needs them. One place names the two imports, so the page (`hall.lazy`)
 * and the warm-up (`routes/hall.tsx`: a hard load of `/hall`, and every link into the hall on
 * hover, touch or focus through the router's preload) fetch the very same chunks once.
 *
 * Browser only: the server never loads the scene. And only a browser that can draw it: one
 * without WebGL 2 is shown the page's plain notice and would never use the chunks (`./webgl`).
 */
import { hallSource, type HallSearch } from "@/lib/hall/source";
import { hasWebGL2 } from "@/lib/hall/webgl";
import { trialSlots } from "@/lib/trial-slots";

export const loadHallScene = () => import("@/components/hall/hall-scene.js");
/** the trial catalogue, from the trial when it is there (`@/lib/trial-slots`); none without it */
export const loadHallTrial = () => trialSlots?.loadHall() ?? Promise.resolve(null);

/** starts the downloads and returns at once; a failure here is the page's to report, not ours */
export function warmHall(search: HallSearch): void {
  if (typeof window === "undefined" || !hasWebGL2()) return;
  void loadHallScene().catch(() => {});
  if (hallSource(search).mode === "trial") void loadHallTrial().catch(() => {});
}
