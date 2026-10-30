import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dirOf, nativeName, type Messages } from "@/lib/locale";

/**
 * لوحة الترجمة — للمراجعين والإدارة.
 *
 * القاعدة تفرض من يكتب ومن يراجع ومن ينشر؛ هذه الطبقة تضيف ما لا تعرفه
 * القاعدة: الفهرس. فهي تقرن كل ترجمةٍ بأصلها العربي والإنجليزي، وتعرف ما
 * نقص وما قدم أصله، وتحسب بصمة الأصل بنفسها (لا تثق ببصمةٍ من المتصفّح)،
 * وترفض ترجمة قالبٍ أسقطت مواضعه («{0}») — فلا يظهر «صفحة من» بلا رقم.
 */
type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (c: unknown) => c as Rpc;

type CatalogEntry = {
  en: string;
  ar: string;
  kind: "text" | "template" | "plural";
  params?: number;
  hash: string;
  file: string;
};
async function catalog(): Promise<Record<string, CatalogEntry>> {
  const { default: c } = await import("@/i18n/catalog.json");
  return (c as unknown as { entries: Record<string, CatalogEntry> }).entries;
}

export type ReviewLocale = {
  code: string;
  name: string;
  dir: "rtl" | "ltr";
  status: "draft" | "live";
  countries: string[];
  counts: Partial<Record<"draft" | "reviewed" | "published", number>> | null;
};
export type WorkRow = {
  key: string;
  ns: string;
  ar: string;
  en: string;
  kind: CatalogEntry["kind"];
  text: string | null;
  status: "missing" | "draft" | "reviewed" | "published";
  origin: "human" | "machine" | "import" | null;
  stale: boolean;
};

function explain(message: string): string {
  const m: Array<[RegExp, string]> = [
    [/reviewer_only/, "لست مراجعاً لهذه اللغة."],
    [/admin_only/, "للإدارة وحدها."],
    [/nothing_published/, "لا تُطلق لغةٌ قبل أن يُنشر فيها نصّ."],
    [/user_not_found/, "لا حساب بهذا البريد."],
    [/locale_not_enabled/, "اللغة غير مفعّلة."],
    [/does not exist|schema cache/, "لم تُطبَّق هجرة اللغات على القاعدة بعد."],
  ];
  return m.find(([re]) => re.test(message))?.[1] ?? "تعذّر التنفيذ.";
}
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
async function call<T = null>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<Result<T>> {
  const { data, error } = await rpc(client).rpc(fn, args);
  return error ? { ok: false, error: explain(error.message) } : { ok: true, data: data as T };
}

const code = z.string().regex(/^[a-z]{2,3}$/);

export const getMyReviewLocales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<Result<{ locales: ReviewLocale[]; total: number; bundled: string[] }>> => {
      const r = await call<ReviewLocale[]>(context.supabase, "my_review_locales");
      if (!r.ok) return r;
      const total = Object.keys(await catalog()).length;
      return { ok: true, data: { locales: r.data, total, bundled: Object.keys(BUNDLED) } };
    },
  );

/** كل نصوص الفهرس للغةٍ ما، مقرونةً بترجمتها وحالها. */
export const getLocaleWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ locale: code }).parse(d))
  .handler(async ({ context, data }): Promise<Result<{ rows: WorkRow[]; total: number }>> => {
    const r = await call<
      Array<{
        key: string;
        text: string;
        source_hash: string;
        status: WorkRow["status"];
        origin: WorkRow["origin"];
      }>
    >(context.supabase, "ui_translations_for", { _locale: data.locale });
    if (!r.ok) return r;
    const have = new Map(r.data.map((x) => [x.key, x]));
    const rows: WorkRow[] = Object.entries(await catalog()).map(([key, e]) => {
      const t = have.get(key);
      return {
        key,
        ns: key.split(".")[0]!,
        ar: e.ar,
        en: e.en,
        kind: e.kind,
        text: t?.text ?? null,
        status: t ? t.status : "missing",
        origin: t?.origin ?? null,
        stale: !!t && t.source_hash !== e.hash,
      };
    });
    return { ok: true, data: { rows, total: rows.length } };
  });

