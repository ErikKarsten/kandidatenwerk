import { describe, expect, it } from "vitest"
import { placeQueryFromAnswer } from "./place-query"
import { geocodePlz, nearestPlz } from "./geocode-plz"

describe("placeQueryFromAnswer", () => {
  it.each([
    ["41 Jahre & Dresden-Pieschen", "Dresden-Pieschen"],
    ["32 Jahre & wohnt in der Nähe von Stade", "Stade"],
    ["32 Jahre & Hechthausen (24 km von Stade entfernt)", "Hechthausen"],
    ["Dormagen - 25 km", "Dormagen"],
    ["53 Jahre alt & wohnt in Rimbach", "Rimbach"],
    ["Westerwald, Krotbach", "Westerwald, Krotbach"],
    ["In Farmsen", "Farmsen"],
    ["33 & Groß Sternberg (Hammah)", "Groß Sternberg"],
  ])("%s -> %s", (answer, expected) => {
    expect(placeQueryFromAnswer(answer)).toBe(expected)
  })

  it("liefert null ohne Ortsnamen", () => {
    expect(placeQueryFromAnswer("34 Jahre")).toBeNull()
  })
})

describe("nearestPlz", () => {
  it("findet zu den Koordinaten einer PLZ wieder diese PLZ", () => {
    const c = geocodePlz("41464")!
    expect(nearestPlz(c.lat, c.lng)).toBe("41464")
  })
})
