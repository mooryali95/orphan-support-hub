/**
 * «أتابعهم»: الزائر بلا حساب يحفظ أطفالاً ليعود إليهم. في متصفّحه وحده (localStorage)،
 * بالمعرّف والاسم المعروض العامّ فقط، ولا يُرسل شيءٌ إلى الخادم.
 */
export type Followed = { id: string; name: string };
const KEY = "followed-children:v1";
const MAX = 12;
export const FOLLOW_EVENT = "followed-change";

export function loadFollowed(store: Pick<Storage, "getItem"> | null = safe()): Followed[] {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x) => x && typeof x.id === "string" && typeof x.name === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

/** adds or removes; the newest first; returns the new list */
export function toggleFollowed(
  child: Followed,
  store: Pick<Storage, "getItem" | "setItem"> | null = safe(),
): Followed[] {
  const list = loadFollowed(store);
  const next = list.some((x) => x.id === child.id)
    ? list.filter((x) => x.id !== child.id)
    : [child, ...list].slice(0, MAX);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FOLLOW_EVENT));
  return next;
}

function safe(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
