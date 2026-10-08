import { describe, expect, it } from "vitest"
import { rankAvailableCandidates, type CandidateRow } from "@/lib/available-candidates"

// Kunde in Braunschweig (38100)
const client = { points: [{ lat: 52.2647, lng: 10.5233 }] }
function row(id: string, lat: number | null, lng: number | null, created_at: string): CandidateRow {
  return { id, first_name: id, last_name: "", email: null, plz: null, lat, lng, berufsbild: null, status: "neu", source: "manual", created_at }
}
const rows = [
  row("braunschweig", 52.2647, 10.5233, "2026-09-01T00:00:00Z"),
  row("hannover", 52.3759, 9.732, "2026-10-01T00:00:00Z"), // ~55 km
  row("hamburg", 53.5511, 9.9937, "2026-09-15T00:00:00Z"), // ~150 km
  row("ohne-standort", null, null, "2026-10-02T00:00:00Z"),
]

describe("rankAvailableCandidates", () => {
  it("sortiert nach Entfernung, Kandidaten ohne Standort ans Ende", () => {
    const r = rankAvailableCandidates(rows, new Set(), { ...client, radiusKm: null, sort: "distance", page: 1, pageSize: 10 })
    expect(r.items.map((c) => c.id)).toEqual(["braunschweig", "hannover", "hamburg", "ohne-standort"])
    expect(r.items[0].distanceKm).toBe(0)
  })

  it("filtert nach Umkreis und lässt Kandidaten ohne Standort dabei weg", () => {
    const r = rankAvailableCandidates(rows, new Set(), { ...client, radiusKm: 100, sort: "distance", page: 1, pageSize: 10 })
    expect(r.items.map((c) => c.id)).toEqual(["braunschweig", "hannover"])
  })

  it("schließt bereits zugeordnete Kandidaten aus", () => {
    const r = rankAvailableCandidates(rows, new Set(["braunschweig"]), { ...client, radiusKm: null, sort: "distance", page: 1, pageSize: 10 })
    expect(r.items.map((c) => c.id)).not.toContain("braunschweig")
  })

  it("sortiert bei 'newest' nach Eingang", () => {
    const r = rankAvailableCandidates(rows, new Set(), { ...client, radiusKm: null, sort: "newest", page: 1, pageSize: 10 })
    expect(r.items.map((c) => c.id)).toEqual(["ohne-standort", "hannover", "hamburg", "braunschweig"])
  })

  it("ignoriert den Umkreis, wenn der Kunde keinen Standort hat", () => {
    const r = rankAvailableCandidates(rows, new Set(), { points: [], radiusKm: 25, sort: "distance", page: 1, pageSize: 10 })
    expect(r.total).toBe(4)
    expect(r.items.every((c) => c.distanceKm === null)).toBe(true)
  })

  it("teilt in Seiten auf und begrenzt die Seitenzahl", () => {
    const r = rankAvailableCandidates(rows, new Set(), { ...client, radiusKm: null, sort: "distance", page: 9, pageSize: 3 })
    expect(r.totalPages).toBe(2)
    expect(r.page).toBe(2)
    expect(r.items.map((c) => c.id)).toEqual(["ohne-standort"])
  })

  it("zählt bei mehreren Standorten den nächstgelegenen (zusammengeführte Stellen)", () => {
    const zweiStandorte = { points: [...client.points, { lat: 53.5511, lng: 9.9937 }] } // + Hamburg
    const r = rankAvailableCandidates(rows, new Set(), { ...zweiStandorte, radiusKm: 30, sort: "distance", page: 1, pageSize: 10 })
    // Beide 0 km vom jeweils nächsten Standort - dann entscheidet der Eingang.
    expect(r.items.map((c) => c.id)).toEqual(["hamburg", "braunschweig"])
    expect(r.items.map((c) => c.distanceKm)).toEqual([0, 0])
  })
})
