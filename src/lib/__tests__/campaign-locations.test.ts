import { describe, expect, it } from "vitest"
import { campaignPoints, nearestDistanceKm, parsePlzList } from "@/lib/campaign-locations"

describe("parsePlzList", () => {
  it("liest PLZ aus Freitext, ohne Dubletten und ohne Haupt-PLZ", () => {
    expect(parsePlzList("38100, 20095 20095;30159", "38100")).toEqual(["20095", "30159"])
    expect(parsePlzList(["1234", "abc"])).toEqual([])
  })
})

describe("campaignPoints", () => {
  it("verbindet Haupt-Standort und weitere PLZ", () => {
    const points = campaignPoints({ plz: "38100", lat: 52.26, lng: 10.52, extra_plz: ["20095", "99999x"] })
    expect(points).toHaveLength(2)
    expect(points[1].plz).toBe("20095")
    expect(nearestDistanceKm(points, points[1].lat, points[1].lng)).toBe(0)
  })

  it("ohne Standort: keine Entfernung", () => {
    expect(nearestDistanceKm(campaignPoints({ lat: null, lng: null }), 52, 10)).toBeNull()
  })
})
