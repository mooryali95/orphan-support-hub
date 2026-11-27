import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isMissingObject,
  MAX_IMPORT_ROWS,
  networkDiff,
  type CountryRow,
  type DuplicateMatch,
  type GroupRow,
  type NetworkDiff,
  type PersonRow,
  type RegionRow,
} from "@/lib/data-entry";

/**
 * بناء البيانات من لوحة الإدارة — الدول، والمناطق، والأشخاص، والمجموعات.
 *
 * هذه الطبقة تنقل ولا تحرس: كل كتابةٍ تمرّ بدالّةٍ في القاعدة تفحص `is_admin()`
 * بنفسها، أو بجدول الدول الذي تقصره سياسته على الإدارة (المسار القائم لسجلّات
 * المنصّة).
 *
 * وما أضافته هجرة «بناء البيانات» قد لا يكون مطبَّقاً على القاعدة المتّصلة:
 * كل دالّةٍ هنا تميّز «الكائن غير موجود» عن الخطأ، وتعيد `missing: true` فتعرض
 * الواجهة «تحتاج تحديث القاعدة» بدل أن تنكسر.
 */

type DbError = { message: string; code?: string | null };
type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: DbError | null }>;
};
type Filter = PromiseLike<{ data: unknown; error: DbError | null }> & {
  eq: (column: string, value: unknown) => Filter;
  order: (column: string) => Filter;
  select: (columns?: string) => Filter;
  maybeSingle: () => PromiseLike<{ data: unknown; error: DbError | null }>;
};
type Tables = {
  from: (table: string) => {
    select: (columns: string) => Filter;
    insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => Filter;
    update: (patch: Record<string, unknown>) => Filter;
  };
};
const rpc = (client: unknown) => client as Rpc;
const tables = (client: unknown) => client as Tables;

export type Failure = { ok: false; missing: boolean; error: string };
const fail = (error: DbError): Failure => ({
  ok: false,
  missing: isMissingObject(error),
  // رموز القاعدة القصيرة تمرّ كما هي لتُترجم؛ وما عداها لا يصل الواجهة خاماً.
  error: /^[a-z_]{3,40}$/.test(error.message) ? error.message : "failed",
});

async function call<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | Failure> {
  const { data, error } = await rpc(client).rpc(fn, args);
  return error ? fail(error) : { ok: true, data: data as T };
}

const code2 = z.string().regex(/^[A-Z]{2}$/);
const currency3 = z.string().regex(/^[A-Z]{3}$/);
const uuid = z.string().uuid();
const short = (max: number) => z.string().trim().max(max);

/* ── الدول ──────────────────────────────────────────────────────── */

export type DataOverview = {
  countries: CountryRow[];
  platformCurrency: string | null;
  /** ملفّاتٌ لم يُعرف رمز دولتها. */
  unlinked: number | null;
  /** صحيح: قُرئت الدول من الجدول مباشرةً لأن نظرة الأعداد غير مطبَّقة بعد. */
  degraded: boolean;
};

type TableCountry = {
  code: string;
  name_ar: string;
  name_local: string | null;
  status: CountryRow["status"];
  sort_order: number;
  in_network?: boolean | null;
  currency?: string | null;
};

export const getDataOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const full = await call<{
      platform_currency: string | null;
      unlinked_children: number;
      countries: CountryRow[];
    }>(context.supabase, "admin_data_overview");
    if (full.ok) {
      const overview: DataOverview = {
        countries: full.data.countries,
        platformCurrency: full.data.platform_currency,
        unlinked: full.data.unlinked_children,
        degraded: false,
      };
      return { ok: true as const, data: overview };
    }
    if (!full.missing) return full;

    // قبل تحديث القاعدة: جدول الدول نفسه (سياسته تُري الإدارة كل الصفوف) بلا أعداد.
    const { data, error } = await tables(context.supabase)
      .from("countries")
      .select("*")
      .order("sort_order");
    if (error) return fail(error);
    const { data: settings } = await tables(context.supabase)
      .from("platform_settings")
      .select("currency")
      .maybeSingle();
    const overview: DataOverview = {
      countries: ((data ?? []) as TableCountry[]).map((c) => ({
        code: c.code,
        name_ar: c.name_ar,
        name_local: c.name_local,
        status: c.status,
        sort_order: c.sort_order,
        in_network: Boolean(c.in_network),
        currency: c.currency ?? null,
        regions: null,
        children: null,
        published: null,
        groups: null,
        offices: null,
        sources: null,
      })),
      platformCurrency: (settings as { currency?: string } | null)?.currency ?? null,
      unlinked: null,
      degraded: true,
    };
    return { ok: true as const, data: overview };
  });

