import { describe, expect, it } from "vitest"
import { contractEnd, missingProfileItems } from "./client-project"

describe("missingProfileItems", () => {
  it("listet fehlende Pflichtangaben, Benefits und Stellen", () => {
    expect(missingProfileItems(null, 0)).toEqual([
      "Kurzbeschreibung",
      "Intro zur Kanzlei",
      "Mitarbeiterzahl",
      "Standort(e)",
      "Ansprechpartner für Bewerbungsgespräche",
      "Benefits",
      "Mindestens eine gesuchte Stelle",
    ])
  })
  it("ist leer, wenn alles da ist", () => {
    expect(
      missingProfileItems(
        { kurzbeschreibung: "a", intro: "b", mitarbeiterzahl: "10", standorte: "Köln", ansprechpartner_bewerbung: "Frau X", benefits: ["Jobrad"] },
        1
      )
    ).toEqual([])
  })
})

describe("contractEnd", () => {
  it("rechnet die Laufzeit in Monaten", () => {
    expect(contractEnd("2026-10-01", 12)).toBe("2027-09-30")
    expect(contractEnd(null, 12)).toBeNull()
  })
})
