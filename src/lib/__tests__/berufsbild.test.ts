import { describe, expect, it } from "vitest"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"

describe("mapKanzleistelleBerufsbild", () => {
  it.each([
    ["Steuerfachangestellte*r (m/w/d)", "steuerfachangestellte"],
    ["Fachangestellter für Steuern", "steuerfachangestellte"],
    ["Aachen - SFA", "steuerfachangestellte"],
    ["Steuerfachwirt (m/w/d)", "steuerfachwirt"],
    ["Schwarz Partners - SFW", "steuerfachwirt"],
    ["Bilanzbuchhalter", "bilanzbuchhalter"],
    ["Steuerberater/in", "steuerberater"],
    ["Lohnbuchhalter (m/w/d)", "sonstige"],
    ["FiBu Teilzeit", "sonstige"],
  ])("%s -> %s", (input, expected) => {
    expect(mapKanzleistelleBerufsbild(input)).toBe(expected)
  })

  it("liefert null für Unbekanntes", () => {
    expect(mapKanzleistelleBerufsbild("Bäcker")).toBeNull()
  })
})
