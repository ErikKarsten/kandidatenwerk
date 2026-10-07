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
      field_templates: {
        Row: {
          id: string
          agency_id: string
          name: string
          field_keys: string[]
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          field_keys?: string[]
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          field_keys?: string[]
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_lead_forms: {
        Row: {
          form_id: string
          agency_id: string
          name: string | null
          page_name: string | null
          questions: Json
          reviewed_at: string | null
          synced_at: string
          created_at: string
        }
        Insert: {
          form_id: string
          agency_id: string
          name?: string | null
          page_name?: string | null
          questions?: Json
          reviewed_at?: string | null
          synced_at?: string
          created_at?: string
        }
        Update: {
          form_id?: string
          agency_id?: string
          name?: string | null
          page_name?: string | null
          questions?: Json
          reviewed_at?: string | null
          synced_at?: string
          created_at?: string
        }
        Relationships: []
      }
      client_profiles: {
        Row: {
          client_id: string
          kurzbeschreibung: string | null
          intro: string | null
          website: string | null
          mitarbeiterzahl: string | null
          standorte: string | null
          mandantenstruktur: string | null
          software: string | null
          arbeitszeiten: string | null
          homeoffice: string | null
          gehaltsgefuege: string | null
          benefits: string[]
          ansprechpartner_bewerbung: string | null
          vertriebsnotizen: string | null
          painpoints: string | null
          ziele_zusammenarbeit: string | null
          finalized_at: string | null
          finalized_by: string | null
          updated_at: string
          updated_by: string | null
          extra: Json
          kanzleistelle_benefits: string[] | null
          kanzleistelle_benefits_hash: string | null
          kanzleistelle_working_model: string | null
        }
        Insert: {
          client_id: string
          kurzbeschreibung?: string | null
          intro?: string | null
          website?: string | null
          mitarbeiterzahl?: string | null
          standorte?: string | null
          mandantenstruktur?: string | null
          software?: string | null
          arbeitszeiten?: string | null
          homeoffice?: string | null
          gehaltsgefuege?: string | null
          benefits?: string[]
          ansprechpartner_bewerbung?: string | null
          vertriebsnotizen?: string | null
          painpoints?: string | null
          ziele_zusammenarbeit?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          updated_at?: string
          updated_by?: string | null
          extra?: Json
          kanzleistelle_benefits?: string[] | null
          kanzleistelle_benefits_hash?: string | null
          kanzleistelle_working_model?: string | null
        }
        Update: {
          client_id?: string
          kurzbeschreibung?: string | null
          intro?: string | null
          website?: string | null
          mitarbeiterzahl?: string | null
          standorte?: string | null
          mandantenstruktur?: string | null
          software?: string | null
          arbeitszeiten?: string | null
          homeoffice?: string | null
          gehaltsgefuege?: string | null
          benefits?: string[]
          ansprechpartner_bewerbung?: string | null
          vertriebsnotizen?: string | null
          painpoints?: string | null
          ziele_zusammenarbeit?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          updated_at?: string
          updated_by?: string | null
          extra?: Json
          kanzleistelle_benefits?: string[] | null
          kanzleistelle_benefits_hash?: string | null
          kanzleistelle_working_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      client_positions: {
        Row: {
          id: string
          client_id: string
          title: string
          berufsbild: string | null
          plz: string | null
          ort: string | null
          lat: number | null
          lng: number | null
          radius_km: number | null
          arbeitszeit: string | null
          berufserfahrung: string | null
          software: string | null
          gehalt: string | null
          startdatum: string | null
          anforderungen: string | null
          aufgaben: string | null
          campaign_id: string | null
          sort_order: number
          created_at: string
          updated_at: string
          kanzleistelle_job_id: string | null
          extra: Json
        }
        Insert: {
          id?: string
          client_id: string
          title: string
          berufsbild?: string | null
          plz?: string | null
          ort?: string | null
          lat?: number | null
          lng?: number | null
          radius_km?: number | null
          arbeitszeit?: string | null
          berufserfahrung?: string | null
          software?: string | null
          gehalt?: string | null
          startdatum?: string | null
          anforderungen?: string | null
          aufgaben?: string | null
          campaign_id?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          kanzleistelle_job_id?: string | null
          extra?: Json
        }
        Update: {
          id?: string
          client_id?: string
          title?: string
          berufsbild?: string | null
          plz?: string | null
          ort?: string | null
          lat?: number | null
          lng?: number | null
          radius_km?: number | null
          arbeitszeit?: string | null
          berufserfahrung?: string | null
          software?: string | null
          gehalt?: string | null
          startdatum?: string | null
          anforderungen?: string | null
          aufgaben?: string | null
          campaign_id?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          kanzleistelle_job_id?: string | null
          extra?: Json
        }
        Relationships: [
          {
            foreignKeyName: "client_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      client_comments: {
        Row: {
          id: string
          client_id: string
          author_id: string | null
          kind: string
          content: string
          mentions: string[]
          created_at: string
          edited_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          author_id?: string | null
          kind?: string
          content: string
          mentions?: string[]
          created_at?: string
          edited_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          author_id?: string | null
          kind?: string
          content?: string
          mentions?: string[]
          created_at?: string
          edited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
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
      custom_field_definitions: {
        Row: {
          id: string
          agency_id: string
          key: string
          label: string
          sort_order: number
          active: boolean
          section: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          key: string
          label: string
          sort_order?: number
          active?: boolean
          section?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          key?: string
          label?: string
          sort_order?: number
          active?: boolean
          section?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          }
        ]
      }
      client_assignment_notes: {
        Row: {
          id: string
          client_assignment_id: string
          author_id: string | null
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          client_assignment_id: string
          author_id?: string | null
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          client_assignment_id?: string
          author_id?: string | null
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignment_notes_client_assignment_id_fkey"
            columns: ["client_assignment_id"]
            isOneToOne: false
            referencedRelation: "client_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignment_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      custom_field_review_queue: {
        Row: {
          id: string
          agency_id: string
          raw_key: string
          example_value: string | null
          example_candidate_id: string | null
          occurrences: number
          status: string
          mapped_to_field_id: string | null
          first_seen_at: string
          last_seen_at: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          raw_key: string
          example_value?: string | null
          example_candidate_id?: string | null
          occurrences?: number
          status?: string
          mapped_to_field_id?: string | null
          first_seen_at?: string
          last_seen_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          raw_key?: string
          example_value?: string | null
          example_candidate_id?: string | null
          occurrences?: number
          status?: string
          mapped_to_field_id?: string | null
          first_seen_at?: string
          last_seen_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_review_queue_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_review_queue_example_candidate_id_fkey"
            columns: ["example_candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_review_queue_mapped_to_field_id_fkey"
            columns: ["mapped_to_field_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_review_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          leadtable_customer_id: string | null
          plz: string | null
          lat: number | null
          lng: number | null
          ort: string | null
          auto_forward_enabled: boolean
          project_phase: string
          contract_start: string | null
          contract_term_months: number | null
          key_account_manager_id: string | null
          close_lead_id: string | null
          close_url: string | null
          close_status: string | null
          close_status_at: string | null
          kanzleistelle_synced_at: string | null
          kanzleistelle_sync_error: string | null
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
          leadtable_customer_id?: string | null
          plz?: string | null
          lat?: number | null
          lng?: number | null
          ort?: string | null
          auto_forward_enabled?: boolean
          project_phase?: string
          contract_start?: string | null
          contract_term_months?: number | null
          key_account_manager_id?: string | null
          close_lead_id?: string | null
          close_url?: string | null
          close_status?: string | null
          close_status_at?: string | null
          kanzleistelle_synced_at?: string | null
          kanzleistelle_sync_error?: string | null
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
          leadtable_customer_id?: string | null
          plz?: string | null
          lat?: number | null
          lng?: number | null
          ort?: string | null
          auto_forward_enabled?: boolean
          project_phase?: string
          contract_start?: string | null
          contract_term_months?: number | null
          key_account_manager_id?: string | null
          close_lead_id?: string | null
          close_url?: string | null
          close_status?: string | null
          close_status_at?: string | null
          kanzleistelle_synced_at?: string | null
          kanzleistelle_sync_error?: string | null
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
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          assigned_to: string
          created_by: string
          candidate_id: string | null
          client_id: string | null
          status: string
          due_date: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          assigned_to: string
          created_by: string
          candidate_id?: string | null
          client_id?: string | null
          status?: string
          due_date?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          assigned_to?: string
          created_by?: string
          candidate_id?: string | null
          client_id?: string | null
          status?: string
          due_date?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          agency_id: string | null
          client_id: string | null
          role: string
          full_name: string | null
          created_at: string
          email: string | null
          phone: string | null
          avatar_path: string | null
          portal_invited_at: string | null
        }
        Insert: {
          id: string
          agency_id?: string | null
          client_id?: string | null
          role: string
          full_name?: string | null
          created_at?: string
          email?: string | null
          phone?: string | null
          avatar_path?: string | null
          portal_invited_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string | null
          client_id?: string | null
          role?: string
          full_name?: string | null
          created_at?: string
          email?: string | null
          phone?: string | null
          avatar_path?: string | null
          portal_invited_at?: string | null
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
      locations: {
        Row: {
          id: string
          plz_prefix: string
          name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          plz_prefix: string
          name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          plz_prefix?: string
          name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      client_assignments: {
        Row: {
          id: string
          candidate_id: string
          client_id: string
          status: string
          created_at: string
          created_by: string | null
          removed_at: string | null
          campaign_id: string | null
        }
        Insert: {
          id?: string
          candidate_id: string
          client_id: string
          status?: string
          created_at?: string
          created_by?: string | null
          removed_at?: string | null
          campaign_id?: string | null
        }
        Update: {
          id?: string
          candidate_id?: string
          client_id?: string
          status?: string
          created_at?: string
          created_by?: string | null
          removed_at?: string | null
          campaign_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          leadtable_lead_id: string | null
          meta_lead_id: string | null
          is_demo: boolean
          tags: string[]
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
          leadtable_lead_id?: string | null
          meta_lead_id?: string | null
          is_demo?: boolean
          tags?: string[]
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
          leadtable_lead_id?: string | null
          meta_lead_id?: string | null
          is_demo?: boolean
          tags?: string[]
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
      leadtable_sync_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          summary: Json | null
          error_message: string | null
        }
        Insert: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          summary?: Json | null
          error_message?: string | null
        }
        Update: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          summary?: Json | null
          error_message?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          client_id: string | null
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
          field_template_id: string | null
          leadtable_campaign_id: string | null
          location_id: string | null
          meta_webhook_last_test_at: string | null
          meta_form_name: string | null
          kind: string
          agency_id: string | null
          is_demo: boolean
        }
        Insert: {
          id?: string
          client_id?: string | null
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
          field_template_id?: string | null
          leadtable_campaign_id?: string | null
          location_id?: string | null
          meta_webhook_last_test_at?: string | null
          meta_form_name?: string | null
          kind?: string
          agency_id?: string | null
          is_demo?: boolean
        }
        Update: {
          id?: string
          client_id?: string | null
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
          field_template_id?: string | null
          leadtable_campaign_id?: string | null
          location_id?: string | null
          meta_webhook_last_test_at?: string | null
          meta_form_name?: string | null
          kind?: string
          agency_id?: string | null
          is_demo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          }
        ]
      }
      client_list_stats: {
        Row: {
          id: string | null
          name: string | null
          contact_name: string | null
          contact_email: string | null
          active: boolean | null
          status: string | null
          logo_url: string | null
          created_at: string | null
          campaign_count: number | null
          candidate_count: number | null
          placement_count: number | null
          pipeline: Json | null
          project_phase: string | null
          key_account_manager_id: string | null
          profile_finalized: boolean | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          contact_name?: string | null
          contact_email?: string | null
          active?: boolean | null
          status?: string | null
          logo_url?: string | null
          created_at?: string | null
          campaign_count?: number | null
          candidate_count?: number | null
          placement_count?: number | null
          pipeline?: Json | null
          project_phase?: string | null
          key_account_manager_id?: string | null
          profile_finalized?: boolean | null
        }
        Update: {
          id?: string | null
          name?: string | null
          contact_name?: string | null
          contact_email?: string | null
          active?: boolean | null
          status?: string | null
          logo_url?: string | null
          created_at?: string | null
          campaign_count?: number | null
          candidate_count?: number | null
          placement_count?: number | null
          pipeline?: Json | null
          project_phase?: string | null
          key_account_manager_id?: string | null
          profile_finalized?: boolean | null
        }
        Relationships: []
      }
      client_locations: {
        Row: {
          id: string
          client_id: string
          strasse: string | null
          plz: string
          ort: string | null
          lat: number | null
          lng: number | null
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          strasse?: string | null
          plz: string
          ort?: string | null
          lat?: number | null
          lng?: number | null
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          strasse?: string | null
          plz?: string
          ort?: string | null
          lat?: number | null
          lng?: number | null
          is_primary?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_messages: {
        Row: {
          id: string
          candidate_id: string
          channel: string
          to_address: string
          subject: string | null
          body: string
          sent_by: string | null
          reply_to: string | null
          status: string
          error: string | null
          created_at: string
          direction: string
          from_address: string | null
          external_id: string | null
        }
        Insert: {
          id?: string
          candidate_id: string
          channel?: string
          to_address: string
          subject?: string | null
          body: string
          sent_by?: string | null
          reply_to?: string | null
          status?: string
          error?: string | null
          created_at?: string
          direction?: string
          from_address?: string | null
          external_id?: string | null
        }
        Update: {
          id?: string
          candidate_id?: string
          channel?: string
          to_address?: string
          subject?: string | null
          body?: string
          sent_by?: string | null
          reply_to?: string | null
          status?: string
          error?: string | null
          created_at?: string
          direction?: string
          from_address?: string | null
          external_id?: string | null
        }
        Relationships: []
      }
      profile_field_settings: {
        Row: {
          id: string
          agency_id: string
          scope: string
          key: string
          label: string
          hint: string | null
          required: boolean
          active: boolean
          multiline: boolean
          is_custom: boolean
          field_group: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          scope: string
          key: string
          label: string
          hint?: string | null
          required?: boolean
          active?: boolean
          multiline?: boolean
          is_custom?: boolean
          field_group?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          scope?: string
          key?: string
          label?: string
          hint?: string | null
          required?: boolean
          active?: boolean
          multiline?: boolean
          is_custom?: boolean
          field_group?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      position_snippets: {
        Row: {
          id: string
          agency_id: string
          berufsbild: string
          kind: string
          text: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          berufsbild: string
          kind: string
          text: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          berufsbild?: string
          kind?: string
          text?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      agency_settings: {
        Row: {
          agency_id: string
          logo_url: string | null
          confirmation_active: boolean
          confirmation_template_id: string | null
          confirmation_active_since: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          logo_url?: string | null
          confirmation_active?: boolean
          confirmation_template_id?: string | null
          confirmation_active_since?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          logo_url?: string | null
          confirmation_active?: boolean
          confirmation_template_id?: string | null
          confirmation_active_since?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      candidate_mail_runs: {
        Row: {
          kind: string
          candidate_id: string
          created_at: string
        }
        Insert: {
          kind: string
          candidate_id: string
          created_at?: string
        }
        Update: {
          kind?: string
          candidate_id?: string
          created_at?: string
        }
        Relationships: []
      }
      automation_templates: {
        Row: {
          id: string
          agency_id: string
          name: string
          trigger: string
          trigger_status: string | null
          delay_seconds: number
          recipient: string
          subject: string
          body_html: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          trigger?: string
          trigger_status?: string | null
          delay_seconds?: number
          recipient?: string
          subject?: string
          body_html?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          trigger?: string
          trigger_status?: string | null
          delay_seconds?: number
          recipient?: string
          subject?: string
          body_html?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_template_sets: {
        Row: {
          id: string
          agency_id: string
          name: string
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          is_default?: boolean
          created_at?: string
        }
        Relationships: []
      }
      automation_template_set_items: {
        Row: {
          set_id: string
          template_id: string
        }
        Insert: {
          set_id: string
          template_id: string
        }
        Update: {
          set_id?: string
          template_id?: string
        }
        Relationships: []
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
          template_id: string | null
          active_since: string | null
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
          template_id?: string | null
          active_since?: string | null
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
          template_id?: string | null
          active_since?: string | null
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
      email_templates: {
        Row: {
          id: string
          agency_id: string
          name: string
          subject: string
          body_html: string
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          subject?: string
          body_html?: string
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          subject?: string
          body_html?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
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
      client_files: {
        Row: {
          id: string
          client_id: string
          file_name: string
          file_path: string
          file_size: number | null
          mime_type: string | null
          comment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          mime_type?: string | null
          comment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          mime_type?: string | null
          comment_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      candidate_tag_list: {
        Row: {
          tag: string | null
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      candidate_list_rows: {
        Row: {
          id: string | null
          first_name: string | null
          last_name: string | null
          full_name: string | null
          email: string | null
          status: string | null
          berufsbild: string | null
          source: string | null
          created_at: string | null
          custom_fields: Json | null
          campaign_id: string | null
          campaign_title: string | null
          client_id: string | null
          client_name: string | null
          tags: string[] | null
        }
        Insert: {
          id?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          email?: string | null
          status?: string | null
          berufsbild?: string | null
          source?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          campaign_id?: string | null
          campaign_title?: string | null
          client_id?: string | null
          client_name?: string | null
          tags?: string[] | null
        }
        Update: {
          id?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          email?: string | null
          status?: string | null
          berufsbild?: string | null
          source?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          campaign_id?: string | null
          campaign_title?: string | null
          client_id?: string | null
          client_name?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_list_rows_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_list_rows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      campaign_automation_runs: {
        Row: {
          id: string
          automation_id: string
          candidate_id: string
          fired_at: string
        }
        Insert: {
          id?: string
          automation_id: string
          candidate_id: string
          fired_at?: string
        }
        Update: {
          id?: string
          automation_id?: string
          candidate_id?: string
          fired_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "campaign_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_automation_runs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
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
      lead_notification_recipients: {
        Row: {
          id: string
          agency_id: string
          profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          profile_id: string
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          profile_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notification_recipients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notification_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
