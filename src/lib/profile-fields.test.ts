import { describe, expect, it } from "vitest"
import { customFieldKey, fieldValue, resolveAllFields, resolveFields, snippetsFor, type ProfileFieldSetting } from "./profile-fields"

const base = { hint: null, multiline: false, field_group: null, sort_order: 0 }

describe("Einstellbare Profilfelder", () => {
  const settings: ProfileFieldSetting[] = [
    { ...base, scope: "stelle", key: "software", label: "Programme", required: true, active: true, is_custom: false },
    { ...base, scope: "stelle", key: "gehalt", label: "Gehalt", required: false, active: false, is_custom: false },
    { ...base, scope: "stelle", key: "eigen_team", label: "Teamgröße", required: true, active: true, is_custom: true },
  ]

  it("überschreibt eingebaute Felder und hängt eigene an", () => {
    const fields = resolveAllFields("stelle", settings)
    expect(fields.find((f) => f.key === "software")).toMatchObject({ label: "Programme", required: true, defaultLabel: "Software / Buchhaltungsprogramm" })
    expect(fields.at(-1)).toMatchObject({ key: "eigen_team", custom: true })
    expect(resolveFields("stelle", settings).some((f) => f.key === "gehalt")).toBe(false)
  })

  it("liest Werte eigener Felder aus extra", () => {
    expect(fieldValue({ software: "DATEV", extra: { eigen_team: "8" } }, { key: "eigen_team", custom: true })).toBe("8")
    expect(fieldValue({ software: "DATEV" }, { key: "software", custom: false })).toBe("DATEV")
  })

  it("bildet Schlüssel und filtert Textbausteine", () => {
    expect(customFieldKey("Größe des Teams")).toBe("eigen_groesse_des_teams")
    const snippets = [
      { id: "1", berufsbild: "steuerfachwirt", kind: "aufgaben" as const, text: "B", sort_order: 1 },
      { id: "2", berufsbild: "steuerfachwirt", kind: "aufgaben" as const, text: "A", sort_order: 0 },
      { id: "3", berufsbild: "sonstige", kind: "anforderungen" as const, text: "C", sort_order: 0 },
    ]
    expect(snippetsFor(snippets, "steuerfachwirt").aufgaben).toEqual(["A", "B"])
    expect(snippetsFor(snippets, null).anforderungen).toEqual(["C"])
  })
})
