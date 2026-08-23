export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      api_clients: {
        Row: {
          active: boolean
          client_key: string
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          org_id: string | null
          secret_hash: string
        }
        Insert: {
          active?: boolean
          client_key: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          org_id?: string | null
          secret_hash: string
        }
        Update: {
          active?: boolean
          client_key?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          org_id?: string | null
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_import_jobs: {
        Row: {
          client_id: string | null
          created_at: string
          created_count: number
          errors: Json | null
          failed_count: number
          id: string
          received_count: number
          source: string | null
          updated_count: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_count?: number
          errors?: Json | null
          failed_count?: number
          id?: string
          received_count?: number
          source?: string | null
          updated_count?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_count?: number
          errors?: Json | null
          failed_count?: number
          id?: string
          received_count?: number
          source?: string | null
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_import_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: []
      }
      care_organizations: {
        Row: {
          about: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          license_number: string | null
          logo_url: string | null
          name: string
          owner_id: string | null
          region: string | null
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
        }
        Insert: {
          about?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Update: {
          about?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Relationships: []
      }
      disbursements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          note: string | null
          org_id: string | null
          orphan_id: string | null
          period_end: string | null
          period_start: string | null
          proof_url: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          note?: string | null
          org_id?: string | null
          orphan_id?: string | null
          period_end?: string | null
          period_start?: string | null
          proof_url?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          note?: string | null
          org_id?: string | null
          orphan_id?: string | null
          period_end?: string | null
          period_start?: string | null
          proof_url?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disbursements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursements_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      orphan_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string | null
          id: string
          orphan_id: string
          storage_path: string
          uploaded_by: string | null
          verified: boolean
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name?: string | null
          id?: string
          orphan_id: string
          storage_path: string
          uploaded_by?: string | null
          verified?: boolean
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string | null
          id?: string
          orphan_id?: string
          storage_path?: string
          uploaded_by?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orphan_documents_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      orphan_needs: {
        Row: {
          category: Database["public"]["Enums"]["need_category"]
          created_at: string
          id: string
          monthly_amount: number
          notes: string | null
          orphan_id: string
          title: string
        }
        Insert: {
          category: Database["public"]["Enums"]["need_category"]
          created_at?: string
          id?: string
          monthly_amount?: number
          notes?: string | null
          orphan_id: string
          title: string
        }
        Update: {
          category?: Database["public"]["Enums"]["need_category"]
          created_at?: string
          id?: string
          monthly_amount?: number
          notes?: string | null
          orphan_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphan_needs_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      orphan_private: {
        Row: {
          address: string | null
          created_at: string
          family_income: number | null
          family_size: number | null
          full_name: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relation: string | null
          health_notes: string | null
          national_id: string | null
          notes: string | null
          orphan_id: string
          school_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          family_income?: number | null
          family_size?: number | null
          full_name?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          health_notes?: string | null
          national_id?: string | null
          notes?: string | null
          orphan_id: string
          school_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          family_income?: number | null
          family_size?: number | null
          full_name?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          health_notes?: string | null
          national_id?: string | null
          notes?: string | null
          orphan_id?: string
          school_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphan_private_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: true
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      orphans: {
        Row: {
          approved_at: string | null
          birth_date: string | null
          city: string | null
          code: string
          country: string
          created_at: string
          created_by: string | null
          currency: string
          display_name: string
          education_stage: string | null
          external_ref: string | null
          external_source: string | null
          funded_monthly: number
          gender: string
          guardian_id: string | null
          id: string
          monthly_need: number
          org_id: string | null
          photo_url: string | null
          region: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["orphan_status"]
          story: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          birth_date?: string | null
          city?: string | null
          code: string
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          display_name: string
          education_stage?: string | null
          external_ref?: string | null
          external_source?: string | null
          funded_monthly?: number
          gender?: string
          guardian_id?: string | null
          id?: string
          monthly_need?: number
          org_id?: string | null
          photo_url?: string | null
          region?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["orphan_status"]
          story?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          birth_date?: string | null
          city?: string | null
          code?: string
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          display_name?: string
          education_stage?: string | null
          external_ref?: string | null
          external_source?: string | null
          funded_monthly?: number
          gender?: string
          guardian_id?: string | null
          id?: string
          monthly_need?: number
          org_id?: string | null
          photo_url?: string | null
          region?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["orphan_status"]
          story?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          monthly_budget: number | null
          phone: string | null
          preferred_region: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          monthly_budget?: number | null
          phone?: string | null
          preferred_region?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          monthly_budget?: number | null
          phone?: string | null
          preferred_region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      progress_reports: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string | null
          education_note: string | null
          health_note: string | null
          id: string
          living_note: string | null
          org_id: string | null
          orphan_id: string
          period: string
          review_note: string | null
          status: Database["public"]["Enums"]["report_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          education_note?: string | null
          health_note?: string | null
          id?: string
          living_note?: string | null
          org_id?: string | null
          orphan_id: string
          period: string
          review_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          education_note?: string | null
          health_note?: string | null
          id?: string
          living_note?: string | null
          org_id?: string | null
          orphan_id?: string
          period?: string
          review_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_reports_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsorship_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          provider: string | null
          provider_ref: string | null
          receipt_url: string | null
          sponsor_id: string
          sponsorship_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string | null
          provider_ref?: string | null
          receipt_url?: string | null
          sponsor_id: string
          sponsorship_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string | null
          provider_ref?: string | null
          receipt_url?: string | null
          sponsor_id?: string
          sponsorship_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sponsorship_payments_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsorships: {
        Row: {
          amount: number
          created_at: string
          currency: string
          ended_at: string | null
          id: string
          is_anonymous: boolean
          message: string | null
          next_charge_at: string | null
          orphan_id: string
          provider: string | null
          provider_subscription_id: string | null
          sponsor_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["sponsorship_status"]
          type: Database["public"]["Enums"]["sponsorship_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          ended_at?: string | null
          id?: string
          is_anonymous?: boolean
          message?: string | null
          next_charge_at?: string | null
          orphan_id: string
          provider?: string | null
          provider_subscription_id?: string | null
          sponsor_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["sponsorship_status"]
          type?: Database["public"]["Enums"]["sponsorship_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          ended_at?: string | null
          id?: string
          is_anonymous?: boolean
          message?: string | null
          next_charge_at?: string | null
          orphan_id?: string
          provider?: string | null
          provider_subscription_id?: string | null
          sponsor_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["sponsorship_status"]
          type?: Database["public"]["Enums"]["sponsorship_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsorships_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: string | null
          event_type: string
          id: string
          orphan_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          orphan_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          orphan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_orphan: { Args: { _orphan_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      owns_org: { Args: { _org_id: string }; Returns: boolean }
      sponsors_orphan: { Args: { _orphan_id: string }; Returns: boolean }
      suggest_orphans_for_sponsor: {
        Args: { _budget?: number; _limit?: number; _region?: string }
        Returns: {
          approved_at: string | null
          birth_date: string | null
          city: string | null
          code: string
          country: string
          created_at: string
          created_by: string | null
          currency: string
          display_name: string
          education_stage: string | null
          external_ref: string | null
          external_source: string | null
          funded_monthly: number
          gender: string
          guardian_id: string | null
          id: string
          monthly_need: number
          org_id: string | null
          photo_url: string | null
          region: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["orphan_status"]
          story: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orphans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "admin" | "sponsor" | "care_org" | "guardian"
      need_category:
        | "education"
        | "health"
        | "food"
        | "housing"
        | "clothing"
        | "other"
      org_status: "pending" | "approved" | "suspended" | "rejected"
      orphan_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "fully_sponsored"
        | "archived"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      report_status: "submitted" | "approved" | "rejected"
      sponsorship_status:
        | "pending_payment"
        | "active"
        | "paused"
        | "cancelled"
        | "completed"
      sponsorship_type: "monthly" | "one_time" | "partial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "sponsor", "care_org", "guardian"],
      need_category: [
        "education",
        "health",
        "food",
        "housing",
        "clothing",
        "other",
      ],
      org_status: ["pending", "approved", "suspended", "rejected"],
      orphan_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "fully_sponsored",
        "archived",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      report_status: ["submitted", "approved", "rejected"],
      sponsorship_status: [
        "pending_payment",
        "active",
        "paused",
        "cancelled",
        "completed",
      ],
      sponsorship_type: ["monthly", "one_time", "partial"],
    },
  },
} as const
