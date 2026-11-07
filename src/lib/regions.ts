import { normalize } from "@/lib/countries";

/**
 * مناطق الدولة كما ترسمها الخارطة — قائمة إدخال المنطقة (UX-10).
 *
 * كانت المنطقة نصّاً حرّاً، والخارطة تطابق بالاسم: «شكودر» لا تطابق
 * «إشقودرة» فيختفي أطفالها من التفصيل. الآن تُختار المنطقة من ملفّ
 * `/geo/admin1/<الدولة>.json` نفسه الذي ترسمه الخارطة، ويُخزَّن اسمها
 * العربي كما فيه — فما يُدخَل هو ما يُطابَق.
 */
export type RegionShape = { id: string; n: string; en: string; alt: string };
export type RegionOption = { id: string; value: string; label: string };

export function regionOptions(regions: readonly RegionShape[]): RegionOption[] {
  return regions
    .map((r) => ({
      id: r.id,
      value: r.n,
      label: r.en && r.en !== r.n ? `${r.n} (${r.en})` : r.n,
    }))
    .sort((a, b) => a.value.localeCompare(b.value, "ar"));
}

/**
 * يردّ نصّاً مكتوباً من قبل (أيّ تهجئة تعرفها الخارطة) إلى اسم المنطقة
 * المعتمد في القائمة؛ وما لا يُعرف يعود null فيُطلب اختياره.
 */
export function resolveRegion(
  text: string | null | undefined,
  regions: readonly RegionShape[],
): string | null {
  if (!text) return null;
  const key = normalize(text);
  if (!key) return null;
  for (const r of regions) {
    const names = [r.n, r.en, ...r.alt.split("|")].map(normalize);
    if (names.includes(key)) return r.n;
  }
  return null;
}

export async function fetchRegions(code: string): Promise<RegionShape[]> {
  const res = await fetch(`/geo/admin1/${code}.json`);
  if (!res.ok) return [];
  const body = (await res.json()) as { regions: RegionShape[] };
  return body.regions.map(({ id, n, en, alt }) => ({ id, n, en, alt }));
}
