import { describe, expect, it } from "vitest"
import { evaluateQualification } from "@/lib/qualified-candidates"

const fields = new Set(["a", "b", "c", "d", "e"])
const fourFilled = { a: "x", b: "x", c: "x", d: "x" }

describe("evaluateQualification", () => {
  it("nimmt Kandidaten mit Status, Berufsbild und 4 ausgefüllten Feldern auf", () => {
    const r = evaluateQualification({ status: "in_kontakt", berufsbild: "steuerberater", custom_fields: fourFilled }, fields)
    expect(r.qualifies).toBe(true)
  })

  it.each(["neu", "abgelehnt", null])("schließt Status %s aus", (status) => {
    const r = evaluateQualification({ status, berufsbild: "steuerberater", custom_fields: fourFilled }, fields)
    expect(r.qualifies).toBe(false)
  })

  it("verlangt ein Berufsbild", () => {
    const r = evaluateQualification({ status: "interview", berufsbild: null, custom_fields: fourFilled }, fields)
    expect(r.qualifies).toBe(false)
  })

  it("zählt nur aktive, nicht leere Felder", () => {
    const r = evaluateQualification(
      { status: "interview", berufsbild: "steuerberater", custom_fields: { a: "x", b: "  ", c: "x", inaktiv: "x", d: "x" } },
      fields
    )
    expect(r.qualifies).toBe(false)
    expect(r.reason).toContain("3/4")
  })

  it("kommt mit fehlenden oder kaputten custom_fields zurecht", () => {
    for (const custom_fields of [null, "kein objekt", 42]) {
      expect(evaluateQualification({ status: "interview", berufsbild: "steuerberater", custom_fields }, fields).qualifies).toBe(false)
    }
  })
})
