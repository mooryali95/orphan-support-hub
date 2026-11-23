import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Verification } from "@/lib/verification";

/**
 * لوحة البيانات للإدارة — كلّ نوعٍ بالشكل نفسه (صفوف، إجمالي، عدّاد الحالات)
 * من `admin_records`، والإجراءات بدوالّ القاعدة التي تفحص الإدارة وتسجّل.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export const RECORD_KINDS = [
  "orphans",
  "sponsorships",
  "pledges",
  "orgs",
  "offices",
  "supervisors",
  "documents",
  "payments",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export type OrphanRecord = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  country: string | null;
  status: string;
  org: string | null;
  need: number;
  funded: number;
  currency: string;
  created_at: string;
  sponsors: number;
  verification: Verification;
};

export type SponsorshipRecord = {
  id: string;
  status: string;
  type: string;
  amount: number;
  currency: string;
  created_at: string;
  started_at: string | null;
  orphan_id: string;
  code: string;
  name: string;
  sponsor: string | null;
};

export type PledgeRecord = {
  id: string;
  status: string;
  kind: string;
  target_type: string;
  target: string | null;
  amount: number;
  currency: string;
  country: string;
  created_at: string;
  supporter: string | null;
};

export type OrgRecord = {
  id: string;
  name: string;
  status: string;
  city: string | null;
  region: string | null;
  license: string | null;
  email: string | null;
  children: number;
  created_at: string;
};

export type OfficeRecord = {
  id: string;
  name: string;
  country: string;
  region: string | null;
  status: string;
  members: number;
  parent: string | null;
  created_at: string;
};

export type SupervisorRecord = {
  id: string;
  email: string | null;
  name: string | null;
  status: string;
  independence: number;
  certified_at: string | null;
  note: string | null;
  created_at: string;
};

export type DocumentRecord = {
  id: string;
  doc_type: string;
  file_name: string | null;
  path: string;
  status: string;
  verified_at: string | null;
  orphan_id: string;
  code: string;
  name: string;
  created_at: string;
};

export type PaymentRecord = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string | null;
  ref: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  sponsor: string | null;
  name: string;
  code: string;
  sponsorship_id: string;
  created_at: string;
};

export type AnyRecord =
  | OrphanRecord
  | SponsorshipRecord
  | PledgeRecord
  | OrgRecord
  | OfficeRecord
  | SupervisorRecord
  | DocumentRecord
  | PaymentRecord;

export type RecordsPage<T> = {
  total: number;
  counts: Record<string, number>;
  rows: T[];
};

export const PAGE_SIZE = 25;

export const listRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(RECORD_KINDS),
        q: z.string().trim().max(120).optional(),
        status: z.string().trim().max(40).optional(),
        page: z.number().int().min(0).max(10_000).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await rpc(context.supabase).rpc("admin_records", {
      _kind: data.kind,
      _q: data.q || null,
      _status: data.status || null,
      _limit: PAGE_SIZE,
      _offset: data.page * PAGE_SIZE,
    });
    if (error) return { ok: false as const, error: error.message, page: null };
    return {
      ok: true as const,
      error: null,
      page: res as RecordsPage<AnyRecord>,
    };
  });

export const transitionPledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "fulfilled", "cancelled"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("admin_set_pledge_status", {
      _pledge: data.id,
      _status: data.status,
      _reason: data.reason || null,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });
