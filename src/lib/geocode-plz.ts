import plzCoords from "@/data/plz-coords.json"
import { haversineDistanceKm } from "@/lib/geo-distance"

const COORDS = plzCoords as unknown as Record<string, [number, number]>

export function geocodePlz(plz: string): { lat: number; lng: number } | null {
  const entry = COORDS[plz]
  if (!entry) return null
  const [lat, lng] = entry
  return { lat, lng }
}

const ENTRIES = Object.entries(COORDS)

// Nächstgelegene PLZ (Flächenmittelpunkt) zu einem Punkt - Umkehrung von geocodePlz,
// z.B. für Kandidaten, die nur ihren Wohnort angegeben haben.
export function nearestPlz(lat: number, lng: number): string | null {
  let best: string | null = null
  let bestDist = Infinity
  const cosLat = Math.cos((lat * Math.PI) / 180)
  for (const [plz, [pLat, pLng]] of ENTRIES) {
    const d = (pLat - lat) ** 2 + ((pLng - lng) * cosLat) ** 2
    if (d < bestDist) {
      bestDist = d
      best = plz
    }
  }
  return best
}

// Alle PLZ, deren Flächenmittelpunkt höchstens radiusKm vom Punkt entfernt liegt.
export function plzWithin(lat: number, lng: number, radiusKm: number): string[] {
  return ENTRIES.filter(([, [pLat, pLng]]) => haversineDistanceKm(lat, lng, pLat, pLng) <= radiusKm).map(([plz]) => plz)
}
