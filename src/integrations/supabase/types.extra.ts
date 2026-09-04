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
  /** تعليق التحصيل الإلكتروني — الافتراض `true`. */
  payments_on_hold: boolean;
  payments_hold_reason: string | null;
  payments_hold_since: Iso | null;
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


/* =====================================================================
   امتداد المرحلة 7 — تحديد المعدّل وصحّة النظام والخدمات
   ===================================================================== */

export type ProgramCategory =
  | "education"
  | "rehabilitation"
  | "psychosocial"
  | "health"
  | "essentials";

/**
 * برنامج في الكتالوج — ما يشتريه الكافل فعلاً.
 *
 * تحويل العرض إلى خدمات ليس تجميلاً: سياسة Creem تمنع «التبرّع حيث لا
 * منتج»، فصار للكفالة منتجٌ مسمّى بسعره ومدّته ومخرجاته ومقدّمه.
 */
export type ProgramRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: ProgramCategory;
  monthly_price: number;
  currency: string;
  duration_months: number | null;
  deliverables: string[];
  status: "active" | "retired";
  /** خدمةٌ تُشترى، أو برنامج بناء أهلية له مفهومٌ وسمةٌ ورحلة. */
  kind: "service" | "qualification";
  created_at: Iso;
};

export type DatabaseWithPhase7 = Omit<DatabaseWithPhase4, "public"> & {
  public: Omit<DatabaseWithPhase4["public"], "Tables" | "Functions"> & {
    Tables: DatabaseWithPhase4["public"]["Tables"] & {
      programs: {
        Row: ProgramRow;
        Insert: Partial<ProgramRow>;
        Update: Partial<ProgramRow>;
        Relationships: [];
      };
    };
    Functions: DatabaseWithPhase4["public"]["Functions"] & {
      hit_rate_limit: {
        Args: { _bucket: string; _identity: string; _limit: number; _window_seconds: number };
        Returns: unknown;
      };
      prune_rate_limits: {
        Args: Record<string, never>;
        Returns: number;
      };
      system_health: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      orphan_program_plan: {
        Args: { _orphan: string };
        Returns: unknown;
      };
    };
  };
};

export type Phase7Client = SupabaseClient<DatabaseWithPhase7, "public">;

export function withPhase7(client: unknown): Phase7Client {
  return client as Phase7Client;
}


/* =====================================================================
   امتداد M5 — الفائض والاقتراحات
   ===================================================================== */

export type DatabaseWithM5 = Omit<DatabaseWithPhase7, "public"> & {
  public: Omit<DatabaseWithPhase7["public"], "Functions"> & {
    Functions: DatabaseWithPhase7["public"]["Functions"] & {
      orphan_funding_state: {
        Args: { _orphan: string };
        Returns: unknown;
      };
      suggest_orphans_for_amount: {
        Args: { _amount: number; _exclude?: string | null; _limit?: number };
        Returns: unknown;
      };
    };
  };
};

export type M5Client = SupabaseClient<DatabaseWithM5, "public">;

export function withM5(client: unknown): M5Client {
  return client as M5Client;
}


/* =====================================================================
   امتداد تفضيلات الإشعارات وإلغاء الاشتراك
   ===================================================================== */

export type NotificationPrefs = {
  email_enabled: boolean;
  muted_kinds: NotificationKind[];
  unsubscribe_token: string;
};

export type DatabaseWithPrefs = Omit<DatabaseWithM5, "public"> & {
  public: Omit<DatabaseWithM5["public"], "Functions"> & {
    Functions: DatabaseWithM5["public"]["Functions"] & {
      my_notification_prefs: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      set_notification_prefs: {
        Args: { _email_enabled: boolean; _muted_kinds: string[] };
        Returns: unknown;
      };
      unsubscribe_by_token: {
        Args: { _token: string };
        Returns: boolean;
      };
    };
  };
};

export type PrefsClient = SupabaseClient<DatabaseWithPrefs, "public">;

export function withPrefs(client: unknown): PrefsClient {
  return client as PrefsClient;
}


/* =====================================================================
   امتداد مُصرِّف طابور البريد
   ===================================================================== */

/** صفٌّ مطالَبٌ به من الطابور، جاهزٌ للإرسال. */
export type ClaimedEmail = {
  id: string;
  recipient: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  unsubscribe_token: string;
  attempts: number;
};

