import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { leadtableFetch } from "@/lib/leadtable-client"

// Einzige bisher existierende Agentur ("Endlich Mitarbeiter") — Standard-Zuordnung für
// Kunden, die außerhalb einer eingeloggten Nutzer-Session (z.B. per Skript) angelegt werden.
const DEFAULT_AGENCY_ID = "00000000-0000-0000-0000-000000000001"

interface LeadtableCampaignsPagination {
  totalItems: number
  totalPages: number
  currentPage: number
  itemsPerPage: number
}
interface LeadtableCampaign {
  _id: string
  occupation?: string
  archived?: boolean
  [key: string]: unknown
}
interface LeadtableCampaignsResponse {
  pagination: LeadtableCampaignsPagination
  campaigns: LeadtableCampaign[]
}

async function fetchAllCampaigns(customerId: string): Promise<LeadtableCampaign[]> {
  const firstPage = await leadtableFetch<LeadtableCampaignsResponse>(`/campaign/all/${customerId}`, {
    page: 1,
    limit: 100,
  })
  const campaigns = [...firstPage.campaigns]

  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    const nextPage = await leadtableFetch<LeadtableCampaignsResponse>(`/campaign/all/${customerId}`, {
      page,
      limit: 100,
    })
    campaigns.push(...nextPage.campaigns)
  }

  return campaigns
}

export type ImportLeadtableCustomerResult =
  | { skipped: true }
  | { skipped: false; clientCreated: boolean; campaignsCreated: number; campaignsSkippedArchived: number }

export async function importLeadtableCustomer(
  customerId: string,
  customerName: string
): Promise<ImportLeadtableCustomerResult> {
  const kandidatenwerk = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { data: existingClient, error: existingClientError } = await kandidatenwerk
    .from("clients")
    .select("id")
    .eq("leadtable_customer_id", customerId)
    .maybeSingle()

  if (existingClientError) throw new Error(existingClientError.message)

  if (existingClient) {
    return { skipped: true }
  }

  const { data: newClient, error: clientInsertError } = await kandidatenwerk
    .from("clients")
    .insert({
      name: customerName,
      leadtable_customer_id: customerId,
      status: "active",
      agency_id: DEFAULT_AGENCY_ID,
    })
    .select("id")
    .single()

  if (clientInsertError) throw new Error(clientInsertError.message)

  const campaigns = await fetchAllCampaigns(customerId)

  let campaignsCreated = 0
  let campaignsSkippedArchived = 0

  for (const campaign of campaigns) {
    if (campaign.archived) {
      campaignsSkippedArchived++
      continue
    }

    const campaignName = campaign.occupation ?? ""
    const berufsbild = mapKanzleistelleBerufsbild(campaignName)

    const { error: campaignInsertError } = await kandidatenwerk.from("campaigns").insert({
      title: campaignName,
      client_id: newClient.id,
      leadtable_campaign_id: campaign._id,
      status: "active",
      berufsbild,
      plz: null,
      lat: null,
      lng: null,
    })

    if (campaignInsertError) throw new Error(campaignInsertError.message)

    campaignsCreated++
  }

  return {
    skipped: false,
    clientCreated: true,
    campaignsCreated,
    campaignsSkippedArchived,
  }
}
