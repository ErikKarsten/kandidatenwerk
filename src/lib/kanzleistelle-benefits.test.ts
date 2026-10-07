import { describe, expect, it } from "vitest"
import { benefitSourceHash, hasBenefitSource, parseBenefitAnswer } from "./kanzleistelle-benefits"

describe("Benefits für Kanzleistelle24", () => {
  it("liest die JSON-Antwort, auch mit Text drumherum", () => {
    const r = parseBenefitAnswer('Hier:\n{"benefits": ["- Firmenwagen nach Absprache", "Partnerschaftsperspektive"], "working_model": "vor_ort"}')
    expect(r).toEqual({ benefits: ["Firmenwagen nach Absprache", "Partnerschaftsperspektive"], workingModel: "vor_ort" })
  })

  it("verwirft unbrauchbare Antworten", () => {
    expect(parseBenefitAnswer("keine Ahnung")).toBeNull()
    expect(parseBenefitAnswer('{"benefits": []}')).toBeNull()
    expect(parseBenefitAnswer('{"benefits": ["A"], "working_model": "irgendwas"}')).toEqual({ benefits: ["A"], workingModel: null })
  })

  it("Hash ändert sich nur bei geänderten Angaben", () => {
    const a = benefitSourceHash({ benefits: ["Firmenwagen "], arbeitszeiten: "Vollzeit", homeoffice: null })
    expect(benefitSourceHash({ benefits: ["Firmenwagen"], arbeitszeiten: " Vollzeit", homeoffice: "" })).toBe(a)
    expect(benefitSourceHash({ benefits: ["Firmenwagen", "Obst"], arbeitszeiten: "Vollzeit" })).not.toBe(a)
  })

  it("erkennt leere Angaben", () => {
    expect(hasBenefitSource({ benefits: [" "], arbeitszeiten: "", homeoffice: null })).toBe(false)
    expect(hasBenefitSource({ homeoffice: "2 Tage" })).toBe(true)
  })
})