export type DatabaseWithOutbox = Omit<DatabaseWithPrefs, "public"> & {
  public: Omit<DatabaseWithPrefs["public"], "Functions"> & {
    Functions: DatabaseWithPrefs["public"]["Functions"] & {
      sweep_email_outbox: { Args: Record<string, never>; Returns: number };
      claim_email_batch: {
        Args: { _limit?: number; _lease_seconds?: number; _max_attempts?: number };
        Returns: ClaimedEmail[];
      };
      mark_email_sent: { Args: { _ids: string[] }; Returns: number };
      mark_email_failed: {
        Args: { _id: string; _error: string; _max_attempts?: number };
        Returns: EmailState;
      };
      mark_email_suppressed: { Args: { _id: string }; Returns: undefined };
    };
  };
};

export type OutboxClient = SupabaseClient<DatabaseWithOutbox, "public">;

export function withOutbox(client: unknown): OutboxClient {
  return client as OutboxClient;
}


/* =====================================================================
   امتداد بناء الأهلية — منهجية «الرواد»
   ===================================================================== */

export type QualificationStage =
  | "concept"
  | "trait"
  | "system"
  | "actions"
  | "measurement"
  | "qualified";

/**
 * ما يُعرض من الأهلية للكافل والزائر.
 *
 * لا درجات ولا سمة جوهرية ولا وسم «تحت العتبة»: تلك حكمٌ على طفل، وقراره
 * في `enrollment_assessments` خلف سياسة القراءة.
 */
export type PublicQualification = {
  enrollment_id: string;
  program: string;
  summary: string;
  level: "foundational" | "applied" | "advanced" | null;
  concept: string | null;
  concept_intent: string | null;
  target_trait: string | null;
  target_trait_summary: string | null;
  inputs: string[];
  processes: string[];
  deliverables: string[];
  stage: QualificationStage;
  stage_order: number;
  stage_changed_at: string;
  monthly_price: number;
  currency: string;
  status: string;
  has_supervisor: boolean;
  has_consent: boolean;
  /** شهادة المشرف — مرتبةٌ بلا هوية. تُضاف في هجرة 20260831100000. */
  supervisor?: SupervisorStanding;
  /** عدّ الجلسات — كم قُبل من كم. لا مضمون ولا ملاحظات. */
  units_total?: number;
  units_accepted?: number;
  /** وقوعُ القياس لا نتيجته: وعدٌ للكافل يصير قابلاً للتحقّق. */
  measured_before?: boolean;
  measured_after?: boolean;
};

export type DatabaseWithQualification = Omit<DatabaseWithOutbox, "public"> & {
  public: Omit<DatabaseWithOutbox["public"], "Functions"> & {
    Functions: DatabaseWithOutbox["public"]["Functions"] & {
      orphan_qualification: { Args: { _orphan: string }; Returns: unknown };
      enrollment_assessments: { Args: { _enrollment: string }; Returns: unknown };
      record_trait_assessment: {
        Args: { _enrollment: string; _scores: unknown; _phase?: string; _note?: string | null };
        Returns: unknown;
      };
    };
  };
};

export type QualificationClient = SupabaseClient<DatabaseWithQualification, "public">;

export function withQualification(client: unknown): QualificationClient {
  return client as QualificationClient;
}


/* =====================================================================
   امتداد تشغيل بناء الأهلية
   ===================================================================== */

export type EnrollmentRoleKind =
  | "supervisor"
  | "jurist"
  | "guardian"
  | "trustee"
  | "mentor";

export type EnrollmentRoleRow = {
  id: string;
  role: EnrollmentRoleKind;
  person_name: string | null;
  person_contact: string | null;
  has_account: boolean;
  consent_at: string | null;
  consent_document: string | null;
  assigned_at: string;
};

export type AssessmentRow = {
  id: string;
  phase: "baseline" | "progress" | "final";
  scores: Record<string, number>;
  core_trait: string | null;
  relational_trait: string | null;
  below_threshold: boolean;
  assessed_at: string;
};

