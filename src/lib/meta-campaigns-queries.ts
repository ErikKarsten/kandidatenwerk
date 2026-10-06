import type { SupabaseClient } from "@supabase/supabase-js"
import { isKs24Campaign } from "@/lib/meta-campaigns-parse"

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

// Lädt alle Zeilen einer Abfrage seitenweise (PostgREST liefert höchstens 1000 je
// Anfrage). query muss bei jedem Aufruf neu gebaut werden.
async function fetchAllRows<T>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return all
}

export async function getLeadCampaignsOverview(supabase: SupabaseClient): Promise<LeadCampaignOverview[]> {
  // Werbegebiete eingebettet statt per .in(ids): bei ~550 Kampagnen wäre die
  // ID-Liste für die URL zu lang.
  const campaigns = await fetchAllRows<Record<string, unknown>>(() =>
    supabase
      .from("campaigns")
      .select(
        "id, title, status, meta_effective_status, meta_form_id, meta_synced_at, berufsbild, campaign_ad_areas(campaign_id, label, area_type, lat, lng, radius_km, adset_active)"
      )
      .eq("kind", "lead")
      .order("status", { ascending: true })
      .order("title", { ascending: true })
  )
  // Nur KS24-Kampagnen (Paket 18, T-81); ältere Kampagnen ohne KS24 bleiben in der
  // Datenbank (samt Kandidaten), erscheinen hier aber nicht mehr.
  const ks24 = campaigns.filter((c) => isKs24Campaign(c.title as string))
  if (ks24.length === 0) return []

  const [leads, assigned] = await Promise.all([
    fetchAllRows<{ id: string; campaign_id: string }>(() =>
      supabase.from("candidates").select("id, campaign_id, campaigns!inner(kind)").eq("campaigns.kind", "lead")
    ),
    fetchAllRows<{ candidate_id: string }>(() => supabase.from("client_assignments").select("candidate_id").is("removed_at", null)),
  ])
  const assignedIds = new Set(assigned.map((a) => a.candidate_id))
  const leadsByCampaign = new Map<string, string[]>()
  for (const l of leads) leadsByCampaign.set(l.campaign_id, [...(leadsByCampaign.get(l.campaign_id) ?? []), l.id])

  const titleById = new Map(ks24.map((c) => [c.id as string, c.title as string]))
  return ks24.map((c) => {
    const campaignLeads = leadsByCampaign.get(c.id as string) ?? []
    return {
      id: c.id as string,
      title: c.title as string,
      status: c.status as string,
      metaEffectiveStatus: (c.meta_effective_status as string | null) ?? null,
      metaFormId: (c.meta_form_id as string | null) ?? null,
      metaSyncedAt: (c.meta_synced_at as string | null) ?? null,
      berufsbild: (c.berufsbild as string | null) ?? null,
      areas: ((c.campaign_ad_areas as Record<string, unknown>[] | null) ?? []).map((a) => toArea(a, titleById)),
      leadsTotal: campaignLeads.length,
      leadsUnassigned: campaignLeads.filter((id) => !assignedIds.has(id)).length,
    }
  })
}

// Werbegebiete aller AKTIVEN Lead-Kampagnen mit aktiver Anzeigengruppe und Koordinaten.
export async function getActiveAdAreas(supabase: SupabaseClient): Promise<AdArea[]> {
  // Eingebettet (campaigns!inner) statt .in(ids), damit die URL kurz bleibt.
  const areas = await fetchAllRows<Record<string, unknown>>(() =>
    supabase
      .from("campaign_ad_areas")
      .select("campaign_id, label, area_type, lat, lng, radius_km, adset_active, campaigns!inner(title, kind, status)")
      .eq("campaigns.kind", "lead")
      .eq("campaigns.status", "active")
      .eq("adset_active", true)
      .not("lat", "is", null)
  )
  const titleById = new Map(
    areas.map((a) => [a.campaign_id as string, ((a.campaigns as { title?: string } | null)?.title ?? "") as string])
  )
  return areas.filter((a) => isKs24Campaign(titleById.get(a.campaign_id as string))).map((a) => toArea(a, titleById))
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
