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
import { syncMetaLeadForms } from "@/lib/lead-form-mapping"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import {
  extractLeadFormId,
  LEAD_OBJECTIVES,
  mapMetaStatus,
  parseGeoLocations,
  type MetaGeoLocations,
  type ParsedArea,
  isKs24Campaign,
} from "@/lib/meta-campaigns-parse"
import { applyDefaultTemplateSet } from "@/lib/automation-templates"

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
  // Neu eingelesene Lead-Formulare (Einstellungen -> Lead-Formulare) und Hinweise dazu -
  // Hinweise zählen nicht als Fehler (z.B. Seite dem Systemnutzer nicht freigegeben).
  leadFormsAdded: number
  leadFormWarnings: string[]
  errors: string[]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// pageSize klein halten, wo Meta viel Daten je Objekt liefert (Anzeigen mit Creative:
// bei 200 je Seite antwortet Meta mit "Please reduce the amount of data").
async function fetchAll<T>(path: string, params: Record<string, string>, pageSize = 200): Promise<T[]> {
  const all: T[] = []
  let after: string | undefined
  for (let page = 0; page < 200; page++) {
    const resp = await metaGraphFetch<MetaPaged<T>>(path, { ...params, limit: String(pageSize), ...(after ? { after } : {}) })
    all.push(...(resp.data ?? []))
    after = resp.paging?.cursors?.after
    if (!resp.paging?.next || !after) break
  }
  return all
}

// Lädt Objekte (Anzeigen/Anzeigengruppen) nur für die angegebenen Kampagnen - gefiltert
// in Blöcken, statt das ganze Werbekonto abzufragen.
async function fetchForCampaigns<T>(path: string, fields: string, campaignIds: string[], pageSize: number): Promise<T[]> {
  const all: T[] = []
  for (let i = 0; i < campaignIds.length; i += 50) {
    const chunk = campaignIds.slice(i, i + 50)
    const filtering = JSON.stringify([{ field: "campaign.id", operator: "IN", value: chunk }])
    all.push(...(await fetchAll<T>(path, { fields, filtering }, pageSize)))
  }
  return all
}

