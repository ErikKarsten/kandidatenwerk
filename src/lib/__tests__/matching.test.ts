import { describe, expect, it } from "vitest"
import { haversineDistanceKm } from "@/lib/matching"

describe("haversineDistanceKm", () => {
  it("ist 0 für denselben Punkt", () => {
    expect(haversineDistanceKm(52.52, 13.405, 52.52, 13.405)).toBe(0)
  })

  it("Berlin–Hamburg liegt bei rund 255 km Luftlinie", () => {
    const d = haversineDistanceKm(52.52, 13.405, 53.5511, 9.9937)
    expect(d).toBeGreaterThan(250)
    expect(d).toBeLessThan(260)
  })

  it("ist symmetrisch", () => {
    const a = haversineDistanceKm(48.137, 11.575, 50.937, 6.96)
    const b = haversineDistanceKm(50.937, 6.96, 48.137, 11.575)
    expect(a).toBe(b)
  })

  it("rundet auf zwei Nachkommastellen", () => {
    const d = haversineDistanceKm(52.52, 13.405, 52.53, 13.41)
    expect(Math.round(d * 100) / 100).toBe(d)
  })
})
