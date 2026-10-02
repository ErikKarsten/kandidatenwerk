import { describe, expect, it } from "vitest"
import { resolveTemplateFieldKeys } from "./field-templates"

const std = { id: "std", field_keys: ["ausbildung", "erreichbarkeit"], is_default: true }
const sfa = { id: "sfa", field_keys: ["datev_erfahrung", "ausbildung"], is_default: false }

describe("resolveTemplateFieldKeys", () => {
  it("ohne Vorlagen: alle Felder (null)", () => {
    expect(resolveTemplateFieldKeys([], ["x"])).toBeNull()
  })
  it("ohne Zuordnung: Standardvorlage", () => {
    expect(resolveTemplateFieldKeys([std, sfa], [])).toEqual(["ausbildung", "erreichbarkeit"])
  })
  it("Kampagne ohne Vorlage nutzt Standard, mehrere werden vereinigt", () => {
    expect(resolveTemplateFieldKeys([std, sfa], ["sfa", null])).toEqual(["datev_erfahrung", "ausbildung", "erreichbarkeit"])
  })
  it("keine Standardvorlage und Kampagne ohne Vorlage: alle Felder", () => {
    expect(resolveTemplateFieldKeys([sfa], [null])).toBeNull()
  })
})
