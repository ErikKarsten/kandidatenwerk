import type { SupabaseClient } from "@supabase/supabase-js"

// Übersicht der Lead-Kampagnen (Meta) für Einstellungen -> Meta-Kampagnen und die
// Werbegebiete für Karte/Kundenprofil (Atlas T-38). Läuft mit dem RLS-Client des
// eingeloggten Team-Mitglieds (Policies aus 20261002000003/000005).

export interface AdArea {
  campaignId: string
  campaignTitle: string
  label: string
  areaType: string
  lat: number | null
  lng: number | null
  radiusKm: number | null
  adsetActive: boolean
}

export interface LeadCampaignOverview {
  id: string
  title: string
  status: string
  metaEffectiveStatus: string | null
  metaFormId: string | null
  metaSyncedAt: string | null
  berufsbild: string | null
  areas: AdArea[]
  leadsTotal: number
  leadsUnassigned: number
}

export async function getLeadCampaignsOverview(supabase: SupabaseClient): Promise<LeadCampaignOverview[]> {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, status, meta_effective_status, meta_form_id, meta_synced_at, berufsbild")
    .eq("kind", "lead")
    .order("status", { ascending: true })
    .order("title", { ascending: true })
  if (!campaigns || campaigns.length === 0) return []

  const ids = campaigns.map((c) => c.id as string)
  const [{ data: areas }, { data: candidates }] = await Promise.all([
    supabase.from("campaign_ad_areas").select("campaign_id, label, area_type, lat, lng, radius_km, adset_active").in("campaign_id", ids),
    supabase.from("candidates").select("id, campaign_id").in("campaign_id", ids),
  ])
  const candidateIds = (candidates ?? []).map((c) => c.id as string)
  const { data: assigned } = candidateIds.length
    ? await supabase.from("client_assignments").select("candidate_id").in("candidate_id", candidateIds).is("removed_at", null)
    : { data: [] }
  const assignedIds = new Set((assigned ?? []).map((a) => a.candidate_id as string))

  const titleById = new Map(campaigns.map((c) => [c.id as string, c.title as string]))
  return campaigns.map((c) => {
    const leads = (candidates ?? []).filter((k) => k.campaign_id === c.id)
    return {
      id: c.id as string,
      title: c.title as string,
      status: c.status as string,
      metaEffectiveStatus: (c.meta_effective_status as string | null) ?? null,
      metaFormId: (c.meta_form_id as string | null) ?? null,
      metaSyncedAt: (c.meta_synced_at as string | null) ?? null,
      berufsbild: (c.berufsbild as string | null) ?? null,
      areas: (areas ?? [])
        .filter((a) => a.campaign_id === c.id)
        .map((a) => toArea(a, titleById)),
      leadsTotal: leads.length,
      leadsUnassigned: leads.filter((k) => !assignedIds.has(k.id as string)).length,
    }
  })
}

// Werbegebiete aller AKTIVEN Lead-Kampagnen mit aktiver Anzeigengruppe und Koordinaten.
export async function getActiveAdAreas(supabase: SupabaseClient): Promise<AdArea[]> {
  const { data: campaigns } = await supabase.from("campaigns").select("id, title").eq("kind", "lead").eq("status", "active")
  if (!campaigns || campaigns.length === 0) return []
  const titleById = new Map(campaigns.map((c) => [c.id as string, c.title as string]))
  const { data: areas } = await supabase
    .from("campaign_ad_areas")
    .select("campaign_id, label, area_type, lat, lng, radius_km, adset_active")
    .in("campaign_id", [...titleById.keys()])
    .eq("adset_active", true)
    .not("lat", "is", null)
  return (areas ?? []).map((a) => toArea(a, titleById))
}

function toArea(a: Record<string, unknown>, titleById: Map<string, string>): AdArea {
  return {
    campaignId: a.campaign_id as string,
    campaignTitle: titleById.get(a.campaign_id as string) ?? "",
    label: a.label as string,
    areaType: a.area_type as string,
    lat: (a.lat as number | null) ?? null,
    lng: (a.lng as number | null) ?? null,
    radiusKm: a.radius_km === null || a.radius_km === undefined ? null : Number(a.radius_km),
    adsetActive: Boolean(a.adset_active),
  }
}
