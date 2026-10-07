import { describe, expect, it } from "vitest"
import { normalizeTags, visibleTags } from "./candidate-tags"

describe("Kandidaten-Tags", () => {
  it("bereinigt und entfernt Doppelte (ohne Groß/Klein)", () => {
    expect(normalizeTags(["  Musterdatensatz ", "musterdatensatz", "", "Top  Kandidat"])).toEqual(["Musterdatensatz", "Top Kandidat"])
  })

  it("blendet Musterdatensatz nur im Show-Modus aus", () => {
    expect(visibleTags(["Musterdatensatz", "Top"], true)).toEqual(["Top"])
    expect(visibleTags(["Musterdatensatz", "Top"], false)).toEqual(["Musterdatensatz", "Top"])
    expect(visibleTags(null, true)).toEqual([])
  })
})