/** المواضع «{0}»… في الأصل يجب أن تبقى في الترجمة، لا أكثر ولا أقل. */
function placeholders(s: string): string {
  return [...s.matchAll(/\{(\d+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");
}

const items = z
  .array(z.object({ key: z.string().max(200), text: z.string().trim().min(1).max(4000) }))
  .max(1000);

export const saveTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        locale: code,
        items,
        review: z.boolean().default(false),
        origin: z.enum(["human", "machine", "import"]).default("human"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<Result<{ saved: number; rejected: string[] }>> => {
    const cat = await catalog();
    const rejected: string[] = [];
    const rows = data.items.flatMap((i) => {
      const e = cat[i.key];
      if (!e || placeholders(e.en) !== placeholders(i.text)) {
        rejected.push(i.key);
        return [];
      }
      return [{ key: i.key, text: i.text, source_hash: e.hash, origin: data.origin }];
    });
    if (rows.length === 0) return { ok: true, data: { saved: 0, rejected } };
    const r = await call<number>(context.supabase, "ui_translation_save", {
      _locale: data.locale,
      _items: rows,
      _review: data.review,
    });
    return r.ok ? { ok: true, data: { saved: r.data, rejected } } : r;
  });

const keysInput = z.object({ locale: code, keys: z.array(z.string().max(200)).min(1).max(1000) });

export const reviewTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => keysInput.parse(d))
  .handler(async ({ context, data }) =>
    call<number>(context.supabase, "ui_translation_review", {
      _locale: data.locale,
      _keys: data.keys,
    }),
  );

export const publishTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => keysInput.parse(d))
  .handler(async ({ context, data }) =>
    call<number>(context.supabase, "ui_translation_publish", {
      _locale: data.locale,
      _keys: data.keys,
    }),
  );

export const unpublishTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => keysInput.parse(d))
  .handler(async ({ context, data }) =>
    call<number>(context.supabase, "ui_translation_unpublish", {
      _locale: data.locale,
      _keys: data.keys,
    }),
  );

/** تفعيل لغةٍ لدولة: الاسم والاتجاه من المتصفّح، والدولة تُضاف إلى دولها. */
export const enableLocale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        locale: code,
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    call(context.supabase, "admin_enable_locale", {
      _code: data.locale,
      _name: nativeName(data.locale),
      _dir: dirOf(data.locale),
      _country: data.country,
    }),
  );

export const setLocaleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ locale: code, status: z.enum(["draft", "live"]) }).parse(d),
  )
  .handler(async ({ context, data }) =>
    call(context.supabase, "admin_set_locale_status", { _code: data.locale, _status: data.status }),
  );

export const setLocaleReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ locale: code, email: z.string().email().max(200), add: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    call(context.supabase, "admin_set_locale_reviewer", {
      _code: data.locale,
      _email: data.email,
      _add: data.add,
    }),
  );

export const getLocaleReviewers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ locale: code }).parse(d))
  .handler(async ({ context, data }) =>
    call<Array<{ email: string; added_at: string }>>(context.supabase, "admin_locale_reviewers", {
      _code: data.locale,
    }),
  );

// المسودّات المرفقة بالكود (مولَّدة آلياً، لم يراجعها أحد بعد).
const BUNDLED: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  sq: () => import("@/i18n/drafts/sq.json"),
};

/** استيراد المسودّة المرفقة: تدخل مسودّةً آلية، ولا تمسّ ما صحّحه إنسان. */
export const importBundledDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ locale: code }).parse(d))
  .handler(async ({ context, data }): Promise<Result<{ saved: number; rejected: string[] }>> => {
    const load = BUNDLED[data.locale];
    if (!load) return { ok: false, error: "لا مسودّة مرفقة لهذه اللغة." };
    const draft = (await load()).default;
    const cat = await catalog();
    const rejected: string[] = [];
    const rows = Object.entries(draft).flatMap(([key, text]) => {
      const e = cat[key];
      if (!e || !text || placeholders(e.en) !== placeholders(text)) {
        rejected.push(key);
        return [];
      }
      return [{ key, text, source_hash: e.hash, origin: "machine" }];
    });
    let saved = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const r = await call<number>(context.supabase, "ui_translation_save", {
        _locale: data.locale,
        _items: rows.slice(i, i + 500),
        _review: false,
      });
      if (!r.ok) return r;
      saved += r.data;
    }
    return { ok: true, data: { saved, rejected } };
  });

/** معاينة الموقع بلغةٍ قبل نشرها: آخر نصٍّ لكل مفتاح بأي حال، ما لم يقدم أصله. */
export const getPreviewMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ locale: code }).parse(d))
  .handler(async ({ context, data }): Promise<Result<Messages>> => {
    const r = await call<Array<{ key: string; text: string; source_hash: string }>>(
      context.supabase,
      "ui_translations_for",
      { _locale: data.locale },
    );
    if (!r.ok) return r;
    const cat = await catalog();
    const out: Messages = {};
    for (const row of r.data) if (cat[row.key]?.hash === row.source_hash) out[row.key] = row.text;
    return { ok: true, data: out };
  });
