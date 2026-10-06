import { describe, expect, it } from "vitest"
import { contractEnd, missingProfileItems } from "./client-project"

describe("missingProfileItems", () => {
  it("listet fehlende Pflichtangaben, Benefits und Stellen", () => {
    expect(missingProfileItems(null, [], 0)).toEqual([
      "Kurzbeschreibung",
      "Intro zur Kanzlei",
      "Mitarbeiterzahl",
      "Standort(e)",
      "Benefits",
      "Mindestens eine gesuchte Stelle",
    ])
  })
  it("ist leer, wenn alles da ist", () => {
    expect(
      missingProfileItems(
        { kurzbeschreibung: "a", intro: "b", mitarbeiterzahl: "10", benefits: ["Jobrad"] },
        [
          {
            title: "SFA",
            berufsbild: "steuerfachangestellte",
            plz: "50668",
            arbeitszeit: "Vollzeit",
            berufserfahrung: "ab 2 Jahre",
            startdatum: "ab sofort",
            aufgaben: "a\nb\nc\nd",
            anforderungen: "x\ny\nz",
          },
        ],
        1
      )
    ).toEqual([])
  })
})

describe("missingProfileItems mit Stellen", () => {
  it("meldet unvollständige Stellen", () => {
    expect(missingProfileItems(null, [{ title: "BiBu", aufgaben: "a" }], 1)).toContain("Stelle „BiBu“ unvollständig")
  })
})

describe("contractEnd", () => {
  it("rechnet die Laufzeit in Monaten", () => {
    expect(contractEnd("2026-10-01", 12)).toBe("2027-09-30")
    expect(contractEnd(null, 12)).toBeNull()
  })
})