/**
 * إضافة دولة أو تعديلها. حالة «الطوارئ» لا تُضبط من هنا (لها مسارها بسببٍ
 * مكتوب في «الدول والمصادر»).
 */
export const saveCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        create: z.boolean(),
        code: code2,
        nameAr: short(80).min(2).optional(),
        nameLocal: short(80).optional(),
        status: z.enum(["planned", "active", "paused"]).optional(),
        currency: currency3.optional(),
        inNetwork: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.nameAr !== undefined) patch["name_ar"] = data.nameAr;
    if (data.nameLocal !== undefined) patch["name_local"] = data.nameLocal || null;
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.currency !== undefined) patch["currency"] = data.currency;
    if (data.inNetwork !== undefined) patch["in_network"] = data.inNetwork;
    if (data.sortOrder !== undefined) patch["sort_order"] = data.sortOrder;

    const db = tables(context.supabase).from("countries");
    if (data.create) {
      if (!data.nameAr) return { ok: false as const, missing: false, error: "name_required" };
      // بلا عملةٍ مختارة: عملة تشغيل الدولة بقاعدة القارّة — من وحدة العملة نفسها.
      const { operatingCurrency } = await import("@/lib/currency");
      const { error } = await db.insert({
        code: data.code,
        status: "planned",
        currency: operatingCurrency(data.code),
        ...patch,
      });
      if (error)
        return error.code === "23505"
          ? { ok: false as const, missing: false, error: "country_exists" }
          : fail(error);
      return { ok: true as const };
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { data: rows, error } = await db.update(patch).eq("code", data.code).select("code");
    if (error) return fail(error);
    // سياسة الجدول تُسقط الكتابة بصمتٍ لغير الإدارة: صفرُ صفوفٍ ليس نجاحاً.
    if (((rows ?? []) as unknown[]).length === 0)
      return { ok: false as const, missing: false, error: "not_saved" };
    return { ok: true as const };
  });

async function loadNetwork() {
  // ملفّ الشبكة كبير: يُحمَّل في الخادم عند الطلب، ولا يدخل حزمة المتصفّح من هنا.
  const { WAMY_COUNTRIES } = await import("@/data/wamy-network");
  // الحضور العلني (مكتب أو نشاط ميداني) وحده — كما على الخريطة الرئيسية.
  return WAMY_COUNTRIES.filter((c) => c.presence.status !== "unconfirmed").map((c) => ({
    code: c.code,
    nameAr: c.nameAr,
  }));
}

async function currentNetwork(client: unknown) {
  const { data, error } = await tables(client)
    .from("countries")
    .select("code, name_ar, in_network")
    .order("code");
  if (error) return fail(error);
  return {
    ok: true as const,
    rows: (data ?? []) as Array<{ code: string; name_ar: string; in_network: boolean }>,
  };
}

export type NetworkPreview = { diff: NetworkDiff; total: number };

/** معاينة: ما الذي سيتغيّر في `countries.in_network` ليطابق ملفّ الشبكة. لا تكتب. */
export const previewNetworkSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const current = await currentNetwork(context.supabase);
    if (!current.ok) return current;
    const network = await loadNetwork();
    const preview: NetworkPreview = {
      diff: networkDiff(current.rows, network),
      total: network.length,
    };
    return { ok: true as const, data: preview };
  });

const codes = z.array(code2).max(300);

/**
 * تطبيق المطابقة — بما رآه المدير في المعاينة بالضبط. إن تغيّرت القاعدة بين
 * المعاينة والتطبيق عاد الفرق الجديد ولم يُكتب شيء.
 */
