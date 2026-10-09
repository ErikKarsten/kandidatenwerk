import { describe, expect, it } from "vitest"
import { buildDemoCandidate, pickDemoTarget } from "./demo-candidate"

describe("pickDemoTarget", () => {
  it("nimmt die erste Stelle nach Reihenfolge", () => {
    const target = pickDemoTarget(
      [
        { berufsbild: "steuerberater", plz: "80331", sort_order: 2, created_at: "2026-10-01" },
        { berufsbild: "bilanzbuchhalter", plz: "53111", sort_order: 1, created_at: "2026-10-02" },
      ],
      "10115"
    )
    expect(target).toEqual({ berufsbild: "bilanzbuchhalter", plz: "53111" })
  })

  it("fällt ohne Stelle auf Steuerfachangestellte am Kanzleistandort zurück", () => {
    expect(pickDemoTarget([], "10115")).toEqual({ berufsbild: "steuerfachangestellte", plz: "10115" })
  })

  it("ersetzt unbekannte Berufsbilder und nimmt die Kanzlei-PLZ, wenn die Stelle keine hat", () => {
    const target = pickDemoTarget([{ berufsbild: "Lohnbuchhalter", plz: null, sort_order: 0, created_at: "2026-10-01" }], "10115")
    expect(target).toEqual({ berufsbild: "steuerfachangestellte", plz: "10115" })
  })

  it("übernimmt gepflegte Berufsbilder wie Lohnbuchhalter", () => {
    const target = pickDemoTarget([{ berufsbild: "lohnbuchhalter", plz: "53111", sort_order: 0, created_at: "2026-10-01" }], null)
    expect(target.berufsbild).toBe("lohnbuchhalter")
  })
})

describe("buildDemoCandidate", () => {
  it("ist als Demo markiert und deutlich benannt", () => {
    const c = buildDemoCandidate({ berufsbild: "steuerfachwirt", plz: "53111" })
    expect(c.is_demo).toBe(true)
    expect(c.last_name).toContain("Beispiel")
    expect(c.custom_fields.ausbildung).toContain("Steuerfachwirt")
    expect(c.lat).not.toBeNull()
  })
})
