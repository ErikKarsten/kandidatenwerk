import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { leadtableFetch } from "@/lib/leadtable-client"

interface LeadtableLeadsPages {
  totalLeads: number
  totalPages: number
  currentPage: number
  leadsPerPage: number
}
interface LeadtableLead {
  _id: string
  name?: string
  email?: string | null
  phone?: string | null
  status?: string
  [key: string]: unknown
}
interface LeadtableLeadsResponse {
  pages: LeadtableLeadsPages
  leads: LeadtableLead[]
}

const STATUS_MAP: Record<string, string> = {
  Unbearbeitet: "neu",
  Vorqualifiziert: "neu",
  "Nicht erreicht": "neu",
  "2x nicht erreicht + Mail": "neu",
  "In Kontakt": "interview",
}
const FALLBACK_STATUS = "neu"

function splitName(name: string): { first_name: string; last_name: string } {
  const trimmed = name.trim()
  const spaceIndex = trimmed.indexOf(" ")
  if (spaceIndex === -1) return { first_name: trimmed, last_name: "" }
  return { first_name: trimmed.slice(0, spaceIndex), last_name: trimmed.slice(spaceIndex + 1) }
}

async function fetchAllLeads(campaignId: string): Promise<LeadtableLead[]> {
  const firstPage = await leadtableFetch<LeadtableLeadsResponse>(`/lead/campaign/${campaignId}`, {
    page: 1,
    limit: 50,
  })
  const leads = [...firstPage.leads]

  for (let page = 2; page <= firstPage.pages.totalPages; page++) {
    const nextPage = await leadtableFetch<LeadtableLeadsResponse>(`/lead/campaign/${campaignId}`, {
      page,
      limit: 50,
    })
    leads.push(...nextPage.leads)
  }

  return leads
}

export type ImportLeadtableCampaignError = {
  leadId: string
  message: string
}

export type ImportLeadtableCampaignResult = {
  created: number
  skippedAbsage: number
  skippedNoEmail: number
  skippedDuplicate: number
  errors: ImportLeadtableCampaignError[]
}

export async function importLeadtableCampaign(
  customerId: string,
  campaignId: string,
  campaignName: string
): Promise<ImportLeadtableCampaignResult> {
  void customerId // aktuell ohne Kandidatenwerk-Client-Zuordnung, für spätere Erweiterung vorgesehen

  const kandidatenwerk = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const leads = await fetchAllLeads(campaignId)
  const berufsbild = mapKanzleistelleBerufsbild(campaignName)

  const result: ImportLeadtableCampaignResult = {
    created: 0,
    skippedAbsage: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
    errors: [],
  }

  for (const lead of leads) {
    try {
      if (lead.status === "Absage") {
        result.skippedAbsage++
        continue
      }

      if (!lead.email) {
        result.skippedNoEmail++
        continue
      }

      const { data: existing, error: existingError } = await kandidatenwerk
        .from("candidates")
        .select("id")
        .eq("email", lead.email)
        .maybeSingle()

      if (existingError) throw new Error(existingError.message)

      if (existing) {
        result.skippedDuplicate++
        continue
      }

      const { first_name, last_name } = splitName(lead.name ?? "")
      const mappedStatus = STATUS_MAP[lead.status ?? ""] ?? FALLBACK_STATUS

      const { error: insertError } = await kandidatenwerk.from("candidates").insert({
        first_name,
        last_name,
        email: lead.email,
        phone: lead.phone ?? null,
        berufsbild,
        plz: null,
        status: mappedStatus,
        source: "leadtable",
        notes: `Import aus Leadtable, Kampagne "${campaignName}", ursprünglicher Status: "${lead.status}"`,
      })

      if (insertError) throw new Error(insertError.message)

      result.created++
    } catch (err) {
      result.errors.push({
        leadId: lead._id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
