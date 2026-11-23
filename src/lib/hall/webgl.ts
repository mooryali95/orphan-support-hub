/**
 * whether this browser can draw the hall (WebGL 2), asked once and remembered. The route's
 * warm-up (`./preload`) and the page (`routes/hall.lazy`) both read this one answer, so a browser
 * without WebGL never downloads the scene it cannot use, and a browser with it is probed once.
 *
 * Cheap first: a browser that does not even define `WebGL2RenderingContext` is answered without
 * a canvas. Otherwise one context is opened on a 1×1 canvas and given back at once
 * (`WEBGL_lose_context`), so no context is left held and a visitor who enters the hall many
 * times never runs into the browser's context limit.
 */
let answer: boolean | null = null;

export function hasWebGL2(): boolean {
  if (answer !== null) return answer;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (typeof WebGL2RenderingContext === "undefined") return (answer = false);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const gl = canvas.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    answer = !!gl;
  } catch {
    answer = false;
  }
  return answer;
}

/** tests only: forget the remembered answer */
export function forgetWebGL2(): void {
  answer = null;
}
