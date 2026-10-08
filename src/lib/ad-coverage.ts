import { haversineDistanceKm } from "@/lib/geo-distance"
import type { AdArea } from "@/lib/meta-campaigns-queries"

// Welche Werbegebiete decken einen Standort ab? (Atlas T-38, Hinweis im Kundenprofil)
// Nur Gebiete mit Mittelpunkt und Radius zählen; nach Entfernung sortiert.
export function coveringAreas(lat: number | null, lng: number | null, areas: AdArea[]): (AdArea & { distanceKm: number })[] {
  if (lat === null || lng === null) return []
  return areas
    .filter((a) => a.lat !== null && a.lng !== null && a.radiusKm !== null)
    .map((a) => ({ ...a, distanceKm: haversineDistanceKm(lat, lng, a.lat!, a.lng!) }))
    .filter((a) => a.distanceKm <= a.radiusKm!)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}
