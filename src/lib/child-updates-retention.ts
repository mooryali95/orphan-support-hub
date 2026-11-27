/**
 * استبقاء وسائط تحديثات الطفل (هجرة 20261202100000_child_updates_retention).
 *
 * المرفوض يُحذف ملفّه فور الرفض (`purgeChildUpdateMedia`)، وصفّه بعد 30 يوماً؛
 * وتحديثات الطفل المؤرشَف بلا كفالةٍ قائمة تُمحى بعد `archiveDays` (365 افتراضاً).
 * يعمل بعميل الخدمة وحده: القاعدة تسرد المستحقّ، فتُحذف الملفّات، ثم تُمحى
 * الصفوف التي حُذفت ملفّاتها — فلا يبقى ملفٌّ بلا صفٍّ يدلّ عليه.
 */
export const CHILD_UPDATES_BUCKET = "child-updates";
export const DEFAULT_ARCHIVE_DAYS = 365;
const MIN_ARCHIVE_DAYS = 30;
/** Storage يقبل عدداً محدوداً من المسارات في الطلب الواحد. */
const REMOVE_CHUNK = 100;

export type RetentionDb = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

/** المدّة من البيئة؛ ما ليس عدداً صحيحاً ≥30 يعود إلى الافتراض. */
export function archiveDaysFrom(raw: string | undefined): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n >= MIN_ARCHIVE_DAYS ? n : DEFAULT_ARCHIVE_DAYS;
}

/** يحذف المسارات من الخزنة الخاصّة؛ true إن حُذفت كلّها (أو لم يكن شيء). */
export async function purgeChildUpdateMedia(db: RetentionDb, paths: string[]): Promise<boolean> {
  const list = [...new Set(paths.filter((p) => typeof p === "string" && p.length > 0))];
  for (let i = 0; i < list.length; i += REMOVE_CHUNK) {
    const { error } = await db.storage
      .from(CHILD_UPDATES_BUCKET)
      .remove(list.slice(i, i + REMOVE_CHUNK));
    if (error) return false;
  }
  return true;
}

type DueItem = { id: string; reason: "rejected" | "archived"; paths: string[] };

export type RetentionSummary = {
  due: number;
  deleted: number;
  storageFailed: number;
  /** كائناتٌ مضى عليها يومٌ بلا صفٍّ في child_updates فحُذفت (N1). */
  stray: number;
};

/**
 * ما رُفع ولم يُسجَّل بـ `child_update_create` لا يبقى: بلا موافقة وليٍّ ولا
 * مراجعة، فيُحذف بعد 24 ساعة (مهلةٌ تكفي لإكمال تسجيل رفعٍ جارٍ).
 */
export async function sweepStrayChildUpdateObjects(
  db: RetentionDb,
): Promise<{ stray: number; failed: boolean }> {
  const res = await db.rpc("child_updates_stray_objects", { _limit: 500 });
  if (res.error) throw new Error(res.error.message);
  const paths = ((res.data as { paths?: string[] } | null)?.paths ?? []).filter(
    (p) => typeof p === "string",
  );
  if (paths.length === 0) return { stray: 0, failed: false };
  const ok = await purgeChildUpdateMedia(db, paths);
  if (!ok) return { stray: 0, failed: true };
  const done = await db.rpc("child_updates_stray_done", { _deleted: paths.length });
  if (done.error) throw new Error(done.error.message);
  return { stray: paths.length, failed: false };
}

export async function runChildUpdatesRetention(
  db: RetentionDb,
  archiveDays: number = DEFAULT_ARCHIVE_DAYS,
): Promise<RetentionSummary> {
  const due = await db.rpc("child_updates_retention_due", { _archive_days: archiveDays });
  if (due.error) throw new Error(due.error.message);
  const body = due.data as { ok: boolean; code?: string; items?: DueItem[] } | null;
  if (!body?.ok) throw new Error(body?.code ?? "retention_due_failed");
  const items = body.items ?? [];

  // صفٌّ لا يُمحى قبل أن تُحذف ملفّاته؛ ما تعذّر حذفه يعود في التشغيل التالي.
  const cleared: string[] = [];
  let storageFailed = 0;
  for (let i = 0; i < items.length; i += REMOVE_CHUNK) {
    const chunk = items.slice(i, i + REMOVE_CHUNK);
    if (
      await purgeChildUpdateMedia(
        db,
        chunk.flatMap((x) => x.paths ?? []),
      )
    ) {
      cleared.push(...chunk.map((x) => x.id));
    } else {
      storageFailed += chunk.length;
    }
  }

  let deleted = 0;
  if (cleared.length > 0) {
    const done = await db.rpc("child_updates_retention_done", {
      _ids: cleared,
      _archive_days: archiveDays,
    });
    if (done.error) throw new Error(done.error.message);
    deleted = (done.data as { deleted?: number } | null)?.deleted ?? 0;
  }
  const sweep = await sweepStrayChildUpdateObjects(db);
  if (sweep.failed) storageFailed += 1;
  return { due: items.length, deleted, storageFailed, stray: sweep.stray };
}
