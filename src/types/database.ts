// Generated from PostgREST OpenAPI spec — do not edit manually.
// Regenerate: node scripts/gen-types.mjs

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      client_contacts: {
        Row: {
          id: string
          client_id: string | null
          name: string
          email: string | null
          phone: string | null
          role: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          name: string
          email?: string | null
          phone?: string | null
          role?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          role?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      clients: {
        Row: {
          id: string
          agency_id: string | null
          name: string
          contact_email: string | null
          active: boolean
          created_at: string
          tags: string[] | null
          contact_name: string | null
          phone: string | null
          logo_url: string | null
          status: string
          kanzleistelle_company_id: string | null
        }
        Insert: {
          id?: string
          agency_id?: string | null
          name: string
          contact_email?: string | null
          active?: boolean
          created_at?: string
          tags?: string[] | null
          contact_name?: string | null
          phone?: string | null
          logo_url?: string | null
          status?: string
          kanzleistelle_company_id?: string | null
        }
        Update: {
          id?: string
          agency_id?: string | null
          name?: string
          contact_email?: string | null
          active?: boolean
          created_at?: string
          tags?: string[] | null
          contact_name?: string | null
          phone?: string | null
          logo_url?: string | null
          status?: string
          kanzleistelle_company_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          }
        ]
      }
      agencies: {
        Row: {
          id: string
          name: string
          logo_url: string | null
          subdomain: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          subdomain?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          subdomain?: string | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          agency_id: string | null
          client_id: string | null
          role: string
          full_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          agency_id?: string | null
          client_id?: string | null
          role: string
          full_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string | null
          client_id?: string | null
          role?: string
          full_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          }
        ]
      }
      candidates: {
        Row: {
          id: string
          campaign_id: string | null
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          status: string
          source: string
          notes: string | null
          created_at: string
          client_id: string | null
          custom_fields: Json | null
          description: string | null
          berufsbild: string | null
          plz: string | null
          lat: number | null
          lng: number | null
          kanzleistelle_application_id: string | null
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          status?: string
          source?: string
          notes?: string | null
          created_at?: string
          client_id?: string | null
          custom_fields?: Json | null
          description?: string | null
          berufsbild?: string | null
          plz?: string | null
          lat?: number | null
          lng?: number | null
          kanzleistelle_application_id?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string | null
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          status?: string
          source?: string
          notes?: string | null
          created_at?: string
          client_id?: string | null
          custom_fields?: Json | null
          description?: string | null
          berufsbild?: string | null
          plz?: string | null
          lat?: number | null
          lng?: number | null
          kanzleistelle_application_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      campaigns: {
        Row: {
          id: string
          client_id: string
          title: string
          description: string | null
          status: string
          meta_campaign_id: string | null
          created_at: string
          meta_field_mapping: Json | null
          meta_form_id: string | null
          berufsbild: string | null
          plz: string | null
          lat: number | null
          lng: number | null
          radius_km: number
          kanzleistelle_job_id: string | null
        }
        Insert: {
          id?: string
          client_id: string
          title: string
          description?: string | null
          status?: string
          meta_campaign_id?: string | null
          created_at?: string
          meta_field_mapping?: Json | null
          meta_form_id?: string | null
          berufsbild?: string | null
          plz?: string | null
          lat?: number | null
          lng?: number | null
          radius_km?: number
          kanzleistelle_job_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          title?: string
          description?: string | null
          status?: string
          meta_campaign_id?: string | null
          created_at?: string
          meta_field_mapping?: Json | null
          meta_form_id?: string | null
          berufsbild?: string | null
          plz?: string | null
          lat?: number | null
          lng?: number | null
          radius_km?: number
          kanzleistelle_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      campaign_automations: {
        Row: {
          id: string
          campaign_id: string
          name: string
          trigger: string
          trigger_status: string | null
          delay_seconds: number
          active: boolean
          recipient: string
          sender_email: string
          sender_name: string
          subject: string
          body_html: string
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          name: string
          trigger?: string
          trigger_status?: string | null
          delay_seconds?: number
          active?: boolean
          recipient?: string
          sender_email?: string
          sender_name?: string
          subject?: string
          body_html?: string
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          name?: string
          trigger?: string
          trigger_status?: string | null
          delay_seconds?: number
          active?: boolean
          recipient?: string
          sender_email?: string
          sender_name?: string
          subject?: string
          body_html?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_automations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          }
        ]
      }
      candidate_history: {
        Row: {
          id: string
          candidate_id: string
          type: string | null
          content: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          type?: string | null
          content?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          type?: string | null
          content?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          }
        ]
      }
      candidate_campaign_matches: {
        Row: {
          id: string
          candidate_id: string
          campaign_id: string
          distance_km: number | null
          status: string
          matched_automatically: boolean
          matched_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          campaign_id: string
          distance_km?: number | null
          status?: string
          matched_automatically?: boolean
          matched_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          campaign_id?: string
          distance_km?: number | null
          status?: string
          matched_automatically?: boolean
          matched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_campaign_matches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_campaign_matches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          }
        ]
      }
      candidate_files: {
        Row: {
          id: string
          candidate_id: string | null
          file_name: string
          file_path: string
          file_size: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          candidate_id?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_files_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
