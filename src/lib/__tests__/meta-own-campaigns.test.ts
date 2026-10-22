import { describe, expect, it } from "vitest"
import { isKs24Campaign, isSelectableForm } from "@/lib/meta-campaigns-parse"

// Paket 80: Formulare eigener Meta-Kampagnen von Kanzleien.
describe("eigene Meta-Kampagnen", () => {
  it("erkennt Kampagnen ohne KS24 als Kanzlei-Kampagnen", () => {
    expect(isKs24Campaign("KS24 - Video Neele - Region Köln")).toBe(true)
    expect(isKs24Campaign("Roggel Steuerberatung – 02/10/2026")).toBe(false)
    expect(isKs24Campaign("PMPG Bonn - SFA (07/26)")).toBe(false)
  })

  it("lässt nur aktive Formulare wählen, ohne Zugriff unter Vorbehalt", () => {
    expect(isSelectableForm({ accessible: true, formStatus: "ACTIVE" })).toBe(true)
    expect(isSelectableForm({ accessible: true, formStatus: "ARCHIVED" })).toBe(false)
    expect(isSelectableForm({ accessible: false, formStatus: null })).toBe(true)
  })
})
