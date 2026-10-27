import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * البوابات — المكاتب، الجهات المانحة، ولوحاتها.
 *
 * القاعدة هي الحَكَم: كل دالّة هنا تنادي دالّة SECURITY DEFINER تفحص
 * العضوية والدور، فلا يُحمى شيءٌ بإخفاء زرّ.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type Workspaces = {
  admin: boolean;
  offices: Array<{
    id: string;
    name: string;
    role: string;
    country: string;
    region: string | null;
  }>;
  donor_entities: Array<{ id: string; name: string; status: string; role: string }>;
  care_org: boolean;
  guardian: boolean;
  pledges: number;
};

export type OfficeDashboard = {
  office: { id: string; name: string; country: string; region: string | null };
  groups: number;
  orphans: number;
  pledges: Partial<Record<"qualification" | "in_kind", { count: number; amount: number }>>;
  reports: { draft: number; submitted: number; published: number };
  can_write: boolean;
  can_publish: boolean;
};

export type OfficeReport = {
  id: string;
  title: string;
  body: string;
  metrics: Record<string, number | string>;
  attachments: string[];
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "submitted" | "published";
  created_at: string;
};

export type DonorDashboard = {
  entity: { id: string; name: string; type: string; status: string };
  by_kind: Partial<Record<"qualification" | "in_kind", number>>;
  by_target: Record<string, number>;
  members: number;
};

export const getMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("my_workspaces");
    if (error) return { ok: false as const, error: error.message, workspaces: null };
    return { ok: true as const, error: null, workspaces: data as Workspaces };
  });

export const getOfficeDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ officeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = rpc(context.supabase);
    const dash = await db.rpc("office_dashboard", { _office: data.officeId });
    if (dash.error)
      return { ok: false as const, error: dash.error.message, dashboard: null, reports: [] };
    // التقارير تمرّ من سياسة RLS نفسها: عضو المكتب أو من فوقه.
    const reports = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              order: (
                k: string,
                o: { ascending: boolean },
              ) => {
                limit: (
                  n: number,
                ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
              };
            };
          };
        };
      }
    )
      .from("office_reports")
      .select("id,title,body,metrics,attachments,period_start,period_end,status,created_at")
      .eq("office_id", data.officeId)
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      ok: true as const,
      error: null,
      dashboard: dash.data as OfficeDashboard,
      reports: (reports.data ?? []) as OfficeReport[],
    };
  });

export const saveOfficeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        officeId: z.string().uuid(),
        reportId: z.string().uuid().optional(),
        title: z.string().trim().min(3).max(200),
        body: z.string().max(20000),
        metrics: z.record(z.string().max(60), z.union([z.number(), z.string().max(200)])),
        attachments: z.array(z.string().max(300)).max(30),
        periodStart: z.string().date().optional(),
        periodEnd: z.string().date().optional(),
        status: z.enum(["draft", "submitted", "published"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await rpc(context.supabase).rpc("save_office_report", {
      _office: data.officeId,
      _title: data.title,
      _body: data.body,
      _metrics: data.metrics,
      _attachments: data.attachments,
      _period_start: data.periodStart ?? null,
      _period_end: data.periodEnd ?? null,
      _status: data.status,
      _id: data.reportId ?? null,
    });
    if (error) return { ok: false as const, error: error.message, id: null };
    return { ok: true as const, error: null, id: id as string };
  });

export const registerDonorEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        type: z.string().trim().max(60),
        country: z.string().trim().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await rpc(context.supabase).rpc("register_donor_entity", {
      _name: data.name,
      _type: data.type,
      _country: data.country || null,
    });
    if (error) return { ok: false as const, error: error.message, id: null };
    return { ok: true as const, error: null, id: id as string };
  });

export const getDonorDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: d, error } = await rpc(context.supabase).rpc("donor_entity_dashboard", {
      _entity: data.entityId,
    });
    if (error) return { ok: false as const, error: error.message, dashboard: null };
    return { ok: true as const, error: null, dashboard: d as DonorDashboard };
  });

export const OFFICE_ROLE_LABELS: Record<string, string> = {
  manager: "مدير المكتب",
  coordinator: "منسّق",
  field_officer: "موظّف ميداني",
  viewer: "مطّلع",
};

export const TARGET_LABELS: Record<string, string> = {
  orphan: "يتيم",
  group: "مجموعة",
  region: "منطقة",
  country: "دولة",
  institution: "مؤسسة",
};

export const KIND_LABELS: Record<string, string> = {
  qualification: "بناء الأهلية",
  in_kind: "دعم عيني",
};

export type AdminOfficesOverview = {
  countries: Array<{ code: string; name: string; status: string }>;
  roles: Array<{ key: string; label: string }>;
  offices: Array<{
    id: string;
    name: string;
    country: string;
    region: string | null;
    parent_id: string | null;
    active: boolean;
    members: Array<{ email: string; role: string }>;
  }>;
  donor_entities: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    created_at: string;
  }>;
};

type TableClient = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
    update: (row: Record<string, unknown>) => {
      eq: (k: string, v: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export const getAdminOffices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("admin_offices_overview");
    if (error) return { ok: false as const, error: error.message, overview: null };
    return { ok: true as const, error: null, overview: data as AdminOfficesOverview };
  });

/** إنشاء مكتب — سياسة offices_admin تقصره على الإدارة. */
export const createOffice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        country: z.string().regex(/^[A-Z]{2}$/),
        region: z.string().trim().max(120).optional(),
        parentId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as TableClient).from("offices").insert({
      name: data.name,
      country_code: data.country,
      region: data.region || null,
      parent_id: data.parentId ?? null,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

export const assignOfficeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        officeId: z.string().uuid(),
        email: z.string().trim().email(),
        role: z.string().regex(/^[a-z_]{2,40}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("admin_assign_office_member", {
      _office: data.officeId,
      _email: data.email,
      _role: data.role,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

export const setDonorEntityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ entityId: z.string().uuid(), status: z.enum(["approved", "suspended", "pending"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as TableClient)
      .from("donor_entities")
      .update({ status: data.status })
      .eq("id", data.entityId);
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });
