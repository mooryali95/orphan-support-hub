/**
 * صورة الطفل — في خزنةٍ خاصّة، برابطٍ موقَّعٍ قصير.
 *
 * كانت الصورة في `public-media`: خزنةٌ عامّة يُنزَّل كلّ ملفٍّ فيها بلا جلسة،
 * وتُسرد مجلّداتها بمعرّف الطفل المعلن — فتصل من لا نطاق «هوية» له، وتبقى
 * بعد سحب الوليّ موافقته. الآن تحفظ القاعدة مساراً في `orphan-photos`
 * الخاصّة، و`orphan_view` لا تُعيده إلا لمن له «الهوية» وموافقته قائمة،
 * والخادم يوقّعه بجلسة القارئ نفسه — فسياسة الخزنة تفحصه مرّةً ثانية.
 *
 * والمدّة قصيرة عمداً: السحب يُغلق الصورة عند انقضاء آخر رابط.
 */

export const CHILD_PHOTO_BUCKET = "orphan-photos";
export const CHILD_PHOTO_TTL_SECONDS = 600;

/** مسارٌ داخل مجلّد الطفل نفسه — الشرط نفسه في `photo_url_is_platform`. */
export function isChildPhotoPath(
  orphanId: string,
  path: string | null | undefined,
): path is string {
  if (!path || path.includes("..")) return false;
  const [folder, file, ...rest] = path.split("/");
  return folder === orphanId && rest.length === 0 && !!file && /^[A-Za-z0-9._-]+$/.test(file);
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

/**
 * رابطٌ موقَّع بجلسة القارئ، أو لا شيء. رابطٌ قديم من نطاقٍ آخر أو من
 * الخزنة العامّة لا يُمرَّر أبداً — ولو وصل من القاعدة.
 */
export async function signChildPhoto(
  client: StorageClient,
  orphanId: string,
  path: string | null | undefined,
): Promise<string | null> {
  if (!isChildPhotoPath(orphanId, path)) return null;
  const { data, error } = await client.storage
    .from(CHILD_PHOTO_BUCKET)
    .createSignedUrl(path, CHILD_PHOTO_TTL_SECONDS);
  return error || !data ? null : data.signedUrl;
}
