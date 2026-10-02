// Meta-Kampagnen-Abgleich (Atlas T-38): legt jede Lead-Kampagne des Meta-Werbekontos
// als Lead-Kampagne in Kandidatenwerk an bzw. aktualisiert sie (Name, Status,
// verknüpftes Lead-Formular) und speichert die Werbegebiete ihrer Anzeigengruppen
// (campaign_ad_areas) für Karte und Abdeckungs-Hinweis.
//
// - Läuft stündlich per Cloudflare Cron Trigger (custom-worker.ts, gemeinsam mit dem
//   Kanzleistelle-Sync) und auf Knopfdruck in Einstellungen -> Meta-Kampagnen.
// - Leads holt NICHT dieser Abgleich, sondern wie bisher der Meta-Leads-Sync bzw. der
//   Webhook über campaigns.meta_form_id - sobald hier das Formular verknüpft ist, laufen
//   die Leads automatisch in "Alle Kandidaten" ein.
// - Braucht META_ACCESS_TOKEN mit ads_read und META_AD_ACCOUNT_ID. Fehlende Rechte
//   führen zu einem Fehler -> Cron-Überwachung meldet per Mail.
// - Städte haben bei Meta keine Koordinaten: einmalig über Nominatim nachschlagen
//   (max. 1/s, max. GEOCODE_LIMIT je Lauf) und über area_key wiederverwenden.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { metaGraphFetch } from "@/lib/meta-ads-client"
import { forwardGeocode } from "@/lib/forward-geocode"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import {
  extractLeadFormId,
  LEAD_OBJECTIVES,
  mapMetaStatus,
  parseGeoLocations,
  type MetaGeoLocations,
  type ParsedArea,
} from "@/lib/meta-campaigns-parse"

type Supabase = SupabaseClient<Database>

const GEOCODE_LIMIT = 60
const GEOCODE_DELAY_MS = 1100

