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

describe("Active Sourcing (Paket 89)", () => {
  it("nur Admins und das Team dürfen Active Sourcing", async () => {
    const { canUseActiveSourcing } = await import("@/lib/teams")
    expect(canUseActiveSourcing({ role: "agency_admin", team: null })).toBe(true)
    expect(canUseActiveSourcing({ role: "agency_member", team: "sales_recruiting_active_sourcing" })).toBe(true)
    expect(canUseActiveSourcing({ role: "agency_member", team: "sales_recruiting" })).toBe(false)
    expect(canUseActiveSourcing({ role: "agency_member", team: "vertrieb" })).toBe(false)
    expect(canUseActiveSourcing(null)).toBe(false)
  })

  it("das neue Team zählt bei Team-Aufgaben auch als Sales Recruiting", async () => {
    const { isAssignedTo, memberOfTeam, teamsCovering } = await import("@/lib/teams")
    expect(teamsCovering("sales_recruiting")).toEqual(["sales_recruiting", "sales_recruiting_active_sourcing"])
    expect(memberOfTeam("sales_recruiting_active_sourcing", "sales_recruiting")).toBe(true)
    expect(memberOfTeam("sales_recruiting", "sales_recruiting_active_sourcing")).toBe(false)
    expect(isAssignedTo({ assigned_to: null, assigned_team: "sales_recruiting" }, "u1", "sales_recruiting_active_sourcing")).toBe(true)
  })
})

describe("Musterdatensätze sehen (Paket 91)", () => {
  it("nur Admins und der Vertrieb", async () => {
    const { canSeeSamples } = await import("@/lib/teams")
    expect(canSeeSamples({ role: "agency_admin", team: null })).toBe(true)
    expect(canSeeSamples({ role: "agency_member", team: "vertrieb" })).toBe(true)
    expect(canSeeSamples({ role: "agency_member", team: "sales_recruiting" })).toBe(false)
    expect(canSeeSamples({ role: "agency_member", team: "sales_recruiting_active_sourcing" })).toBe(false)
    expect(canSeeSamples({ role: "agency_member", team: null })).toBe(false)
  })
})
