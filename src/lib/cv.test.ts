import { describe, expect, it } from "vitest"
import { buildCv, cvReference } from "./cv"

const candidate = {
  id: "3f2b9c1e-1a2b-4c3d-8e9f-0123456789ab",
  first_name: "Erika",
  last_name: "Muster",
  email: "erika@example.com",
  phone: "0151 123",
  plz: "50668",
  berufsbild: "steuerfachangestellte",
  custom_fields: {
    ausbildung: "Steuerfachangestellte (IHK)",
    wechselgrund: "Mehr Verantwortung",
    alter: "29",
    erreichbarkeit: "ab 17 Uhr",
    weitere_antworten: "intern",
    eigen_hobby: "Laufen",
  },
}
const defs = [{ key: "eigen_hobby", label: "Hobbys", active: true }]

describe("Lebenslauf", () => {
  it("gliedert vollständig mit Name und Kontakt", () => {
    const cv = buildCv(candidate, defs, false)
    expect(cv.title).toBe("Erika Muster")
    expect(cv.subtitle).toBe("Steuerfachangestellte")
    expect(cv.facts).toContainEqual({ label: "Alter", value: "29 Jahre" })
    expect(cv.sections.map((s) => s.title)).toEqual(["Qualifikation", "Wechselmotivation", "Weitere Angaben", "Kontakt"])
    expect(JSON.stringify(cv)).not.toContain("intern")
  })

  it("anonymisiert Name, Kontakt und Erreichbarkeit, PLZ bleibt", () => {
    const cv = buildCv(candidate, defs, true)
    const all = JSON.stringify(cv)
    expect(cv.title).toBe(`Kandidat:in ${cvReference(candidate.id)}`)
    for (const secret of ["Erika", "Muster", "erika@example.com", "0151", "ab 17 Uhr"]) expect(all).not.toContain(secret)
    expect(cv.facts).toContainEqual({ label: "PLZ", value: "50668" })
  })
})
