import { describe, expect, it } from "vitest"
import { buildCv } from "@/lib/cv"

// Paket 87: Lebenslauf im Portal nur mit den Feldern, die die Kanzlei im Portal sieht.
describe("Lebenslauf im Kundenportal", () => {
  const candidate = {
    id: "7fe8823c-cf57-4871-be61-1dcbcdc74cc5",
    first_name: "Franziska",
    last_name: "Lehnert",
    email: "f@x.de",
    phone: "0151",
    plz: "23547",
    berufsbild: "steuerfachangestellte",
    custom_fields: { ausbildung: "StFA 2011", gehaltsvorstellung: "46000", erreichbarkeit: "ab 17 Uhr" },
  }
  const defs = [
    { key: "ausbildung", label: "Ausbildung", active: true },
    { key: "gehaltsvorstellung", label: "Gehalt", active: true },
    { key: "erreichbarkeit", label: "Erreichbarkeit", active: true },
  ]
  const labels = (cv: ReturnType<typeof buildCv>) => cv.sections.flatMap((s) => s.items.map((i) => i.label))

  it("lässt Felder weg, die nicht in der Feld-Vorlage stehen", () => {
    const cv = buildCv(candidate, defs, false, undefined, new Set(["ausbildung"]))
    expect(labels(cv)).toContain("Ausbildung / Qualifikation")
    expect(labels(cv).join()).not.toMatch(/Gehalt|Erreichbarkeit/)
    expect(labels(cv)).toEqual(expect.arrayContaining(["E-Mail", "Telefon"]))
  })

  it("zeigt die Erreichbarkeit nur einmal", () => {
    const cv = buildCv(candidate, defs, false)
    expect(labels(cv).filter((l) => l === "Erreichbarkeit")).toHaveLength(1)
  })
})
