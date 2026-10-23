import { describe, expect, it } from "vitest"
import { CANDIDATE_STATUS_OPTIONS, RECALL_STATUS, recallDueDate } from "@/lib/candidate-status"

// Paket 85: "Derzeit nicht auf Suche" -> Aufgabe in 6 Monaten erneut anrufen.
describe("Derzeit nicht auf Suche", () => {
  it("ist ein wählbarer Status", () => {
    expect(CANDIDATE_STATUS_OPTIONS.find((o) => o.value === RECALL_STATUS)?.label).toBe("Derzeit nicht auf Suche")
  })

  it("setzt die Aufgabe auf heute in 6 Monaten", () => {
    expect(recallDueDate(new Date("2026-10-23T09:00:00Z"))).toBe("2027-04-23")
    expect(recallDueDate(new Date("2026-08-31T09:00:00Z"))).toBe("2027-02-28")
    expect(recallDueDate(new Date("2027-08-31T09:00:00Z"))).toBe("2028-02-29")
  })
})
