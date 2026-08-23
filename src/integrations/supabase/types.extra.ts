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
        Row: GeneratedPayments["Row"] & PaymentExtras;
        Insert: GeneratedPayments["Insert"] & Partial<PaymentExtras>;
        Update: GeneratedPayments["Update"] & Partial<PaymentExtras>;
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
