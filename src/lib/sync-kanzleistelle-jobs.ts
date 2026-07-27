import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type KanzleistelleDatabase = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          is_active: boolean
          user_id: string | null
          admin_notes: string | null
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          user_id?: string | null
          admin_notes?: string | null
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          user_id?: string | null
          admin_notes?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          title: string
          company: string | null
          company_id: string | null
          postal_code: string | null
          latitude: number | null
          longitude: number | null
          is_active: boolean
          status: string
          matching_candidates_count: number
        }
        Insert: {
          id?: string
          title: string
          company?: string | null
          company_id?: string | null
          postal_code?: string | null
          latitude?: number | null
          longitude?: number | null
          is_active?: boolean
          status?: string
          matching_candidates_count?: number
        }
        Update: {
          id?: string
          title?: string
          company?: string | null
          company_id?: string | null
          postal_code?: string | null
          latitude?: number | null
          longitude?: number | null
          is_active?: boolean
          status?: string
          matching_candidates_count?: number
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

function createKandidatenwerkClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
}

function createKanzleistelleClient() {
  return createClient<KanzleistelleDatabase>(
    process.env.KANZLEISTELLE_SUPABASE_URL!,
    process.env.KANZLEISTELLE_SUPABASE_SERVICE_KEY!
  )
}

async function countMatchingCandidates(
  kandidatenwerk: SupabaseClient<Database>,
  campaignId: string
): Promise<number> {
  const { count, error } = await kandidatenwerk
    .from("candidate_campaign_matches")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)

  if (error) throw new Error(error.message)

  return count ?? 0
}

export type SyncCampaignsError = {
  campaignId: string
  message: string
}

export type SyncCampaignsResult = {
  created: number
  errors: SyncCampaignsError[]
}

export async function syncCampaignsToKanzleistelle(limit?: number): Promise<SyncCampaignsResult> {
  const kandidatenwerk = createKandidatenwerkClient()
  const kanzleistelle = createKanzleistelleClient()

  let query = kandidatenwerk
    .from("campaigns")
    .select("id, title, plz, lat, lng, client_id, clients(id, name, kanzleistelle_company_id)")
    .is("kanzleistelle_job_id", null)
    .eq("status", "active")

  if (limit !== undefined) query = query.limit(limit)

  const { data: campaigns, error: fetchError } = await query

  if (fetchError) throw new Error(`Kandidatenwerk-Abfrage fehlgeschlagen: ${fetchError.message}`)

  const errors: SyncCampaignsError[] = []
  let created = 0

  for (const campaign of campaigns ?? []) {
    try {
      const client = campaign.clients
      if (!client) throw new Error("Kampagne hat keinen zugehörigen Mandanten")

      let companyId = client.kanzleistelle_company_id

      if (!companyId) {
        const { data: company, error: companyError } = await kanzleistelle
          .from("companies")
          .insert({
            name: client.name,
            is_active: true,
            user_id: null,
            admin_notes: "Automatisch aus Kandidatenwerk übernommen",
          })
          .select("id")
          .single()

        if (companyError) throw new Error(companyError.message)

        companyId = company.id

        const { error: clientUpdateError } = await kandidatenwerk
          .from("clients")
          .update({ kanzleistelle_company_id: companyId })
          .eq("id", client.id)

        if (clientUpdateError) throw new Error(clientUpdateError.message)
      }

      const matchingCandidatesCount = await countMatchingCandidates(kandidatenwerk, campaign.id)

      const { data: job, error: jobError } = await kanzleistelle
        .from("jobs")
        .insert({
          title: campaign.title,
          company: client.name,
          company_id: companyId,
          postal_code: campaign.plz,
          latitude: campaign.lat,
          longitude: campaign.lng,
          is_active: true,
          status: "active",
          matching_candidates_count: matchingCandidatesCount,
        })
        .select("id")
        .single()

      if (jobError) throw new Error(jobError.message)

      const { error: campaignUpdateError } = await kandidatenwerk
        .from("campaigns")
        .update({ kanzleistelle_job_id: job.id })
        .eq("id", campaign.id)

      if (campaignUpdateError) throw new Error(campaignUpdateError.message)

      created++
    } catch (err) {
      errors.push({
        campaignId: campaign.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { created, errors }
}

export type UpdateMatchingCountsError = {
  campaignId: string
  message: string
}

export type UpdateMatchingCountsResult = {
  updated: number
  errors: UpdateMatchingCountsError[]
}

export async function updateMatchingCounts(): Promise<UpdateMatchingCountsResult> {
  const kandidatenwerk = createKandidatenwerkClient()
  const kanzleistelle = createKanzleistelleClient()

  const { data: campaigns, error: fetchError } = await kandidatenwerk
    .from("campaigns")
    .select("id, kanzleistelle_job_id")
    .not("kanzleistelle_job_id", "is", null)

  if (fetchError) throw new Error(`Kandidatenwerk-Abfrage fehlgeschlagen: ${fetchError.message}`)

  const errors: UpdateMatchingCountsError[] = []
  let updated = 0

  for (const campaign of campaigns ?? []) {
    try {
      const jobId = campaign.kanzleistelle_job_id
      if (!jobId) continue

      const matchingCandidatesCount = await countMatchingCandidates(kandidatenwerk, campaign.id)

      const { error: jobUpdateError } = await kanzleistelle
        .from("jobs")
        .update({ matching_candidates_count: matchingCandidatesCount })
        .eq("id", jobId)

      if (jobUpdateError) throw new Error(jobUpdateError.message)

      updated++
    } catch (err) {
      errors.push({
        campaignId: campaign.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { updated, errors }
}