export type EnrollmentDetail = {
  enrollment_id: string;
  orphan_id: string;
  program: string;
  kind: "service" | "qualification";
  stage: QualificationStage;
  stage_order: number;
  status: string;
  is_supervisor: boolean;
  roles: EnrollmentRoleRow[];
  assessments: AssessmentRow[];
};

export type OrphanEnrollmentRow = {
  enrollment_id: string;
  program: string;
  kind: "service" | "qualification";
  stage: QualificationStage;
  status: string;
};

export type DatabaseWithQualificationOps = Omit<DatabaseWithQualification, "public"> & {
  public: Omit<DatabaseWithQualification["public"], "Functions"> & {
    Functions: DatabaseWithQualification["public"]["Functions"] & {
      assign_enrollment_role: {
        Args: {
          _enrollment: string;
          _role: string;
          _person_name?: string | null;
          _person_email?: string | null;
          _person_contact?: string | null;
          _note?: string | null;
        };
        Returns: string;
      };
      record_enrollment_consent: {
        Args: { _role_id: string; _document: string };
        Returns: undefined;
      };
      set_enrollment_stage: { Args: { _enrollment: string; _stage: string }; Returns: string };
      enrollment_detail: { Args: { _enrollment: string }; Returns: unknown };
      orphan_enrollments: { Args: { _orphan: string }; Returns: unknown };
    };
  };
};

export type QualificationOpsClient = SupabaseClient<DatabaseWithQualificationOps, "public">;

export function withQualificationOps(client: unknown): QualificationOpsClient {
  return client as QualificationOpsClient;
}


/* =====================================================================
   امتداد أهلية المشرف
   ===================================================================== */

export type ProgramLevel = "foundational" | "applied" | "advanced";

/** شهادة المشرف كما تُعرض: مرتبةٌ بلا هوية ولا رقم. */
export type SupervisorStanding =
  | { assigned: false }
  | {
      assigned: true;
      level: ProgramLevel;
      certified: boolean;
      independent: boolean;
      since: string;
    };

/** وأهليّته كما يراها هو — الرقم فيها، فهي أهليّته لا حكمٌ عليه. */
export type MySupervisorProfile = {
  level: ProgramLevel;
  independence_index: number;
  independent: boolean;
  threshold: number;
  certified_at: string | null;
  active: boolean;
} | null;

export type SupervisedEnrollment = {
  enrollment_id: string;
  orphan_id: string;
  orphan_name: string;
  orphan_code: string;
  program: string;
  stage: QualificationStage;
  stage_order: number;
  status: string;
  has_consent: boolean;
  assessments: number;
  has_final: boolean;
  has_baseline: boolean;
  units_total: number;
  units_accepted: number;
  /** ما سُلّم وينتظر تقويماً — عملٌ يُرى من اللوحة لا يُبحث عنه. */
  units_awaiting: number;
  since: string;
};

export type DatabaseWithSupervisor = Omit<DatabaseWithQualificationOps, "public"> & {
  public: Omit<DatabaseWithQualificationOps["public"], "Functions"> & {
    Functions: DatabaseWithQualificationOps["public"]["Functions"] & {
      my_supervised_enrollments: { Args: Record<string, never>; Returns: unknown };
      my_supervisor_profile: { Args: Record<string, never>; Returns: unknown };
      certify_supervisor: {
        Args: { _user: string; _level?: string; _independence?: number; _note?: string | null };
        Returns: unknown;
      };
      enrollment_supervisor_standing: { Args: { _enrollment: string }; Returns: unknown };
    };
  };
};

export type SupervisorClient = SupabaseClient<DatabaseWithSupervisor, "public">;

export function withSupervisor(client: unknown): SupervisorClient {
  return client as SupervisorClient;
}


/* =====================================================================
   امتداد إدارة المشرفين
   ===================================================================== */

export type AdminSupervisorRow = {
  user_id: string;
  email: string;
  level: ProgramLevel;
  independence_index: number;
  independent: boolean;
  certified_at: string | null;
  active: boolean;
  note: string | null;
  /** عدد من يُشرف عليهم — ليُعرَف أثر السحب قبل الضغط لا بعده. */
  assignments: number;
};

