import { describe, expect, it } from "vitest"
import { applyFormMapping, suggestTarget, type FormQuestion } from "./lead-form-mapping"

const fieldKeys = new Set(["ausbildung", "erreichbarkeit", "wohnort_plz", "alter"])

describe("suggestTarget", () => {
  it("nutzt den Fragetyp von Meta", () => {
    expect(suggestTarget({ key: "vollständiger_name", label: "Full name", type: "FULL_NAME" }, fieldKeys)).toBe("full_name")
    expect(suggestTarget({ key: "e-mail-adresse", label: "Email", type: "EMAIL" }, fieldKeys)).toBe("email")
    expect(suggestTarget({ key: "telefonnummer", label: "Phone number", type: "PHONE" }, fieldKeys)).toBe("phone")
  })
  it("schlägt Zusatzfelder über die Beschriftung vor", () => {
    expect(suggestTarget({ key: "x", label: "Welche Ausbildung hast du absolviert?", type: "CUSTOM" }, fieldKeys)).toBe("field:ausbildung")
    expect(suggestTarget({ key: "x", label: "Wohnort (PLZ)", type: "CUSTOM" }, fieldKeys)).toBe("plz")
  })
  it("ohne Treffer in die Beschreibung, Kontaktfelder ohne Typ erkannt", () => {
    expect(suggestTarget({ key: "wie_viel_berufserfahrung_hast_du?" }, fieldKeys)).toBe("beschreibung")
    expect(suggestTarget({ key: "e-mail-adresse" }, fieldKeys)).toBe("email")
    expect(suggestTarget({ key: "telefonnummer" }, fieldKeys)).toBe("phone")
    expect(suggestTarget({ key: "first_name" }, fieldKeys)).toBe("first_name")
    expect(suggestTarget({ key: "last_name" }, fieldKeys)).toBe("last_name")
    expect(suggestTarget({ key: "inbox_url" }, fieldKeys)).toBe("ignorieren")
  })
})

describe("applyFormMapping", () => {
  const questions: FormQuestion[] = [
    { key: "vollständiger_name", label: "Full name", type: "FULL_NAME", target: "full_name" },
    { key: "e-mail-adresse", label: "Email", type: "EMAIL", target: "email" },
    { key: "welche_ausbildung?", label: "Welche Ausbildung?", type: "CUSTOM", target: "field:ausbildung" },
    { key: "erfahrung", label: "Berufserfahrung", type: "CUSTOM", target: "beschreibung" },
    { key: "wohnort", label: "Wohnort", type: "CUSTOM", target: "plz" },
  ]
  it("verteilt die Antworten auf Felder und Beschreibung", () => {
    const r = applyFormMapping(
      questions,
      { "vollständiger_name": "Anna Muster", "e-mail-adresse": "Anna@Example.de", "welche_ausbildung?": "steuerfachangestellte", erfahrung: "0-2_jahre", wohnort: "Köln" },
      fieldKeys
    )
    expect(r).toMatchObject({ fullName: "Anna Muster", email: "anna@example.de", plzAnswer: "Köln" })
    expect(r.fields).toEqual({ ausbildung: "steuerfachangestellte", wohnort_plz: "Köln" })
    expect(r.descriptionLines).toEqual(["Berufserfahrung: 0-2_jahre"])
  })
})
