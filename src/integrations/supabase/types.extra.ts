import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as Generated } from "./types";

/**
 * امتداد أنواع القاعدة لما أضافته هجرة 20260823160000.
 *
 * `types.ts` مولَّد من القاعدة الحيّة ويحمل تحذير «لا تُعدَّل مباشرة»، ولا
 * أملك صلاحية إعادة توليده من هنا. فبدل تعديله، تُعرَّف الإضافات هنا
 * وتُدمج في نوع واحد. حين يُعيد Lovable التوليد تصبح هذه الإضافات مطابقة
 * لما وُلّد، ويمكن حذف الملف بلا أثر.
 */

type Iso = string;

type PaymentEventRow = {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  sponsorship_id: string | null;
  payment_id: string | null;
  payload: unknown;
  signature_verified: boolean;
  processed_at: Iso | null;
  error: string | null;
  created_at: Iso;
};

type PlatformSettingsRow = {
  id: boolean;
  currency: string;
  fee_percent: number;
  min_sponsorship: number;
  max_sponsorship: number;
  updated_at: Iso;
};

/**
 * حالة الدفعة بعد هجرة 20260823180000.
 *
 * `payment_status` المولَّد لا يعرف `disputed` لأن التوليد سبق الهجرة.
 * والمنازعة ليست ردّ مبلغ: الردّ قرار من التاجر، والمنازعة نزاع يفتحه
 * حامل البطاقة وقد يُحسم لأيّ طرف — فخلطهما يُخفي مالاً معلّقاً.
 */
type PaymentStatusWithDispute = Generated["public"]["Enums"]["payment_status"] | "disputed";

/** الأعمدة التي أضافتها الهجرة إلى سجلّ المدفوعات. */
type PaymentExtras = {
  provider_checkout_id: string | null;
  checkout_url: string | null;
  idempotency_key: string | null;
  failure_reason: string | null;
  fee_amount: number;
  net_amount: number | null;
};

type GeneratedPublic = Generated["public"];
type GeneratedPayments = GeneratedPublic["Tables"]["sponsorship_payments"];

export type DatabaseWithPayments = Omit<Generated, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Functions"> & {
    Tables: Omit<GeneratedPublic["Tables"], "sponsorship_payments"> & {
      sponsorship_payments: {
        Row: Omit<GeneratedPayments["Row"], "status"> &
          PaymentExtras & { status: PaymentStatusWithDispute };
        Insert: Omit<GeneratedPayments["Insert"], "status"> &
          Partial<PaymentExtras> & { status?: PaymentStatusWithDispute };
        Update: Omit<GeneratedPayments["Update"], "status"> &
          Partial<PaymentExtras> & { status?: PaymentStatusWithDispute };
        Relationships: GeneratedPayments["Relationships"];
      };
      payment_events: {
        Row: PaymentEventRow;
        Insert: Pick<PaymentEventRow, "provider" | "provider_event_id" | "event_type" | "payload"> &
          Partial<PaymentEventRow>;
        Update: Partial<PaymentEventRow>;
        Relationships: [];
      };
      platform_settings: {
        Row: PlatformSettingsRow;
        Insert: Partial<PlatformSettingsRow>;
        Update: Partial<PlatformSettingsRow>;
        Relationships: [];
      };
    };
    Functions: GeneratedPublic["Functions"] & {
      admin_overview: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      write_audit: {
        Args: {
          _action: string;
          _entity: string;
          _entity_id: string;
          _meta?: unknown;
        };
        Returns: undefined;
      };
    };
  };
};

export type PaymentsClient = SupabaseClient<DatabaseWithPayments, "public">;

/**
 * العميل نفسه؛ النوع وحده هو ما يتّسع. الالتفاف عبر `unknown` مقصود:
 * الجداول موجودة في القاعدة فعلاً وينقصها التوليد لا الوجود.
 */
export function withPayments(client: unknown): PaymentsClient {
  return client as PaymentsClient;
}


/* =====================================================================
   امتداد المرحلة 2 — الوثائق وموافقة الصورة والإدخال المعامَلاتي
   =====================================================================
   نفس سبب الامتداد أعلاه: `types.ts` مولَّد من القاعدة قبل هذه الهجرات.
   ===================================================================== */

export type PhotoConsent = "none" | "face_hidden" | "granted" | "withdrawn";

export type OrphanDocKind =
  | "death_certificate"
  | "birth_certificate"
  | "guardianship_proof"
  | "orphan_id"
  | "guardian_id"
  | "income_proof"
  | "school_record"
  | "medical_report"
  | "photo_consent"
  | "other";

export type RejectionCode =
  | "documents_missing"
  | "documents_unclear"
  | "documents_inconsistent"
  | "identity_unverified"
  | "guardianship_unproven"
  | "needs_unjustified"
  | "duplicate_profile"
  | "photo_consent_missing"
  | "other";

/** الأعمدة التي أضافتها هجرتا 20260824100000/1 إلى `orphans`. */
type OrphanPhase2 = {
  photo_consent: PhotoConsent;
  photo_consent_at: Iso | null;
  photo_consent_by: string | null;
  photo_consent_doc: string | null;
  rejection_code: RejectionCode | null;
  reviewed_by: string | null;
  reviewed_at: Iso | null;
};