export type DatabaseWithSupervisorAdmin = Omit<DatabaseWithSupervisor, "public"> & {
  public: Omit<DatabaseWithSupervisor["public"], "Functions"> & {
    Functions: DatabaseWithSupervisor["public"]["Functions"] & {
      admin_supervisors: { Args: Record<string, never>; Returns: unknown };
      certify_supervisor_by_email: {
        Args: { _email: string; _level?: string; _independence?: number; _note?: string | null };
        Returns: unknown;
      };
      revoke_supervisor: { Args: { _user: string; _note?: string | null }; Returns: unknown };
    };
  };
};

export type SupervisorAdminClient = SupabaseClient<DatabaseWithSupervisorAdmin, "public">;

export function withSupervisorAdmin(client: unknown): SupervisorAdminClient {
  return client as SupervisorAdminClient;
}


/* =====================================================================
   امتداد ورش الجلسات
   ===================================================================== */

export type UnitStatus = "pending" | "submitted" | "returned" | "accepted";

export type EnrollmentUnit = {
  unit_id: string;
  ordinal: number;
  title: string;
  focus: string;
  material: string;
  task: string;
  outputs: string[];
  submission: string;
  status: UnitStatus;
  evidence: string | null;
  note: string | null;
  submitted_at: string | null;
  decided_at: string | null;
};

/** الخطّة المعلَنة — لا ما سلّمه طفلٌ بعينه. */
export type CurriculumUnit = {
  ordinal: number;
  title: string;
  focus: string;
  material: string;
  task: string;
  outputs: string[];
};

export type DatabaseWithUnits = Omit<DatabaseWithSupervisorAdmin, "public"> & {
  public: Omit<DatabaseWithSupervisorAdmin["public"], "Functions"> & {
    Functions: DatabaseWithSupervisorAdmin["public"]["Functions"] & {
      enrollment_unit_progress: { Args: { _enrollment: string }; Returns: unknown };
      program_curriculum: { Args: { _program: string }; Returns: unknown };
      record_unit_progress: {
        Args: {
          _enrollment: string;
          _unit: string;
          _status: string;
          _evidence?: string | null;
          _note?: string | null;
        };
        Returns: unknown;
      };
    };
  };
};

export type UnitsClient = SupabaseClient<DatabaseWithUnits, "public">;

export function withUnits(client: unknown): UnitsClient {
  return client as UnitsClient;
}

/* =====================================================================
   امتداد المطابقة
   ===================================================================== */

/**
 * ترشيحٌ يحمل سببه.
 *
 * الحقول الخمسة الأخيرة ليست زينة: ترشيحٌ بلا سببٍ نُخزةٌ لا توصية،
 * والكافل يقرّر على بيّنة أو لا يقرّر.
 */
export type SuggestedOrphan = {
  id: string;
  code: string;
  display_name: string;
  gender: string | null;
  birth_date: string | null;
  city: string | null;
  region: string | null;
  story: string | null;
  photo_url: string | null;
  education_stage: string | null;
  monthly_need: number;
  funded_monthly: number;
  currency: string;
  status: string;
  org_id: string | null;
  created_at: string;
  gap: number;
  /** برنامج أهليةٍ حيّ له مشرفٌ معتمَد وإذنٌ موثَّق. */
  building: boolean;
  /** ميزانيتك تسدّ ثغرته كاملةً. */
  completes: boolean;
  in_region: boolean;
  waiting_days: number;
};

export type SponsorPreferences = {
  monthly_budget: number | null;
  preferred_region: string | null;
  city: string | null;
  full_name: string | null;
} | null;

export type DatabaseWithMatching = Omit<DatabaseWithUnits, "public"> & {
  public: Omit<DatabaseWithUnits["public"], "Functions"> & {
    Functions: DatabaseWithUnits["public"]["Functions"] & {
      suggest_orphans_for_sponsor: {
        Args: { _budget?: number | null; _region?: string | null; _limit?: number };
        Returns: unknown;
      };
      my_sponsor_preferences: { Args: Record<string, never>; Returns: unknown };
      published_regions: { Args: Record<string, never>; Returns: unknown };
      save_sponsor_preferences: {
        Args: { _budget?: number | null; _region?: string | null };
        Returns: unknown;
      };
    };
  };
};

export type MatchingClient = SupabaseClient<DatabaseWithMatching, "public">;

export function withMatching(client: unknown): MatchingClient {
  return client as MatchingClient;
}

