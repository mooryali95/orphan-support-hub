/**
 * تحديثات الطفل للكافل (هجرة 20261201100000_child_updates): صورٌ ومقاطع قصيرة وملاحظات
 * يرفعها فريق دولة الطفل بموافقة الوليّ، ويحسمها غيرُ رافعها، ويراها الكافل النشط وحده.
 * صافٍ بلا React ولا خادم (child-updates.test.ts)؛ القاعدة هي الحارس، وهذه الحدود
 * تسبقها في المتصفّح والخادم ليعرف الرافع السبب قبل أن يرفع.
 */

import type { QueueCursor } from "@/lib/golden-record";

export type ChildUpdateKind = "photo" | "video" | "note";

/** الحدود نفسها في `child_update_create` وفي خزنة `child-updates`. */
export const CHILD_UPDATE_LIMITS = {
  photoBytes: 5 * 1024 * 1024,
  videoBytes: 40 * 1024 * 1024,
  videoSeconds: 60,
  captionChars: 500,
} as const;

export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export const VIDEO_TYPES = { "video/mp4": "mp4" } as const;

export type MediaCheck =
  | { ok: true; kind: "photo" | "video"; ext: string }
  | { ok: false; code: "type_unsupported" | "file_too_large" };

/** نوع الملفّ وحجمه قبل الرفع: صورة jpg/png/webp حتى 5MB، أو mp4 حتى 40MB. */
export function checkMedia(type: string, size: number): MediaCheck {
  const photo = PHOTO_TYPES[type as keyof typeof PHOTO_TYPES];
  if (photo)
    return size <= CHILD_UPDATE_LIMITS.photoBytes
      ? { ok: true, kind: "photo", ext: photo }
      : { ok: false, code: "file_too_large" };
  const video = VIDEO_TYPES[type as keyof typeof VIDEO_TYPES];
  if (video)
    return size <= CHILD_UPDATE_LIMITS.videoBytes
      ? { ok: true, kind: "video", ext: video }
      : { ok: false, code: "file_too_large" };
  return { ok: false, code: "type_unsupported" };
}

/** مسار الوسيط في الخزنة: مجلّد الطفل واسمٌ عشوائي — لا اسم ملفٍّ من الرافع. */
export function childUpdatePath(orphanId: string, id: string, ext: string): string {
  return `${orphanId}/${id}.${ext}`;
}

/** تحديثٌ معتمد كما يراه الكافل، بروابط موقَّعة قصيرة العمر (أو رسمٍ في التجربة). */
export type ChildUpdate = {
  id: string;
  kind: ChildUpdateKind;
  caption_ar: string;
  caption_en: string | null;
  at: string;
  duration_seconds: number | null;
  url: string | null;
  poster_url: string | null;
  /** بيانات نموذجية (التجربة): تُوسم «نموذج» ولا تُعرض كصورة طفلٍ حقيقي. */
  sample?: boolean;
};

/** بندٌ ينتظر الحسم في دولةٍ ما. */
export type PendingChildUpdate = {
  cursor?: QueueCursor;
  id: string;
  orphan_id: string;
  orphan_name: string;
  orphan_code: string;
  country_code: string;
  kind: ChildUpdateKind;
  caption_ar: string;
  caption_en: string | null;
  duration_seconds: number | null;
  created_at: string;
  mine: boolean;
  frozen: boolean;
  url: string | null;
  poster_url: string | null;
};

/** التعليق بلغة الواجهة، وبالعربية حين لا ترجمة. */
export function captionOf(u: Pick<ChildUpdate, "caption_ar" | "caption_en">, locale: string) {
  return locale === "en" && u.caption_en ? u.caption_en : u.caption_ar;
}

export type MonthGroup<T> = { month: string; items: T[] };

/** يجمع التحديثات شهراً شهراً (`YYYY-MM` بتوقيتٍ عالمي)، الأحدث أوّلاً. */
export function groupByMonth<T extends { at: string }>(items: readonly T[]): MonthGroup<T>[] {
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at));
  const out: MonthGroup<T>[] = [];
  for (const it of sorted) {
    const month = it.at.slice(0, 7);
    const last = out[out.length - 1];
    if (last?.month === month) last.items.push(it);
    else out.push({ month, items: [it] });
  }
  return out;
}

/** مدّة المقطع بالدقائق والثواني (0:42). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
