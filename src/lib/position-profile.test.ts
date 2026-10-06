import { describe, expect, it } from "vitest"
import { appendPoint, countPoints, missingPositionItems } from "./position-profile"

describe("Stellenprofil", () => {
  it("zählt Punkte zeilenweise und ignoriert Aufzählungszeichen und Leerzeilen", () => {
    expect(countPoints("- Buchhaltung\n\n• Löhne\nAbschlüsse")).toBe(3)
    expect(countPoints(null)).toBe(0)
  })

  it("meldet fehlende Pflichtangaben mit Zähler", () => {
    expect(missingPositionItems({ berufsbild: "steuerfachangestellte", plz: "50668", aufgaben: "a\nb" })).toEqual([
      "Arbeitszeit",
      "Berufserfahrung",
      "Start",
      "Aufgaben (2/4)",
      "Anforderungen (0/3)",
    ])
  })

  it("ist vollständig mit allen Angaben", () => {
    expect(
      missingPositionItems({
        berufsbild: "steuerfachangestellte",
        plz: "50668",
        arbeitszeit: "Vollzeit",
        berufserfahrung: "ab 2 Jahre",
        startdatum: "ab sofort",
        aufgaben: "a\nb\nc\nd",
        anforderungen: "x\ny\nz",
      })
    ).toEqual([])
  })

  it("folgt den eingestellten Pflichtfeldern inkl. eigener Felder", () => {
    const rules = [
      { key: "arbeitszeit", label: "Arbeitszeit", required: false, custom: false },
      { key: "aufgaben", label: "Aufgaben", required: true, custom: false },
      { key: "eigen_team", label: "Teamgröße", required: true, custom: true },
    ]
    expect(missingPositionItems({ berufsbild: "x", plz: "1", aufgaben: "a\nb\nc\nd", extra: {} }, rules)).toEqual(["Teamgröße"])
    expect(missingPositionItems({ berufsbild: "x", plz: "1", aufgaben: "a\nb\nc\nd", extra: { eigen_team: "8" } }, rules)).toEqual([])
  })

  it("hängt Textbausteine ohne Doppelungen an", () => {
    expect(appendPoint("", "A")).toBe("A")
    expect(appendPoint("A", "B")).toBe("A\nB")
    expect(appendPoint("- A\nB", "A")).toBe("- A\nB")
  })

})
