import { describe, expect, it } from "vitest"
import { caseSignature, findCandidateDuplicates, findClientDuplicates } from "./duplicates"

describe("findClientDuplicates", () => {
  it("findet ähnliche Kunden mit gleicher PLZ", () => {
    const r = findClientDuplicates([
      { id: "a", name: "Müller & Partner Steuerberatung GmbH", plz: "50667" },
      { id: "b", name: "Müller Partner Steuerberatung", plz: "50667" },
      { id: "c", name: "Schmidt Steuerberatung", plz: "50667" },
      { id: "d", name: "Müller & Partner Steuerberatung", plz: "10115" },
    ])
    expect(r.map((f) => f.recordIds)).toEqual([["a", "b"]])
  })
})

describe("findCandidateDuplicates", () => {
  it("findet gleiche E-Mail und gleichen Namen mit PLZ, ohne doppelte Fälle", () => {
    const r = findCandidateDuplicates([
      { id: "1", first_name: "Anna", last_name: "Muster", email: "anna@x.de", plz: "50667" },
      { id: "2", first_name: "Anna", last_name: "Muster", email: "ANNA@x.de", plz: "50667" },
      { id: "3", first_name: "Bob", last_name: "B", email: null, plz: "10115" },
      { id: "4", first_name: "Bob", last_name: "B", email: "bob@y.de", plz: "10115" },
    ])
    expect(r.map((f) => f.recordIds)).toEqual([["1", "2"], ["3", "4"]])
  })
})

describe("caseSignature", () => {
  it("ist unabhängig von der Reihenfolge", () => {
    expect(caseSignature("kunde", ["b", "a"])).toBe(caseSignature("kunde", ["a", "b"]))
  })
})
