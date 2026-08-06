import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { leadtableFetch } from "@/lib/leadtable-client"

// Einzige bisher existierende Agentur ("Endlich Mitarbeiter") — Standard-Zuordnung für
// Kunden, die außerhalb einer eingeloggten Nutzer-Session (z.B. per Skript) angelegt werden.
const DEFAULT_AGENCY_ID = "00000000-0000-0000-0000-000000000001"

interface LeadtablePagination {
  totalItems: number
  totalPages: number
  currentPage: number
  itemsPerPage: number
}
export interface LeadtableCampaign {
  _id: string
  occupation?: string
  archived?: boolean
  [key: string]: unknown
}
interface LeadtableCampaignsResponse {
  pagination: LeadtablePagination
  campaigns: LeadtableCampaign[]
}

// Es gibt bei Leadtable keinen Single-Item-GET-Endpunkt für einzelne Kampagnen (nur
// /campaign/all/{customerId} als Liste, verifiziert per Testaufruf - GET
// /campaign/{campaignId} liefert 404 "Cannot GET"). "Eine Kampagne abfragen" heißt hier
// also immer: komplette Kampagnenliste des Kunden laden und per _id filtern.
export async function fetchAllCampaigns(customerId: string): Promise<LeadtableCampaign[]> {
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

export interface LeadtableCustomerListItem {
  _id: string
  name: string
  archived?: boolean
  [key: string]: unknown
}
interface LeadtableCustomersResponse {
  pagination: LeadtablePagination
  customers: LeadtableCustomerListItem[]
}

// Analog zu fetchAllCampaigns: auch für Kunden gibt es nur /customer/all als Liste,
// kein Single-Item-GET (ebenfalls per Testaufruf verifiziert).
export async function fetchAllCustomers(): Promise<LeadtableCustomerListItem[]> {
  const firstPage = await leadtableFetch<LeadtableCustomersResponse>("/customer/all", { page: 1, limit: 100 })
  const customers = [...firstPage.customers]

  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    const nextPage = await leadtableFetch<LeadtableCustomersResponse>("/customer/all", { page, limit: 100 })
    customers.push(...nextPage.customers)
  }

  return customers
}

export interface ImportNewCampaignsResult {
  campaignsCreated: number
  campaignsSkippedArchived: number
  campaignsSkippedExisting: number
}

// Gemeinsame Kampagnen-Import-Schleife für einen (bereits existierenden) Kandidatenwerk-
// Client: lädt die komplette Kampagnenliste des Kunden bei Leadtable und legt nur NEUE
// Kampagnen an - übersprungen werden archivierte UND bereits per leadtable_campaign_id
// vorhandene Kampagnen. Wird sowohl von importLeadtableCustomer() (Erstimport, wo der
// Duplikat-Check ein No-Op ist, da noch keine Kampagnen existieren) als auch vom
// "Mit Leadtable aktualisieren"-Knopf auf der Kunden-Detailseite genutzt (Re-Sync eines
// bestehenden Kunden, wo der Duplikat-Check das eigentlich Wichtige ist).
export async function importNewLeadtableCampaignsForClient(
  clientRecordId: string,
  leadtableCustomerId: string
): Promise<ImportNewCampaignsResult> {
  const kandidatenwerk = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const campaigns = await fetchAllCampaigns(leadtableCustomerId)

  let campaignsCreated = 0
  let campaignsSkippedArchived = 0
  let campaignsSkippedExisting = 0

  for (const campaign of campaigns) {
    if (campaign.archived) {
      campaignsSkippedArchived++
      continue
    }

    const { data: existingCampaign, error: existingCampaignError } = await kandidatenwerk
      .from("campaigns")
      .select("id")
      .eq("leadtable_campaign_id", campaign._id)
      .maybeSingle()

    if (existingCampaignError) throw new Error(existingCampaignError.message)

    if (existingCampaign) {
      campaignsSkippedExisting++
      continue
    }

    const campaignName = campaign.occupation ?? ""
    const berufsbild = mapKanzleistelleBerufsbild(campaignName)

    const { error: campaignInsertError } = await kandidatenwerk.from("campaigns").insert({
      title: campaignName,
      client_id: clientRecordId,
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

  return { campaignsCreated, campaignsSkippedArchived, campaignsSkippedExisting }
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

  const { campaignsCreated, campaignsSkippedArchived } = await importNewLeadtableCampaignsForClient(
    newClient.id,
    customerId
  )

  return {
    skipped: false,
    clientCreated: true,
    campaignsCreated,
    campaignsSkippedArchived,
  }
}