export const applyNetworkSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ add: codes, enable: codes, disable: codes }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const current = await currentNetwork(context.supabase);
    if (!current.ok) return current;
    const network = await loadNetwork();
    const diff = networkDiff(current.rows, network);
    const same = (a: Array<{ code: string }>, b: string[]) =>
      a.length === b.length && a.every((x) => b.includes(x.code));
    if (
      !same(diff.add, data.add) ||
      !same(diff.enable, data.enable) ||
      !same(diff.disable, data.disable)
    )
      return { ok: false as const, missing: false, error: "preview_stale", diff };

    const db = tables(context.supabase).from("countries");
    const { operatingCurrency } = await import("@/lib/currency");
    const { countryName } = await import("@/lib/countries");
    if (diff.add.length > 0) {
      const { error } = await db.insert(
        diff.add.map((c) => ({
          code: c.code,
          name_ar: c.nameAr,
          name_local: countryName(c.code, "en"),
          // تُضاف «مخطّطة»: التعليم يفتحها وجهةً للدعم؛ والكفالة تُفعَّل لكل دولةٍ بقرارها.
          status: "planned",
          in_network: true,
          currency: operatingCurrency(c.code),
        })),
      );
      if (error) return fail(error);
    }
    let written = diff.add.length;
    for (const [list, value] of [
      [diff.enable, true],
      [diff.disable, false],
    ] as const) {
      for (const c of list) {
        const { data: rows, error } = await db
          .update({ in_network: value })
          .eq("code", c.code)
          .select("code");
        if (error) return fail(error);
        written += ((rows ?? []) as unknown[]).length;
      }
    }
    const expected = diff.add.length + diff.enable.length + diff.disable.length;
    if (written < expected) return { ok: false as const, missing: false, error: "not_saved" };
    return {
      ok: true as const,
      added: diff.add.length,
      enabled: diff.enable.length,
      disabled: diff.disable.length,
    };
  });

/* ── المناطق ────────────────────────────────────────────────────── */

export type RegionsView = {
  country: string;
  regions: RegionRow[];
  unmatched: Array<{ name: string; children: number }>;
};

export const getRegions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2 }).parse(input))
  .handler(async ({ data, context }) =>
    call<RegionsView>(context.supabase, "admin_regions", { _country: data.country }),
  );

export type RegionSaved = {
  id: string;
  created: boolean;
  children_renamed?: number;
  groups_renamed?: number;
  children_left?: number;
};

export const saveRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.optional(),
        country: code2,
        nameAr: short(120).min(1),
        nameLocal: short(120).optional(),
        geoId: short(40).optional(),
        active: z.boolean().default(true),
        cascade: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<RegionSaved>(context.supabase, "admin_save_region", {
      _id: data.id ?? null,
      _country: data.country,
      _name_ar: data.nameAr,
      _name_local: data.nameLocal ?? null,
      _geo_id: data.geoId ?? null,
      _active: data.active,
      _sort: null,
      _cascade: data.cascade,
    }),
  );

export const seedRegions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        country: code2,
        rows: z
          .array(
            z.object({
              name_ar: short(120).min(1),
              name_local: short(120).optional(),
              geo_id: short(40).optional(),
            }),
          )
          .min(1)
          .max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<{ added: number; skipped: number }>(context.supabase, "admin_seed_regions", {
      _country: data.country,
      _rows: data.rows,
    }),
  );

/* ── الأشخاص ────────────────────────────────────────────────────── */

const personSchema = z.object({
  display_name: short(80),
  gender: short(10),
  country: short(2),
  region: short(120).optional(),
  city: short(80).optional(),
  birth_date: short(10).optional(),
  education_stage: short(80).optional(),
  monthly_need: short(12).optional(),
  group_id: uuid.optional(),
  org_id: uuid.optional(),
  full_name: short(140).optional(),
  guardian_name: short(140).optional(),
  guardian_phone: short(40).optional(),
  private_notes: short(1000).optional(),
  external_ref: short(80).optional(),
  confirm_duplicate: z.boolean().optional(),
});

