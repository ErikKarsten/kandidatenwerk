// Kanzleien im Umkreis eines Kandidaten (Reiter "Zuordnung", Paket 46): jede Kanzlei mit
// ihren Standorten (Stammdaten, weitere Standorte, Stellen) und den gesuchten Stellen samt
// Stellenprofil - unabhängig davon, ob es schon eine Kanzlei-Kampagne gibt.
import { haversineDistanceKm } from "@/lib/geo-distance"
import { fieldValue, type ResolvedField } from "@/lib/profile-fields"

export interface KanzleiPosition {
  id: string
  title: string
  berufsbild: string | null
  ort: string | null
  campaignId: string | null
  details: { label: string; value: string }[]
}

export interface KanzleiOption {
  id: string
  name: string
  ort: string | null
  places: { lat: number; lng: number }[]
  positions: KanzleiPosition[]
}

interface ClientRow {
  id: string
  name: string
  ort: string | null
  lat: number | null
  lng: number | null
}
interface LocationRow {
  client_id: string
  lat: number | null
  lng: number | null
}
interface PositionRow {
  id: string
  client_id: string
  title: string
  berufsbild: string | null
  ort: string | null
  lat: number | null
  lng: number | null
  campaign_id: string | null
  [key: string]: unknown
}

export function buildKanzleiOptions(clients: ClientRow[], locations: LocationRow[], positions: PositionRow[], fields: ResolvedField[]): KanzleiOption[] {
  // Titel und Berufsbild stehen schon in der Kopfzeile der Stelle.
  const detailFields = fields.filter((f) => !["title", "berufsbild", "plz", "ort", "radius_km"].includes(f.key))
  return clients.map((c) => {
    const own = positions.filter((p) => p.client_id === c.id)
    const raw = [
      ...(c.lat !== null && c.lng !== null ? [{ lat: c.lat, lng: c.lng }] : []),
      ...locations.filter((l) => l.client_id === c.id && l.lat !== null && l.lng !== null).map((l) => ({ lat: l.lat!, lng: l.lng! })),
      ...own.filter((p) => p.lat !== null && p.lng !== null).map((p) => ({ lat: p.lat!, lng: p.lng! })),
    ]
    const places = raw.filter((p, i) => raw.findIndex((q) => Math.abs(q.lat - p.lat) < 1e-4 && Math.abs(q.lng - p.lng) < 1e-4) === i)
    return {
      id: c.id,
      name: c.name,
      ort: c.ort,
      places,
      positions: own.map((p) => ({
        id: p.id,
        title: p.title,
        berufsbild: p.berufsbild,
        ort: p.ort,
        campaignId: p.campaign_id,
        details: detailFields.map((f) => ({ label: f.label, value: fieldValue(p, f).trim() })).filter((d) => d.value),
      })),
    }
  })
}

// Entfernung zum nächsten Standort der Kanzlei, null ohne Standort.
export function kanzleiDistanceKm(k: Pick<KanzleiOption, "places">, lat: number, lng: number): number | null {
  if (k.places.length === 0) return null
  return Math.min(...k.places.map((p) => haversineDistanceKm(lat, lng, p.lat, p.lng)))
}
