import { describe, expect, it } from "vitest"
import { backTarget, nextStack } from "@/lib/nav-history"

describe("Zurück-Verlauf", () => {
  it("überspringt Formulare und erkennt Browser-Zurück", () => {
    let s: string[] = []
    for (const url of ["/dashboard/clients/k1", "/dashboard/campaigns/c1", "/dashboard/candidates/new?campaign_id=c1", "/dashboard/campaigns/c1"]) s = nextStack(s, url)
    expect(s).toEqual(["/dashboard/clients/k1", "/dashboard/campaigns/c1"])
    expect(nextStack(s, "/dashboard/clients/k1")).toEqual(["/dashboard/clients/k1"])
  })

  it("führt nach dem Anlegen aus der Kampagne zum Kunden, nicht ins Formular", () => {
    const { target, rest } = backTarget(["/dashboard/clients/k1", "/dashboard/campaigns/c1"], "/dashboard/campaigns/c1", "/dashboard/clients")
    expect(target).toBe("/dashboard/clients/k1")
    expect(rest).toEqual([])
  })

  it("ohne Verlauf zur Übersicht", () => {
    expect(backTarget([], "/dashboard/candidates/x", "/dashboard/candidates").target).toBe("/dashboard/candidates")
  })
})
