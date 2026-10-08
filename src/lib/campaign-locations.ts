import { geocodePlz } from "@/lib/geocode-plz"
import { haversineDistanceKm } from "@/lib/geo-distance"

// Standorte einer Kanzlei-Kampagne (Paket 40): Haupt-PLZ (lat/lng) plus weitere PLZ aus
// zusammengeführten Stellen. Für Matching und Umkreis zählt der nächstgelegene Standort.
export interface LatLng {
  lat: number
  lng: number
  plz?: string | null
}

export function campaignPoints(c: { plz?: string | null; lat: number | null; lng: number | null; extra_plz?: string[] | null }): LatLng[] {
  const points: LatLng[] = c.lat !== null && c.lng !== null ? [{ lat: c.lat, lng: c.lng, plz: c.plz ?? null }] : []
  for (const plz of c.extra_plz ?? []) {
    const coords = geocodePlz(plz)
    if (coords && !points.some((p) => p.lat === coords.lat && p.lng === coords.lng)) points.push({ ...coords, plz })
  }
  return points
}

// Entfernung zum nächsten Standort, null ohne Standort.
export function nearestDistanceKm(points: LatLng[], lat: number, lng: number): number | null {
  if (points.length === 0) return null
  return Math.min(...points.map((p) => haversineDistanceKm(p.lat, p.lng, lat, lng)))
}

// "12345, 23456 34567" -> ["12345", "23456", "34567"]; ohne Haupt-PLZ und Dubletten.
export function parsePlzList(input: string | string[] | null | undefined, mainPlz?: string | null): string[] {
  const raw = Array.isArray(input) ? input.join(" ") : (input ?? "")
  return [...new Set(raw.match(/\b\d{5}\b/g) ?? [])].filter((p) => p !== mainPlz).sort()
}
