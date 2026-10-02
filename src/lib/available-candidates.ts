import { haversineDistanceKm } from "@/lib/matching"

// Verfügbare Kandidaten im Kundenprofil (Atlas T-29): Kandidaten aus der gesamten
// Datenbank, die einem Kunden noch nicht aktiv zugeordnet sind - sortiert nach
// Entfernung zum Kundenstandort oder nach Eingang. Bewusst unabhängig von Kampagnen:
// das automatische Matching (matching.ts) läuft nur über aktive Kampagnen und findet
// Kunden ohne Kampagne deshalb nie.
//
// Reine Funktion ohne Datenbankzugriff (Filter/Sortierung/Seiten), damit sie testbar
// ist - die Action in clients/[id]/actions.ts lädt die Rohdaten.

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
}

export interface RankOptions {
  clientLat: number | null
  clientLng: number | null
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
  const hasClientLocation = opts.clientLat !== null && opts.clientLng !== null

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
      distanceKm:
        hasClientLocation && r.lat !== null && r.lng !== null
          ? haversineDistanceKm(opts.clientLat!, opts.clientLng!, r.lat, r.lng)
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
