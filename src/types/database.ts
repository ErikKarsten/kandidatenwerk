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
      clients: {
        Row: {
          id: string
          agency_id: string
          name: string
          contact_email: string | null
          active: boolean
          created_at: string
          tags: string[] | null
          contact_name: string | null
          phone: string | null
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
          custom_fields: Record<string, string> | null
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
          custom_fields?: Record<string, string> | null
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
          custom_fields?: Record<string, string> | null
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
      candidate_files: {
        Row: {
          id: string
          candidate_id: string
          file_name: string
          file_path: string
          file_size: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
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
      campaigns: {
        Row: {
          id: string
          client_id: string
          title: string
          description: string | null
          status: string
          meta_campaign_id: string | null
          meta_field_mapping: Record<string, string> | null
          meta_form_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          title: string
          description?: string | null
          status?: string
          meta_campaign_id?: string | null
          meta_field_mapping?: Record<string, string> | null
          meta_form_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          title?: string
          description?: string | null
          status?: string
          meta_campaign_id?: string | null
          meta_field_mapping?: Record<string, string> | null
          meta_form_id?: string | null
          created_at?: string
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