// Untypisierter Zugriff für die neuen Spalten/Tabellen, bis src/types/database.ts neu
// generiert ist (campaign_ad_areas, campaigns.meta_effective_status/meta_synced_at).
function areaSignature(...parts: unknown[]): string {
  return JSON.stringify(parts.map((p, i) => (i === 4 ? (p === null || p === undefined ? null : Number(p)) : p ?? null)))
}

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
    leadFormsAdded: 0,
    leadFormWarnings: [],
    errors: [],
  }

  const campaigns = await fetchAll<MetaCampaign>(`${act}/campaigns`, { fields: "id,name,effective_status,objective" })
  const allLeadCampaigns = campaigns.filter((c) => (!c.objective || LEAD_OBJECTIVES.has(c.objective)) && isKs24Campaign(c.name))

  const { data: existingRows, error: existingError } = await db
    .from("campaigns")
    .select("id, meta_campaign_id, meta_form_id, title, status, meta_effective_status")
    .eq("kind", "lead")
    .not("meta_campaign_id", "is", null)
  if (existingError) throw new Error(existingError.message)
  const existingByMetaId = new Map((existingRows ?? []).map((r) => [r.meta_campaign_id as string, r]))

  // Bereits importierte Kampagnen ohne "KS24" im Namen: einmalig auf pausiert setzen -
  // sie bleiben samt Kandidaten sichtbar, werden aber nicht mehr abgeglichen und
  // importieren keine Leads mehr (T-64).
  const nonKs24Active = (existingRows ?? []).filter((r) => r.status === "active" && !isKs24Campaign(r.title as string)).map((r) => r.id as string)
  if (nonKs24Active.length > 0) {
    const { error: pauseError } = await db.from("campaigns").update({ status: "paused" }).in("id", nonKs24Active)
    if (pauseError) result.errors.push(`Nicht-KS24-Kampagnen pausieren: ${pauseError.message}`)
  }

  // Nur laufende Kampagnen abgleichen (Wunsch 02.10.2026) - pausierte/beendete sind
  // egal. Zusätzlich die bei uns noch als laufend geführten, damit ihr Status auf
  // pausiert/beendet springt, sobald sie bei Meta nicht mehr laufen.
  const leadCampaigns = allLeadCampaigns.filter(
    (c) => c.effective_status === "ACTIVE" || existingByMetaId.get(c.id)?.status === "active"
  )
  result.metaCampaigns = leadCampaigns.filter((c) => c.effective_status === "ACTIVE").length

  // Meta begrenzt API-Aufrufe je Werbekonto stark (Fehler 17 "User request limit
  // reached" schon nach zwei Voll-Läufen). Deshalb nur nachladen, was sich ändern kann:
  // - Anzeigen (-> Lead-Formular) nur für Kampagnen ohne verknüpftes Formular,
  // - Anzeigengruppen (-> Werbegebiete) nur für laufende Kampagnen.
  const running = leadCampaigns.filter((c) => c.effective_status === "ACTIVE")
  const needsFormIds = running.filter((c) => !existingByMetaId.get(c.id)?.meta_form_id).map((c) => c.id)
  const needsAreasIds = running.map((c) => c.id)

  const ads = await fetchForCampaigns<MetaAd>(
    `${act}/ads`,
    "campaign_id,effective_status,creative{object_story_spec{link_data{call_to_action},video_data{call_to_action}},asset_feed_spec{call_to_actions}}",
    needsFormIds,
    25
  )
  const adsets = await fetchForCampaigns<MetaAdSet>(
    `${act}/adsets`,
    "id,name,campaign_id,effective_status,targeting{geo_locations}",
    needsAreasIds,
    100
  )
  const needsAreas = new Set(needsAreasIds)
  log(`${leadCampaigns.length} Lead-Kampagnen; Formulare für ${needsFormIds.length}, Werbegebiete für ${needsAreasIds.length} geladen (${ads.length} Anzeigen, ${adsets.length} Anzeigengruppen).`)

  // Lead-Formular je Kampagne: bevorzugt aus aktiven Anzeigen.
  const formByCampaign = new Map<string, string>()
  for (const ad of [...ads].sort((a, b) => Number(b.effective_status === "ACTIVE") - Number(a.effective_status === "ACTIVE"))) {
    const formId = extractLeadFormId(ad.creative)
    if (formId && !formByCampaign.has(ad.campaign_id)) formByCampaign.set(ad.campaign_id, formId)
  }

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
        campaignId = existing.id
        // Nur bei echten Änderungen schreiben: Cloudflare erlaubt je Cron-Lauf höchstens
        // 1000 Unteranfragen, ein Update aller ~550 Kampagnen sprengt das.
        const changed =
          existing.title !== fields.title ||
          existing.status !== fields.status ||
          existing.meta_effective_status !== fields.meta_effective_status ||
          (formId !== null && formId !== existing.meta_form_id)
        if (changed) {
          const { error } = await db.from("campaigns").update(fields).eq("id", existing.id)
          if (error) throw new Error(error.message)
          result.updated++
          if (formId && formId !== existing.meta_form_id) result.formsLinked++
        }
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
        // Neue Kampagne: Standard-Vorlagenset übernehmen, ausgeschaltet (Paket 15, T-74).
        await applyDefaultTemplateSet(db as unknown as SupabaseClient<Database>, campaignId)
        if (formId) result.formsLinked++
      }

      if (!needsAreas.has(mc.id)) continue
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
  // Auch Städte aus früheren Läufen, die noch keine Koordinaten haben (Limit je Lauf).
  const { data: storedMissing } = await db
    .from("campaign_ad_areas")
    .select("area_key")
    .eq("area_type", "city")
    .is("lat", null)
    .not("area_key", "is", null)
  // Städte aktiver Anzeigengruppen zuerst - die braucht Karte/Kundenprofil.
  const currentMissing = [...areasByCampaignId.values()]
    .flat()
    .filter((a) => a.areaType === "city" && a.areaKey && !coordsByKey.has(`city:${a.areaKey}`))
    .sort((a, b) => Number(b.adsetActive) - Number(a.adsetActive))
  const missingCityKeys = [
    ...new Set([
      ...currentMissing.map((a) => a.areaKey as string),
      ...(storedMissing ?? []).map((r) => r.area_key as string).filter((k) => !coordsByKey.has(`city:${k}`)),
    ]),
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
      // Meta hängt teils das Land an den Namen ("Tann, Germany") - stört die Suche.
      const cityName = info?.name?.replace(/,\s*(Germany|Deutschland)$/i, "").trim()
      const query = [cityName, info?.region, "Deutschland"].filter(Boolean).join(", ")
      try {
        const coords = cityName ? await forwardGeocode(query) : null
        if (coords) {
          coordsByKey.set(`city:${key}`, coords)
          // Gespeicherte Gebiete dieser Stadt (z.B. beendeter Kampagnen) gleich ergänzen.
          await db.from("campaign_ad_areas").update({ lat: coords.lat, lng: coords.lng }).eq("area_type", "city").eq("area_key", key).is("lat", null)
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

  // Abgleichszeitpunkt für alle Lead-Kampagnen in einer Anfrage (statt je Kampagne).
  await db.from("campaigns").update({ meta_synced_at: now }).eq("kind", "lead").not("meta_campaign_id", "is", null)

  // Werbegebiete je Kampagne nur ersetzen, wenn sie sich geändert haben (Unteranfragen-
  // Limit, s.o.) - Vergleich ohne Koordinaten, die ergänzt die Geokodierung oben direkt.
  const storedSignature = new Map<string, string[]>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("campaign_ad_areas")
      .select("campaign_id, meta_adset_id, area_type, area_key, label, radius_km, adset_active")
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const sig = areaSignature(r.meta_adset_id, r.area_type, r.area_key, r.label, r.radius_km, r.adset_active)
      storedSignature.set(r.campaign_id as string, [...(storedSignature.get(r.campaign_id as string) ?? []), sig])
    }
    if (!data || data.length < 1000) break
  }

  for (const [campaignId, areas] of areasByCampaignId) {
    const newSig = areas.map((a) => areaSignature(a.adsetId, a.areaType, a.areaKey, a.label, a.radiusKm, a.adsetActive)).sort().join("|")
    if (newSig === (storedSignature.get(campaignId) ?? []).sort().join("|")) {
      result.areas += areas.length
      continue
    }
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

  // Formulare laufender Kampagnen, die noch nicht eingelesen sind (Fragen für die
  // Feld-Zuordnung). Nur unbekannte - bekannte pflegt man in den Einstellungen.
  try {
    const { data: formRows } = await db.from("campaigns").select("meta_form_id").eq("kind", "lead").eq("status", "active").not("meta_form_id", "is", null)
    const { data: fieldRows } = await db.from("custom_field_definitions").select("key").eq("agency_id", agencyId).eq("active", true)
    const forms = await syncMetaLeadForms(
      db,
      agencyId,
      (formRows ?? []).map((r) => r.meta_form_id as string),
      new Set((fieldRows ?? []).map((r) => r.key as string)),
      { onlyMissing: true }
    )
    result.leadFormsAdded = forms.added
    result.leadFormWarnings = forms.errors
  } catch (err) {
    result.leadFormWarnings.push(`Lead-Formulare: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}
