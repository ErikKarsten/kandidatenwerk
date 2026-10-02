// Reine Auswertung von Meta-Marketing-API-Antworten für den Kampagnen-Abgleich (Atlas
// T-38) - ohne Netzwerk/Datenbank, damit testbar. Genutzt von meta-campaigns-sync.ts.

import { geocodePlz } from "@/lib/geocode-plz"

export type AreaType = "city" | "place" | "custom_location" | "zip" | "region" | "country"

export interface ParsedArea {
  areaType: AreaType
  areaKey: string | null
  label: string
  lat: number | null
  lng: number | null
  radiusKm: number | null
}

interface RadiusLocation {
  key?: string
  name?: string
  address_string?: string
  radius?: number
  distance_unit?: string
  latitude?: number
  longitude?: number
}

export interface MetaGeoLocations {
  cities?: RadiusLocation[]
  places?: RadiusLocation[]
  custom_locations?: RadiusLocation[]
  zips?: { key?: string; name?: string }[]
  regions?: { key?: string; name?: string }[]
  countries?: string[]
}

const MILE_IN_KM = 1.609344

function toKm(radius: number | undefined, unit: string | undefined): number | null {
  if (radius === undefined || radius === null) return null
  return unit === "mile" ? Math.round(radius * MILE_IN_KM * 10) / 10 : radius
}

// Werbegebiete einer Anzeigengruppe. Städte haben bei Meta keine Koordinaten (lat/lng
// null) - die löst der Abgleich separat über ihren Namen auf.
export function parseGeoLocations(geo: MetaGeoLocations | undefined | null): ParsedArea[] {
  if (!geo) return []
  const areas: ParsedArea[] = []

  for (const c of geo.cities ?? []) {
    areas.push({
      areaType: "city",
      areaKey: c.key ?? null,
      label: c.name ?? "Stadt",
      lat: null,
      lng: null,
      radiusKm: toKm(c.radius, c.distance_unit),
    })
  }
  for (const p of geo.places ?? []) {
    areas.push({
      areaType: "place",
      areaKey: p.key ?? null,
      label: p.name ?? "Ort",
      lat: p.latitude ?? null,
      lng: p.longitude ?? null,
      radiusKm: toKm(p.radius, p.distance_unit),
    })
  }
  for (const p of geo.custom_locations ?? []) {
    areas.push({
      areaType: "custom_location",
      areaKey: p.latitude !== undefined && p.longitude !== undefined ? `${p.latitude},${p.longitude}` : null,
      label: p.name ?? p.address_string ?? "Eigener Standort",
      lat: p.latitude ?? null,
      lng: p.longitude ?? null,
      radiusKm: toKm(p.radius, p.distance_unit),
    })
  }
  for (const z of geo.zips ?? []) {
    // Meta-Schlüssel "DE:38100" -> PLZ-Mittelpunkt aus der lokalen Liste
    const plz = (z.key ?? "").split(":").pop() ?? ""
    const coords = geocodePlz(plz)
    areas.push({
      areaType: "zip",
      areaKey: z.key ?? null,
      label: `PLZ ${z.name ?? plz}`,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      radiusKm: null,
    })
  }
  for (const r of geo.regions ?? []) {
    areas.push({ areaType: "region", areaKey: r.key ?? null, label: r.name ?? "Region", lat: null, lng: null, radiusKm: null })
  }
  for (const country of geo.countries ?? []) {
    areas.push({ areaType: "country", areaKey: country, label: country === "DE" ? "Deutschland" : country, lat: null, lng: null, radiusKm: null })
  }
  return areas
}

// Meta-Status -> Status in Kandidatenwerk (campaigns_status_check: active/paused/completed).
export function mapMetaStatus(effectiveStatus: string | undefined): "active" | "paused" | "completed" {
  if (effectiveStatus === "ACTIVE") return "active"
  if (effectiveStatus === "PAUSED" || effectiveStatus === "CAMPAIGN_PAUSED" || effectiveStatus === "IN_PROCESS" || effectiveStatus === "WITH_ISSUES") {
    return "paused"
  }
  return "completed"
}

// Lead-Formular-ID aus einem Anzeigen-Creative (steht je nach Anzeigentyp in
// object_story_spec oder asset_feed_spec unter call_to_action.value.lead_gen_form_id).
export function extractLeadFormId(creative: unknown): string | null {
  const match = JSON.stringify(creative ?? {}).match(/"lead_gen_form_id":"?(\d+)"?/)
  return match ? match[1] : null
}

export const LEAD_OBJECTIVES = new Set(["OUTCOME_LEADS", "LEAD_GENERATION"])
