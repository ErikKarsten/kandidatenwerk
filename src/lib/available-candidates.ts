import { haversineDistanceKm } from "@/lib/geo-distance"

// Passende Kandidaten einer Kanzlei-Kampagne (Atlas T-40): Kandidaten, die der
// Kampagne noch nicht zugeordnet sind - sortiert nach Entfernung zum Standort der
// Kampagne oder nach Eingang. Ergänzt das gespeicherte Matching (candidate_campaign_
// matches), das nur bei bestimmten Ereignissen neu berechnet wird.
//
// Reine Funktion ohne Datenbankzugriff (Filter/Sortierung/Seiten), damit sie testbar
// ist - die Action in campaigns/[id]/actions.ts lädt die Rohdaten.

export type AvailableSort = "distance" | "newest"

export interface CandidateRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  plz: string | null
  lat: number | null
  lng: number | null
  berufsbild: string | null
  status: string
  source: string
  created_at: string
}

export interface AvailableCandidate {
  id: string
  name: string
  email: string | null
  plz: string | null
  berufsbild: string | null
  status: string
  source: string
  createdAt: string
  distanceKm: number | null
  lat: number | null
  lng: number | null
}

export interface RankOptions {
  // Standorte der Kampagne (Haupt-PLZ plus weitere, Paket 40); es zählt der nächste.
  points: { lat: number; lng: number }[]
  radiusKm: number | null // null = ohne Umkreis-Grenze
  sort: AvailableSort
  page: number
  pageSize: number
}

export function rankAvailableCandidates(
  rows: CandidateRow[],
  assignedIds: Set<string>,
  opts: RankOptions
): { items: AvailableCandidate[]; total: number; totalPages: number; page: number } {
  const hasClientLocation = opts.points.length > 0

  let items: AvailableCandidate[] = rows
    .filter((r) => !assignedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim() || "(ohne Namen)",
      email: r.email,
      plz: r.plz,
      berufsbild: r.berufsbild,
      status: r.status,
      source: r.source,
      createdAt: r.created_at,
      lat: r.lat,
      lng: r.lng,
      distanceKm:
        hasClientLocation && r.lat !== null && r.lng !== null
          ? Math.min(...opts.points.map((p) => haversineDistanceKm(p.lat, p.lng, r.lat!, r.lng!)))
          : null,
    }))

  // Umkreis nur anwendbar, wenn der Kunde einen Standort hat; Kandidaten ohne Standort
  // fallen bei gesetztem Umkreis heraus (ihre Entfernung ist unbekannt).
  if (opts.radiusKm !== null && hasClientLocation) {
    items = items.filter((c) => c.distanceKm !== null && c.distanceKm <= opts.radiusKm!)
  }

  items.sort((a, b) => {
    if (opts.sort === "distance") {
      if (a.distanceKm === null && b.distanceKm !== null) return 1
      if (a.distanceKm !== null && b.distanceKm === null) return -1
      if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm
      }
    }
    return b.createdAt.localeCompare(a.createdAt)
  })

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / opts.pageSize))
  const page = Math.min(Math.max(1, opts.page), totalPages)
  return {
    items: items.slice((page - 1) * opts.pageSize, page * opts.pageSize),
    total,
    totalPages,
    page,
  }
}
