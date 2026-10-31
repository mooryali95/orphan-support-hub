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
      access_request_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          from_admin: boolean
          id: string
          request_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          from_admin: boolean
          id?: string
          request_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          from_admin?: boolean
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "orphan_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      access_scope_packages: {
        Row: {
          active: boolean
          created_at: string
          description: string
          key: string
          label: string
          scopes: string[]
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          key: string
          label: string
          scopes: string[]
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          key?: string
          label?: string
          scopes?: string[]
          sort_order?: number
        }
        Relationships: []
      }
      access_scopes: {
        Row: {
          active: boolean
          created_at: string
          description: string
          key: string
          label: string
          sensitivity: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          key: string
          label: string
          sensitivity?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          key?: string
          label?: string
          sensitivity?: number
          sort_order?: number
        }
        Relationships: []
      }
      api_clients: {
        Row: {
          active: boolean
          client_key: string
          created_at: string
          created_by: string | null
          id: string
          last_import_at: string | null
          last_used_at: string | null
          name: string
          org_id: string | null
          revoked_at: string | null
          scopes: string[]
          secret_hash: string
          secret_prefix: string | null
          secret_salt: string | null
          source: string | null
        }
        Insert: {
          active?: boolean
          client_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_import_at?: string | null
          last_used_at?: string | null
          name: string
          org_id?: string | null
          revoked_at?: string | null
          scopes?: string[]
          secret_hash: string
          secret_prefix?: string | null
          secret_salt?: string | null
          source?: string | null
        }
        Update: {
          active?: boolean
          client_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_import_at?: string | null
          last_used_at?: string | null
          name?: string
          org_id?: string | null
          revoked_at?: string | null
          scopes?: string[]
          secret_hash?: string
          secret_prefix?: string | null
          secret_salt?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clients_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
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
          idempotency_key: string | null
          received_count: number
          request_digest: string | null
          result: Json
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
          idempotency_key?: string | null
          received_count?: number
          request_digest?: string | null
          result?: Json
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
          idempotency_key?: string | null
          received_count?: number
          request_digest?: string | null
          result?: Json
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
          country_code: string | null
          created_at: string
          id: string
          kind: string | null
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
          country_code?: string | null
          created_at?: string
          id?: string
          kind?: string | null
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
          country_code?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          license_number?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_organizations_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "care_organizations_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "institution_kinds"
            referencedColumns: ["key"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          emergency_note: string | null
          name_ar: string
          name_local: string | null
          sort_order: number
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          emergency_note?: string | null
          name_ar: string
          name_local?: string | null
          sort_order?: number
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          emergency_note?: string | null
          name_ar?: string
          name_local?: string | null
          sort_order?: number
          status?: string
        }
        Relationships: []
      }
      data_retention_policy: {
        Row: {
          basis: Database["public"]["Enums"]["processing_basis"]
          entity: string
          note: string
          retain_months: number | null
          updated_at: string
        }
        Insert: {
          basis: Database["public"]["Enums"]["processing_basis"]
          entity: string
          note: string
          retain_months?: number | null
          updated_at?: string
        }
        Update: {
          basis?: Database["public"]["Enums"]["processing_basis"]
          entity?: string
          note?: string
          retain_months?: number | null
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
          delivered_at: string | null
          delivery_note: string | null
          delivery_proof_path: string | null
          id: string
          note: string | null
          org_id: string | null
          orphan_id: string | null
          period_end: string | null
          period_start: string | null
          proof_url: string | null
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          delivered_at?: string | null
          delivery_note?: string | null
          delivery_proof_path?: string | null
          id?: string
          note?: string | null
          org_id?: string | null
          orphan_id?: string | null
          period_end?: string | null
          period_start?: string | null
          proof_url?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          delivered_at?: string | null
          delivery_note?: string | null
          delivery_proof_path?: string | null
          id?: string
          note?: string | null
          org_id?: string | null
          orphan_id?: string | null
          period_end?: string | null
          period_start?: string | null
          proof_url?: string | null
          reference?: string | null
          status?: string
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
      dispatch_runs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          error_kind: string | null
          failed: number
          id: string
          job: string
          ok: boolean
          provider: string | null
          schema_ready: boolean
          sent: number
          skipped: number
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          error_kind?: string | null
          failed?: number
          id?: string
          job?: string
          ok?: boolean
          provider?: string | null
          schema_ready?: boolean
          sent?: number
          skipped?: number
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          error_kind?: string | null
          failed?: number
          id?: string
          job?: string
          ok?: boolean
          provider?: string | null
          schema_ready?: boolean
          sent?: number
          skipped?: number
        }
        Relationships: []
      }
      donor_entities: {
        Row: {
          country: string | null
          created_at: string
          created_by: string
          entity_type: string
          id: string
          name: string
          status: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by: string
          entity_type?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string
          entity_type?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      donor_members: {
        Row: {
          entity_id: string
          role: string
          user_id: string
        }
        Insert: {
          entity_id: string
          role?: string
          user_id: string
        }
        Update: {
          entity_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_members_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "donor_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          consent_at: string | null
          consent_document: string | null
          ended_at: string | null
          enrollment_id: string
          id: string
          note: string | null
          person_contact: string | null
          person_id: string | null
          person_name: string | null
          role: Database["public"]["Enums"]["enrollment_role"]
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          consent_at?: string | null
          consent_document?: string | null
          ended_at?: string | null
          enrollment_id: string
          id?: string
          note?: string | null
          person_contact?: string | null
          person_id?: string | null
          person_name?: string | null
          role: Database["public"]["Enums"]["enrollment_role"]
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          consent_at?: string | null
          consent_document?: string | null
          ended_at?: string | null
          enrollment_id?: string
          id?: string
          note?: string | null
          person_contact?: string | null
          person_id?: string | null
          person_name?: string | null
          role?: Database["public"]["Enums"]["enrollment_role"]
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_roles_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_units: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          enrollment_id: string
          evidence: string | null
          id: string
          note: string | null
          status: Database["public"]["Enums"]["unit_progress"]
          submitted_at: string | null
          unit_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          enrollment_id: string
          evidence?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["unit_progress"]
          submitted_at?: string | null
          unit_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          enrollment_id?: string
          evidence?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["unit_progress"]
          submitted_at?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_units_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "program_units"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_e_consents: {
        Row: {
          created_at: string
          decision: string
          id: string
          orphan_id: string
          statement: string
          subject: string
          subject_ref: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          orphan_id: string
          statement: string
          subject: string
          subject_ref?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          orphan_id?: string
          statement?: string
          subject?: string
          subject_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_e_consents_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_kinds: {
        Row: {
          active: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      integrity_discrepancies: {
        Row: {
          changes: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          orphan_id: string
          source: string | null
          status: string
        }
        Insert: {
          changes: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          orphan_id: string
          source?: string | null
          status?: string
        }
        Update: {
          changes?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          orphan_id?: string
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrity_discrepancies_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_log: {
        Row: {
          actor: string | null
          at: string
          detail: Json
          hash: string
          id: number
          kind: string
          orphan_id: string | null
          prev_hash: string
          source: string | null
        }
        Insert: {
          actor?: string | null
          at?: string
          detail?: Json
          hash?: string
          id?: number
          kind: string
          orphan_id?: string | null
          prev_hash?: string
          source?: string | null
        }
        Update: {
          actor?: string | null
          at?: string
          detail?: Json
          hash?: string
          id?: number
          kind?: string
          orphan_id?: string | null
          prev_hash?: string
          source?: string | null
        }
        Relationships: []
      }
      mirror_batches: {
        Row: {
          deleted: number
          entity: string
          hash: string
          id: number
          payload_hash: string
          prev_hash: string
          received_at: string
          records: number
          source: string
        }
        Insert: {
          deleted?: number
          entity: string
          hash: string
          id?: number
          payload_hash: string
          prev_hash: string
          received_at?: string
          records: number
          source: string
        }
        Update: {
          deleted?: number
          entity?: string
          hash?: string
          id?: number
          payload_hash?: string
          prev_hash?: string
          received_at?: string
          records?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "mirror_batches_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      mirror_groups: {
        Row: {
          country_code: string
          deleted_at: string | null
          external_ref: string
          id: string
          institution_name: string | null
          institution_ref: string | null
          name: string
          region: string | null
          source: string
          source_updated_at: string | null
          supervisor_name: string | null
          supervisor_ref: string | null
          synced_at: string
        }
        Insert: {
          country_code: string
          deleted_at?: string | null
          external_ref: string
          id?: string
          institution_name?: string | null
          institution_ref?: string | null
          name: string
          region?: string | null
          source: string
          source_updated_at?: string | null
          supervisor_name?: string | null
          supervisor_ref?: string | null
          synced_at?: string
        }
        Update: {
          country_code?: string
          deleted_at?: string | null
          external_ref?: string
          id?: string
          institution_name?: string | null
          institution_ref?: string | null
          name?: string
          region?: string | null
          source?: string
          source_updated_at?: string | null
          supervisor_name?: string | null
          supervisor_ref?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mirror_groups_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "mirror_groups_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      mirror_sync_state: {
        Row: {
          cursor_at: string | null
          cursor_ref: string | null
          drift: Json | null
          entity: string
          last_error: string | null
          last_run_at: string | null
          source: string
        }
        Insert: {
          cursor_at?: string | null
          cursor_ref?: string | null
          drift?: Json | null
          entity: string
          last_error?: string | null
          last_run_at?: string | null
          source: string
        }
        Update: {
          cursor_at?: string | null
          cursor_ref?: string | null
          drift?: Json | null
          entity?: string
          last_error?: string | null
          last_run_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "mirror_sync_state_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          email_enabled: boolean
          muted_kinds: Database["public"]["Enums"]["notification_kind"][]
          unsubscribe_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          muted_kinds?: Database["public"]["Enums"]["notification_kind"][]
          unsubscribe_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          muted_kinds?: Database["public"]["Enums"]["notification_kind"][]
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          email_attempts: number
          email_claimed_at: string | null
          email_error: string | null
          email_sent_at: string | null
          email_skip_reason: string | null
          email_state: Database["public"]["Enums"]["email_state"]
          entity: string | null
          entity_id: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          email_attempts?: number
          email_claimed_at?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          email_skip_reason?: string | null
          email_state?: Database["public"]["Enums"]["email_state"]
          entity?: string | null
          entity_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          email_attempts?: number
          email_claimed_at?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          email_skip_reason?: string | null
          email_state?: Database["public"]["Enums"]["email_state"]
          entity?: string | null
          entity_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      office_members: {
        Row: {
          created_at: string
          office_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          office_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          office_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_members_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_members_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "office_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      office_reports: {
        Row: {
          attachments: string[]
          attachments_consent: boolean
          author_id: string
          body: string
          created_at: string
          id: string
          metrics: Json
          office_id: string
          period_end: string | null
          period_start: string | null
          published_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: string[]
          attachments_consent?: boolean
          author_id: string
          body?: string
          created_at?: string
          id?: string
          metrics?: Json
          office_id: string
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: string[]
          attachments_consent?: boolean
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          metrics?: Json
          office_id?: string
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_reports_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_roles: {
        Row: {
          can_publish: boolean
          can_write: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          can_publish?: boolean
          can_write?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          can_publish?: boolean
          can_write?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      offices: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          region: string | null
        }
        Insert: {
          active?: boolean
          country_code: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          region?: string | null
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offices_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "offices_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_platforms: {
        Row: {
          active: boolean
          base_url: string | null
          country_code: string
          created_at: string
          key: string
          last_reconcile_at: string | null
          name: string
          office_reviewed: boolean
          org_id: string | null
          regions_mapped: boolean
          status: string
        }
        Insert: {
          active?: boolean
          base_url?: string | null
          country_code: string
          created_at?: string
          key: string
          last_reconcile_at?: string | null
          name: string
          office_reviewed?: boolean
          org_id?: string | null
          regions_mapped?: boolean
          status?: string
        }
        Update: {
          active?: boolean
          base_url?: string | null
          country_code?: string
          created_at?: string
          key?: string
          last_reconcile_at?: string | null
          name?: string
          office_reviewed?: boolean
          org_id?: string | null
          regions_mapped?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_platforms_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "operating_platforms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_runs: {
        Row: {
          at: string
          checks: Json
          id: number
          level: string
          notified: number
          signature: string
        }
        Insert: {
          at?: string
          checks: Json
          id?: number
          level: string
          notified?: number
          signature: string
        }
        Update: {
          at?: string
          checks?: Json
          id?: number
          level?: string
          notified?: number
          signature?: string
        }
        Relationships: []
      }
      orphan_access_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string | null
          granted_scopes: string[]
          id: string
          orphan_id: string
          reason: string
          requested_package: string | null
          requester_id: string
          status: Database["public"]["Enums"]["access_status"]
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          granted_scopes?: string[]
          id?: string
          orphan_id: string
          reason: string
          requested_package?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["access_status"]
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          granted_scopes?: string[]
          id?: string
          orphan_id?: string
          reason?: string
          requested_package?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["access_status"]
        }
        Relationships: [
          {
            foreignKeyName: "orphan_access_requests_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orphan_access_requests_requested_package_fkey"
            columns: ["requested_package"]
            isOneToOne: false
            referencedRelation: "access_scope_packages"
            referencedColumns: ["key"]
          },
        ]
      }
      orphan_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string | null
          id: string
          kind: Database["public"]["Enums"]["orphan_doc_type"]
          mime_type: string | null
          note: string | null
          orphan_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["orphan_doc_type"]
          mime_type?: string | null
          note?: string | null
          orphan_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["orphan_doc_type"]
          mime_type?: string | null
          note?: string | null
          orphan_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
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
      orphan_locks: {
        Row: {
          locked_at: string
          orphan_id: string
          reason: string
          source_ref: string | null
        }
        Insert: {
          locked_at?: string
          orphan_id: string
          reason: string
          source_ref?: string | null
        }
        Update: {
          locked_at?: string
          orphan_id?: string
          reason?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orphan_locks_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: true
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
      orphan_profile_sections: {
        Row: {
          created_at: string
          data: Json
          id: string
          note: string | null
          orphan_id: string
          section: Database["public"]["Enums"]["profile_section"]
          updated_at: string
          updated_by: string | null
          updated_role: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          note?: string | null
          orphan_id: string
          section: Database["public"]["Enums"]["profile_section"]
          updated_at?: string
          updated_by?: string | null
          updated_role?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          note?: string | null
          orphan_id?: string
          section?: Database["public"]["Enums"]["profile_section"]
          updated_at?: string
          updated_by?: string | null
          updated_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orphan_profile_sections_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      orphan_trait_scores: {
        Row: {
          deleted_at: string | null
          external_ref: string
          id: string
          note: string | null
          observed_at: string
          orphan_id: string
          scale_max: number
          score: number
          source: string
          trait_id: string
        }
        Insert: {
          deleted_at?: string | null
          external_ref: string
          id?: string
          note?: string | null
          observed_at: string
          orphan_id: string
          scale_max?: number
          score: number
          source: string
          trait_id: string
        }
        Update: {
          deleted_at?: string | null
          external_ref?: string
          id?: string
          note?: string | null
          observed_at?: string
          orphan_id?: string
          scale_max?: number
          score?: number
          source?: string
          trait_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphan_trait_scores_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orphan_trait_scores_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "orphan_trait_scores_trait_id_fkey"
            columns: ["trait_id"]
            isOneToOne: false
            referencedRelation: "trait_definitions"
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
          country_code: string | null
          created_at: string
          created_by: string | null
          currency: string
          display_name: string
          education_stage: string | null
          external_deleted_at: string | null
          external_ref: string | null
          external_source: string | null
          funded_monthly: number
          gender: string
          group_id: string | null
          guardian_id: string | null
          id: string
          monthly_need: number
          org_id: string | null
          photo_consent: Database["public"]["Enums"]["photo_consent_state"]
          photo_consent_at: string | null
          photo_consent_by: string | null
          photo_consent_doc: string | null
          photo_url: string | null
          region: string | null
          rejection_code: Database["public"]["Enums"]["rejection_code"] | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
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
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          display_name: string
          education_stage?: string | null
          external_deleted_at?: string | null
          external_ref?: string | null
          external_source?: string | null
          funded_monthly?: number
          gender?: string
          group_id?: string | null
          guardian_id?: string | null
          id?: string
          monthly_need?: number
          org_id?: string | null
          photo_consent?: Database["public"]["Enums"]["photo_consent_state"]
          photo_consent_at?: string | null
          photo_consent_by?: string | null
          photo_consent_doc?: string | null
          photo_url?: string | null
          region?: string | null
          rejection_code?: Database["public"]["Enums"]["rejection_code"] | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          display_name?: string
          education_stage?: string | null
          external_deleted_at?: string | null
          external_ref?: string | null
          external_source?: string | null
          funded_monthly?: number
          gender?: string
          group_id?: string | null
          guardian_id?: string | null
          id?: string
          monthly_need?: number
          org_id?: string | null
          photo_consent?: Database["public"]["Enums"]["photo_consent_state"]
          photo_consent_at?: string | null
          photo_consent_by?: string | null
          photo_consent_doc?: string | null
          photo_url?: string | null
          region?: string | null
          rejection_code?: Database["public"]["Enums"]["rejection_code"] | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["orphan_status"]
          story?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphans_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "orphans_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mirror_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orphans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          payment_id: string | null
          processed_at: string | null
          provider: string
          provider_event_id: string
          signature_verified: boolean
          sponsorship_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          provider: string
          provider_event_id: string
          signature_verified?: boolean
          sponsorship_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          signature_verified?: boolean
          sponsorship_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          brand_name: string
          code_prefix: string
          currency: string
          email_hold_reason: string | null
          email_on_hold: boolean
          fee_percent: number
          id: boolean
          max_sponsorship: number
          min_sponsorship: number
          payments_hold_reason: string | null
          payments_hold_since: string | null
          payments_on_hold: boolean
          updated_at: string
        }
        Insert: {
          brand_name?: string
          code_prefix?: string
          currency?: string
          email_hold_reason?: string | null
          email_on_hold?: boolean
          fee_percent?: number
          id?: boolean
          max_sponsorship?: number
          min_sponsorship?: number
          payments_hold_reason?: string | null
          payments_hold_since?: string | null
          payments_on_hold?: boolean
          updated_at?: string
        }
        Update: {
          brand_name?: string
          code_prefix?: string
          currency?: string
          email_hold_reason?: string | null
          email_on_hold?: boolean
          fee_percent?: number
          id?: boolean
          max_sponsorship?: number
          min_sponsorship?: number
          payments_hold_reason?: string | null
          payments_hold_since?: string | null
          payments_on_hold?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pledge_deliveries: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string | null
          office_id: string
          pledge_id: string
          proof_path: string | null
          stage: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          office_id: string
          pledge_id: string
          proof_path?: string | null
          stage: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          office_id?: string
          pledge_id?: string
          proof_path?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "pledge_deliveries_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_deliveries_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "support_pledges"
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
      program_enrollments: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          ended_at: string | null
          id: string
          monthly_price: number
          note: string | null
          orphan_id: string
          program_id: string
          stage: Database["public"]["Enums"]["qualification_stage"]
          stage_changed_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          ended_at?: string | null
          id?: string
          monthly_price: number
          note?: string | null
          orphan_id: string
          program_id: string
          stage?: Database["public"]["Enums"]["qualification_stage"]
          stage_changed_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          ended_at?: string | null
          id?: string
          monthly_price?: number
          note?: string | null
          orphan_id?: string
          program_id?: string
          stage?: Database["public"]["Enums"]["qualification_stage"]
          stage_changed_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_enrollments_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_units: {
        Row: {
          active: boolean
          created_at: string
          focus: string
          id: string
          material: string
          ordinal: number
          outputs: string[]
          program_id: string
          submission: string
          task: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          focus: string
          id?: string
          material: string
          ordinal: number
          outputs: string[]
          program_id: string
          submission: string
          task: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          focus?: string
          id?: string
          material?: string
          ordinal?: number
          outputs?: string[]
          program_id?: string
          submission?: string
          task?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_units_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          category: Database["public"]["Enums"]["program_category"]
          concept_id: string | null
          created_at: string
          currency: string
          deliverables: string[]
          description: string | null
          duration_months: number | null
          id: string
          inputs: string[]
          kind: Database["public"]["Enums"]["program_kind"]
          level: Database["public"]["Enums"]["program_level"] | null
          monthly_price: number
          processes: string[]
          provider_org_id: string | null
          slug: string
          status: Database["public"]["Enums"]["program_status"]
          summary: string
          target_trait_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["program_category"]
          concept_id?: string | null
          created_at?: string
          currency?: string
          deliverables?: string[]
          description?: string | null
          duration_months?: number | null
          id?: string
          inputs?: string[]
          kind?: Database["public"]["Enums"]["program_kind"]
          level?: Database["public"]["Enums"]["program_level"] | null
          monthly_price: number
          processes?: string[]
          provider_org_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["program_status"]
          summary: string
          target_trait_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["program_category"]
          concept_id?: string | null
          created_at?: string
          currency?: string
          deliverables?: string[]
          description?: string | null
          duration_months?: number | null
          id?: string
          inputs?: string[]
          kind?: Database["public"]["Enums"]["program_kind"]
          level?: Database["public"]["Enums"]["program_level"] | null
          monthly_price?: number
          processes?: string[]
          provider_org_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["program_status"]
          summary?: string
          target_trait_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "qualification_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_provider_org_id_fkey"
            columns: ["provider_org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_target_trait_id_fkey"
            columns: ["target_trait_id"]
            isOneToOne: false
            referencedRelation: "qualification_traits"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_reports: {
        Row: {
          attachment_url: string | null
          attachments: string[]
          created_at: string
          created_by: string | null
          education_note: string | null
          health_note: string | null
          id: string
          living_note: string | null
          org_id: string | null
          orphan_id: string
          period: string
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          attachments?: string[]
          created_at?: string
          created_by?: string | null
          education_note?: string | null
          health_note?: string | null
          id?: string
          living_note?: string | null
          org_id?: string | null
          orphan_id: string
          period: string
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          attachments?: string[]
          created_at?: string
          created_by?: string | null
          education_note?: string | null
          health_note?: string | null
          id?: string
          living_note?: string | null
          org_id?: string | null
          orphan_id?: string
          period?: string
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
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
      protected_admins: {
        Row: {
          created_at: string
          email: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          email: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string | null
        }
        Relationships: []
      }
      qualification_concepts: {
        Row: {
          actions: string[]
          active: boolean
          created_at: string
          id: string
          intent: string
          name: string
          origin: string
          slug: string
          system_support: string[]
          trait_id: string
        }
        Insert: {
          actions: string[]
          active?: boolean
          created_at?: string
          id?: string
          intent: string
          name: string
          origin: string
          slug: string
          system_support: string[]
          trait_id: string
        }
        Update: {
          actions?: string[]
          active?: boolean
          created_at?: string
          id?: string
          intent?: string
          name?: string
          origin?: string
          slug?: string
          system_support?: string[]
          trait_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualification_concepts_trait_id_fkey"
            columns: ["trait_id"]
            isOneToOne: false
            referencedRelation: "qualification_traits"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_traits: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          summary: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          summary: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          summary?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          identity: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          identity: string
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          identity?: string
          window_start?: string
        }
        Relationships: []
      }
      sponsorship_payments: {
        Row: {
          amount: number
          checkout_url: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          fee_amount: number
          id: string
          idempotency_key: string | null
          invoice_no: string | null
          net_amount: number | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          provider: string | null
          provider_checkout_id: string | null
          provider_event_id: string | null
          provider_payment_id: string | null
          provider_ref: string | null
          receipt_url: string | null
          sponsor_id: string
          sponsorship_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          checkout_url?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          invoice_no?: string | null
          net_amount?: number | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string | null
          provider_checkout_id?: string | null
          provider_event_id?: string | null
          provider_payment_id?: string | null
          provider_ref?: string | null
          receipt_url?: string | null
          sponsor_id: string
          sponsorship_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          invoice_no?: string | null
          net_amount?: number | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string | null
          provider_checkout_id?: string | null
          provider_event_id?: string | null
          provider_payment_id?: string | null
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
          enrollment_id: string | null
          exceeds_gap: boolean
          excess_at_creation: number | null
          id: string
          is_anonymous: boolean
          message: string | null
          message_reviewed_at: string | null
          message_status: string
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
          enrollment_id?: string | null
          exceeds_gap?: boolean
          excess_at_creation?: number | null
          id?: string
          is_anonymous?: boolean
          message?: string | null
          message_reviewed_at?: string | null
          message_status?: string
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
          enrollment_id?: string | null
          exceeds_gap?: boolean
          excess_at_creation?: number | null
          id?: string
          is_anonymous?: boolean
          message?: string | null
          message_reviewed_at?: string | null
          message_status?: string
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
            foreignKeyName: "sponsorships_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorships_orphan_id_fkey"
            columns: ["orphan_id"]
            isOneToOne: false
            referencedRelation: "orphans"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_profiles: {
        Row: {
          active: boolean
          certified_at: string | null
          certified_by: string | null
          created_at: string
          independence_index: number
          level: Database["public"]["Enums"]["program_level"]
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          certified_at?: string | null
          certified_by?: string | null
          created_at?: string
          independence_index?: number
          level?: Database["public"]["Enums"]["program_level"]
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          certified_at?: string | null
          certified_by?: string | null
          created_at?: string
          independence_index?: number
          level?: Database["public"]["Enums"]["program_level"]
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_pledges: {
        Row: {
          amount: number
          country_code: string
          created_at: string
          currency: string
          donor_entity_id: string | null
          group_id: string | null
          id: string
          kind: string
          note: string | null
          org_id: string | null
          orphan_id: string | null
          region: string | null
          status: string
          supporter_id: string
          target_type: string
        }
        Insert: {
          amount: number
          country_code: string
          created_at?: string
          currency?: string
          donor_entity_id?: string | null
          group_id?: string | null
          id?: string
          kind: string
          note?: string | null
          org_id?: string | null
          orphan_id?: string | null
          region?: string | null
          status?: string
          supporter_id: string
          target_type: string
        }
        Update: {
          amount?: number
          country_code?: string
          created_at?: string
          currency?: string
          donor_entity_id?: string | null
          group_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          org_id?: string | null
          orphan_id?: string | null
          region?: string | null
          status?: string
          supporter_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_pledges_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "support_pledges_donor_entity_id_fkey"
            columns: ["donor_entity_id"]
            isOneToOne: false
            referencedRelation: "donor_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_pledges_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mirror_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "care_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_pledges_orphan_id_fkey"
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
      trait_assessments: {
        Row: {
          assessed_at: string
          assessed_by: string | null
          below_threshold: boolean
          core_trait_id: string | null
          enrollment_id: string
          id: string
          note: string | null
          phase: Database["public"]["Enums"]["assessment_phase"]
          relational_trait_id: string | null
          scores: Json
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string | null
          below_threshold?: boolean
          core_trait_id?: string | null
          enrollment_id: string
          id?: string
          note?: string | null
          phase: Database["public"]["Enums"]["assessment_phase"]
          relational_trait_id?: string | null
          scores: Json
        }
        Update: {
          assessed_at?: string
          assessed_by?: string | null
          below_threshold?: boolean
          core_trait_id?: string | null
          enrollment_id?: string
          id?: string
          note?: string | null
          phase?: Database["public"]["Enums"]["assessment_phase"]
          relational_trait_id?: string | null
          scores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "trait_assessments_core_trait_id_fkey"
            columns: ["core_trait_id"]
            isOneToOne: false
            referencedRelation: "qualification_traits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trait_assessments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trait_assessments_relational_trait_id_fkey"
            columns: ["relational_trait_id"]
            isOneToOne: false
            referencedRelation: "qualification_traits"
            referencedColumns: ["id"]
          },
        ]
      }
      trait_definitions: {
        Row: {
          definition_ar: string | null
          definition_local: string | null
          deleted_at: string | null
          dimension_id: string
          elements: Json
          external_ref: string
          id: string
          name_ar: string
          name_local: string | null
          sort_order: number
          source: string
          stage_label: string | null
        }
        Insert: {
          definition_ar?: string | null
          definition_local?: string | null
          deleted_at?: string | null
          dimension_id: string
          elements?: Json
          external_ref: string
          id?: string
          name_ar: string
          name_local?: string | null
          sort_order?: number
          source: string
          stage_label?: string | null
        }
        Update: {
          definition_ar?: string | null
          definition_local?: string | null
          deleted_at?: string | null
          dimension_id?: string
          elements?: Json
          external_ref?: string
          id?: string
          name_ar?: string
          name_local?: string | null
          sort_order?: number
          source?: string
          stage_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trait_definitions_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "trait_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trait_definitions_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      trait_dimensions: {
        Row: {
          description: string | null
          id: string
          key: string
          label_ar: string
          label_local: string | null
          sort_order: number
          source: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          label_ar: string
          label_local?: string | null
          sort_order?: number
          source: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          label_ar?: string
          label_local?: string | null
          sort_order?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "trait_dimensions_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "operating_platforms"
            referencedColumns: ["key"]
          },
        ]
      }
      trait_score_revisions: {
        Row: {
          id: number
          new_score: number
          orphan_id: string
          revised_at: string
          score_id: string
          was_observed_at: string
          was_score: number
        }
        Insert: {
          id?: number
          new_score: number
          orphan_id: string
          revised_at?: string
          score_id: string
          was_observed_at: string
          was_score: number
        }
        Update: {
          id?: number
          new_score?: number
          orphan_id?: string
          revised_at?: string
          score_id?: string
          was_observed_at?: string
          was_score?: number
        }
        Relationships: []
      }
      ui_locale_reviewers: {
        Row: {
          added_at: string
          added_by: string | null
          locale: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          locale: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          locale?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ui_locale_reviewers_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "ui_locales"
            referencedColumns: ["code"]
          },
        ]
      }
      ui_locales: {
        Row: {
          code: string
          countries: string[]
          dir: string
          enabled_at: string
          enabled_by: string | null
          live_at: string | null
          name: string
          status: string
        }
        Insert: {
          code: string
          countries?: string[]
          dir?: string
          enabled_at?: string
          enabled_by?: string | null
          live_at?: string | null
          name: string
          status?: string
        }
        Update: {
          code?: string
          countries?: string[]
          dir?: string
          enabled_at?: string
          enabled_by?: string | null
          live_at?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      ui_translation_revisions: {
        Row: {
          action: string
          actor: string | null
          at: string
          id: number
          key: string
          locale: string
          origin: string | null
          status: string
          text: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          id?: number
          key: string
          locale: string
          origin?: string | null
          status: string
          text?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          id?: number
          key?: string
          locale?: string
          origin?: string | null
          status?: string
          text?: string | null
        }
        Relationships: []
      }
      ui_translations: {
        Row: {
          key: string
          locale: string
          origin: string
          published_at: string | null
          published_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_hash: string
          status: string
          text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          locale: string
          origin?: string
          published_at?: string | null
          published_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_hash: string
          status?: string
          text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          locale?: string
          origin?: string
          published_at?: string | null
          published_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_hash?: string
          status?: string
          text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ui_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "ui_locales"
            referencedColumns: ["code"]
          },
        ]
      }
      unlock_requests: {
        Row: {
          applied_at: string | null
          approvals: string[]
          approved_at: string | null
          created_at: string
          decided_by: string | null
          decision_note: string | null
          discrepancy_id: string | null
          document: string | null
          expires_at: string | null
          id: string
          op: string
          orphan_id: string
          patch: Json
          reason: string
          requested_by: string
          status: string
        }
        Insert: {
          applied_at?: string | null
          approvals?: string[]
          approved_at?: string | null
          created_at?: string
          decided_by?: string | null
          decision_note?: string | null
          discrepancy_id?: string | null
          document?: string | null
          expires_at?: string | null
          id?: string
          op: string
          orphan_id: string
          patch?: Json
          reason: string
          requested_by: string
          status?: string
        }
        Update: {
          applied_at?: string | null
          approvals?: string[]
          approved_at?: string | null
          created_at?: string
          decided_by?: string | null
          decision_note?: string | null
          discrepancy_id?: string | null
          document?: string | null
          expires_at?: string | null
          id?: string
          op?: string
          orphan_id?: string
          patch?: Json
          reason?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "unlock_requests_orphan_id_fkey"
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
      _ops_checks: { Args: never; Returns: Json }
      _ops_level: { Args: { _checks: Json }; Returns: string }
      access_scope_catalog: { Args: never; Returns: Json }
      access_thread: { Args: { _request: string }; Returns: Json }
      admin_access_requests: { Args: { _status?: string }; Returns: Json }
      admin_api_clients: { Args: never; Returns: Json }
      admin_apply_unlock: { Args: { _request: string }; Returns: Json }
      admin_approve_unlock: { Args: { _request: string }; Returns: Json }
      admin_approved_orgs: { Args: never; Returns: Json }
      admin_assign_office_member: {
        Args: { _email: string; _office: string; _role: string }
        Returns: undefined
      }
      admin_decision_context: {
        Args: { _id: string; _kind: string }
        Returns: Json
      }
      admin_decision_inbox: { Args: never; Returns: Json }
      admin_enable_locale: {
        Args: { _code: string; _country: string; _dir: string; _name: string }
        Returns: undefined
      }
      admin_grant_payload: { Args: { _request: string }; Returns: Json }
      admin_integrity_queue: { Args: never; Returns: Json }
      admin_locale_reviewers: { Args: { _code: string }; Returns: Json }
      admin_mirror_status: { Args: never; Returns: Json }
      admin_offices_overview: { Args: never; Returns: Json }
      admin_orphan_lock: { Args: { _orphan: string }; Returns: Json }
      admin_overview: { Args: never; Returns: Json }
      admin_reject_unlock: {
        Args: { _note: string; _request: string }
        Returns: undefined
      }
      admin_request_unlock: {
        Args: {
          _document?: string
          _op: string
          _orphan: string
          _patch: Json
          _reason: string
        }
        Returns: string
      }
      admin_resolve_discrepancy: {
        Args: { _accept: boolean; _id: string; _reason: string }
        Returns: string
      }
      admin_review_office_report: {
        Args: { _publish: boolean; _report: string }
        Returns: undefined
      }
      admin_set_country_emergency: {
        Args: { _code: string; _note: string; _on: boolean }
        Returns: undefined
      }
      admin_set_locale_reviewer: {
        Args: { _add: boolean; _code: string; _email: string }
        Returns: undefined
      }
      admin_set_locale_status: {
        Args: { _code: string; _status: string }
        Returns: undefined
      }
      admin_set_platform_org: {
        Args: { _org: string; _platform: string }
        Returns: undefined
      }
      admin_set_pledge_status: {
        Args: { _pledge: string; _status: string }
        Returns: undefined
      }
      admin_set_source: {
        Args: {
          _key: string
          _office_reviewed?: boolean
          _regions_mapped?: boolean
          _status: string
        }
        Returns: Json
      }
      admin_sources_overview: { Args: never; Returns: Json }
      admin_supervisors: { Args: never; Returns: Json }
      age_band_of: {
        Args: { _birth: string }
        Returns: Database["public"]["Enums"]["age_band"]
      }
      amend_orphan_access: {
        Args: { _note?: string; _request: string; _scopes: string[] }
        Returns: Json
      }
      announce_payment: {
        Args: {
          _amount: number
          _currency: string
          _sponsorship: string
          _succeeded: boolean
        }
        Returns: undefined
      }
      api_orphan_cards: {
        Args: {
          _age_band?: string
          _client: string
          _country?: string
          _funding?: string
          _gender?: string
          _limit?: number
          _offset?: number
          _region?: string
        }
        Returns: Json
      }
      assign_enrollment_role: {
        Args: {
          _enrollment: string
          _note?: string
          _person_contact?: string
          _person_email?: string
          _person_name?: string
          _role: string
        }
        Returns: string
      }
      brand_name: { Args: never; Returns: string }
      can_manage_orphan: { Args: { _orphan_id: string }; Returns: boolean }
      can_reach_office_folder: {
        Args: { _need: string; _path: string }
        Returns: boolean
      }
      can_reach_orphan_folder: { Args: { _path: string }; Returns: boolean }
      can_see_qualification: { Args: { _orphan: string }; Returns: boolean }
      can_view_orphan_detail: { Args: { _orphan: string }; Returns: boolean }
      certify_supervisor: {
        Args: {
          _independence?: number
          _level?: string
          _note?: string
          _user: string
        }
        Returns: Json
      }
      certify_supervisor_by_email: {
        Args: {
          _email: string
          _independence?: number
          _level?: string
          _note?: string
        }
        Returns: Json
      }
      claim_email_batch: {
        Args: {
          _lease_seconds?: number
          _limit?: number
          _max_attempts?: number
        }
        Returns: {
          attempts: number
          body: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string
          recipient: string
          title: string
          unsubscribe_token: string
        }[]
      }
      cohort_is_safe: { Args: { _orphan: string }; Returns: boolean }
      cohort_min: { Args: never; Returns: number }
      confirm_disbursement_delivery: {
        Args: { _disbursement: string; _note?: string; _proof_path: string }
        Returns: undefined
      }
      consent_statement: {
        Args: { _decision: string; _subject: string }
        Returns: string
      }
      create_api_client:
        | {
            Args: {
              _hash: string
              _key: string
              _name: string
              _org: string
              _prefix: string
              _salt: string
              _scopes: string[]
            }
            Returns: Json
          }
        | {
            Args: {
              _hash: string
              _key: string
              _name: string
              _org: string
              _prefix: string
              _salt: string
              _scopes: string[]
              _source: string
            }
            Returns: Json
          }
      create_orphan_intake: { Args: { _payload: Json }; Returns: Json }
      create_support_pledge: {
        Args: {
          _amount: number
          _country?: string
          _currency?: string
          _elapsed?: number
          _kind: string
          _note?: string
          _target: string
          _target_type: string
        }
        Returns: string
      }
      decide_orphan_access: {
        Args: {
          _days?: number
          _decision: string
          _note?: string
          _request: string
          _scopes?: string[]
        }
        Returns: Json
      }
      donor_entity_dashboard: { Args: { _entity: string }; Returns: Json }
      donor_entity_pledges: { Args: { _entity: string }; Returns: Json }
      donor_members_list: { Args: { _entity: string }; Returns: Json }
      donor_set_member: {
        Args: { _email: string; _entity: string; _role: string }
        Returns: undefined
      }
      enrollment_assessments: { Args: { _enrollment: string }; Returns: Json }
      enrollment_detail: { Args: { _enrollment: string }; Returns: Json }
      enrollment_has_consent: {
        Args: { _enrollment: string }
        Returns: boolean
      }
      enrollment_supervisor: { Args: { _enrollment: string }; Returns: string }
      enrollment_supervisor_standing: {
        Args: { _enrollment: string }
        Returns: Json
      }
      enrollment_unit_progress: { Args: { _enrollment: string }; Returns: Json }
      geo_stats: { Args: never; Returns: Json }
      guardian_children_overview: { Args: never; Returns: Json }
      guardian_consent_enrollment: { Args: { _role: string }; Returns: string }
      guardian_orphans: { Args: never; Returns: Json }
      guardian_set_photo_consent: {
        Args: { _orphan: string; _state: string }
        Returns: string
      }
      has_orphan_scope: {
        Args: { _orphan: string; _scope: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: {
          _bucket: string
          _identity: string
          _limit: number
          _window_seconds: number
        }
        Returns: Json
      }
      import_orphan_record: {
        Args: { _client: string; _payload: Json }
        Returns: Json
      }
      in_orphan_circle: { Args: { _orphan: string }; Returns: boolean }
      integrity_row_hash: {
        Args: {
          _actor: string
          _at: string
          _detail: Json
          _kind: string
          _orphan: string
          _prev: string
          _source: string
        }
        Returns: string
      }
      integrity_verify: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_donor_member: { Args: { _entity: string }; Returns: boolean }
      is_donor_owner: { Args: { _entity: string }; Returns: boolean }
      is_locale_reviewer: { Args: { _locale: string }; Returns: boolean }
      is_protected_admin_email: { Args: { _email: string }; Returns: boolean }
      is_published_orphan_folder: { Args: { _path: string }; Returns: boolean }
      ledger_receipt: {
        Args: {
          _delivered_at: string
          _delivery: string
          _month: string
          _paid: number
          _payment: string
          _sponsorship: string
        }
        Returns: string
      }
      ledger_receipt_v2: {
        Args: {
          _delivered_at: string
          _delivery: string
          _month: string
          _paid: number
          _payment: string
          _refs: string
          _sponsorship: string
        }
        Returns: string
      }
      list_orphan_cards: {
        Args: {
          _age_band?: string
          _building?: boolean
          _country?: string
          _education_stage?: string
          _funding?: string
          _gender?: string
          _group?: string
          _limit?: number
          _offset?: number
          _region?: string
          _search?: string
          _sort?: string
        }
        Returns: Json
      }
      lock_orphan: {
        Args: { _orphan: string; _reason: string; _ref: string }
        Returns: undefined
      }
      log_integrity: {
        Args: {
          _detail?: Json
          _kind: string
          _orphan?: string
          _source?: string
        }
        Returns: undefined
      }
      lookup_payment: { Args: { _ref: string }; Returns: Json }
      mark_email_failed: {
        Args: { _error: string; _id: string; _max_attempts?: number }
        Returns: Database["public"]["Enums"]["email_state"]
      }
      mark_email_sent: { Args: { _ids: string[] }; Returns: number }
      mark_email_suppressed: { Args: { _id: string }; Returns: undefined }
      mirror_apply: {
        Args: {
          _client: string
          _cursor_at?: string
          _cursor_ref?: string
          _deleted?: string[]
          _entity: string
          _records: Json
        }
        Returns: Json
      }
      mirror_log_batch: {
        Args: {
          _client: string
          _deleted: number
          _entity: string
          _payload_hash: string
          _records: number
        }
        Returns: string
      }
      mirror_mark_reconciled: { Args: { _client: string }; Returns: undefined }
      mirror_reconcile: {
        Args: { _client: string; _entity: string; _refs: string[] }
        Returns: Json
      }
      moderate_sponsor_message: {
        Args: { _approve: boolean; _sponsorship: string }
        Returns: undefined
      }
      month_payment_refs: {
        Args: { _month: string; _sponsorship: string }
        Returns: string
      }
      month_payments: {
        Args: { _month: string; _sponsorship: string }
        Returns: Json
      }
      my_access_requests: { Args: never; Returns: Json }
      my_journey_feed: { Args: { _limit?: number }; Returns: Json }
      my_monthly_digest: { Args: never; Returns: Json }
      my_notification_prefs: { Args: never; Returns: Json }
      my_orphan_scopes: { Args: { _orphan: string }; Returns: string[] }
      my_pledges: { Args: never; Returns: Json }
      my_review_locales: { Args: never; Returns: Json }
      my_sponsor_preferences: { Args: never; Returns: Json }
      my_supervised_enrollments: { Args: never; Returns: Json }
      my_supervisor_profile: { Args: never; Returns: Json }
      my_supervisor_today: { Args: never; Returns: Json }
      my_workspaces: { Args: never; Returns: Json }
      next_invoice_no: { Args: { _at: string }; Returns: string }
      next_orphan_code: { Args: never; Returns: string }
      notification_recipients: {
        Args: { _ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      notify: {
        Args: {
          _body?: string
          _entity?: string
          _entity_id?: string
          _kind: Database["public"]["Enums"]["notification_kind"]
          _link?: string
          _title: string
          _user: string
        }
        Returns: string
      }
      office_dashboard: { Args: { _office: string }; Returns: Json }
      office_open_pledges: { Args: { _office: string }; Returns: Json }
      office_permission: {
        Args: { _need?: string; _office: string }
        Returns: boolean
      }
      ops_health: { Args: never; Returns: Json }
      ops_record_run: { Args: never; Returns: Json }
      org_orphans: { Args: never; Returns: Json }
      org_pending_deliveries: { Args: never; Returns: Json }
      orphan_enrollments: { Args: { _orphan: string }; Returns: Json }
      orphan_filter_options: { Args: never; Returns: Json }
      orphan_funding_state: { Args: { _orphan: string }; Returns: Json }
      orphan_group: { Args: { _orphan: string }; Returns: Json }
      orphan_is_locked: { Args: { _orphan: string }; Returns: boolean }
      orphan_journey: { Args: { _orphan: string }; Returns: Json }
      orphan_messages: { Args: { _orphan: string }; Returns: Json }
      orphan_profile: { Args: { _orphan: string }; Returns: Json }
      orphan_profile_completeness: { Args: { _orphan: string }; Returns: Json }
      orphan_program_plan: { Args: { _orphan: string }; Returns: Json }
      orphan_qualification: { Args: { _orphan: string }; Returns: Json }
      orphan_reports: { Args: { _orphan: string }; Returns: Json }
      orphan_sponsor_ids: { Args: { _orphan: string }; Returns: string[] }
      orphan_traits: { Args: { _orphan: string }; Returns: Json }
      orphan_view: { Args: { _orphan: string }; Returns: Json }
      owns_org: { Args: { _org_id: string }; Returns: boolean }
      payment_hold_state: { Args: never; Returns: Json }
      pledge_in_office: {
        Args: { _office: string; _pledge: string }
        Returns: boolean
      }
      post_access_message: {
        Args: { _body: string; _request: string }
        Returns: Json
      }
      profile_section_fields: {
        Args: { _s: Database["public"]["Enums"]["profile_section"] }
        Returns: string[]
      }
      profile_section_is_sensitive: {
        Args: { _s: Database["public"]["Enums"]["profile_section"] }
        Returns: boolean
      }
      program_curriculum: { Args: { _program: string }; Returns: Json }
      protected_admin_override: { Args: never; Returns: boolean }
      prune_rate_limits: { Args: never; Returns: number }
      public_ui_locales: { Args: never; Returns: Json }
      published_regions: { Args: never; Returns: Json }
      published_ui_messages: { Args: { _locale: string }; Returns: Json }
      record_enrollment_consent: {
        Args: { _document: string; _role_id: string }
        Returns: undefined
      }
      record_pledge_delivery: {
        Args: {
          _note?: string
          _office: string
          _pledge: string
          _proof_path?: string
          _stage: string
        }
        Returns: undefined
      }
      record_trait_assessment: {
        Args: {
          _enrollment: string
          _note?: string
          _phase?: string
          _scores: Json
        }
        Returns: Json
      }
      record_unit_progress: {
        Args: {
          _enrollment: string
          _evidence?: string
          _note?: string
          _status: string
          _unit: string
        }
        Returns: Json
      }
      register_donor_entity: {
        Args: { _country?: string; _name: string; _type?: string }
        Returns: string
      }
      request_is_service: { Args: never; Returns: boolean }
      request_orphan_access:
        | { Args: { _orphan: string; _reason: string }; Returns: Json }
        | {
            Args: { _orphan: string; _package: string; _reason: string }
            Returns: Json
          }
      resolve_country_code: { Args: { _text: string }; Returns: string }
      review_organization: {
        Args: { _decision: string; _id: string; _reason?: string }
        Returns: undefined
      }
      review_orphan: {
        Args: {
          _code?: Database["public"]["Enums"]["rejection_code"]
          _decision: string
          _id: string
          _reason?: string
        }
        Returns: undefined
      }
      review_progress_report: {
        Args: { _decision: string; _id: string; _note?: string }
        Returns: undefined
      }
      revoke_api_client: { Args: { _client: string }; Returns: Json }
      revoke_orphan_access: {
        Args: { _note?: string; _request: string }
        Returns: Json
      }
      revoke_supervisor: {
        Args: { _note?: string; _user: string }
        Returns: Json
      }
      save_office_report: {
        Args: {
          _attachments?: string[]
          _body: string
          _consent?: boolean
          _id?: string
          _metrics?: Json
          _office: string
          _period_end?: string
          _period_start?: string
          _status?: string
          _title: string
        }
        Returns: string
      }
      save_orphan_profile_section: {
        Args: {
          _data?: Json
          _note?: string
          _orphan: string
          _section: string
        }
        Returns: Json
      }
      save_sponsor_preferences: {
        Args: { _budget?: number; _region?: string }
        Returns: Json
      }
      set_enrollment_stage: {
        Args: { _enrollment: string; _stage: string }
        Returns: Database["public"]["Enums"]["qualification_stage"]
      }
      set_notification_prefs: {
        Args: { _email_enabled: boolean; _muted_kinds: string[] }
        Returns: Json
      }
      set_pledge_entity: {
        Args: { _entity: string; _pledge: string }
        Returns: undefined
      }
      source_checklist: { Args: { _key: string }; Returns: Json }
      sponsor_messages_for_review: { Args: never; Returns: Json }
      sponsor_qualification: { Args: { _orphan: string }; Returns: Json }
      sponsors_orphan: { Args: { _orphan_id: string }; Returns: boolean }
      sponsorship_ledger: { Args: { _sponsorship: string }; Returns: Json }
      stage_order: {
        Args: { _s: Database["public"]["Enums"]["qualification_stage"] }
        Returns: number
      }
      start_orphan_draft: { Args: { _org_id: string }; Returns: Json }
      submit_progress_report: { Args: { _payload: Json }; Returns: Json }
      suggest_orphans_for_amount: {
        Args: { _amount: number; _exclude?: string; _limit?: number }
        Returns: {
          code: string
          country: string
          currency: string
          display_name: string
          education_stage: string
          funded_monthly: number
          gap: number
          id: string
          monthly_need: number
          region: string
        }[]
      }
      suggest_orphans_for_sponsor: {
        Args: { _budget?: number; _limit?: number; _region?: string }
        Returns: {
          age_band: Database["public"]["Enums"]["age_band"]
          building: boolean
          code: string
          completes: boolean
          country: string
          created_at: string
          currency: string
          display_name: string
          education_stage: string
          funded_monthly: number
          gap: number
          gender: string
          id: string
          in_region: boolean
          monthly_need: number
          org_id: string
          region: string
          status: Database["public"]["Enums"]["orphan_status"]
          waiting_days: number
        }[]
      }
      supervisor_independence_threshold: { Args: never; Returns: number }
      support_catalog: { Args: { _country?: string }; Returns: Json }
      sweep_email_outbox: { Args: never; Returns: number }
      system_health: { Args: never; Returns: Json }
      touch_api_client: {
        Args: { _client: string; _imported?: boolean }
        Returns: undefined
      }
      trait_model: { Args: { _source?: string }; Returns: Json }
      ui_translation_publish: {
        Args: { _keys: string[]; _locale: string }
        Returns: number
      }
      ui_translation_review: {
        Args: { _keys: string[]; _locale: string }
        Returns: number
      }
      ui_translation_save: {
        Args: { _items: Json; _locale: string; _review?: boolean }
        Returns: number
      }
      ui_translation_unpublish: {
        Args: { _keys: string[]; _locale: string }
        Returns: number
      }
      ui_translations_for: { Args: { _locale: string }; Returns: Json }
      unlock_context_allows: {
        Args: { _op: string; _orphan: string }
        Returns: boolean
      }
      unlock_editable_fields: { Args: never; Returns: string[] }
      unlock_quorum: { Args: never; Returns: number }
      unsubscribe_by_token: { Args: { _token: string }; Returns: boolean }
      verify_document: {
        Args: { _id: string; _note?: string; _verified: boolean }
        Returns: undefined
      }
      verify_ledger_receipt: {
        Args: { _month: string; _receipt: string; _sponsorship: string }
        Returns: Json
      }
      write_audit: {
        Args: {
          _action: string
          _entity: string
          _entity_id: string
          _meta?: Json
        }
        Returns: undefined
      }
      write_timeline: {
        Args: { _detail?: string; _event_type: string; _orphan: string }
        Returns: undefined
      }
    }
    Enums: {
      access_status: "pending" | "approved" | "rejected" | "revoked"
      age_band:
        | "under_6"
        | "age_6_11"
        | "age_12_14"
        | "age_15_17"
        | "age_18_plus"
        | "unknown"
      app_role: "admin" | "sponsor" | "care_org" | "guardian"
      assessment_phase: "baseline" | "progress" | "final"
      email_state: "pending" | "sent" | "failed" | "skipped"
      enrollment_role:
        | "supervisor"
        | "jurist"
        | "guardian"
        | "trustee"
        | "mentor"
      enrollment_status:
        | "proposed"
        | "funded"
        | "paused"
        | "completed"
        | "cancelled"
      need_category:
        | "education"
        | "health"
        | "food"
        | "housing"
        | "clothing"
        | "other"
      notification_kind:
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
        | "other"
      org_status: "pending" | "approved" | "suspended" | "rejected"
      orphan_doc_type:
        | "death_certificate"
        | "birth_certificate"
        | "guardianship_proof"
        | "orphan_id"
        | "guardian_id"
        | "income_proof"
        | "school_record"
        | "medical_report"
        | "photo_consent"
        | "other"
      orphan_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "fully_sponsored"
        | "archived"
      payment_status: "pending" | "paid" | "failed" | "refunded" | "disputed"
      photo_consent_state: "none" | "face_hidden" | "granted" | "withdrawn"
      processing_basis:
        | "guardian_consent"
        | "legitimate_interest"
        | "legal_obligation"
        | "vital_interest"
      profile_section:
        | "education"
        | "health"
        | "family"
        | "social"
        | "aspiration"
        | "supervisor_note"
      program_category:
        | "education"
        | "rehabilitation"
        | "psychosocial"
        | "health"
        | "essentials"
      program_kind: "service" | "qualification"
      program_level: "foundational" | "applied" | "advanced"
      program_status: "draft" | "active" | "archived"
      qualification_stage:
        | "concept"
        | "trait"
        | "system"
        | "actions"
        | "measurement"
        | "qualified"
      rejection_code:
        | "documents_missing"
        | "documents_unclear"
        | "documents_inconsistent"
        | "identity_unverified"
        | "guardianship_unproven"
        | "needs_unjustified"
        | "duplicate_profile"
        | "photo_consent_missing"
        | "other"
      report_status: "submitted" | "approved" | "rejected"
      sponsorship_status:
        | "pending_payment"
        | "active"
        | "paused"
        | "cancelled"
        | "completed"
      sponsorship_type: "monthly" | "one_time" | "partial"
      unit_progress: "pending" | "submitted" | "returned" | "accepted"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      access_status: ["pending", "approved", "rejected", "revoked"],
      age_band: [
        "under_6",
        "age_6_11",
        "age_12_14",
        "age_15_17",
        "age_18_plus",
        "unknown",
      ],
      app_role: ["admin", "sponsor", "care_org", "guardian"],
      assessment_phase: ["baseline", "progress", "final"],
      email_state: ["pending", "sent", "failed", "skipped"],
      enrollment_role: [
        "supervisor",
        "jurist",
        "guardian",
        "trustee",
        "mentor",
      ],
      enrollment_status: [
        "proposed",
        "funded",
        "paused",
        "completed",
        "cancelled",
      ],
      need_category: [
        "education",
        "health",
        "food",
        "housing",
        "clothing",
        "other",
      ],
      notification_kind: [
        "welcome",
        "orphan_approved",
        "orphan_rejected",
        "organization_approved",
        "organization_rejected",
        "sponsorship_started",
        "payment_succeeded",
        "payment_failed",
        "report_published",
        "report_rejected",
        "other",
      ],
      org_status: ["pending", "approved", "suspended", "rejected"],
      orphan_doc_type: [
        "death_certificate",
        "birth_certificate",
        "guardianship_proof",
        "orphan_id",
        "guardian_id",
        "income_proof",
        "school_record",
        "medical_report",
        "photo_consent",
        "other",
      ],
      orphan_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "fully_sponsored",
        "archived",
      ],
      payment_status: ["pending", "paid", "failed", "refunded", "disputed"],
      photo_consent_state: ["none", "face_hidden", "granted", "withdrawn"],
      processing_basis: [
        "guardian_consent",
        "legitimate_interest",
        "legal_obligation",
        "vital_interest",
      ],
      profile_section: [
        "education",
        "health",
        "family",
        "social",
        "aspiration",
        "supervisor_note",
      ],
      program_category: [
        "education",
        "rehabilitation",
        "psychosocial",
        "health",
        "essentials",
      ],
      program_kind: ["service", "qualification"],
      program_level: ["foundational", "applied", "advanced"],
      program_status: ["draft", "active", "archived"],
      qualification_stage: [
        "concept",
        "trait",
        "system",
        "actions",
        "measurement",
        "qualified",
      ],
      rejection_code: [
        "documents_missing",
        "documents_unclear",
        "documents_inconsistent",
        "identity_unverified",
        "guardianship_unproven",
        "needs_unjustified",
        "duplicate_profile",
        "photo_consent_missing",
        "other",
      ],
      report_status: ["submitted", "approved", "rejected"],
      sponsorship_status: [
        "pending_payment",
        "active",
        "paused",
        "cancelled",
        "completed",
      ],
      sponsorship_type: ["monthly", "one_time", "partial"],
      unit_progress: ["pending", "submitted", "returned", "accepted"],
    },
  },
} as const