/** والأعمدة التي أُضيفت إلى `orphan_documents`. */
type DocumentPhase2 = {
  kind: OrphanDocKind;
  mime_type: string | null;
  size_bytes: number | null;
  verified_by: string | null;
  verified_at: Iso | null;
  note: string | null;
};

type GeneratedOrphans = GeneratedPublic["Tables"]["orphans"];
type GeneratedDocs = GeneratedPublic["Tables"]["orphan_documents"];

export type DatabaseWithPhase2 = Omit<DatabaseWithPayments, "public"> & {
  public: Omit<DatabaseWithPayments["public"], "Tables" | "Functions"> & {
    Tables: Omit<DatabaseWithPayments["public"]["Tables"], "orphans" | "orphan_documents"> & {
      orphans: {
        Row: GeneratedOrphans["Row"] & OrphanPhase2;
        Insert: GeneratedOrphans["Insert"] & Partial<OrphanPhase2>;
        Update: GeneratedOrphans["Update"] & Partial<OrphanPhase2>;
        Relationships: GeneratedOrphans["Relationships"];
      };
      orphan_documents: {
        Row: GeneratedDocs["Row"] & DocumentPhase2;
        Insert: GeneratedDocs["Insert"] & Partial<DocumentPhase2>;
        Update: GeneratedDocs["Update"] & Partial<DocumentPhase2>;
        Relationships: GeneratedDocs["Relationships"];
      };
    };
    Functions: DatabaseWithPayments["public"]["Functions"] & {
      start_orphan_draft: {
        Args: { _org_id: string };
        Returns: unknown;
      };
      create_orphan_intake: {
        Args: { _payload: unknown };
        Returns: unknown;
      };
      review_orphan: {
        Args: { _id: string; _decision: string; _code?: string | null; _reason?: string | null };
        Returns: undefined;
      };
      review_organization: {
        Args: { _id: string; _decision: string; _reason?: string | null };
        Returns: undefined;
      };
      verify_document: {
        Args: { _id: string; _verified: boolean; _note?: string | null };
        Returns: undefined;
      };
      next_orphan_code: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
  };
};

export type Phase2Client = SupabaseClient<DatabaseWithPhase2, "public">;

/** العميل نفسه؛ النوع وحده هو ما يتّسع — كما في `withPayments`. */
export function withPhase2(client: unknown): Phase2Client {
  return client as Phase2Client;
}


/* =====================================================================
   امتداد المرحلة 4 — التقارير والخط الزمني والإشعارات
   ===================================================================== */

export type NotificationKind =
  | "welcome"
  | "orphan_approved"
  | "orphan_rejected"
  | "organization_approved"
  | "organization_rejected"
  | "sponsorship_started"
  | "payment_succeeded"
  | "payment_failed"
  | "report_published"
  | "report_rejected"
  | "other";

export type EmailState = "pending" | "sent" | "failed" | "skipped";

type NotificationPhase4 = {
  kind: NotificationKind;
  entity: string | null;
  entity_id: string | null;
  email_state: EmailState;
  email_attempts: number;
  email_error: string | null;
  email_sent_at: Iso | null;
};

type ReportPhase4 = {
  attachments: string[];
  reviewed_by: string | null;
  reviewed_at: Iso | null;
  published_at: Iso | null;
};

type GeneratedNotifications = GeneratedPublic["Tables"]["notifications"];
type GeneratedReports = GeneratedPublic["Tables"]["progress_reports"];

export type DatabaseWithPhase4 = Omit<DatabaseWithPhase2, "public"> & {
  public: Omit<DatabaseWithPhase2["public"], "Tables" | "Functions"> & {
    Tables: Omit<DatabaseWithPhase2["public"]["Tables"], "notifications" | "progress_reports"> & {
      notifications: {
        Row: GeneratedNotifications["Row"] & NotificationPhase4;
        Insert: GeneratedNotifications["Insert"] & Partial<NotificationPhase4>;
        Update: GeneratedNotifications["Update"] & Partial<NotificationPhase4>;
        Relationships: GeneratedNotifications["Relationships"];
      };
      progress_reports: {
        Row: GeneratedReports["Row"] & ReportPhase4;
        Insert: GeneratedReports["Insert"] & Partial<ReportPhase4>;
        Update: GeneratedReports["Update"] & Partial<ReportPhase4>;
        Relationships: GeneratedReports["Relationships"];
      };
    };
    Functions: DatabaseWithPhase2["public"]["Functions"] & {
      submit_progress_report: {
        Args: { _payload: unknown };
        Returns: unknown;
      };
      review_progress_report: {
        Args: { _id: string; _decision: string; _note?: string | null };
        Returns: undefined;
      };
      notification_recipients: {
        Args: { _ids: string[] };
        Returns: Array<{ id: string; email: string | null }>;
      };
      announce_payment: {
        Args: { _sponsorship: string; _succeeded: boolean; _amount: number; _currency: string };
        Returns: undefined;
      };
    };
  };
};

export type Phase4Client = SupabaseClient<DatabaseWithPhase4, "public">;

export function withPhase4(client: unknown): Phase4Client {
  return client as Phase4Client;
}
