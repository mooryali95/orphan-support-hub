/**
 * صورة الطفل — في خزنةٍ خاصّة، برابطٍ موقَّعٍ قصير.
 *
 * كانت الصورة في `public-media`: خزنةٌ عامّة يُنزَّل كلّ ملفٍّ فيها بلا جلسة،
 * وتُسرد مجلّداتها بمعرّف الطفل المعلن — فتصل من لا نطاق «هوية» له، وتبقى
 * بعد سحب الوليّ موافقته. الآن تحفظ القاعدة مساراً في `orphan-photos`
 * الخاصّة، و`orphan_view` لا تُعيده إلا لمن له «الهوية» وموافقته قائمة،
 * والمتصفّح يُنزّله بجلسة القارئ نفسه — فسياسة الخزنة تفحصه عند كلّ عرض.
 *
 * ولا رابط موقَّعاً أصلاً: الرابط لا يُسحب بعد إصداره، فمن احتفظ به
 * يرى الصورة بعد سحب الموافقة حتى ينقضي.
 */

export const CHILD_PHOTO_BUCKET = "orphan-photos";
/** مسارٌ داخل مجلّد الطفل نفسه — الشرط نفسه في `photo_url_is_platform`. */
export function isChildPhotoPath(
  orphanId: string,
  path: string | null | undefined,
): path is string {
  if (!path || path.includes("..")) return false;
  const [folder, file, ...rest] = path.split("/");
  return folder === orphanId && rest.length === 0 && !!file && /^[A-Za-z0-9._-]+$/.test(file);
}

/**
 * مسار الصورة كما يُسلَّم للمتصفّح: صالحٌ أو لا شيء. لا رابط موقَّع —
 * المتصفّح يُنزّلها بجلسة القارئ (`usePrivateFile`)، فتفحص سياسة الخزنة
 * «الهوية» والموافقة عند كلّ عرض، ويُغلق السحبُ الصورةَ فوراً.
 */
export function childPhotoPath(orphanId: string, path: string | null | undefined): string | null {
  return isChildPhotoPath(orphanId, path) ? path : null;
}
