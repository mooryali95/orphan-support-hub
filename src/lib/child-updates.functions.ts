import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  checkMedia,
  childUpdatePath,
  CHILD_UPDATE_LIMITS,
  type ChildUpdate,
  type ChildUpdateKind,
  type PendingChildUpdate,
} from "@/lib/child-updates";
import { QUEUE_PAGE } from "@/lib/golden-record";
import { queuePage } from "@/lib/golden-record.functions";
import { callRpc, type RpcResult } from "@/lib/rpc-call";

/**
 * تحديثات الطفل في الخادم. القاعدة تحرس كلّ شيء (`my_child_updates` للكافل النشط،
 * `child_update_queue` لفريق الدولة، وسياسة خزنة `child-updates`)؛ هنا تُوقَّع روابط
 * الوسائط بعميل المستخدم نفسه — فلا يُوقَّع إلا ما تُجيزه السياسة — لعشر دقائق.
 */
const BUCKET = "child-updates";
const SIGNED_SECONDS = 600;

type Storage = {
  storage: {
    from: (b: string) => {
      createSignedUrls: (
        paths: string[],
        ttl: number,
      ) => PromiseLike<{
        data: Array<{ path: string | null; signedUrl: string | null }> | null;
        error: unknown;
      }>;
      createSignedUploadUrl: (
        path: string,
      ) => PromiseLike<{ data: { signedUrl: string; token: string } | null; error: unknown }>;
    };
  };
};

type RawMedia = { storage_path: string | null; poster_path: string | null };

async function sign<T extends RawMedia>(client: unknown, rows: T[]) {
  const paths = [
    ...new Set(rows.flatMap((r) => [r.storage_path, r.poster_path]).filter(Boolean)),
  ] as string[];
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await (client as Storage).storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return rows.map(({ storage_path, poster_path, ...rest }) => ({
    ...rest,
    url: storage_path ? (urls.get(storage_path) ?? null) : null,
    poster_url: poster_path ? (urls.get(poster_path) ?? null) : null,
  }));
}

type RawUpdate = Omit<ChildUpdate, "url" | "poster_url"> & RawMedia;
type RawPending = Omit<PendingChildUpdate, "url" | "poster_url"> & RawMedia;

/** المعتمد لطفلٍ يكفله المستخدم كفالةً نشطة؛ قائمةٌ فارغة لغيره. */
export const listChildUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orphanId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<RpcResult<ChildUpdate[]>> => {
    const res = await callRpc<{ items: RawUpdate[] }>(context.supabase, "my_child_updates", {
      _orphan: data.orphanId,
    });
    if (!res.ok) return res;
    return { ok: true, data: await sign(context.supabase, res.data.items) };
  });

/** ما ينتظر الحسم: دولةٌ لفريقها، أو `null` للإدارة (كلّ الدول). */
export const listChildUpdateQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable(),
        ...queuePage,
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RpcResult<PendingChildUpdate[]>> => {
    const res = await callRpc<{ items: RawPending[] }>(context.supabase, "child_update_queue", {
      _country: data.country,
      _limit: data.limit ?? QUEUE_PAGE,
      _after: data.after ?? null,
    });
    if (!res.ok) return res;
    return { ok: true, data: await sign(context.supabase, res.data.items) };
  });

export type UpdateChild = { id: string; code: string; display_name: string; frozen: boolean };

export const searchUpdateChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ country: z.string().regex(/^[A-Z]{2}$/), q: z.string().max(80) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<RpcResult<UpdateChild[]>> => {
    const res = await callRpc<{ items: UpdateChild[] }>(context.supabase, "child_update_children", {
      _country: data.country,
      _q: data.q,
    });
    return res.ok ? { ok: true, data: res.data.items } : res;
  });

/** رابط رفعٍ موقَّع بعد فحص النوع والحجم؛ سياسة الخزنة تحرس الدولة والتجميد. */
export const createChildUpdateUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        type: z.string().max(60),
        size: z.number().int().positive(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const check = checkMedia(data.type, data.size);
    if (!check.ok) return { ok: false as const, error: check.code };
    const path = childUpdatePath(data.orphanId, crypto.randomUUID(), check.ext);
    const { data: signed, error } = await (context.supabase as unknown as Storage).storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, error: "upload_forbidden" };
    return { ok: true as const, path, kind: check.kind, signedUrl: signed.signedUrl };
  });

export const submitChildUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        kind: z.enum(["photo", "video", "note"] satisfies ChildUpdateKind[]),
        path: z.string().max(200).nullable(),
        posterPath: z.string().max(200).nullable(),
        captionAr: z.string().trim().min(1).max(CHILD_UPDATE_LIMITS.captionChars),
        captionEn: z.string().trim().max(CHILD_UPDATE_LIMITS.captionChars),
        consent: z.boolean(),
        durationSeconds: z.number().int().min(1).max(CHILD_UPDATE_LIMITS.videoSeconds).nullable(),
      })
      .parse(i),
  )
  .handler(({ data, context }) =>
    callRpc<{ ok: true; id: string }>(context.supabase, "child_update_create", {
      _orphan: data.orphanId,
      _kind: data.kind,
      _path: data.path,
      _caption_ar: data.captionAr,
      _caption_en: data.captionEn,
      _consent: data.consent,
      _duration: data.durationSeconds,
      _poster: data.posterPath,
    }),
  );

export const reviewChildUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RpcResult<{ ok: true }>> => {
    const res = await callRpc<{ ok: true; purge?: string[] }>(
      context.supabase,
      "child_update_review",
      { _id: data.id, _decision: data.decision, _reason: data.reason },
    );
    if (!res.ok) return res;
    // المرفوض يُحذف ملفّه الآن بعميل الخدمة؛ وإن تعذّر التقطه الاستبقاء الدوري.
    const purge = res.data.purge ?? [];
    if (purge.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { purgeChildUpdateMedia } = await import("@/lib/child-updates-retention");
      type Db = Parameters<typeof purgeChildUpdateMedia>[0];
      if (!(await purgeChildUpdateMedia(supabaseAdmin as unknown as Db, purge))) {
        const { logServerEvent } = await import("@/lib/server-log");
        logServerEvent("warn", "child_updates.purge_deferred", { count: purge.length });
      }
    }
    return { ok: true, data: { ok: true } };
  });
