/**
 * Quiet background warm-up of the hall from any page: once the current page has loaded and the
 * browser is idle, fetch the hall's route and 3D chunks so arriving at /hall feels instant.
 * Skipped on save-data / slow (2g, 3g) connections, on phone-sized screens (the scene chunk is
 * ~345KB gzipped; on a phone it would compete with the visible page for CPU and data, and the
 * hall route still preloads it on intent) and on browsers that cannot draw the scene.
 * The chunks are content-hashed, so the browser's HTTP cache keeps them across visits.
 */
import { loadHallScene } from "@/lib/hall/preload";
import { hasWebGL2 } from "@/lib/hall/webgl";

type Conn = { saveData?: boolean; effectiveType?: string };

export function shouldWarm(conn: Conn | undefined, webgl: boolean, narrow = false): boolean {
  if (!webgl || narrow) return false;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|-)[23]g$/.test(conn.effectiveType)) return false;
  return true;
}

let started = false;
export function warmHallWhenIdle(preloadRoute: () => Promise<unknown>): () => void {
  if (typeof window === "undefined" || started) return () => {};
  const conn = (navigator as Navigator & { connection?: Conn }).connection;
  const narrow = window.matchMedia?.("(max-width: 767px)").matches ?? false;
  if (!shouldWarm(conn, hasWebGL2(), narrow)) return () => {};
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (started) return;
    started = true;
    void preloadRoute().catch(() => {});
    void loadHallScene().catch(() => {});
  };
  const schedule = () => {
    // let the visible page finish first, then use the browser's spare time
    timer = setTimeout(() => {
      const ric = window.requestIdleCallback;
      if (ric) idleId = ric(run, { timeout: 8000 });
      else run();
    }, 2500);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (timer) clearTimeout(timer);
    if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
  };
}
