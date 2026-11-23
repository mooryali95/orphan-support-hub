import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  withPrefs,
  type NotificationKind,
  type NotificationPrefs,
} from "@/integrations/supabase/types.extra";

/**
 * تفضيلات الإشعارات وإلغاء الاشتراك.
 *
 * بريدٌ معامَلاتي إلى قائمة حقيقية بلا تفضيلات وبلا رابط إلغاء مخالفةٌ
 * صريحة، لا نقصٌ في الميزات. فهذه الدوال هي ما يجعل تشغيل الإرسال
 * ممكناً قانوناً.
 *
 * والفرض كلّه في القاعدة — في `notify()` — لا هنا: هذه الطبقة واجهةٌ
 * لقرار المستخدم، لا حارسةٌ له.
 */

/** الأنواع التي يملك المستخدم كتمها، بتسمياتها العربية. */
export const MUTABLE_KINDS: Array<{ kind: NotificationKind; label: string; hint: string }> = [
  {
    kind: "report_published",
    label: "تقارير الأثر",
    hint: "حين يُنشر تقرير دوري عن ملفٍّ تكفله",
  },
  {
    kind: "payment_succeeded",
    label: "إيصالات الدفع",
    hint: "تأكيد كل دفعة شهرية نجحت",
  },
  {
    kind: "payment_failed",
    label: "تعثّر الدفع",
    hint: "حين لا تتمّ دفعة — إيقافه قد يُنهي كفالتك دون أن تدري",
  },
  {
    kind: "pledge_delivered",
    label: "تسليم التبرع العيني والتأهيل",
    hint: "حين يسلّم المكتب تبرّعك بمستندٍ موثّق",
  },
  {
    kind: "pledge_preparing",
    label: "تجهيز التبرع العيني والتأهيل",
    hint: "حين يبدأ المكتب تجهيز تبرّعك",
  },
  {
    kind: "sponsorship_started",
    label: "بدء الكفالة",
    hint: "عند تفعيل كفالة جديدة",
  },
  {
    kind: "orphan_approved",
    label: "اعتماد الملفات",
    hint: "للجهات الميدانية: قرار الإدارة في ملفّ رفعتَه",
  },
  {
    kind: "orphan_rejected",
    label: "إعادة الملفات للتصحيح",
    hint: "للجهات الميدانية: ملفّ يحتاج تعديلاً",
  },
];

function parsePrefs(raw: unknown): NotificationPrefs {
  const row = (raw ?? {}) as Partial<NotificationPrefs>;
  return {
    email_enabled: row.email_enabled ?? true,
    muted_kinds: Array.isArray(row.muted_kinds) ? row.muted_kinds : [],
    unsubscribe_token: row.unsubscribe_token ?? "",
  };
}

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withPrefs(context.supabase);
    const { data, error } = await db.rpc("my_notification_prefs");
    if (error) return { ok: false as const, error: error.message, prefs: null };
    return { ok: true as const, error: null, prefs: parsePrefs(data) };
  });

export const saveNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        emailEnabled: z.boolean(),
        // الأنواع تُتحقَّق ثانيةً في القاعدة عند التحويل إلى التعداد،
        // فقيمة مجهولة ترمي هناك ولا تُكتب — وهذا الفحص للرسالة لا للأمان.
        mutedKinds: z.array(z.string().trim().max(60)).max(32),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withPrefs(context.supabase);
    const { data: res, error } = await db.rpc("set_notification_prefs", {
      _email_enabled: data.emailEnabled,
      _muted_kinds: data.mutedKinds,
    });
    if (error) return { ok: false as const, error: error.message, prefs: null };
    return { ok: true as const, error: null, prefs: parsePrefs(res) };
  });

/**
 * إلغاء الاشتراك برمز — بلا جلسة.
 *
 * الرابط يُنقر من صندوق البريد حيث لا تسجيل دخول، فلو اشترطنا جلسةً
 * لما كان إلغاءً عملياً. ويُستعمل المفتاح المنشور لا مفتاح الخدمة:
 * الدالة في القاعدة `SECURITY DEFINER` وممنوحة لـ`anon`، والرمز
 * UUID عشوائي هو الحارس.
 */
export const unsubscribeByToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    // APP-10: مسارٌ بلا جلسة يقبل رمزاً — يُحدّ بالعنوان ويُغلق إن تعذّر العدّ.
    const { limitCurrentRequest, RATE_LIMITED_MESSAGE } = await import("@/lib/rate-limit");
    if (!(await limitCurrentRequest("auth")).allowed) {
      return { ok: false as const, error: RATE_LIMITED_MESSAGE };
    }
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
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

    const { data: ok, error } = await withPrefs(supabase).rpc("unsubscribe_by_token", {
      _token: data.token,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: ok === true, error: null as string | null };
  });