/* =====================================================================
   امتداد حاجب الأطفال والفلترة
   ===================================================================== */

export type AgeBand =
  | "under_6"
  | "age_6_11"
  | "age_12_14"
  | "age_15_17"
  | "age_18_plus"
  | "unknown";

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under_6: "دون السادسة",
  age_6_11: "٦ – ١١",
  age_12_14: "١٢ – ١٤",
  age_15_17: "١٥ – ١٧",
  age_18_plus: "١٨ فأكثر",
  unknown: "غير محدّدة",
};

/** البطاقة — ما يكفي ليُقرَّر، ولا يكفي ليُعرَف الطفل. */
export type OrphanCardRow = {
  id: string;
  code: string;
  display_name: string;
  gender: string | null;
  country: string | null;
  region: string | null;
  education_stage: string | null;
  age_band: AgeBand;
  monthly_need: number;
  funded_monthly: number;
  currency: string;
  status: string;
  org_id: string | null;
  created_at: string;
  gap: number;
  building: boolean;
  waiting_days: number;
};

export type AccessStatus = "pending" | "approved" | "rejected" | "revoked";

export type MyAccess = {
  request_id: string;
  status: AccessStatus;
  expires_at: string | null;
  decision_note: string | null;
  created_at: string;
} | null;

/** الملفّ: بطاقةٌ دائماً، وتفاصيلُ عند الإذن وحده. */
export type OrphanView = OrphanCardRow & {
  may_view_detail: boolean;
  access: MyAccess;
  detail?: {
    birth_date: string | null;
    city: string | null;
    story: string | null;
    photo_url: string | null;
    needs: Array<{
      id: string;
      category: string;
      title: string;
      monthly_amount: number;
    }>;
  };
};

export type AccessRequestRow = {
  id: string;
  orphan_id: string;
  orphan_name: string;
  orphan_code: string;
  requester_email: string;
  reason: string;
  status: AccessStatus;
  created_at: string;
  decided_at: string | null;
  expires_at: string | null;
  sponsorships: number;
};

export type OrphanFilterOptions = {
  countries: string[];
  regions: string[];
  stages: string[];
};

export type DatabaseWithProtection = Omit<DatabaseWithMatching, "public"> & {
  public: Omit<DatabaseWithMatching["public"], "Functions"> & {
    Functions: DatabaseWithMatching["public"]["Functions"] & {
      list_orphan_cards: {
        Args: {
          _country?: string | null;
          _region?: string | null;
          _age_band?: string | null;
          _gender?: string | null;
          _education_stage?: string | null;
          _funding?: string | null;
          _building?: boolean | null;
          _search?: string | null;
          _sort?: string | null;
          _limit?: number;
          _offset?: number;
        };
        Returns: unknown;
      };
      orphan_filter_options: { Args: Record<string, never>; Returns: unknown };
      orphan_view: { Args: { _orphan: string }; Returns: unknown };
      request_orphan_access: { Args: { _orphan: string; _reason: string }; Returns: unknown };
      decide_orphan_access: {
        Args: { _request: string; _decision: string; _note?: string | null; _days?: number };
        Returns: unknown;
      };
      revoke_orphan_access: { Args: { _request: string; _note?: string | null }; Returns: unknown };
      admin_access_requests: { Args: { _status?: string }; Returns: unknown };
      my_access_requests: { Args: Record<string, never>; Returns: unknown };
      guardian_orphans: { Args: Record<string, never>; Returns: unknown };
      org_orphans: { Args: Record<string, never>; Returns: unknown };
    };
  };
};

export type ProtectionClient = SupabaseClient<DatabaseWithProtection, "public">;

export function withProtection(client: unknown): ProtectionClient {
  return client as ProtectionClient;
}

/** صفوف لوحات من يملك الملفّ — تمرّ بدالّة لا بمنحٍ عريض. */
export type GuardianOrphanRow = {
  id: string;
  code: string;
  display_name: string;
  city: string | null;
  country: string | null;
  region: string | null;
  status: string;
  monthly_need: number;
  funded_monthly: number;
  currency: string;
  photo_consent: string | null;
  created_at: string;
};

export type OrgOrphanRow = GuardianOrphanRow & {
  rejection_code: string | null;
  rejection_reason: string | null;
};
