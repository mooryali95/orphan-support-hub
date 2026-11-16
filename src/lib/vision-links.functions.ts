/**
 * الدول المتّصلة فعلاً بمنصّة تشغيل (`public_operating_links`) — مجاميع فقط.
 * إن لم تصل الدالّة القاعدةَ بعد، أو تعذّرت القراءة، فكلّ الدول افتراضية:
 * لا نُظهر «حقيقياً» إلا ما ثبت.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type OperatingLink = {
  country: string;
  platform: string;
  syncedAt: string;
  groups: number;
  orphans: number;
};

export function parseLinks(data: unknown): OperatingLink[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    if (typeof r["country"] !== "string" || !/^[A-Z]{2}$/.test(r["country"])) return [];
    return [
      {
        country: r["country"],
        platform: String(r["platform"] ?? ""),
        syncedAt: String(r["synced_at"] ?? ""),
        groups: Number(r["groups"]) || 0,
        orphans: Number(r["orphans"]) || 0,
      },
    ];
  });
}

export const getOperatingLinks = createServerFn({ method: "GET" }).handler(
  async (): Promise<OperatingLink[]> => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return [];
    try {
      // مفاتيح sb_ المنشورة تُرسل في apikey لا في Authorization (كما في orphans.functions).
      const sb = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
              h.delete("Authorization");
            }
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      });
      const rpc = sb as unknown as {
        rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
      };
      const { data, error } = await rpc.rpc("public_operating_links");
      return error ? [] : parseLinks(data);
    } catch {
      return [];
    }
  },
);
