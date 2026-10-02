import { describe, expect, it } from "vitest"
import { coveringAreas } from "@/lib/ad-coverage"
import type { AdArea } from "@/lib/meta-campaigns-queries"

const area = (label: string, lat: number | null, lng: number | null, radiusKm: number | null): AdArea => ({
  campaignId: label, campaignTitle: `Kampagne ${label}`, label, areaType: "city", lat, lng, radiusKm, adsetActive: true,
})

describe("coveringAreas", () => {
  const areas = [
    area("München", 48.137, 11.575, 35),
    area("Augsburg", 48.371, 10.898, 30),
    area("Ohne Radius", 48.137, 11.575, null),
    area("Ohne Koordinaten", null, null, 30),
  ]

  it("findet Gebiete, in deren Radius der Standort liegt, nächstes zuerst", () => {
    // Freising: ~33 km von München, ~85 km von Augsburg
    expect(coveringAreas(48.403, 11.749, areas).map((a) => a.label)).toEqual(["München"])
    // Dachau: ~17 km von München, ~45 km von Augsburg
    expect(coveringAreas(48.26, 11.434, areas).map((a) => a.label)).toEqual(["München"])
  })

  it("liefert nichts außerhalb aller Radien oder ohne Standort", () => {
    expect(coveringAreas(52.52, 13.405, areas)).toEqual([])
    expect(coveringAreas(null, null, areas)).toEqual([])
  })
})