/** نتيجة فحص صفٍّ أو كتابته كما تعيدها القاعدة. */
export type PersonResult = {
  ok: boolean;
  code?: "invalid" | "possible_duplicate";
  dry_run?: boolean;
  row?: number;
  errors: string[];
  warnings: string[];
  duplicates: DuplicateMatch[];
  country_code: string | null;
  country_name: string | null;
  currency: string | null;
  region: string | null;
  /** بعد الكتابة. */
  id?: string;
  /** رقم الملفّ بعد الكتابة — يشارك المفتاح `code` مع رمز الرفض، فيُقرأ حين `ok`. */
  status?: string;
};

export const findPersons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: short(80).optional(),
        country: code2.optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<PersonRow[]>(context.supabase, "admin_find_persons", {
      _q: data.q ?? null,
      _country: data.country ?? null,
      _limit: data.limit,
    }),
  );

export const addPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        row: personSchema,
        confirmDuplicates: z.boolean().default(false),
        dryRun: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<PersonResult & { code?: string }>(context.supabase, "admin_add_person", {
      _row: data.row,
      _confirm_duplicates: data.confirmDuplicates,
      _dry_run: data.dryRun,
    }),
  );

export type ImportResult = {
  dry_run: boolean;
  received: number;
  ready: number;
  invalid: number;
  duplicates: number;
  results: Array<PersonResult & { code?: string }>;
};

export const importPersons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ rows: z.array(personSchema).min(1).max(MAX_IMPORT_ROWS), dryRun: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<ImportResult>(context.supabase, "admin_import_persons", {
      _rows: data.rows,
      _dry_run: data.dryRun,
    }),
  );

/** الجهات المعتمدة لإسناد الملفّ — الدالّة القائمة `admin_approved_orgs`. */
export const getApprovedOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const res = await call<Array<{ id: string; name: string }>>(
      context.supabase,
      "admin_approved_orgs",
    );
    return { orgs: res.ok ? (res.data ?? []) : [] };
  });

/* ── المجموعات ──────────────────────────────────────────────────── */

export const getGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2.optional() }).parse(input))
  .handler(async ({ data, context }) =>
    call<GroupRow[]>(context.supabase, "admin_groups", { _country: data.country ?? null }),
  );

export const saveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: short(120).min(2),
        country: code2,
        region: short(120).optional(),
        institution: short(140).optional(),
        supervisor: short(140).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<{ id: string; created: boolean }>(context.supabase, "admin_save_group", {
      _id: data.id ?? null,
      _name: data.name,
      _country: data.country,
      _region: data.region ?? null,
      _institution: data.institution ?? null,
      _supervisor: data.supervisor ?? null,
    }),
  );

export const getGroupMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ groupId: uuid }).parse(input))
  .handler(async ({ data, context }) =>
    call<PersonRow[]>(context.supabase, "admin_group_members", { _group: data.groupId }),
  );

export type MemberConflict = Partial<
  Record<"country" | "region" | "group", { child: string | null; group: string | null }>
>;
export type MemberResult = {
  ok: boolean;
  code?:
    | "conflict"
    | "synced"
    | "locked"
    | "group_synced"
    | "group_unknown"
    | "person_unknown"
    | "country_fixed";
  source?: string | null;
  conflict?: MemberConflict;
  unchanged?: boolean;
  region?: string | null;
  country_changed?: boolean;
  region_changed?: boolean;
};

export const setGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        groupId: uuid,
        personId: uuid,
        adoptCountry: z.boolean().default(false),
        regionChoice: z.enum(["group", "keep"]).optional(),
        move: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    call<MemberResult>(context.supabase, "admin_set_group_member", {
      _group: data.groupId,
      _orphan: data.personId,
      _adopt_country: data.adoptCountry,
      _region_choice: data.regionChoice ?? null,
      _move: data.move,
    }),
  );

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ personId: uuid }).parse(input))
  .handler(async ({ data, context }) =>
    call<MemberResult>(context.supabase, "admin_remove_group_member", { _orphan: data.personId }),
  );
