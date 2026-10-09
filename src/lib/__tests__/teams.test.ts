import { describe, expect, it } from "vitest"
import { assigneeLabel, assigneeValue, canCreateSamples, isAssignedTo, parseAssignee } from "@/lib/teams"

describe("Zuweisung an Person oder Team", () => {
  it("liest Personen und Teams aus dem Auswahlwert", () => {
    expect(parseAssignee("abc")).toEqual({ assigned_to: "abc", assigned_team: null })
    expect(parseAssignee("team:vertrieb")).toEqual({ assigned_to: null, assigned_team: "vertrieb" })
    expect(parseAssignee("team:unbekannt")).toBeNull()
    expect(parseAssignee("")).toBeNull()
  })

  it("baut den Auswahlwert zurück", () => {
    expect(assigneeValue({ assigned_to: null, assigned_team: "sales_recruiting" })).toBe("team:sales_recruiting")
    expect(assigneeValue({ assigned_to: "abc", assigned_team: null })).toBe("abc")
  })

  it("Team-Aufgaben gehören allen Mitgliedern", () => {
    const task = { assigned_to: null, assigned_team: "vertrieb" }
    expect(isAssignedTo(task, "u1", "vertrieb")).toBe(true)
    expect(isAssignedTo(task, "u1", "sales_recruiting")).toBe(false)
    expect(isAssignedTo(task, "u1", null)).toBe(false)
    expect(isAssignedTo({ assigned_to: "u1", assigned_team: null }, "u1", null)).toBe(true)
  })

  it("zeigt Team oder Person", () => {
    expect(assigneeLabel({ assigned_team: "vertrieb" }, null)).toBe("Team Vertrieb")
    expect(assigneeLabel({ assigned_team: null }, "Anna")).toBe("Anna")
  })
})

describe("canCreateSamples", () => {
  it("nur Admins und Vertrieb", () => {
    expect(canCreateSamples({ role: "agency_admin", team: null })).toBe(true)
    expect(canCreateSamples({ role: "agency_member", team: "vertrieb" })).toBe(true)
    expect(canCreateSamples({ role: "agency_member", team: "sales_recruiting" })).toBe(false)
    expect(canCreateSamples({ role: "agency_member", team: null })).toBe(false)
    expect(canCreateSamples(null)).toBe(false)
  })
})