interface MetaPaged<T> {
  data: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

interface MetaCampaign {
  id: string
  name: string
  effective_status?: string
  objective?: string
}

interface MetaAdSet {
  id: string
  name: string
  campaign_id: string
  effective_status?: string
  targeting?: { geo_locations?: MetaGeoLocations }
}

interface MetaAd {
  campaign_id: string
  effective_status?: string
  creative?: unknown
}

export interface MetaCampaignsSyncResult {
  metaCampaigns: number
  created: number
  updated: number
  formsLinked: number
  areas: number
  geocoded: number
  geocodePending: number
  errors: string[]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = []
  let after: string | undefined
  for (let page = 0; page < 50; page++) {
    const resp = await metaGraphFetch<MetaPaged<T>>(path, { ...params, limit: "200", ...(after ? { after } : {}) })
    all.push(...(resp.data ?? []))
    after = resp.paging?.cursors?.after
    if (!resp.paging?.next || !after) break
  }
  return all
}

// Untypisierter Zugriff für die neuen Spalten/Tabellen, bis src/types/database.ts neu
// generiert ist (campaign_ad_areas, campaigns.meta_effective_status/meta_synced_at).
function untyped(supabase: Supabase): SupabaseClient {
  return supabase as unknown as SupabaseClient
}

export async function syncMetaCampaigns(
  supabase: Supabase,
  { log = console.log }: { log?: (message: string) => void } = {}
): Promise<MetaCampaignsSyncResult> {
  const adAccountId = process.env.META_AD_ACCOUNT_ID
  if (!adAccountId) throw new Error("META_AD_ACCOUNT_ID ist nicht gesetzt.")
  const act = `/act_${adAccountId.replace(/^act_/, "")}`

  // Lead-Kampagnen gehören keiner Kanzlei, aber einer Agentur. Aktuell gibt es genau
  // eine - bei mehreren müsste die Zuordnung Werbekonto -> Agentur konfigurierbar werden.
  const { data: agencies, error: agencyError } = await supabase.from("agencies").select("id")
  if (agencyError) throw new Error(agencyError.message)
  if (!agencies || agencies.length !== 1) throw new Error(`Erwarte genau eine Agentur, gefunden: ${agencies?.length ?? 0}.`)
  const agencyId = agencies[0].id

  const db = untyped(supabase)
  const result: MetaCampaignsSyncResult = {
    metaCampaigns: 0,
    created: 0,
    updated: 0,
    formsLinked: 0,
    areas: 0,
    geocoded: 0,
    geocodePending: 0,
    errors: [],
  }

  const [campaigns, adsets, ads] = await Promise.all([
    fetchAll<MetaCampaign>(`${act}/campaigns`, { fields: "id,name,effective_status,objective" }),
    fetchAll<MetaAdSet>(`${act}/adsets`, { fields: "id,name,campaign_id,effective_status,targeting{geo_locations}" }),
    fetchAll<MetaAd>(`${act}/ads`, {
      fields: "campaign_id,effective_status,creative{object_story_spec,asset_feed_spec}",
    }),
  ])
  const leadCampaigns = campaigns.filter((c) => !c.objective || LEAD_OBJECTIVES.has(c.objective))
  result.metaCampaigns = leadCampaigns.length
  log(`${leadCampaigns.length} Lead-Kampagnen, ${adsets.length} Anzeigengruppen, ${ads.length} Anzeigen von Meta geladen.`)

  // Lead-Formular je Kampagne: bevorzugt aus aktiven Anzeigen.
  const formByCampaign = new Map<string, string>()
  for (const ad of [...ads].sort((a, b) => Number(b.effective_status === "ACTIVE") - Number(a.effective_status === "ACTIVE"))) {
    const formId = extractLeadFormId(ad.creative)
    if (formId && !formByCampaign.has(ad.campaign_id)) formByCampaign.set(ad.campaign_id, formId)
  }

  const { data: existingRows, error: existingError } = await db
    .from("campaigns")
    .select("id, meta_campaign_id, meta_form_id")
    .eq("kind", "lead")
    .not("meta_campaign_id", "is", null)
  if (existingError) throw new Error(existingError.message)
  const existingByMetaId = new Map((existingRows ?? []).map((r) => [r.meta_campaign_id as string, r]))

  // Bereits bekannte Koordinaten (vor allem Städte) wiederverwenden.
  const { data: knownAreas } = await db
    .from("campaign_ad_areas")
    .select("area_type, area_key, lat, lng")
    .not("lat", "is", null)
    .not("area_key", "is", null)
  const coordsByKey = new Map<string, { lat: number; lng: number }>()
  for (const a of knownAreas ?? []) coordsByKey.set(`${a.area_type}:${a.area_key}`, { lat: a.lat, lng: a.lng })

  const now = new Date().toISOString()
  const areasByCampaignId = new Map<string, (ParsedArea & { adsetId: string; adsetName: string; adsetActive: boolean })[]>()

  for (const mc of leadCampaigns) {
    try {
      const formId = formByCampaign.get(mc.id) ?? null
      const existing = existingByMetaId.get(mc.id)
      const fields = {
        title: mc.name,
        status: mapMetaStatus(mc.effective_status),
        meta_effective_status: mc.effective_status ?? null,
        meta_synced_at: now,
        ...(formId ? { meta_form_id: formId } : {}),
      }

      let campaignId: string
      if (existing) {
        const { error } = await db.from("campaigns").update(fields).eq("id", existing.id)
        if (error) throw new Error(error.message)
        campaignId = existing.id
        result.updated++
        if (formId && formId !== existing.meta_form_id) result.formsLinked++
      } else {
        const { data: inserted, error } = await db
          .from("campaigns")
          .insert({
            ...fields,
            kind: "lead",
            agency_id: agencyId,
            client_id: null,
            meta_campaign_id: mc.id,
            berufsbild: mapKanzleistelleBerufsbild(mc.name),
          })
          .select("id")
          .single()
        if (error) throw new Error(error.message)
        campaignId = inserted.id as string
        result.created++
        if (formId) result.formsLinked++
      }

      const areas = adsets
        .filter((s) => s.campaign_id === mc.id)
        .flatMap((s) =>
          parseGeoLocations(s.targeting?.geo_locations).map((a) => ({
            ...a,
            adsetId: s.id,
            adsetName: s.name,
            adsetActive: s.effective_status === "ACTIVE",
          }))
        )
      areasByCampaignId.set(campaignId, areas)
    } catch (err) {
      result.errors.push(`Kampagne „${mc.name}“: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Städte ohne bekannte Koordinaten: Namen + Bundesland über Meta (adgeolocationmeta,
  // deutsche Namen), dann Nominatim - gedrosselt und begrenzt je Lauf.
  const missingCityKeys = [
    ...new Set(
      [...areasByCampaignId.values()]
        .flat()
        .filter((a) => a.areaType === "city" && a.areaKey && !coordsByKey.has(`city:${a.areaKey}`))
        .map((a) => a.areaKey as string)
    ),
  ]
  if (missingCityKeys.length > 0) {
    const toResolve = missingCityKeys.slice(0, GEOCODE_LIMIT)
    result.geocodePending = missingCityKeys.length - toResolve.length
    const meta = await metaGraphFetch<{ data?: { cities?: Record<string, { name?: string; region?: string }> } }>("/search", {
      type: "adgeolocationmeta",
      cities: JSON.stringify(toResolve),
    })
    for (const key of toResolve) {
      const info = meta.data?.cities?.[key]
      const query = [info?.name, info?.region, "Deutschland"].filter(Boolean).join(", ")
      try {
        const coords = info?.name ? await forwardGeocode(query) : null
        if (coords) {
          coordsByKey.set(`city:${key}`, coords)
          result.geocoded++
        } else {
          result.errors.push(`Stadt ${key} („${query}“) nicht gefunden.`)
        }
      } catch (err) {
        result.errors.push(`Geokodierung „${query}“: ${err instanceof Error ? err.message : String(err)}`)
      }
      await sleep(GEOCODE_DELAY_MS)
    }
  }

  // Werbegebiete je Kampagne vollständig ersetzen.
  for (const [campaignId, areas] of areasByCampaignId) {
    const rows = areas.map((a) => {
      const known = a.lat === null && a.areaKey ? coordsByKey.get(`${a.areaType}:${a.areaKey}`) : undefined
      return {
        campaign_id: campaignId,
        meta_adset_id: a.adsetId,
        adset_name: a.adsetName,
        adset_active: a.adsetActive,
        area_type: a.areaType,
        area_key: a.areaKey,
        label: a.label,
        lat: a.lat ?? known?.lat ?? null,
        lng: a.lng ?? known?.lng ?? null,
        radius_km: a.radiusKm,
        synced_at: now,
      }
    })
    const { error: deleteError } = await db.from("campaign_ad_areas").delete().eq("campaign_id", campaignId)
    if (deleteError) {
      result.errors.push(`Werbegebiete löschen (${campaignId}): ${deleteError.message}`)
      continue
    }
    if (rows.length > 0) {
      const { error: insertError } = await db.from("campaign_ad_areas").insert(rows)
      if (insertError) {
        result.errors.push(`Werbegebiete speichern (${campaignId}): ${insertError.message}`)
        continue
      }
    }
    result.areas += rows.length
  }

  return result
}
